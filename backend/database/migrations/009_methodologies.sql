-- =============================================================================
-- 009 – cross_methodologies: Análise Crossability, Paper, validações,
-- Cross Score Card e decisões (WAD 7.3.11–7.3.14, 7.4.12, 7.4.13)
-- =============================================================================

-- Análise Crossability versionada por candidatura (WAD 7.3.11)
CREATE TABLE cross_methodologies.analise_crossability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidatura_parceiro_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    compatibilidade_publicos TEXT,
    compatibilidade_territorios TEXT,
    complementaridade_ativos TEXT,
    sinergias TEXT,
    fit_estrategico TEXT,
    momento_estrategico TEXT,
    racional_recomendacao TEXT,
    status_crossability_id UUID NOT NULL,
    responsavel_id UUID,
    data_analise TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_analise_crossability_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_analise_crossability_status
        FOREIGN KEY (status_crossability_id)
        REFERENCES cross_methodologies.status_crossability(id)
        ON DELETE RESTRICT,

    -- Uma nova análise nunca sobrescreve a anterior
    CONSTRAINT uq_analise_crossability_versao
        UNIQUE (candidatura_parceiro_id, numero_versao)
);

-- Paper (WAD 7.3.12, 7.4.12)
CREATE TABLE cross_methodologies.paper (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frente_oportunidade_id UUID NOT NULL,
    titulo VARCHAR(250) NOT NULL,
    status_paper_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_paper_frente
        FOREIGN KEY (frente_oportunidade_id)
        REFERENCES cross_projects.frente_oportunidade(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_paper_status
        FOREIGN KEY (status_paper_id)
        REFERENCES cross_methodologies.status_paper(id)
        ON DELETE RESTRICT
);

CREATE TABLE cross_methodologies.versao_paper (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    estrategia_proposta TEXT NOT NULL,
    beneficios_esperados TEXT,
    plano_implementacao TEXT,
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_versao_paper
        FOREIGN KEY (paper_id)
        REFERENCES cross_methodologies.paper(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_versao_paper_numero UNIQUE (paper_id, numero_versao),

    CONSTRAINT ck_versao_paper_vigencia
        CHECK (
            vigente_ate IS NULL
            OR vigente_desde IS NULL
            OR vigente_ate >= vigente_desde
        )
);

-- Candidaturas recomendadas em um Paper (N:N com atributos)
CREATE TABLE cross_methodologies.paper_candidatura (
    paper_id UUID NOT NULL,
    candidatura_parceiro_id UUID NOT NULL,
    ordem_prioridade INTEGER,
    justificativa TEXT,
    recomendacao TEXT,
    status_recomendacao VARCHAR(50),

    PRIMARY KEY (paper_id, candidatura_parceiro_id),

    CONSTRAINT fk_paper_candidatura_paper
        FOREIGN KEY (paper_id)
        REFERENCES cross_methodologies.paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_paper_candidatura_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT
);

-- Validação sempre aponta para uma versão específica do Paper (WAD 7.3.12)
CREATE TABLE cross_methodologies.validacao_paper (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    versao_paper_id UUID NOT NULL,
    tipo_validacao_id UUID NOT NULL,
    status_validacao_id UUID NOT NULL,
    responsavel_id UUID,
    data_validacao TIMESTAMPTZ,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_validacao_paper_versao
        FOREIGN KEY (versao_paper_id)
        REFERENCES cross_methodologies.versao_paper(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_validacao_paper_tipo
        FOREIGN KEY (tipo_validacao_id)
        REFERENCES cross_methodologies.tipo_validacao(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_validacao_paper_status
        FOREIGN KEY (status_validacao_id)
        REFERENCES cross_methodologies.status_validacao(id)
        ON DELETE RESTRICT
);

-- Modelo de Score Card versionado (WAD 7.3.13, 7.4.13)
CREATE TABLE cross_methodologies.modelo_score_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID
);

CREATE TABLE cross_methodologies.versao_modelo_score_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo_score_card_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_versao_modelo_score_card_modelo
        FOREIGN KEY (modelo_score_card_id)
        REFERENCES cross_methodologies.modelo_score_card(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_versao_modelo_score_card_numero
        UNIQUE (modelo_score_card_id, numero_versao),

    CONSTRAINT ck_versao_modelo_score_card_vigencia
        CHECK (
            vigente_ate IS NULL
            OR vigente_desde IS NULL
            OR vigente_ate >= vigente_desde
        )
);

CREATE TABLE cross_methodologies.criterio_score_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    versao_modelo_score_card_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    peso_sim NUMERIC(10,4) NOT NULL,
    peso_nao NUMERIC(10,4) NOT NULL,
    ordem INTEGER NOT NULL,
    obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_criterio_versao_modelo
        FOREIGN KEY (versao_modelo_score_card_id)
        REFERENCES cross_methodologies.versao_modelo_score_card(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_criterio_ordem
        UNIQUE (versao_modelo_score_card_id, ordem)
);

-- A avaliação ocorre somente após a validação do Paper (FK obrigatória)
CREATE TABLE cross_methodologies.avaliacao_score_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidatura_parceiro_id UUID NOT NULL,
    versao_modelo_score_card_id UUID NOT NULL,
    validacao_paper_id UUID NOT NULL,
    potencial_disruptivo INTEGER NOT NULL,
    score_total NUMERIC(12,4) NOT NULL,
    status_avaliacao_score_card_id UUID NOT NULL,
    data_aplicacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsavel_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_avaliacao_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_avaliacao_versao_modelo
        FOREIGN KEY (versao_modelo_score_card_id)
        REFERENCES cross_methodologies.versao_modelo_score_card(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_avaliacao_validacao_paper
        FOREIGN KEY (validacao_paper_id)
        REFERENCES cross_methodologies.validacao_paper(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_avaliacao_status
        FOREIGN KEY (status_avaliacao_score_card_id)
        REFERENCES cross_methodologies.status_avaliacao_score_card(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_avaliacao_potencial_disruptivo
        CHECK (potencial_disruptivo BETWEEN 1 AND 5)
);

-- Respostas: uma por critério por avaliação; pontuação validada por trigger
CREATE TABLE cross_methodologies.resposta_score_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avaliacao_score_card_id UUID NOT NULL,
    criterio_score_card_id UUID NOT NULL,
    valor_resposta resposta_score_card NOT NULL,
    peso_sim_aplicado NUMERIC(10,4) NOT NULL,
    peso_nao_aplicado NUMERIC(10,4) NOT NULL,
    pontuacao_obtida NUMERIC(10,4) NOT NULL,
    justificativa TEXT,

    CONSTRAINT fk_resposta_avaliacao
        FOREIGN KEY (avaliacao_score_card_id)
        REFERENCES cross_methodologies.avaliacao_score_card(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_resposta_criterio
        FOREIGN KEY (criterio_score_card_id)
        REFERENCES cross_methodologies.criterio_score_card(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_resposta_avaliacao_criterio
        UNIQUE (avaliacao_score_card_id, criterio_score_card_id)
);

-- Decisões históricas da candidatura (WAD 7.3.14)
CREATE TABLE cross_methodologies.decisao_candidatura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidatura_parceiro_id UUID NOT NULL,
    tipo_decisao_id UUID NOT NULL,
    justificativa TEXT,
    responsavel_id UUID,
    data_decisao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contexto JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_decisao_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_decisao_tipo
        FOREIGN KEY (tipo_decisao_id)
        REFERENCES cross_methodologies.tipo_decisao(id)
        ON DELETE RESTRICT
);
