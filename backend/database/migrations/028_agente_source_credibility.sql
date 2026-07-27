-- =============================================================================
-- 028 – Agentes de IA: registra o Source Credibility no vocabulário de agentes
--
-- Terceiro agente (parte 1 da validação de fontes: a origem é reputável?).
-- Heurística barata e determinística, sem LLM.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'source_credibility';
