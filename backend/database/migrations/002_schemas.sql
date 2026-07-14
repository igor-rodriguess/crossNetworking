-- =============================================================================
-- 002 – Schemas por domínio (WAD 7.4.2)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cross_core;          -- base de relacionamentos, pessoas, organizações, usuários, documentos
CREATE SCHEMA IF NOT EXISTS cross_intelligence;  -- perfis, públicos, praças, territórios, ativos, canais, métricas, artistas
CREATE SCHEMA IF NOT EXISTS cross_commercial;    -- clientes, contratos, modelos de contratação, remuneração
CREATE SCHEMA IF NOT EXISTS cross_projects;      -- projetos, briefings, planejamentos, frentes, candidaturas
CREATE SCHEMA IF NOT EXISTS cross_methodologies; -- Crossability, Papers, validações, Score Card, decisões
CREATE SCHEMA IF NOT EXISTS cross_partnerships;  -- parcerias, negociações, contrapartidas, contratos de parceria
CREATE SCHEMA IF NOT EXISTS cross_execution;     -- planos, etapas, entregas, reuniões, touchpoints, pendências
CREATE SCHEMA IF NOT EXISTS cross_analytics;     -- acompanhamentos, indicadores, medições, resultados, ROI, encerramentos
CREATE SCHEMA IF NOT EXISTS cross_governance;    -- fontes, evidências, auditoria
