-- =============================================================================
-- 013 – cross_governance: fontes, evidências, associações de evidência e de
-- documento, auditoria técnica (WAD 7.3.20, 7.3.21, 7.4.16–7.4.18)
-- =============================================================================

CREATE TABLE cross_governance.fonte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    tipo VARCHAR(100),
    url TEXT,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cross_governance.evidencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte_id UUID,
    documento_id UUID,
    titulo VARCHAR(250) NOT NULL,
    descricao TEXT,
    url TEXT,
    data_coleta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validade_inicio DATE,
    validade_fim DATE,
    nivel_confianca d_nivel_confianca,
    validado_por_id UUID,
    data_validacao TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'ativa',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_evidencia_fonte
        FOREIGN KEY (fonte_id)
        REFERENCES cross_governance.fonte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_evidencia_documento
        FOREIGN KEY (documento_id)
        REFERENCES cross_core.documento(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_evidencia_validade
        CHECK (validade_fim IS NULL OR validade_inicio IS NULL OR validade_fim >= validade_inicio)
);

-- -----------------------------------------------------------------------------
-- Associações de evidência com FK explícita (sem polimorfismo — WAD 7.3.20)
-- -----------------------------------------------------------------------------

CREATE TABLE cross_governance.perfil_estrategico_evidencia (
    perfil_estrategico_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (perfil_estrategico_id, evidencia_id),

    CONSTRAINT fk_pee_perfil
        FOREIGN KEY (perfil_estrategico_id)
        REFERENCES cross_intelligence.perfil_estrategico(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pee_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

CREATE TABLE cross_governance.analise_crossability_evidencia (
    analise_crossability_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (analise_crossability_id, evidencia_id),

    CONSTRAINT fk_ace_analise
        FOREIGN KEY (analise_crossability_id)
        REFERENCES cross_methodologies.analise_crossability(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ace_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

CREATE TABLE cross_governance.medicao_midia_evidencia (
    medicao_midia_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (medicao_midia_id, evidencia_id),

    CONSTRAINT fk_mme_medicao
        FOREIGN KEY (medicao_midia_id)
        REFERENCES cross_intelligence.medicao_midia(id) ON DELETE RESTRICT,
    CONSTRAINT fk_mme_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

CREATE TABLE cross_governance.big_moment_evidencia (
    big_moment_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (big_moment_id, evidencia_id),

    CONSTRAINT fk_bme_big_moment
        FOREIGN KEY (big_moment_id)
        REFERENCES cross_intelligence.big_moment(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bme_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

CREATE TABLE cross_governance.resultado_evidencia (
    resultado_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (resultado_id, evidencia_id),

    CONSTRAINT fk_re_resultado
        FOREIGN KEY (resultado_id)
        REFERENCES cross_analytics.resultado(id) ON DELETE RESTRICT,
    CONSTRAINT fk_re_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

CREATE TABLE cross_governance.calculo_roi_evidencia (
    calculo_roi_id UUID NOT NULL,
    evidencia_id UUID NOT NULL,
    relevancia VARCHAR(30),
    observacoes TEXT,

    PRIMARY KEY (calculo_roi_id, evidencia_id),

    CONSTRAINT fk_cre_calculo
        FOREIGN KEY (calculo_roi_id)
        REFERENCES cross_analytics.calculo_roi(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cre_evidencia
        FOREIGN KEY (evidencia_id)
        REFERENCES cross_governance.evidencia(id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- Associações de documento (núcleo central de documentos — WAD 7.4.16)
-- -----------------------------------------------------------------------------

CREATE TABLE cross_projects.projeto_documento (
    projeto_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (projeto_id, documento_id),
    CONSTRAINT fk_projeto_documento_projeto
        FOREIGN KEY (projeto_id) REFERENCES cross_projects.projeto(id) ON DELETE RESTRICT,
    CONSTRAINT fk_projeto_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_projects.briefing_documento (
    briefing_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (briefing_id, documento_id),
    CONSTRAINT fk_briefing_documento_briefing
        FOREIGN KEY (briefing_id) REFERENCES cross_projects.briefing(id) ON DELETE RESTRICT,
    CONSTRAINT fk_briefing_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_projects.planejamento_documento (
    planejamento_estrategico_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (planejamento_estrategico_id, documento_id),
    CONSTRAINT fk_planejamento_documento_planejamento
        FOREIGN KEY (planejamento_estrategico_id)
        REFERENCES cross_projects.planejamento_estrategico(id) ON DELETE RESTRICT,
    CONSTRAINT fk_planejamento_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_methodologies.paper_documento (
    paper_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (paper_id, documento_id),
    CONSTRAINT fk_paper_documento_paper
        FOREIGN KEY (paper_id) REFERENCES cross_methodologies.paper(id) ON DELETE RESTRICT,
    CONSTRAINT fk_paper_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_commercial.contrato_cliente_documento (
    contrato_cliente_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (contrato_cliente_id, documento_id),
    CONSTRAINT fk_contrato_cliente_documento_contrato
        FOREIGN KEY (contrato_cliente_id)
        REFERENCES cross_commercial.contrato_cliente(id) ON DELETE RESTRICT,
    CONSTRAINT fk_contrato_cliente_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_partnerships.parceria_documento (
    parceria_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (parceria_id, documento_id),
    CONSTRAINT fk_parceria_documento_parceria
        FOREIGN KEY (parceria_id) REFERENCES cross_partnerships.parceria(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parceria_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

CREATE TABLE cross_execution.plano_execucao_documento (
    plano_execucao_id UUID NOT NULL,
    documento_id UUID NOT NULL,
    PRIMARY KEY (plano_execucao_id, documento_id),
    CONSTRAINT fk_plano_execucao_documento_plano
        FOREIGN KEY (plano_execucao_id)
        REFERENCES cross_execution.plano_execucao(id) ON DELETE RESTRICT,
    CONSTRAINT fk_plano_execucao_documento_documento
        FOREIGN KEY (documento_id) REFERENCES cross_core.documento(id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- Auditoria técnica central (WAD 7.4.18)
-- Mantém usuario_id sem FK para preservar o registro mesmo após remoção do
-- usuário; não substitui históricos de negócio nem versionamentos.
-- -----------------------------------------------------------------------------

CREATE TABLE cross_governance.auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID,
    schema_afetado VARCHAR(100) NOT NULL,
    tabela_afetada VARCHAR(100) NOT NULL,
    registro_id UUID,
    operacao VARCHAR(20) NOT NULL,
    dados_anteriores JSONB,
    dados_novos JSONB,
    origem VARCHAR(100),
    contexto JSONB,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_auditoria_operacao
        CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE'))
);
