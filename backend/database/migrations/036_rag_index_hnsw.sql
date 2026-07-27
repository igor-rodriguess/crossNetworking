-- =============================================================================
-- 036 – RAG: troca o índice ivfflat por HNSW
--
-- O ivfflat exige "treino" e, com poucas linhas, deixa a maioria dos vetores
-- fora dos probes — a busca retornava quase nada. O HNSW (recomendado no
-- pgvector 0.8) não tem esse problema: funciona bem desde a primeira linha e
-- escala melhor. Troca sem perder dados.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

DROP INDEX IF EXISTS cross_ai.idx_documento_rag_embedding;

CREATE INDEX IF NOT EXISTS idx_documento_rag_embedding_hnsw
    ON cross_ai.documento_rag
    USING hnsw (embedding vector_cosine_ops);
