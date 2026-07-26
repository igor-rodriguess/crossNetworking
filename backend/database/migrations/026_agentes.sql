-- =============================================================================
-- 026 – Agentes de IA: auditoria de execuções (fundação do pipeline)
--
-- Todo agente registra CADA execução aqui: quem disparou, qual agente, o
-- contexto de entrada, a saída produzida e a origem (modelo real ou stub mock).
-- É a base de rastreabilidade que a arquitetura exige — nenhuma saída de IA é
-- opaca. Nada aqui escreve na base de domínio; isso só acontece após o Human
-- Gate (etapa futura). Saídas ficam como JSONB (rascunho estruturado).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cross_ai;
GRANT USAGE ON SCHEMA cross_ai TO cross_app;

-- Vocabulário fechado dos agentes conhecidos (cresce a cada agente novo).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agente_tipo') THEN
        CREATE TYPE cross_ai.agente_tipo AS ENUM (
            'search_planning'
        );
    END IF;
END $$;

-- Estado de uma execução.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execucao_status') THEN
        CREATE TYPE cross_ai.execucao_status AS ENUM (
            'sucesso',
            'erro'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cross_ai.execucao_agente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agente cross_ai.agente_tipo NOT NULL,
    status cross_ai.execucao_status NOT NULL,
    -- "openai" (modelo real) ou "mock" (stub determinístico, sem chave).
    origem VARCHAR(20) NOT NULL,
    -- Contexto de entrada e resultado — rascunho estruturado, nunca verdade.
    entrada JSONB NOT NULL,
    saida JSONB,
    erro TEXT,
    -- Tokens consumidos (0 no modo mock).
    tokens_entrada INTEGER NOT NULL DEFAULT 0,
    tokens_saida INTEGER NOT NULL DEFAULT 0,
    -- Duração em milissegundos.
    duracao_ms INTEGER,
    -- Quem disparou (usuário interno) e vínculo opcional ao domínio.
    criado_por_id UUID,
    projeto_id UUID,
    frente_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execucao_agente_agente
    ON cross_ai.execucao_agente (agente, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_execucao_agente_projeto
    ON cross_ai.execucao_agente (projeto_id)
    WHERE projeto_id IS NOT NULL;

GRANT SELECT, INSERT ON cross_ai.execucao_agente TO cross_app;
