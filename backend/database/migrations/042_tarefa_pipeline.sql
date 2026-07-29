-- 042 — Execução assíncrona dos pipelines de IA, com progresso observável.
--
-- Motivação: o pipeline completo encadeia várias chamadas de LLM. Com um modelo
-- local (Ollama), cada chamada custa minutos, e a execução síncrona no request
-- estourava o timeout HTTP antes de chegar à recomendação — o usuário via a
-- tela falhar sem nenhuma sugestão, mesmo com o pipeline funcionando.
--
-- Esta tabela desacopla: a rota dispara a tarefa e responde na hora com o id;
-- o pipeline avança em segundo plano gravando cada etapa aqui; o front busca
-- o progresso por polling. Nada de domínio é escrito — a promoção continua
-- protegida pelo Human Gate.

CREATE TABLE IF NOT EXISTS cross_ai.tarefa_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'executando', 'concluida', 'erro')),

    -- Entrada original, para reexecutar ou auditar o que foi pedido.
    entrada JSONB NOT NULL,

    -- Progresso observável: etapa corrente + histórico do que já rodou. O front
    -- lê estes dois campos para desenhar a linha do tempo de carregamento.
    etapa_atual VARCHAR(60),
    etapas JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 0..100, derivado do peso das etapas concluídas.
    progresso SMALLINT NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),

    -- Resultado final (PipelineSaida) quando status = 'concluida'.
    resultado JSONB,
    erro TEXT,

    -- Execução-pai na auditoria, quando o pipeline chega ao fim.
    execucao_pipeline_id UUID,

    projeto_id UUID,
    frente_id UUID,
    criado_por_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em TIMESTAMPTZ,

    CONSTRAINT fk_tarefa_pipeline_execucao
        FOREIGN KEY (execucao_pipeline_id)
        REFERENCES cross_ai.execucao_agente(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_tarefa_pipeline_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_tarefa_pipeline_frente
        FOREIGN KEY (frente_id)
        REFERENCES cross_projects.frente_oportunidade(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_tarefa_pipeline_usuario
        FOREIGN KEY (criado_por_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tarefa_pipeline_criado_em
    ON cross_ai.tarefa_pipeline (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tarefa_pipeline_status
    ON cross_ai.tarefa_pipeline (status, criado_em DESC);

-- A aplicação atualiza o progresso enquanto executa, então precisa de UPDATE.
GRANT SELECT, INSERT, UPDATE ON cross_ai.tarefa_pipeline TO cross_app;
