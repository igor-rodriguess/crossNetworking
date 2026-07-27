-- =============================================================================
-- 035 – RAG: base de conhecimento vetorial (pgvector)
--
-- A fundação de conhecimento que a arquitetura chama de "o cérebro": guarda
-- embeddings de papers, perfis de Partes e decisões para busca semântica. Vive
-- no MESMO banco (Supabase já tem pgvector 0.8.2) — sem Docker, junto dos dados
-- reais. text-embedding-3-small = 1536 dimensões.
--
-- É camada de CONHECIMENTO (leitura por todos os agentes de reasoning). A
-- escrita de dado de domínio continua passando pelo Human Gate.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Tipo de origem do conhecimento (cresce conforme ingerimos mais fontes).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'documento_origem' AND n.nspname = 'cross_ai') THEN
        CREATE TYPE cross_ai.documento_origem AS ENUM (
            'paper',
            'perfil_parte',
            'decisao',
            'coleta_web',
            'manual'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cross_ai.documento_rag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem cross_ai.documento_origem NOT NULL,
    -- Texto do trecho indexado (o "chunk").
    conteudo TEXT NOT NULL,
    -- Embedding do conteúdo (1536 dims — text-embedding-3-small).
    embedding vector(1536) NOT NULL,
    -- Vínculo opcional à entidade de domínio de onde veio (para rastreio).
    referencia_id UUID,
    -- Metadados livres (título, url, etc.).
    metadados JSONB,
    -- Marca se o embedding é real (openai) ou mock (determinístico).
    embedding_origem VARCHAR(20) NOT NULL DEFAULT 'mock',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID
);

-- Índice de similaridade por cosseno (ivfflat). Bom equilíbrio para o volume
-- esperado; lists ajustável conforme a base cresce.
CREATE INDEX IF NOT EXISTS idx_documento_rag_embedding
    ON cross_ai.documento_rag
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_documento_rag_origem
    ON cross_ai.documento_rag (origem, criado_em DESC);

GRANT SELECT, INSERT, DELETE ON cross_ai.documento_rag TO cross_app;
