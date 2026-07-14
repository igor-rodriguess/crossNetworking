-- =============================================================================
-- 008 – cross_projects: projeto, origem da demanda, briefing, planejamento,
-- frente de oportunidade e candidatura de parceiro
-- (WAD 7.3.10, 7.4.11)
-- =============================================================================

CREATE TABLE cross_projects.projeto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_cross_id UUID NOT NULL,
    contrato_cliente_id UUID,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    objetivo TEXT NOT NULL,
    produto VARCHAR(200),
    data_inicio DATE,
    data_previsao_fim DATE,
    data_fim_real DATE,
    status_projeto_id UUID NOT NULL,
    prioridade_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_projeto_cliente_cross
        FOREIGN KEY (cliente_cross_id)
        REFERENCES cross_commercial.cliente_cross(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_projeto_contrato
        FOREIGN KEY (contrato_cliente_id)
        REFERENCES cross_commercial.contrato_cliente(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_projeto_status
        FOREIGN KEY (status_projeto_id)
        REFERENCES cross_projects.status_projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_projeto_prioridade
        FOREIGN KEY (prioridade_id)
        REFERENCES cross_projects.prioridade(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_projeto_datas
        CHECK (
            data_fim_real IS NULL
            OR data_inicio IS NULL
            OR data_fim_real >= data_inicio
        )
);

-- Origens da demanda registradas historicamente (briefing ou oportunidade Cross)
CREATE TABLE cross_projects.origem_demanda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    tipo_origem_demanda_id UUID NOT NULL,
    descricao TEXT,
    data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_origem_demanda_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_origem_demanda_tipo
        FOREIGN KEY (tipo_origem_demanda_id)
        REFERENCES cross_projects.tipo_origem_demanda(id)
        ON DELETE RESTRICT
);

-- Briefing versionado (WAD 7.3.8)
CREATE TABLE cross_projects.briefing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    conteudo TEXT NOT NULL,
    objetivos TEXT,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_briefing_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_briefing_versao UNIQUE (projeto_id, numero_versao),

    CONSTRAINT ck_briefing_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

-- Planejamento estratégico versionado (WAD 2.2, 7.3.8)
CREATE TABLE cross_projects.planejamento_estrategico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    consolidacao_materiais TEXT,
    estudos_marca TEXT,
    diagnosticos TEXT,
    objetivos_negocio TEXT,
    desafios TEXT,
    territorios TEXT,
    oportunidades TEXT,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_planejamento_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_planejamento_versao UNIQUE (projeto_id, numero_versao),

    CONSTRAINT ck_planejamento_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

-- Responsáveis internos do projeto (todo projeto deve ter ao menos um ativo)
CREATE TABLE cross_projects.responsavel_projeto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    usuario_interno_id UUID NOT NULL,
    funcao VARCHAR(150),
    inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fim DATE,
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_responsavel_projeto_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_responsavel_projeto_usuario
        FOREIGN KEY (usuario_interno_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_responsavel_projeto_datas
        CHECK (fim IS NULL OR fim >= inicio)
);

CREATE TABLE cross_projects.frente_oportunidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    territorio_id UUID,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(150),
    objetivo TEXT NOT NULL,
    data_abertura DATE NOT NULL,
    data_encerramento DATE,
    status_frente_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_frente_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_frente_territorio
        FOREIGN KEY (territorio_id)
        REFERENCES cross_intelligence.territorio(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_frente_status
        FOREIGN KEY (status_frente_id)
        REFERENCES cross_projects.status_frente(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_frente_datas
        CHECK (
            data_encerramento IS NULL
            OR data_encerramento >= data_abertura
        )
);

CREATE TABLE cross_projects.candidatura_parceiro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frente_oportunidade_id UUID NOT NULL,
    parte_id UUID NOT NULL,
    interesse_cliente_id UUID,
    interesse_parceiro_id UUID,
    disponibilidade_confirmada BOOLEAN,
    prioridade_id UUID,
    status_candidatura_id UUID NOT NULL,
    data_entrada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_saida TIMESTAMPTZ,
    motivo_recusa TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_candidatura_frente
        FOREIGN KEY (frente_oportunidade_id)
        REFERENCES cross_projects.frente_oportunidade(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_candidatura_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_candidatura_interesse_cliente
        FOREIGN KEY (interesse_cliente_id)
        REFERENCES cross_projects.nivel_interesse(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_candidatura_interesse_parceiro
        FOREIGN KEY (interesse_parceiro_id)
        REFERENCES cross_projects.nivel_interesse(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_candidatura_prioridade
        FOREIGN KEY (prioridade_id)
        REFERENCES cross_projects.prioridade(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_candidatura_status
        FOREIGN KEY (status_candidatura_id)
        REFERENCES cross_projects.status_candidatura(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_candidatura_datas
        CHECK (
            data_saida IS NULL
            OR data_saida >= data_entrada
        )
);

-- Histórico de movimentações de status da candidatura (WAD 7.3.7)
CREATE TABLE cross_projects.historico_candidatura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidatura_parceiro_id UUID NOT NULL,
    status_anterior_id UUID,
    status_novo_id UUID NOT NULL,
    data_movimentacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsavel_id UUID,
    justificativa TEXT,
    contexto JSONB,

    CONSTRAINT fk_historico_candidatura_candidatura
        FOREIGN KEY (candidatura_parceiro_id)
        REFERENCES cross_projects.candidatura_parceiro(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_historico_candidatura_status_anterior
        FOREIGN KEY (status_anterior_id)
        REFERENCES cross_projects.status_candidatura(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_historico_candidatura_status_novo
        FOREIGN KEY (status_novo_id)
        REFERENCES cross_projects.status_candidatura(id)
        ON DELETE RESTRICT
);
