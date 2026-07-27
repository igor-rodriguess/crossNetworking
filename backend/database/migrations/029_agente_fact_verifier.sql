-- =============================================================================
-- 029 – Agentes de IA: registra o Fact Verifier no vocabulário de agentes
--
-- Parte 2 da validação de fontes (a afirmação confere em 2+ fontes
-- independentes?). Heurística de corroboração por domínios distintos.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'fact_verifier';
