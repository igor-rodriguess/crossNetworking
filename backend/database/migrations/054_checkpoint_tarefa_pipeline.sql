-- =============================================================================
-- 054 – Checkpoint por etapa do pipeline
--
-- Motivação: hoje uma falha na etapa 8 descarta o trabalho das etapas 1–7. Em
-- modo local isso custa minutos; com API paga, custa dinheiro — a reexecução
-- refaz e recobra toda a coleta, extração e inferência já concluídas.
--
-- Mecanismo mínimo, sem fila e sem infraestrutura distribuída: a tarefa guarda
-- o resultado de cada etapa concluída num JSONB. Ao reexecutar, o pipeline lê o
-- checkpoint e pula o que já foi feito.
--
-- JSONB (e não tabela relacional de etapa) é deliberado: as saídas de etapa têm
-- formatos heterogêneos (plano, coleta, credibilidade, perfis…), já são
-- persistidas como JSONB em execucao_agente e o checkpoint é efêmero por
-- natureza — vive enquanto a tarefa está em curso.
--
-- ADITIVA e IDEMPOTENTE. Nenhuma coluna alterada ou removida.
--
-- COMPATIBILIDADE
--   A versão anterior do código ignora as colunas novas (têm default) e segue
--   funcionando. Pode ser aplicada antes do deploy.
--
-- ROLLBACK
--     ALTER TABLE cross_ai.tarefa_pipeline
--       DROP COLUMN IF EXISTS checkpoint,
--       DROP COLUMN IF EXISTS tentativa,
--       DROP COLUMN IF EXISTS retomada_de_id;
--   Perde-se apenas a capacidade de retomar tarefas em curso; nenhum dado de
--   domínio é afetado.
-- =============================================================================

ALTER TABLE cross_ai.tarefa_pipeline
    -- Saídas das etapas já concluídas, por nome de etapa:
    --   { "search_planning": { "origem": "...", "saida": {...},
    --                          "execucao_id": "...", "concluida_em": "..." }, ... }
    ADD COLUMN IF NOT EXISTS checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Quantas vezes esta tarefa foi executada (1 = primeira).
    ADD COLUMN IF NOT EXISTS tentativa SMALLINT NOT NULL DEFAULT 1,

    -- Quando é retomada de outra tarefa, aponta para a original.
    ADD COLUMN IF NOT EXISTS retomada_de_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tarefa_pipeline_retomada'
    ) THEN
        ALTER TABLE cross_ai.tarefa_pipeline
            ADD CONSTRAINT fk_tarefa_pipeline_retomada
            FOREIGN KEY (retomada_de_id)
            REFERENCES cross_ai.tarefa_pipeline(id)
            ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN cross_ai.tarefa_pipeline.checkpoint IS
    'Saídas das etapas concluídas, por nome. Permite retomar sem refazer nem recobrar.';
