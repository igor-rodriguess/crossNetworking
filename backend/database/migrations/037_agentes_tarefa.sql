-- 037 — Agentes de tarefa: pipelines Partner Discovery e Market Intelligence.
-- Os agentes de tarefa apenas orquestram componentes e registram rascunhos;
-- a promoção para o domínio continua protegida pelo Human Gate.

ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'partner_discovery';
ALTER TYPE cross_ai.agente_tipo ADD VALUE IF NOT EXISTS 'market_intelligence';
