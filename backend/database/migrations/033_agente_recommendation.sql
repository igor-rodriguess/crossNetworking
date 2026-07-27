-- =============================================================================
-- 033 – Agentes de IA: registra o Recommendation no vocabulário de agentes
--
-- Sexto nó (Recommend): ranqueia candidatos pela análise Crossability. Score
-- determinístico das 6 dimensões, ponderado pela confiança. Rascunho de
-- priorização; a decisão final é humana (Human Gate).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'recommendation';
