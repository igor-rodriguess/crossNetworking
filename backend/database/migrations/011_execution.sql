-- =============================================================================
-- 011 – cross_execution: planos de execução, etapas, entregas, reuniões,
-- touchpoints e pendências (WAD 7.3.17)
-- =============================================================================

-- Plano de execução versionado (WAD 7.3.8)
CREATE TABLE cross_execution.plano_execucao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    nome VARCHAR(200),
    descricao TEXT,
    status_execucao_id UUID NOT NULL,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_plano_execucao_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_plano_execucao_status
        FOREIGN KEY (status_execucao_id)
        REFERENCES cross_execution.status_execucao(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_plano_execucao_versao UNIQUE (parceria_id, numero_versao),

    CONSTRAINT ck_plano_execucao_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

-- Etapas não possuem valor independente do plano (WAD 7.4.10)
CREATE TABLE cross_execution.etapa_execucao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_execucao_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    ordem INTEGER NOT NULL,
    data_inicio_prevista DATE,
    data_fim_prevista DATE,
    status_execucao_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_etapa_plano
        FOREIGN KEY (plano_execucao_id)
        REFERENCES cross_execution.plano_execucao(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_etapa_status
        FOREIGN KEY (status_execucao_id)
        REFERENCES cross_execution.status_execucao(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_etapa_ordem UNIQUE (plano_execucao_id, ordem),

    CONSTRAINT ck_etapa_datas
        CHECK (
            data_fim_prevista IS NULL
            OR data_inicio_prevista IS NULL
            OR data_fim_prevista >= data_inicio_prevista
        )
);

CREATE TABLE cross_execution.entrega (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etapa_execucao_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    data_prevista DATE,
    data_entrega DATE,
    status_entrega_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_entrega_etapa
        FOREIGN KEY (etapa_execucao_id)
        REFERENCES cross_execution.etapa_execucao(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_entrega_status
        FOREIGN KEY (status_entrega_id)
        REFERENCES cross_execution.status_entrega(id)
        ON DELETE RESTRICT
);

-- Responsável por entrega: usuário interno OU parte externa (WAD 7.3.17)
CREATE TABLE cross_execution.entrega_responsavel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id UUID NOT NULL,
    usuario_interno_id UUID,
    parte_id UUID,
    funcao VARCHAR(150),
    inicio DATE,
    fim DATE,
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_entrega_responsavel_entrega
        FOREIGN KEY (entrega_id)
        REFERENCES cross_execution.entrega(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_entrega_responsavel_usuario
        FOREIGN KEY (usuario_interno_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_entrega_responsavel_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_entrega_responsavel_alvo
        CHECK (
            (usuario_interno_id IS NOT NULL AND parte_id IS NULL)
            OR
            (usuario_interno_id IS NULL AND parte_id IS NOT NULL)
        ),

    CONSTRAINT ck_entrega_responsavel_datas
        CHECK (fim IS NULL OR inicio IS NULL OR fim >= inicio)
);

CREATE TABLE cross_execution.reuniao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    data_reuniao TIMESTAMPTZ NOT NULL,
    local VARCHAR(200),
    resumo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_reuniao_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT
);

CREATE TABLE cross_execution.reuniao_participante (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reuniao_id UUID NOT NULL,
    usuario_interno_id UUID,
    parte_id UUID,
    papel VARCHAR(100),

    CONSTRAINT fk_reuniao_participante_reuniao
        FOREIGN KEY (reuniao_id)
        REFERENCES cross_execution.reuniao(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reuniao_participante_usuario
        FOREIGN KEY (usuario_interno_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_reuniao_participante_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_reuniao_participante_alvo
        CHECK (
            (usuario_interno_id IS NOT NULL AND parte_id IS NULL)
            OR
            (usuario_interno_id IS NULL AND parte_id IS NOT NULL)
        )
);

CREATE TABLE cross_execution.touchpoint (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    tipo VARCHAR(100),
    descricao TEXT NOT NULL,
    data_touchpoint TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsavel_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_touchpoint_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT
);

-- Pendência sempre pertence à parceria; etapa/entrega são opcionais (WAD 7.3.17)
CREATE TABLE cross_execution.pendencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    etapa_execucao_id UUID,
    entrega_id UUID,
    descricao TEXT NOT NULL,
    status_pendencia_id UUID NOT NULL,
    prazo DATE,
    responsavel_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_pendencia_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_pendencia_etapa
        FOREIGN KEY (etapa_execucao_id)
        REFERENCES cross_execution.etapa_execucao(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_pendencia_entrega
        FOREIGN KEY (entrega_id)
        REFERENCES cross_execution.entrega(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_pendencia_status
        FOREIGN KEY (status_pendencia_id)
        REFERENCES cross_execution.status_pendencia(id)
        ON DELETE RESTRICT
);
