-- =============================================================================
-- 063 — Big Moment Signal
--
-- Sprint AI-09.
--
-- AUDITORIA: `cross_intelligence.big_moment` JÁ EXISTE, mas é outra coisa.
--
--   cross_intelligence.big_moment
--     └── pessoa_id NOT NULL → cross_core.pessoa
--
-- É uma agenda de marcos PESSOAIS, presa a `pessoa`. Não comporta marca,
-- empresa nem Cliente Cross, e não guarda proveniência de Evidence, status
-- temporal, fingerprint ou versão.
--
-- Reaproveitá-la exigiria desfigurar uma feature existente do domínio. Por isso
-- esta migration cria uma estrutura NOVA e SEPARADA em cross_ai, junto das
-- demais saídas de agente — e deixa `big_moment` intacta.
--
-- Aditiva. Idempotente. Apenas teste/homologação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cross_ai.big_moment_signal (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parte, não pessoa: funciona para artista, marca, empresa e Cliente Cross.
  -- Artista é Parte com papel, não um domínio paralelo.
  parte_id               UUID REFERENCES cross_core.parte(id) ON DELETE CASCADE,
  entidade_nome          VARCHAR(200) NOT NULL,

  event_type             VARCHAR(40) NOT NULL,
  titulo                 VARCHAR(300) NOT NULL,
  resumo_factual         TEXT NOT NULL,

  -- announced | scheduled | ongoing | completed | cancelled | unknown
  -- Anúncio NÃO é ocorrência: "turnê anunciada" ≠ "turnê aconteceu".
  temporal_status        VARCHAR(20) NOT NULL,
  -- Expressão original quando a data não é normalizável ("segundo semestre").
  expressao_temporal     VARCHAR(200),

  anunciado_em           DATE,
  inicia_em              DATE,
  termina_em             DATE,
  ocorreu_em             DATE,

  -- Base do Monitoring (AI-10): desde quando conhecemos, e quando revimos.
  primeiro_visto_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_visto_em        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- pre_event | active | post_event | expired | unknown
  janela_oportunidade    VARCHAR(20) NOT NULL DEFAULT 'unknown',

  -- fact_ids do Evidence Package. Big Moment sem Evidence não existe.
  evidence_refs          TEXT[] NOT NULL DEFAULT '{}',
  -- corroborada | fonte_unica | conflitante
  forca_verificacao      VARCHAR(20) NOT NULL,
  dominios_independentes INTEGER NOT NULL DEFAULT 0,

  -- Score de TRIAGEM. Não é Cross Score, não é probabilidade de parceria.
  prioridade_score       NUMERIC(6,2) NOT NULL DEFAULT 0,
  componentes_relevancia JSONB NOT NULL DEFAULT '[]'::jsonb,

  conflitos              JSONB NOT NULL DEFAULT '[]'::jsonb,
  lacunas                TEXT[] NOT NULL DEFAULT '{}',

  -- Identidade determinística do evento: entidade + tipo + assunto + contexto
  -- temporal. É o que impede dez matérias virarem dez momentos.
  event_fingerprint      VARCHAR(64) NOT NULL,

  versao                 INTEGER NOT NULL DEFAULT 1,
  nivel_validacao        VARCHAR(30) NOT NULL DEFAULT 'estrutural',
  classifier_mode        VARCHAR(30) NOT NULL DEFAULT 'deterministico',
  classifier_versao      VARCHAR(30) NOT NULL,

  execucao_id            UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.big_moment_signal IS
  'Sinal de momento temporal relevante. Distinto de cross_intelligence.big_moment, que é agenda de marcos pessoais presa a `pessoa`.';
COMMENT ON COLUMN cross_ai.big_moment_signal.event_fingerprint IS
  'Identidade determinística do evento. Mesma impressão = mesmo momento; nova Evidence atualiza em vez de duplicar.';
COMMENT ON COLUMN cross_ai.big_moment_signal.prioridade_score IS
  'Score de TRIAGEM para ordenar o que olhar primeiro. Não é Cross Score nem avaliação estratégica.';
COMMENT ON COLUMN cross_ai.big_moment_signal.temporal_status IS
  'announced ≠ completed. Anúncio de turnê não significa turnê realizada.';

-- Um momento por (entidade, impressão digital). Nova Evidence sobre o mesmo
-- evento atualiza a linha; não cria outra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_big_moment_fingerprint
  ON cross_ai.big_moment_signal (event_fingerprint);

CREATE INDEX IF NOT EXISTS idx_big_moment_parte
  ON cross_ai.big_moment_signal (parte_id, ultimo_visto_em DESC)
  WHERE parte_id IS NOT NULL;
-- Sustenta "quais momentos estão ativos agora?" sem reprocessar análises.
CREATE INDEX IF NOT EXISTS idx_big_moment_janela
  ON cross_ai.big_moment_signal (janela_oportunidade, prioridade_score DESC);
-- Sustenta "o que apareceu desde X?" — base do Monitoring.
CREATE INDEX IF NOT EXISTS idx_big_moment_recentes
  ON cross_ai.big_moment_signal (primeiro_visto_em DESC);

-- -----------------------------------------------------------------------------
-- Histórico de versões
--
-- Um momento muda: anunciado → agendado → cancelado. Sobrescrever apagaria a
-- trajetória, que é justamente o que importa para o Monitoring.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.big_moment_versao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  big_moment_id     UUID NOT NULL REFERENCES cross_ai.big_moment_signal(id) ON DELETE CASCADE,
  versao            INTEGER NOT NULL,
  temporal_status   VARCHAR(20) NOT NULL,
  evidence_refs     TEXT[] NOT NULL DEFAULT '{}',
  motivo_mudanca    VARCHAR(200),
  snapshot          JSONB NOT NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.big_moment_versao IS
  'Trajetória do momento. Cancelamento não apaga o agendamento anterior — a mudança É a informação.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_big_moment_versao
  ON cross_ai.big_moment_versao (big_moment_id, versao);
