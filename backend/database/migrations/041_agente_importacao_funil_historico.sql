-- 041 — Auditoria do leitor estrutural de planilhas históricas de parcerias.
ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'historical_funnel_import';
