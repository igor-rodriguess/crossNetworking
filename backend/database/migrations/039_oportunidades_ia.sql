-- 039 — Projeção persistida das sugestões de parceria produzidas pela IA.
-- Cada registro é um rascunho auditável: não cria candidatura, projeto ou
-- parceria sem a decisão explícita do Human Gate.

CREATE TABLE IF NOT EXISTS cross_ai.oportunidade_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execucao_pipeline_id UUID,
    pipeline VARCHAR(40) NOT NULL,
    cliente_nome VARCHAR(300) NOT NULL,
    objetivo TEXT NOT NULL,
    parceiro_nome VARCHAR(300) NOT NULL,
    perfil_parceiro JSONB,
    analise JSONB NOT NULL,
    score_fit SMALLINT NOT NULL CHECK (score_fit BETWEEN 0 AND 100),
    confianca SMALLINT NOT NULL CHECK (confianca BETWEEN 0 AND 100),
    fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
    briefing JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'em_curadoria', 'aprovada', 'descartada')),
    projeto_id UUID,
    frente_id UUID,
    criado_por_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_oportunidade_ia_execucao
        FOREIGN KEY (execucao_pipeline_id)
        REFERENCES cross_ai.execucao_agente(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_oportunidade_ia_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_oportunidade_ia_frente
        FOREIGN KEY (frente_id)
        REFERENCES cross_projects.frente_oportunidade(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_oportunidade_ia_usuario
        FOREIGN KEY (criado_por_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_oportunidade_ia_criado_em
    ON cross_ai.oportunidade_ia (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_oportunidade_ia_cliente
    ON cross_ai.oportunidade_ia (cliente_nome, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_oportunidade_ia_status
    ON cross_ai.oportunidade_ia (status, criado_em DESC);

GRANT SELECT, INSERT ON cross_ai.oportunidade_ia TO cross_app;
