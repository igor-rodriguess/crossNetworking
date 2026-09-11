-- =============================================================================
-- 064 — Monitoring
--
-- Sprint AI-10.
--
-- AUDITORIA: não existia nenhuma estrutura de monitoring. `tarefa_pipeline` tem
-- checkpoint, mas é escopo de PIPELINE (uma execução), não de ALVO (uma Parte
-- observada ao longo do tempo). São coisas diferentes: o checkpoint de pipeline
-- retoma uma execução interrompida; o checkpoint de monitoring lembra o que já
-- foi visto sobre a entidade em ciclos anteriores.
--
-- Quatro estruturas mínimas:
--   1. monitoring_alvo       — o que observar e quando
--   2. monitoring_ciclo      — uma execução do motor
--   3. monitoring_alvo_run   — o que aconteceu com cada alvo naquele ciclo
--   4. monitoring_alerta     — o que mudou e merece olhar humano
--
-- Aditiva. Idempotente. Apenas teste/homologação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Alvo de monitoramento
--
-- Parte é o alvo central — não existe universo separado para artista, marca ou
-- cliente. Alvo é EXPLÍCITO: a base inteira não entra em monitoramento sozinha.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.monitoring_alvo (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parte_id               UUID NOT NULL REFERENCES cross_core.parte(id) ON DELETE CASCADE,

  -- Contexto operacional opcional. Pode informar cadência, nunca score.
  candidatura_parceiro_id UUID REFERENCES cross_projects.candidatura_parceiro(id) ON DELETE SET NULL,
  projeto_id             UUID REFERENCES cross_projects.projeto(id) ON DELETE SET NULL,

  -- ativo | pausado | arquivado
  status                 VARCHAR(20) NOT NULL DEFAULT 'ativo',
  -- baixa | normal | alta — prioridade de VERIFICAÇÃO, não valor comercial.
  prioridade             VARCHAR(10) NOT NULL DEFAULT 'normal',
  -- Intervalo em horas. Representação simples: cron por alvo seria excesso.
  cadencia_horas         INTEGER NOT NULL DEFAULT 168,

  ultima_verificacao_em  TIMESTAMPTZ,
  -- Coluna materializada: a seleção de vencidos precisa ser um index scan,
  -- não um cálculo sobre a base inteira a cada ciclo.
  proxima_verificacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_sucesso_em      TIMESTAMPTZ,
  falhas_consecutivas    INTEGER NOT NULL DEFAULT 0,

  -- Referências e hashes do que já foi observado. NUNCA HTML ou payload bruto.
  checkpoint             JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lease: impede que dois workers processem o mesmo alvo. Com expiry, para que
  -- um worker morto não trave o alvo para sempre.
  reservado_ate          TIMESTAMPTZ,
  reservado_por          VARCHAR(80),

  criado_por_id          UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.monitoring_alvo IS
  'Entidade sob observação. Registro EXPLÍCITO: a base não entra em monitoramento automaticamente.';
COMMENT ON COLUMN cross_ai.monitoring_alvo.prioridade IS
  'Prioridade de verificação. Não é Cross Score nem chance de parceria.';
COMMENT ON COLUMN cross_ai.monitoring_alvo.checkpoint IS
  'Hashes e refs do que já foi visto. Sem HTML, sem scrape, sem prompt.';
COMMENT ON COLUMN cross_ai.monitoring_alvo.reservado_ate IS
  'Lease com expiry: worker que morre não deixa o alvo travado para sempre.';

-- Um alvo por Parte: registrar a mesma entidade duas vezes duplicaria trabalho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoring_alvo_parte
  ON cross_ai.monitoring_alvo (parte_id);

-- Índice da consulta principal: alvos ativos e vencidos, por prioridade.
CREATE INDEX IF NOT EXISTS idx_monitoring_alvo_due
  ON cross_ai.monitoring_alvo (status, proxima_verificacao_em)
  WHERE status = 'ativo';

-- -----------------------------------------------------------------------------
-- 2. Ciclo de monitoramento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.monitoring_ciclo (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em         TIMESTAMPTZ,

  alvos_vencidos        INTEGER NOT NULL DEFAULT 0,
  alvos_processados     INTEGER NOT NULL DEFAULT 0,
  alvos_sucesso         INTEGER NOT NULL DEFAULT 0,
  alvos_falha           INTEGER NOT NULL DEFAULT 0,

  evidencias_novas      INTEGER NOT NULL DEFAULT 0,
  momentos_novos        INTEGER NOT NULL DEFAULT 0,
  momentos_atualizados  INTEGER NOT NULL DEFAULT 0,
  alertas_criados       INTEGER NOT NULL DEFAULT 0,

  -- Métrica central da Sprint: quanto processamento foi EVITADO.
  research_evitados     INTEGER NOT NULL DEFAULT 0,
  big_moment_evitados   INTEGER NOT NULL DEFAULT 0,

  custo_estimado_usd    NUMERIC(12,6) NOT NULL DEFAULT 0,
  avisos                JSONB NOT NULL DEFAULT '[]'::jsonb,
  worker_id             VARCHAR(80)
);

COMMENT ON COLUMN cross_ai.monitoring_ciclo.big_moment_evitados IS
  'Execuções de Big Moment evitadas pelo fast path de "sem mudança". É a economia que justifica o Monitoring.';

-- -----------------------------------------------------------------------------
-- 3. Execução por alvo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.monitoring_alvo_run (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id              UUID NOT NULL REFERENCES cross_ai.monitoring_ciclo(id) ON DELETE CASCADE,
  alvo_id               UUID NOT NULL REFERENCES cross_ai.monitoring_alvo(id) ON DELETE CASCADE,

  -- sucesso | falha | sem_mudanca | pulado | bloqueado_orcamento
  status                VARCHAR(30) NOT NULL,
  -- Classificação do delta observado.
  delta                 VARCHAR(40) NOT NULL,

  iniciado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em         TIMESTAMPTZ,

  evidencias_antes      INTEGER NOT NULL DEFAULT 0,
  evidencias_depois     INTEGER NOT NULL DEFAULT 0,
  evidencias_novas      INTEGER NOT NULL DEFAULT 0,

  big_moment_executado  BOOLEAN NOT NULL DEFAULT FALSE,
  alertas_criados       INTEGER NOT NULL DEFAULT 0,

  erro                  TEXT,
  proxima_verificacao_em TIMESTAMPTZ,
  detalhe               JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_monitoring_run_ciclo
  ON cross_ai.monitoring_alvo_run (ciclo_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_run_alvo
  ON cross_ai.monitoring_alvo_run (alvo_id, iniciado_em DESC);

-- -----------------------------------------------------------------------------
-- 4. Alerta
--
-- Sinal interno para revisão humana. NÃO é notificação externa, não é
-- Recommendation, não é oportunidade.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.monitoring_alerta (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  alvo_id               UUID NOT NULL REFERENCES cross_ai.monitoring_alvo(id) ON DELETE CASCADE,
  parte_id              UUID NOT NULL REFERENCES cross_core.parte(id) ON DELETE CASCADE,
  ciclo_id              UUID REFERENCES cross_ai.monitoring_ciclo(id) ON DELETE SET NULL,

  tipo                  VARCHAR(40) NOT NULL,
  -- info | baixa | media | alta — prioridade de REVISÃO, não valor comercial.
  severidade            VARCHAR(10) NOT NULL DEFAULT 'info',

  titulo                VARCHAR(300) NOT NULL,
  resumo                TEXT NOT NULL,

  evidence_refs         TEXT[] NOT NULL DEFAULT '{}',
  big_moment_refs       TEXT[] NOT NULL DEFAULT '{}',

  -- Impede o mesmo evento virar alerta a cada ciclo.
  deduplication_key     VARCHAR(120) NOT NULL,
  -- Correlação SECUNDÁRIA da AI-10. Não substitui o fingerprint da AI-09.
  correlation_key       VARCHAR(120),

  -- novo | visto | descartado | resolvido. Nunca 'aprovado': alerta é para ler.
  status                VARCHAR(20) NOT NULL DEFAULT 'novo',
  nivel_validacao       VARCHAR(30) NOT NULL DEFAULT 'estrutural',

  detectado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.monitoring_alerta IS
  'Mudança que merece olhar humano. Não é notificação externa, não é Recommendation, não cria oportunidade.';
COMMENT ON COLUMN cross_ai.monitoring_alerta.deduplication_key IS
  'Mesmo evento em ciclos consecutivos não gera alerta novo.';
COMMENT ON COLUMN cross_ai.monitoring_alerta.correlation_key IS
  'Correlação secundária (entidade+tipo+assunto, SEM data). Detecta evento possivelmente relacionado sem alterar o fingerprint estrito da AI-09.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoring_alerta_dedupe
  ON cross_ai.monitoring_alerta (deduplication_key);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerta_parte
  ON cross_ai.monitoring_alerta (parte_id, detectado_em DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerta_novos
  ON cross_ai.monitoring_alerta (status, detectado_em DESC) WHERE status = 'novo';
CREATE INDEX IF NOT EXISTS idx_monitoring_alerta_correlacao
  ON cross_ai.monitoring_alerta (correlation_key) WHERE correlation_key IS NOT NULL;
