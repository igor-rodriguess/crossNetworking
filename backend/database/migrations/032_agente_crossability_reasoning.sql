-- =============================================================================
-- 032 – Agentes de IA: registra o Crossability Reasoning no vocabulário
--
-- O coração da metodologia (Reason): aplica a Crossability nas 6 dimensões e
-- produz um RASCUNHO (o agente propõe; o humano promove no Human Gate).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'crossability_reasoning';
