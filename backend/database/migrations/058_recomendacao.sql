-- =============================================================================
-- 058 — Recommendation Proposal
--
-- Sprint AI-06.
--
-- Guarda a PROPOSTA de conexão para avaliação humana. Deliberadamente separada
-- de `candidatura_parceiro` e `frente_oportunidade`: usar as tabelas
-- operacionais como storage transformaria uma hipótese em registro de funil, que
-- é exatamente o que o Human Gate existe para impedir.
--
-- Guarda REFERÊNCIAS ao que sustentou (perfis, Crossability, Matching) em vez de
-- copiar os payloads: duplicá-los criaria duas versões da verdade.
--
-- Idempotente. Aplicada apenas em teste/homologação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cross_ai.recomendacao (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  direcao                 VARCHAR(40)  NOT NULL,

  -- Origem pode ser externa e não vinculada (prospecção do zero): por isso
  -- `parte_id` é anulável e o nome é preservado à parte.
  origem_parte_id         UUID REFERENCES cross_core.parte(id) ON DELETE SET NULL,
  origem_nome             VARCHAR(200) NOT NULL,
  origem_vinculo          VARCHAR(30)  NOT NULL,

  candidato_parte_id      UUID NOT NULL REFERENCES cross_core.parte(id) ON DELETE CASCADE,
  candidato_nome          VARCHAR(200) NOT NULL,

  objetivo                TEXT,

  status                  VARCHAR(40)  NOT NULL,
  nivel_sustentacao       VARCHAR(40)  NOT NULL,
  -- NULL é resultado legítimo: significa que não houve sustentação para propor.
  hipotese_oportunidade   TEXT,

  confianca               SMALLINT     NOT NULL,
  -- Enquanto embeddings e Crossability real não forem homologados, isto
  -- permanece 'estrutural'. Nunca 'producao_homologada'.
  nivel_validacao         VARCHAR(30)  NOT NULL DEFAULT 'estrutural',
  proximo_passo           VARCHAR(50),

  -- Proveniência do que sustentou a proposta.
  perfil_origem_versao    INTEGER,
  perfil_candidato_versao INTEGER,
  crossability_hash       VARCHAR(64),
  matching_pesos_versao   VARCHAR(40),
  -- Hash dos inputs: dois runs com o mesmo hash produziram a mesma proposta.
  hash_entrada            VARCHAR(64)  NOT NULL,

  -- Proposta completa validada. Consultas analíticas usam as colunas acima; o
  -- JSONB preserva a íntegra para auditoria.
  proposta                JSONB        NOT NULL,

  contra_evidencias       SMALLINT     NOT NULL DEFAULT 0,
  lacunas                 SMALLINT     NOT NULL DEFAULT 0,
  riscos                  SMALLINT     NOT NULL DEFAULT 0,

  -- Agrupa versões da MESMA proposta lógica (§37). Reexecutar após mudança de
  -- Evidence/Perfil/Matching cria nova linha; a anterior permanece.
  proposta_logica_id      UUID         NOT NULL DEFAULT gen_random_uuid(),
  versao                  INTEGER      NOT NULL DEFAULT 1,

  execucao_id             UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,
  criado_por_id           UUID,
  criado_em               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.recomendacao IS
  'Proposta de conexão para avaliação humana. NÃO é oportunidade nem registro de funil — o Human Gate decide se vira algo operacional.';
COMMENT ON COLUMN cross_ai.recomendacao.hipotese_oportunidade IS
  'NULL quando não houve sustentação. Não recomendar é resposta válida, não falha.';
COMMENT ON COLUMN cross_ai.recomendacao.proposta_logica_id IS
  'Agrupa versões da mesma proposta lógica. Nova execução cria nova linha; histórico nunca é sobrescrito.';
COMMENT ON COLUMN cross_ai.recomendacao.confianca IS
  'Confiança na SUSTENTAÇÃO da hipótese. Não é probabilidade de fechar parceria nem Score Card.';

CREATE INDEX IF NOT EXISTS idx_recomendacao_candidato
  ON cross_ai.recomendacao (candidato_parte_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_recomendacao_origem
  ON cross_ai.recomendacao (origem_parte_id) WHERE origem_parte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recomendacao_logica
  ON cross_ai.recomendacao (proposta_logica_id, versao DESC);
CREATE INDEX IF NOT EXISTS idx_recomendacao_status
  ON cross_ai.recomendacao (status, criado_em DESC);
