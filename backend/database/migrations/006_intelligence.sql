-- =============================================================================
-- 006 – cross_intelligence: inteligência estratégica, artistas e talentos
-- (WAD 3.4, 7.3.5, 7.3.15, 7.4.14)
-- =============================================================================

-- Perfil estratégico versionado de uma parte (WAD 7.3.8)
CREATE TABLE cross_intelligence.perfil_estrategico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    numero_versao INTEGER NOT NULL,
    resumo TEXT,
    posicionamento TEXT,
    objetivos TEXT,
    desafios TEXT,
    status_versao d_status_versao NOT NULL DEFAULT 'rascunho',
    vigente_desde TIMESTAMPTZ,
    vigente_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_perfil_estrategico_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_perfil_estrategico_versao UNIQUE (parte_id, numero_versao),

    CONSTRAINT ck_perfil_estrategico_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

-- Públicos
CREATE TABLE cross_intelligence.publico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    faixa_etaria VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_publico_nome UNIQUE (nome)
);

CREATE TABLE cross_intelligence.parte_publico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    publico_id UUID NOT NULL,
    relevancia VARCHAR(30),
    vigente_desde DATE,
    vigente_ate DATE,
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_parte_publico_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parte_publico_publico
        FOREIGN KEY (publico_id) REFERENCES cross_intelligence.publico(id) ON DELETE RESTRICT
);

-- Praças de atuação
CREATE TABLE cross_intelligence.praca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    uf VARCHAR(2),
    pais VARCHAR(100) NOT NULL DEFAULT 'Brasil',
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cross_intelligence.parte_praca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    praca_id UUID NOT NULL,
    relevancia VARCHAR(30),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_parte_praca_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parte_praca_praca
        FOREIGN KEY (praca_id) REFERENCES cross_intelligence.praca(id) ON DELETE RESTRICT
);

-- Territórios estratégicos
CREATE TABLE cross_intelligence.territorio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cross_intelligence.parte_territorio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    territorio_id UUID NOT NULL,
    relevancia VARCHAR(30),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_parte_territorio_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parte_territorio_territorio
        FOREIGN KEY (territorio_id) REFERENCES cross_intelligence.territorio(id) ON DELETE RESTRICT
);

-- Ativos de uma parte (propriedades, naming rights, espaços, cotas etc.)
CREATE TABLE cross_intelligence.ativo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    categoria VARCHAR(150),
    descricao TEXT,
    valor_referencia d_valor_monetario,
    moeda d_moeda,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_ativo_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT
);

-- Canais de mídia e métricas de alcance
CREATE TABLE cross_intelligence.canal_midia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    plataforma VARCHAR(100) NOT NULL,
    identificador VARCHAR(200),
    url TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_canal_midia_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT
);

CREATE TABLE cross_intelligence.medicao_midia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canal_midia_id UUID NOT NULL,
    tipo_metrica_id UUID NOT NULL,
    valor NUMERIC(18,2) NOT NULL,
    unidade VARCHAR(50),
    data_coleta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fonte VARCHAR(200),
    nivel_confianca d_nivel_confianca,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_medicao_midia_canal
        FOREIGN KEY (canal_midia_id) REFERENCES cross_intelligence.canal_midia(id) ON DELETE RESTRICT,
    CONSTRAINT fk_medicao_midia_tipo_metrica
        FOREIGN KEY (tipo_metrica_id) REFERENCES cross_analytics.tipo_metrica(id) ON DELETE RESTRICT
);

-- Disponibilidade: da parte OU de um ativo, nunca ambos (WAD 7.3.15, 7.4.14)
CREATE TABLE cross_intelligence.disponibilidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID,
    ativo_id UUID,
    tipo_disponibilidade_id UUID NOT NULL,
    data_inicio TIMESTAMPTZ NOT NULL,
    data_fim TIMESTAMPTZ NOT NULL,
    motivo_indisponibilidade TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_disponibilidade_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disponibilidade_ativo
        FOREIGN KEY (ativo_id) REFERENCES cross_intelligence.ativo(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disponibilidade_tipo
        FOREIGN KEY (tipo_disponibilidade_id) REFERENCES cross_intelligence.tipo_disponibilidade(id) ON DELETE RESTRICT,

    CONSTRAINT ck_disponibilidade_alvo
        CHECK (
            (parte_id IS NOT NULL AND ativo_id IS NULL)
            OR
            (parte_id IS NULL AND ativo_id IS NOT NULL)
        ),

    CONSTRAINT ck_disponibilidade_datas CHECK (data_fim >= data_inicio)
);

-- Informações específicas de artistas e talentos (WAD 3.4)
CREATE TABLE cross_intelligence.representacao_artistica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL,
    representante_parte_id UUID NOT NULL,
    tipo_representacao VARCHAR(100) NOT NULL, -- agência, label, empresário etc.
    vigente_desde DATE,
    vigente_ate DATE,
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_representacao_pessoa
        FOREIGN KEY (pessoa_id) REFERENCES cross_core.pessoa(parte_id) ON DELETE RESTRICT,
    CONSTRAINT fk_representacao_representante
        FOREIGN KEY (representante_parte_id) REFERENCES cross_core.parte(id) ON DELETE RESTRICT,

    CONSTRAINT ck_representacao_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

CREATE TABLE cross_intelligence.turne (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    data_inicio DATE,
    data_fim DATE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_turne_pessoa
        FOREIGN KEY (pessoa_id) REFERENCES cross_core.pessoa(parte_id) ON DELETE RESTRICT,

    CONSTRAINT ck_turne_datas
        CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

-- Eventos de turnê não possuem valor independente da turnê (WAD 7.4.10)
CREATE TABLE cross_intelligence.evento_turne (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turne_id UUID NOT NULL,
    nome VARCHAR(200),
    cidade VARCHAR(150),
    local VARCHAR(200),
    data_evento DATE NOT NULL,

    CONSTRAINT fk_evento_turne_turne
        FOREIGN KEY (turne_id) REFERENCES cross_intelligence.turne(id) ON DELETE CASCADE
);

CREATE TABLE cross_intelligence.big_moment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(150),
    data_prevista DATE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_big_moment_pessoa
        FOREIGN KEY (pessoa_id) REFERENCES cross_core.pessoa(parte_id) ON DELETE RESTRICT
);

CREATE TABLE cross_intelligence.evento_agenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pessoa_id UUID NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    local VARCHAR(200),
    data_inicio TIMESTAMPTZ NOT NULL,
    data_fim TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arquivado_em TIMESTAMPTZ,

    CONSTRAINT fk_evento_agenda_pessoa
        FOREIGN KEY (pessoa_id) REFERENCES cross_core.pessoa(parte_id) ON DELETE RESTRICT,

    CONSTRAINT ck_evento_agenda_datas
        CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);
