-- =============================================================================
-- 053 – Observabilidade e custo das execuções de agente
--
-- Motivação: `execucao_agente` já registrava tokens e duração, mas o pipeline
-- gravava zero em todas as execuções (auditarAgente descartava os valores) e
-- não havia como saber QUAL MODELO atendeu — só o provedor. Sem modelo não há
-- preço por token, e sem preço não há custo estimado.
--
-- Esta migration é ADITIVA e IDEMPOTENTE (WAD 7.4.22):
--   · só adiciona colunas nullable e uma tabela nova;
--   · nenhuma coluna é removida, renomeada ou tem tipo alterado;
--   · nenhum dado existente é reescrito;
--   · linhas antigas ficam com NULL nas colunas novas, o que é a leitura
--     correta — "não medido" é diferente de "custou zero".
--
-- COMPATIBILIDADE
--   A aplicação em execução (versão anterior) continua funcionando sem
--   alteração: os INSERTs antigos nomeiam as colunas explicitamente e as novas
--   aceitam NULL/default. Pode ser aplicada ANTES do deploy do código novo,
--   conforme a ordem recomendada em ARQUITETURA_INFRAESTRUTURA §4.7.
--
-- ROLLBACK
--   Reversível sem perda de dado de domínio (as colunas só guardam telemetria):
--     DROP TABLE IF EXISTS cross_ai.uso_ferramenta;
--     ALTER TABLE cross_ai.execucao_agente
--       DROP COLUMN IF EXISTS modelo,
--       DROP COLUMN IF EXISTS tokens_cache,
--       DROP COLUMN IF EXISTS custo_estimado,
--       DROP COLUMN IF EXISTS iniciado_em,
--       DROP COLUMN IF EXISTS finalizado_em,
--       DROP COLUMN IF EXISTS execucao_pai_id,
--       DROP COLUMN IF EXISTS tentativa;
--     DROP INDEX IF EXISTS cross_ai.idx_execucao_agente_pai;
--   O rollback descarta a telemetria coletada no período — não afeta
--   oportunidades, análises, auditoria de governança nem regras de negócio.
-- =============================================================================

-- --- Colunas de telemetria ---------------------------------------------------

ALTER TABLE cross_ai.execucao_agente
    -- Modelo que atendeu ("gpt-4o-mini", "deepseek-chat", "qwen3:4b").
    -- NULL quando a etapa não usou LLM (heurística, determinística).
    ADD COLUMN IF NOT EXISTS modelo VARCHAR(80),

    -- Tokens de entrada servidos de cache pelo provedor. Cobrados mais barato,
    -- então entram separados de tokens_entrada no cálculo de custo.
    ADD COLUMN IF NOT EXISTS tokens_cache INTEGER NOT NULL DEFAULT 0,

    -- Custo estimado em USD. NUMERIC (não float) porque é dinheiro: 6 casas
    -- comportam preços por token sem erro de arredondamento binário.
    -- NULL = não estimado (etapa sem LLM ou modelo sem preço cadastrado).
    ADD COLUMN IF NOT EXISTS custo_estimado NUMERIC(12, 6),

    -- Início e fim reais da etapa. `criado_em` marca a GRAVAÇÃO, que acontece
    -- depois do trabalho; para latência real é preciso o par.
    ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ,

    -- Execução-pai do pipeline. Sem esta coluna, agregar custo por pipeline
    -- exigia varrer o JSONB de tarefa_pipeline.etapas.
    ADD COLUMN IF NOT EXISTS execucao_pai_id UUID,

    -- Número da tentativa (1 = primeira). Prepara o registro de retry sem
    -- ainda implementar a política de repetição.
    ADD COLUMN IF NOT EXISTS tentativa SMALLINT NOT NULL DEFAULT 1;

-- FK auto-referente: uma etapa aponta para a execução-pai do pipeline.
-- ON DELETE SET NULL preserva a etapa mesmo se o pai for removido — auditoria
-- não deve sumir em cascata.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_execucao_agente_pai'
    ) THEN
        ALTER TABLE cross_ai.execucao_agente
            ADD CONSTRAINT fk_execucao_agente_pai
            FOREIGN KEY (execucao_pai_id)
            REFERENCES cross_ai.execucao_agente(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_execucao_agente_pai
    ON cross_ai.execucao_agente (execucao_pai_id)
    WHERE execucao_pai_id IS NOT NULL;

COMMENT ON COLUMN cross_ai.execucao_agente.modelo IS
    'Modelo que atendeu. NULL quando a etapa não usou LLM.';
COMMENT ON COLUMN cross_ai.execucao_agente.custo_estimado IS
    'Custo estimado em USD. NULL = não estimado; 0 = medido e gratuito.';
COMMENT ON COLUMN cross_ai.execucao_agente.execucao_pai_id IS
    'Execução-pai do pipeline; NULL quando a etapa rodou isolada por rota.';

-- --- Uso de ferramentas externas ---------------------------------------------
-- Firecrawl, busca web e embeddings são cobrados por uso e não têm tokens.
-- Ficam em tabela própria: uma execução pode chamar N ferramentas, e forçar
-- isso em colunas da execução criaria campos esparsos.

CREATE TABLE IF NOT EXISTS cross_ai.uso_ferramenta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execucao_id UUID NOT NULL,

    -- Vocabulário aberto (VARCHAR + CHECK, não ENUM): ferramentas novas entram
    -- sem ALTER TYPE, que não roda dentro de transação em algumas versões.
    ferramenta VARCHAR(40) NOT NULL
        CHECK (ferramenta IN (
            'web_search', 'firecrawl_search', 'firecrawl_scrape',
            'embeddings', 'tool_call'
        )),

    -- Chamadas feitas e unidades consumidas (páginas, trechos, resultados).
    chamadas INTEGER NOT NULL DEFAULT 1 CHECK (chamadas >= 0),
    unidades INTEGER NOT NULL DEFAULT 0 CHECK (unidades >= 0),

    -- Falhas contam para custo: uma chamada que erra pode ter sido cobrada.
    falhas INTEGER NOT NULL DEFAULT 0 CHECK (falhas >= 0),

    custo_estimado NUMERIC(12, 6),
    detalhe JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_uso_ferramenta_execucao
        FOREIGN KEY (execucao_id)
        REFERENCES cross_ai.execucao_agente(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_uso_ferramenta_execucao
    ON cross_ai.uso_ferramenta (execucao_id);
CREATE INDEX IF NOT EXISTS idx_uso_ferramenta_ferramenta
    ON cross_ai.uso_ferramenta (ferramenta, criado_em DESC);

-- A aplicação registra uso; não altera nem apaga (CASCADE cuida da remoção).
GRANT SELECT, INSERT ON cross_ai.uso_ferramenta TO cross_app;
