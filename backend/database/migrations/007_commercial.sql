-- =============================================================================
-- 007 – cross_commercial: cliente Cross, contratos e remuneração
-- (WAD 7.3.9)
-- =============================================================================

-- Vínculo comercial entre uma parte e a Crossnetworking (1:0..1 ativo por parte)
CREATE TABLE cross_commercial.cliente_cross (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    responsavel_conta_id UUID,
    status_cliente_id UUID NOT NULL,
    inicio_relacionamento DATE,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_cliente_cross_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cliente_cross_status
        FOREIGN KEY (status_cliente_id)
        REFERENCES cross_commercial.status_cliente(id)
        ON DELETE RESTRICT
);

-- Contratos do cliente ao longo do tempo
CREATE TABLE cross_commercial.contrato_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_cross_id UUID NOT NULL,
    codigo VARCHAR(50),
    descricao TEXT,
    data_inicio DATE,
    data_fim DATE,
    status_contrato_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_contrato_cliente_cliente
        FOREIGN KEY (cliente_cross_id)
        REFERENCES cross_commercial.cliente_cross(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contrato_cliente_status
        FOREIGN KEY (status_contrato_id)
        REFERENCES cross_commercial.status_contrato(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_contrato_cliente_datas
        CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

-- Um contrato pode combinar mais de um modelo de contratação (N:N)
CREATE TABLE cross_commercial.contrato_modelo_contratacao (
    contrato_cliente_id UUID NOT NULL,
    modelo_contratacao_id UUID NOT NULL,
    observacoes TEXT,

    PRIMARY KEY (contrato_cliente_id, modelo_contratacao_id),

    CONSTRAINT fk_contrato_modelo_contrato
        FOREIGN KEY (contrato_cliente_id)
        REFERENCES cross_commercial.contrato_cliente(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_contrato_modelo_modelo
        FOREIGN KEY (modelo_contratacao_id)
        REFERENCES cross_commercial.modelo_contratacao(id)
        ON DELETE RESTRICT
);

-- Componentes de remuneração do contrato (valor mensal, comissões etc.)
CREATE TABLE cross_commercial.componente_remuneracao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_cliente_id UUID NOT NULL,
    tipo_remuneracao_id UUID NOT NULL,
    descricao TEXT,
    valor d_valor_monetario,
    moeda d_moeda,
    percentual d_percentual,
    vigente_desde DATE,
    vigente_ate DATE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_componente_remuneracao_contrato
        FOREIGN KEY (contrato_cliente_id)
        REFERENCES cross_commercial.contrato_cliente(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_componente_remuneracao_tipo
        FOREIGN KEY (tipo_remuneracao_id)
        REFERENCES cross_commercial.tipo_remuneracao(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_componente_remuneracao_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde),

    -- Todo componente precisa definir valor monetário ou percentual
    CONSTRAINT ck_componente_remuneracao_conteudo
        CHECK (valor IS NOT NULL OR percentual IS NOT NULL),

    -- Valor monetário sempre acompanhado da moeda
    CONSTRAINT ck_componente_remuneracao_moeda
        CHECK (valor IS NULL OR moeda IS NOT NULL)
);
