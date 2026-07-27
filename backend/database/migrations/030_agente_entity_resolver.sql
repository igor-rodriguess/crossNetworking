-- =============================================================================
-- 030 – Agentes de IA: registra o Entity Resolver no vocabulário de agentes
--
-- Parte 3 da validação: dedupe de entidades e casamento com as Partes já
-- cadastradas (primeiro agente que consulta a base de domínio).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'entity_resolver';
