-- =============================================================================
-- 027 – Agentes de IA: registra o Source Collector no vocabulário de agentes
--
-- O enum agente_tipo cresce a cada agente novo. Aqui adicionamos o segundo nó
-- da espinha de descoberta (coleta de fontes). ADD VALUE é idempotente com
-- IF NOT EXISTS.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'source_collector';
