-- =============================================================================
-- 010 – cross_partnerships: parceria, negociações, contrapartidas e
-- contratos de parceria (WAD 3.4, 7.3.14, 7.3.25)
-- =============================================================================

-- Uma candidatura gera no máximo uma parceria ativa (índice parcial em 015)
CREATE TABLE cross_partnerships.parceria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidatura_parceiro_id UUID NOT NULL,
    projeto_id UUID NOT NULL,
    frente_oportunidade_id UUID NOT NULL,
    cliente_cross_id UUID NOT NULL,
    parte_parceira_id UUID NOT NULL,
    tipo_parceria_id UUID,
    status_parceria_id UUID NOT NULL,
    data_inicio DATE,
    data_fim DATE,
    condicoes_comerciais TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_parceria_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_frente
        FOREIGN KEY (frente_oportunidade_id)
        REFERENCES cross_projects.frente_oportunidade(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_cliente_cross
        FOREIGN KEY (cliente_cross_id)
        REFERENCES cross_commercial.cliente_cross(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_parte_parceira
        FOREIGN KEY (parte_parceira_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_tipo
        FOREIGN KEY (tipo_parceria_id)
        REFERENCES cross_partnerships.tipo_parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_status
        FOREIGN KEY (status_parceria_id)
        REFERENCES cross_partnerships.status_parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_parceria_datas
        CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

CREATE TABLE cross_partnerships.negociacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    status_negociacao_id UUID NOT NULL,
    descricao TEXT,
    data_inicio DATE,
    data_fim DATE,
    responsavel_id UUID,
    resultado TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_negociacao_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_negociacao_status
        FOREIGN KEY (status_negociacao_id)
        REFERENCES cross_partnerships.status_negociacao(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_negociacao_datas
        CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

CREATE TABLE cross_partnerships.contrapartida (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    descricao TEXT NOT NULL,
    categoria VARCHAR(150),
    valor_estimado d_valor_monetario,
    moeda d_moeda,
    prazo DATE,
    cumprida BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_contrapartida_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_contrapartida_moeda
        CHECK (valor_estimado IS NULL OR moeda IS NOT NULL)
);

CREATE TABLE cross_partnerships.contrato_parceria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    descricao TEXT,
    data_assinatura DATE,
    data_inicio DATE,
    data_fim DATE,
    valor d_valor_monetario,
    moeda d_moeda,
    status_contrato_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_contrato_parceria_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contrato_parceria_status
        FOREIGN KEY (status_contrato_id)
        REFERENCES cross_commercial.status_contrato(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_contrato_parceria_datas
        CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio),

    CONSTRAINT ck_contrato_parceria_moeda
        CHECK (valor IS NULL OR moeda IS NOT NULL)
);
