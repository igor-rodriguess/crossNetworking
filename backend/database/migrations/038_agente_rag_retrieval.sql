-- 038 – Auditoria da etapa de retrieval do Knowledge RAG.
-- Aditiva e idempotente: permite rastrear quando o contexto interno foi
-- consultado pelos pipelines de tarefa.

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'rag_retrieval';
