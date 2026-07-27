-- =============================================================================
-- 031 – Agentes de IA: registra o Information Extractor no vocabulário
--
-- Quarto nó da espinha (Extract): estrutura conteúdo bruto coletado em campos
-- do domínio (setor, públicos, territórios, ativos, sinais de parceria).
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'information_extractor';
