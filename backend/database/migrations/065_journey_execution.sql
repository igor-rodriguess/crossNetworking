-- =============================================================================
-- 065 — Journey Execution (Cross Orchestrator)
--
-- Sprint E2E-01.
--
-- AUDITORIA: `cross_ai.execucao_agente` já persiste execução de AGENTE, e
-- `tarefa_pipeline` já tem checkpoint. Nenhuma das duas representa uma JORNADA
-- de negócio atravessando vários agentes com pausas humanas no meio.
--
-- Esta migration adiciona o nível COORDENADOR. `execucao_agente` continua sendo
-- o filho — não é substituída nem duplicada.
--
--   journey_execution           ← a jornada (pai)
--     └── journey_step          ← cada etapa, com estado próprio
--           └── execucao_agente ← execução real do agente (já existente)
--
-- Aditiva. Idempotente. Apenas teste/homologação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cross_ai.journey_execution (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- cliente_para_parceiro | parceiro_para_cliente | prospeccao_do_zero
  journey_type          VARCHAR(40) NOT NULL,

  -- Origem da jornada. Mesmo quando não é humana, todo efeito operacional
  -- continua submetido aos Human Gates.
  trigger_source        VARCHAR(30) NOT NULL DEFAULT 'humano',
  trigger_ref           VARCHAR(120),

  -- Source pode ser externa e não vinculada (prospecção do zero).
  parte_origem_id       UUID REFERENCES cross_core.parte(id) ON DELETE SET NULL,
  nome_origem           VARCHAR(200) NOT NULL,
  objetivo              TEXT,

  status                VARCHAR(40) NOT NULL DEFAULT 'criada',
  -- Motivo quando a jornada para sem concluir: aguardando humano, evidência
  -- insuficiente, entidade não resolvida.
  --
  -- TEXT e não VARCHAR curto: este campo é explicação para humano. Um limite
  -- apertado forçaria truncar a razão da parada — e uma razão truncada é pior
  -- do que nenhuma, porque parece completa.
  motivo_parada         TEXT,

  -- Resultados alcançados, por referência.
  recomendacao_id       UUID REFERENCES cross_ai.recomendacao(id) ON DELETE SET NULL,
  revisao_id            UUID REFERENCES cross_ai.recomendacao_revisao(id) ON DELETE SET NULL,
  promocao_id           UUID REFERENCES cross_ai.promocao_oportunidade(id) ON DELETE SET NULL,
  candidatura_id        UUID REFERENCES cross_projects.candidatura_parceiro(id) ON DELETE SET NULL,

  -- Correlaciona todos os logs e execuções filhas desta jornada.
  correlation_id        VARCHAR(60) NOT NULL,
  -- Optimistic locking: dois resumes simultâneos não executam a mesma etapa.
  versao                INTEGER NOT NULL DEFAULT 1,

  nivel_validacao       VARCHAR(40) NOT NULL DEFAULT 'estrutural',

  criado_por_id         UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em         TIMESTAMPTZ
);

COMMENT ON TABLE cross_ai.journey_execution IS
  'Jornada de negócio coordenando vários agentes. É o PAI de execucao_agente, nunca substituto.';
COMMENT ON COLUMN cross_ai.journey_execution.trigger_source IS
  'humano | monitoring_alert | meeting_signal | big_moment | system_test. Origem não-humana não dispensa Human Gate.';
COMMENT ON COLUMN cross_ai.journey_execution.motivo_parada IS
  'Pausa humana NÃO é erro: aguardando_revisao ≠ evidencia_insuficiente ≠ falha.';

CREATE INDEX IF NOT EXISTS idx_journey_status
  ON cross_ai.journey_execution (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_journey_correlation
  ON cross_ai.journey_execution (correlation_id);
CREATE INDEX IF NOT EXISTS idx_journey_origem
  ON cross_ai.journey_execution (parte_origem_id) WHERE parte_origem_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Etapa da jornada
--
-- Cada etapa tem estado próprio: executada, reutilizada, pulada, aguardando
-- humano ou bloqueada. Um booleano não distinguiria "reutilizei porque já
-- existia" de "pulei porque não era necessário" — e essa diferença é
-- exatamente a economia que o Orchestrator precisa provar.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.journey_step (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID NOT NULL REFERENCES cross_ai.journey_execution(id) ON DELETE CASCADE,

  ordem                 INTEGER NOT NULL,
  step                  VARCHAR(40) NOT NULL,
  -- pendente | executando | concluida | falha | pulada | reutilizada
  -- | aguardando_humano | bloqueada
  status                VARCHAR(30) NOT NULL DEFAULT 'pendente',

  -- Por que foi reutilizada ou pulada. Sem isso, a economia seria um número
  -- sem explicação — então o texto não pode ser truncado para caber.
  motivo                TEXT,

  -- Aponta a execução real do agente. Em etapa reutilizada, aponta a ANTERIOR.
  execucao_agente_id    UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,
  -- Referência do artefato produzido/reaproveitado (hash, id, versão).
  output_ref            VARCHAR(120),
  output_versao         INTEGER,

  -- Tamanho do contexto entregue ao agente — base da otimização de tokens.
  contexto_caracteres   INTEGER NOT NULL DEFAULT 0,
  duracao_ms            INTEGER,
  erro                  TEXT,

  iniciado_em           TIMESTAMPTZ,
  finalizado_em         TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN cross_ai.journey_step.status IS
  'reutilizada ≠ pulada: a primeira reaproveita artefato válido; a segunda nem precisava rodar.';
COMMENT ON COLUMN cross_ai.journey_step.execucao_agente_id IS
  'Em etapa reutilizada aponta para a execução ANTERIOR — é o que prova que não houve rerun.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_step_ordem
  ON cross_ai.journey_step (journey_id, ordem);
CREATE INDEX IF NOT EXISTS idx_journey_step_journey
  ON cross_ai.journey_step (journey_id, ordem);

-- -----------------------------------------------------------------------------
-- Convergência para bases que já aplicaram a versão inicial desta migration.
--
-- `CREATE TABLE IF NOT EXISTS` não altera tabela existente: sem este bloco, uma
-- base criada antes manteria os VARCHAR curtos e estouraria em runtime ao
-- gravar um motivo completo. Alargar é sempre seguro (nenhum dado perdido).
-- -----------------------------------------------------------------------------
ALTER TABLE cross_ai.journey_execution ALTER COLUMN motivo_parada TYPE TEXT;
ALTER TABLE cross_ai.journey_step      ALTER COLUMN motivo        TYPE TEXT;
