-- =============================================================================
-- 005 – cross_core: usuários internos, Parte e especializações, papéis,
-- contatos e documentos (WAD 7.3.4, 7.4.8, 7.4.16)
-- =============================================================================

-- Usuários internos da plataforma (referenciados pelas colunas de auditoria)
CREATE TABLE cross_core.usuario_interno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(254) NOT NULL,
    cargo VARCHAR(150),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT uq_usuario_interno_email UNIQUE (email)
);

-- Supertipo Parte (WAD 7.4.8)
CREATE TABLE cross_core.parte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo tipo_parte NOT NULL,
    nome_exibicao VARCHAR(200) NOT NULL,
    status_parte_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_parte_status
        FOREIGN KEY (status_parte_id)
        REFERENCES cross_core.status_parte(id)
        ON DELETE RESTRICT
);

-- Especialização: Organização
CREATE TABLE cross_core.organizacao (
    parte_id UUID PRIMARY KEY,
    razao_social VARCHAR(200),
    nome_fantasia VARCHAR(200) NOT NULL,
    cnpj VARCHAR(14),
    tipo_organizacao_id UUID,
    segmento_principal VARCHAR(150),
    descricao TEXT,
    site TEXT,
    logo_url TEXT,

    CONSTRAINT fk_organizacao_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_organizacao_tipo
        FOREIGN KEY (tipo_organizacao_id)
        REFERENCES cross_core.tipo_organizacao(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_organizacao_cnpj UNIQUE (cnpj)
);

-- Especialização: Pessoa
CREATE TABLE cross_core.pessoa (
    parte_id UUID PRIMARY KEY,
    nome_completo VARCHAR(200) NOT NULL,
    nome_artistico VARCHAR(200),
    cpf VARCHAR(11),
    data_nascimento DATE,
    genero VARCHAR(100),
    nacionalidade VARCHAR(100),
    biografia TEXT,

    CONSTRAINT fk_pessoa_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_pessoa_cpf UNIQUE (cpf)
);

-- Papéis de uma parte no ecossistema (N:N, com vigência)
CREATE TABLE cross_core.parte_papel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    papel_id UUID NOT NULL,
    vigente_desde DATE,
    vigente_ate DATE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_parte_papel_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parte_papel_papel
        FOREIGN KEY (papel_id)
        REFERENCES cross_core.papel(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_parte_papel_vigencia
        CHECK (vigente_ate IS NULL OR vigente_desde IS NULL OR vigente_ate >= vigente_desde)
);

-- Contatos vinculados a uma parte
CREATE TABLE cross_core.contato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parte_id UUID NOT NULL,
    nome VARCHAR(200) NOT NULL,
    cargo VARCHAR(150),
    email VARCHAR(254),
    telefone VARCHAR(30),
    principal BOOLEAN NOT NULL DEFAULT FALSE,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por_id UUID,
    arquivado_em TIMESTAMPTZ,
    arquivado_por_id UUID,

    CONSTRAINT fk_contato_parte
        FOREIGN KEY (parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT
);

-- Núcleo central de documentos (WAD 7.3.16, 7.4.16)
-- O arquivo fica em serviço de armazenamento externo; o banco guarda metadados.
CREATE TABLE cross_core.documento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    tipo_mime VARCHAR(150) NOT NULL,
    extensao VARCHAR(20),
    tamanho_bytes BIGINT,
    arquivo_url TEXT NOT NULL,
    hash_sha256 VARCHAR(64) NOT NULL,
    numero_versao INTEGER NOT NULL DEFAULT 1,
    status_documento_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_documento_status
        FOREIGN KEY (status_documento_id)
        REFERENCES cross_core.status_documento(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_documento_tamanho
        CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0)
);
