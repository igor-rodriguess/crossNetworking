-- =============================================================================
-- 034 – Agentes de IA: registra o Human Gate no vocabulário de agentes
--
-- O portão de curadoria (Human Gate): promove/rejeita uma saída de agente para
-- a base real, com decisão humana obrigatória. Fecha o ciclo — só aqui a IA
-- vira dado de domínio, sempre como rascunho (em_elaboracao).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'human_gate';
