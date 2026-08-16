-- =============================================================================
-- 055 – Cross Knowledge: conhecimento VALIDADO da Cross, versionado e rastreável
--
-- Motivação: a auditoria (docs/ai/04) classificou o RAG como INSUFFICIENT — a
-- metodologia Cross vive dentro de prompts, não numa base consultável. Mudar um
-- critério de julgamento exige editar código. Esta migration cria a fundação
-- para que o conhecimento seja dado, não literal de string.
--
-- SEPARAÇÃO FUNDAMENTAL (ADR-009). Duas coisas diferentes:
--   · EVIDENCE        "o que sabemos sobre o mundo"  → cross_ai.documento_rag
--   · CROSS KNOWLEDGE "como a Cross interpreta isso" → cross_ai.conhecimento_*
--
-- `documento_rag` NÃO é alterado nem migrado: continua servindo à ingestão de
-- coleta web, papers e perfis. As tabelas novas guardam apenas conhecimento
-- metodológico validado. Misturar os dois faria o RAG virar prova de fato
-- externo, que é exatamente o que a arquitetura proíbe.
--
-- ADITIVA e IDEMPOTENTE: nenhuma tabela existente é alterada, nenhuma coluna
-- removida, nenhum dado reescrito.
--
-- COMPATIBILIDADE
--   O código anterior desconhece estas tabelas e segue funcionando. Pode ser
--   aplicada antes do deploy.
--
-- ROLLBACK
--     DROP TABLE IF EXISTS cross_ai.conhecimento_chunk;
--     DROP TABLE IF EXISTS cross_ai.conhecimento_versao;
--     DROP TABLE IF EXISTS cross_ai.conhecimento_documento;
--     DROP TYPE IF EXISTS cross_ai.conhecimento_status;
--     DROP TYPE IF EXISTS cross_ai.conhecimento_categoria;
--     DROP TYPE IF EXISTS cross_ai.conhecimento_escopo;
--   Descarta apenas o conhecimento indexado — nenhum dado de domínio,
--   oportunidade, análise ou auditoria é afetado.
-- =============================================================================

-- --- Vocabulários ------------------------------------------------------------

-- Categoria do conhecimento. Permite ao agente pedir só o que interessa:
-- avaliar Crossability não precisa recuperar playbook comercial.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'conhecimento_categoria' AND n.nspname = 'cross_ai') THEN
        CREATE TYPE cross_ai.conhecimento_categoria AS ENUM (
            'metodologia_crossability',
            'definicao',
            'criterio',
            'playbook',
            'case_aprovado',
            'principio',
            'padrao_decisao',
            'aprendizado_validado',
            'criterio_cliente',
            'outro'
        );
    END IF;
END $$;

-- Ciclo de vida. Só `validado` alimenta o retrieval de produção: rascunho é
-- proposta, obsoleto é histórico. É o Human Gate do conhecimento (ADR-010).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'conhecimento_status' AND n.nspname = 'cross_ai') THEN
        CREATE TYPE cross_ai.conhecimento_status AS ENUM (
            'rascunho',
            'validado',
            'obsoleto'
        );
    END IF;
END $$;

-- Alcance. `cliente` exige cliente_cross_id e nunca vaza para outra conta.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'conhecimento_escopo' AND n.nspname = 'cross_ai') THEN
        CREATE TYPE cross_ai.conhecimento_escopo AS ENUM (
            'global',
            'cliente',
            'interno'
        );
    END IF;
END $$;

-- --- Documento ---------------------------------------------------------------
-- A identidade estável do conhecimento. "Metodologia Crossability" é UM
-- documento que evolui em várias versões.

CREATE TABLE IF NOT EXISTS cross_ai.conhecimento_documento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Chave estável e legível; permite reindexar sem duplicar (idempotência).
    codigo VARCHAR(120) NOT NULL UNIQUE,
    titulo VARCHAR(300) NOT NULL,
    categoria cross_ai.conhecimento_categoria NOT NULL,
    escopo cross_ai.conhecimento_escopo NOT NULL DEFAULT 'global',
    -- Obrigatório quando escopo = 'cliente'; garantido pelo CHECK abaixo.
    cliente_cross_id UUID,
    -- De onde veio (arquivo, decisão, ata). Rastreabilidade da origem.
    documento_origem VARCHAR(500),
    descricao TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_conhecimento_doc_cliente
        FOREIGN KEY (cliente_cross_id)
        REFERENCES cross_commercial.cliente_cross(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_conhecimento_doc_usuario
        FOREIGN KEY (criado_por_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE SET NULL,

    -- Escopo de cliente sem cliente seria conhecimento órfão, recuperável por
    -- qualquer conta — exatamente o vazamento que o escopo existe para impedir.
    CONSTRAINT ck_conhecimento_doc_escopo_cliente
        CHECK (escopo <> 'cliente' OR cliente_cross_id IS NOT NULL)
);

-- --- Versão ------------------------------------------------------------------
-- Uma análise futura precisa saber QUAL versão da metodologia a sustentou.

CREATE TABLE IF NOT EXISTS cross_ai.conhecimento_versao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID NOT NULL,
    versao INTEGER NOT NULL CHECK (versao >= 1),
    status cross_ai.conhecimento_status NOT NULL DEFAULT 'rascunho',

    -- Conteúdo integral desta versão. O chunking deriva daqui; guardar o texto
    -- permite reindexar sem depender do arquivo de origem.
    conteudo TEXT NOT NULL,

    -- Quem aprovou e quando. Sem isso, "validado" não teria responsável.
    aprovado_em TIMESTAMPTZ,
    aprovado_por_id UUID,
    -- Versão que esta substitui — a cadeia histórica.
    substitui_versao_id UUID,
    notas TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_conhecimento_versao_documento
        FOREIGN KEY (documento_id)
        REFERENCES cross_ai.conhecimento_documento(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_conhecimento_versao_aprovador
        FOREIGN KEY (aprovado_por_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_conhecimento_versao_substitui
        FOREIGN KEY (substitui_versao_id)
        REFERENCES cross_ai.conhecimento_versao(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_conhecimento_versao UNIQUE (documento_id, versao),

    -- "Validado" sem aprovador nem data seria validação sem responsável.
    CONSTRAINT ck_conhecimento_versao_validada
        CHECK (status <> 'validado' OR aprovado_em IS NOT NULL)
);

-- Só UMA versão validada por documento: é a que o retrieval usa. Sem isso,
-- v1 e v2 poderiam ser recuperadas juntas e o agente veria duas metodologias
-- conflitantes como se fossem a mesma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conhecimento_versao_validada
    ON cross_ai.conhecimento_versao (documento_id)
    WHERE status = 'validado';

-- --- Chunk -------------------------------------------------------------------
-- A unidade de recuperação. Carrega o embedding e a proveniência necessária
-- para o agente citar "esta conclusão usou K17".

CREATE TABLE IF NOT EXISTS cross_ai.conhecimento_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    versao_id UUID NOT NULL,
    -- Ordem dentro da versão; junto com versao_id dá a chave de idempotência.
    ordem INTEGER NOT NULL CHECK (ordem >= 0),
    -- Seção de origem (título/subtítulo). É o que permite ao humano conferir
    -- de onde o trecho saiu sem abrir o documento inteiro.
    secao VARCHAR(300),
    conteudo TEXT NOT NULL,
    -- Mesma dimensão de documento_rag (1536, text-embedding-3-small). NÃO
    -- alterada nesta sprint: mudar dimensão exigiria reindexar tudo.
    embedding vector(1536) NOT NULL,
    -- "openai" (real) ou "mock" (determinístico). Sem isto, não há como
    -- distinguir qualidade semântica real de stub na hora de avaliar.
    embedding_origem VARCHAR(20) NOT NULL DEFAULT 'mock',
    metadados JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_conhecimento_chunk_versao
        FOREIGN KEY (versao_id)
        REFERENCES cross_ai.conhecimento_versao(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_conhecimento_chunk_ordem UNIQUE (versao_id, ordem)
);

-- HNSW, como em 036: funciona bem desde a primeira linha, sem "treino".
CREATE INDEX IF NOT EXISTS idx_conhecimento_chunk_embedding_hnsw
    ON cross_ai.conhecimento_chunk
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_conhecimento_chunk_versao
    ON cross_ai.conhecimento_chunk (versao_id, ordem);
CREATE INDEX IF NOT EXISTS idx_conhecimento_versao_documento
    ON cross_ai.conhecimento_versao (documento_id, status);
CREATE INDEX IF NOT EXISTS idx_conhecimento_doc_categoria
    ON cross_ai.conhecimento_documento (categoria, escopo);
CREATE INDEX IF NOT EXISTS idx_conhecimento_doc_cliente
    ON cross_ai.conhecimento_documento (cliente_cross_id)
    WHERE cliente_cross_id IS NOT NULL;

COMMENT ON TABLE cross_ai.conhecimento_documento IS
    'Cross Knowledge: como a Cross interpreta. NÃO é evidência de fato externo.';
COMMENT ON TABLE cross_ai.conhecimento_versao IS
    'Versões da metodologia. Só uma validada por documento alimenta o retrieval.';
COMMENT ON TABLE cross_ai.conhecimento_chunk IS
    'Unidade de recuperação, com embedding e proveniência (documento/versão/seção).';

-- A aplicação lê e escreve conhecimento; a curadoria (validar/obsoletar) é
-- UPDATE. DELETE fica fora: obsoletar preserva o histórico, apagar não.
GRANT SELECT, INSERT, UPDATE ON cross_ai.conhecimento_documento TO cross_app;
GRANT SELECT, INSERT, UPDATE ON cross_ai.conhecimento_versao TO cross_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cross_ai.conhecimento_chunk TO cross_app;
