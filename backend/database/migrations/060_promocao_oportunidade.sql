-- =============================================================================
-- 060 — Promoção de Recommendation para Oportunidade
--
-- Sprint AI-07B.
--
-- Liga a camada de inteligência ao domínio operacional. Registra a AÇÃO HUMANA
-- EXPLÍCITA que transformou uma hipótese aprovada numa candidatura real.
--
-- Existe para responder, depois: "qual Recommendation originou esta
-- oportunidade, e quem decidiu promovê-la?".
--
-- Não altera `candidatura_parceiro`, `avaliacao_score_card` nem
-- `validacao_paper`: RN022 e RN023 permanecem exatamente como estão. A
-- candidatura é criada pelo service existente, não por INSERT direto.
--
-- Idempotente. Aplicada apenas em teste/homologação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cross_ai.promocao_oportunidade (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origem na inteligência.
  recomendacao_id          UUID NOT NULL REFERENCES cross_ai.recomendacao(id) ON DELETE RESTRICT,
  recomendacao_versao      INTEGER NOT NULL,
  -- A revisão humana que autorizou. Sem ela não há promoção legítima.
  revisao_id               UUID NOT NULL REFERENCES cross_ai.recomendacao_revisao(id) ON DELETE RESTRICT,

  -- Destino no domínio operacional.
  candidatura_parceiro_id  UUID NOT NULL REFERENCES cross_projects.candidatura_parceiro(id) ON DELETE RESTRICT,
  frente_oportunidade_id   UUID NOT NULL REFERENCES cross_projects.frente_oportunidade(id) ON DELETE RESTRICT,

  -- Quem promoveu. Vem do contexto autenticado, nunca do payload: a IA jamais
  -- pode figurar como autora de uma criação operacional.
  promovido_por_id         UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL,
  promovido_por_nome       VARCHAR(200),
  promovido_em             TIMESTAMPTZ NOT NULL DEFAULT now(),

  observacao               TEXT,

  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.promocao_oportunidade IS
  'Ação humana explícita que promoveu uma hipótese aprovada a candidatura. É o elo entre inteligência e funil.';
COMMENT ON COLUMN cross_ai.promocao_oportunidade.revisao_id IS
  'Human Gate (AI-07A) que autorizou. Promoção sem revisão aprovada é rejeitada pelo serviço.';
COMMENT ON COLUMN cross_ai.promocao_oportunidade.promovido_por_id IS
  'Usuário autenticado. A IA nunca promove: criação operacional exige ator humano.';

-- Uma promoção por recomendação. É o que torna clique duplo idempotente e
-- impede duas oportunidades para a mesma hipótese.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promocao_por_recomendacao
  ON cross_ai.promocao_oportunidade (recomendacao_id);

CREATE INDEX IF NOT EXISTS idx_promocao_candidatura
  ON cross_ai.promocao_oportunidade (candidatura_parceiro_id);
CREATE INDEX IF NOT EXISTS idx_promocao_promotor
  ON cross_ai.promocao_oportunidade (promovido_por_id) WHERE promovido_por_id IS NOT NULL;
