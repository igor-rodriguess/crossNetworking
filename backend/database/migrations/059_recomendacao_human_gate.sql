-- =============================================================================
-- 059 — Recommendation Human Gate
--
-- Sprint AI-07A.
--
-- Registra a DECISÃO HUMANA sobre uma hipótese produzida pela inteligência.
--
-- Fica deliberadamente na camada de inteligência (cross_ai), antes do funil:
--   · não toca em candidatura_parceiro
--   · não toca em avaliacao_score_card
--   · não cria Paper
--
-- Aprovar aqui significa apenas "a Cross aceitou esta hipótese para seguir para
-- o processo de promoção a oportunidade". A promoção em si — candidatura,
-- Paper, Score Card oficial — é AI-07B, e depende de RN022/RN023 que
-- permanecem intocadas.
--
-- Idempotente. Aplicada apenas em teste/homologação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cross_ai.recomendacao_revisao (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A revisão aponta para a LINHA da recomendação, não para a proposta lógica:
  -- a decisão vale para a versão que o humano efetivamente leu. Recomendação
  -- nova gera revisão nova; a antiga não muda retroativamente.
  recomendacao_id         UUID NOT NULL REFERENCES cross_ai.recomendacao(id) ON DELETE CASCADE,
  recomendacao_versao     INTEGER NOT NULL,
  proposta_logica_id      UUID NOT NULL,

  decisao                 VARCHAR(40) NOT NULL,

  -- Identidade real do revisor. Nunca vem do payload do cliente: um corpo de
  -- requisição afirmando "approved_by = CEO" não é prova de autoria.
  revisor_id              UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL,
  revisor_nome            VARCHAR(200),

  -- Snapshot do que a IA propôs, congelado no momento da decisão. Sem isto,
  -- editar a recomendação depois reescreveria o que o humano havia analisado.
  snapshot_ia             JSONB NOT NULL,
  -- Campos alterados pelo humano. NULL quando aprovou sem editar.
  edicoes_humanas         JSONB,
  motivo                  TEXT,

  -- Override explícito de recomendação sem sustentação: registrado, nunca
  -- silencioso.
  override_insuficiente   BOOLEAN NOT NULL DEFAULT FALSE,
  requer_enriquecimento   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Enquanto IA real não for homologada, permanece 'estrutural'.
  nivel_validacao         VARCHAR(30) NOT NULL DEFAULT 'estrutural',

  -- Optimistic locking: dois revisores sobre a mesma versão não se sobrescrevem.
  versao_revisao          INTEGER NOT NULL DEFAULT 1,

  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_em             TIMESTAMPTZ,
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.recomendacao_revisao IS
  'Decisão humana sobre uma hipótese da inteligência. Anterior ao funil: aprovar aqui NÃO cria candidatura, Paper nem Score Card.';
COMMENT ON COLUMN cross_ai.recomendacao_revisao.snapshot_ia IS
  'O que a IA propôs no momento da decisão. Preservado para auditar divergência entre inteligência e equipe.';
COMMENT ON COLUMN cross_ai.recomendacao_revisao.revisor_id IS
  'Vem do contexto autenticado, nunca do payload. Identidade afirmada pelo cliente não é confiável.';
COMMENT ON COLUMN cross_ai.recomendacao_revisao.override_insuficiente IS
  'TRUE quando o humano decidiu apesar de sustentação insuficiente. A insuficiência nunca é ocultada.';

-- Uma decisão efetiva por versão de recomendação. É o que torna a aprovação
-- repetida idempotente em vez de acumular histórico duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_revisao_por_recomendacao
  ON cross_ai.recomendacao_revisao (recomendacao_id)
  WHERE decidido_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revisao_logica
  ON cross_ai.recomendacao_revisao (proposta_logica_id, recomendacao_versao DESC);
CREATE INDEX IF NOT EXISTS idx_revisao_decisao
  ON cross_ai.recomendacao_revisao (decisao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_revisao_revisor
  ON cross_ai.recomendacao_revisao (revisor_id) WHERE revisor_id IS NOT NULL;
