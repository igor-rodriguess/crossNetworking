-- =============================================================================
-- 062 — Meeting Intelligence
--
-- Sprint AI-08.
--
-- AUDITORIA (§4): o domínio NÃO possuía onde guardar conteúdo de reunião.
--   cross_execution.reuniao tinha apenas `resumo` (text) — um campo de resumo
--   humano, não ata nem transcript. Não existe tabela de transcript, ata ou
--   anexo de reunião em lugar nenhum do schema.
--
-- Por isso esta migration cria DUAS estruturas:
--
--   1. cross_execution.reuniao_conteudo
--      O conteúdo em si (notas, ata, transcript), VERSIONADO. Editar a ata não
--      pode reescrever silenciosamente a análise já feita sobre a versão
--      anterior — por isso versão + hash.
--
--   2. cross_ai.analise_reuniao
--      A análise derivada. Fica em cross_ai, junto das demais análises, e
--      NUNCA dentro da reunião: sobrescrever o conteúdo original com
--      interpretação destruiria a fonte.
--
-- Aditiva. Nada é removido. Idempotente. Apenas teste/homologação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Conteúdo de reunião, versionado
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_execution.reuniao_conteudo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reuniao_id     UUID NOT NULL REFERENCES cross_execution.reuniao(id) ON DELETE CASCADE,

  -- notas | ata | transcript | transcript_timestamped | texto_importado
  tipo_conteudo  VARCHAR(30) NOT NULL DEFAULT 'notas',
  conteudo       TEXT NOT NULL,

  -- Identidade do conteúdo. A análise aponta para o hash, então editar o texto
  -- gera nova versão em vez de invalidar a análise histórica.
  versao         INTEGER NOT NULL DEFAULT 1,
  conteudo_hash  VARCHAR(64) NOT NULL,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por_id  UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL
);

COMMENT ON TABLE cross_execution.reuniao_conteudo IS
  'Conteúdo textual da reunião, versionado. Antes da 062 o domínio só tinha `resumo` — não havia onde guardar ata ou transcript.';
COMMENT ON COLUMN cross_execution.reuniao_conteudo.conteudo_hash IS
  'SHA-256 do conteúdo. Editar o texto cria nova versão; a análise antiga continua apontando para o hash que analisou.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reuniao_conteudo_versao
  ON cross_execution.reuniao_conteudo (reuniao_id, versao);
CREATE INDEX IF NOT EXISTS idx_reuniao_conteudo_reuniao
  ON cross_execution.reuniao_conteudo (reuniao_id, versao DESC);

-- -----------------------------------------------------------------------------
-- 2. Análise da reunião
--
-- Derivada, nunca destrutiva. O conteúdo original permanece intocado em
-- `reuniao_conteudo`; aqui vive apenas a interpretação.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.analise_reuniao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reuniao_id          UUID NOT NULL REFERENCES cross_execution.reuniao(id) ON DELETE CASCADE,
  conteudo_id         UUID REFERENCES cross_execution.reuniao_conteudo(id) ON DELETE SET NULL,
  -- Guardado à parte para sobreviver mesmo se a linha de conteúdo sumir: é o
  -- que prova QUAL texto foi analisado.
  conteudo_hash       VARCHAR(64) NOT NULL,
  conteudo_versao     INTEGER NOT NULL,

  -- Como a extração foi feita. `deterministico` hoje; o campo existe para que
  -- trocar por modelo real não exija migration nem reescrita do contrato.
  extractor_mode      VARCHAR(30) NOT NULL,
  extractor_versao    VARCHAR(30) NOT NULL,

  -- Enquanto não houver validação semântica real, permanece 'estrutural'.
  nivel_validacao     VARCHAR(30) NOT NULL DEFAULT 'estrutural',

  status              VARCHAR(40) NOT NULL,

  resultado           JSONB NOT NULL,
  resumo_executivo    TEXT,

  total_segmentos     INTEGER NOT NULL DEFAULT 0,
  total_lotes         INTEGER NOT NULL DEFAULT 0,
  total_itens         INTEGER NOT NULL DEFAULT 0,
  speakers_nao_resolvidos INTEGER NOT NULL DEFAULT 0,

  duracao_ms          INTEGER,
  llm_calls           INTEGER NOT NULL DEFAULT 0,
  custo_estimado_usd  NUMERIC(12,6) NOT NULL DEFAULT 0,

  versao_analise      INTEGER NOT NULL DEFAULT 1,
  execucao_id         UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por_id       UUID REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL
);

COMMENT ON TABLE cross_ai.analise_reuniao IS
  'Análise derivada de uma reunião. Vive em cross_ai, nunca dentro da reunião: interpretação não sobrescreve fonte.';
COMMENT ON COLUMN cross_ai.analise_reuniao.status IS
  'analisada | conteudo_insuficiente. Conteúdo vazio não gera inteligência fabricada.';
COMMENT ON COLUMN cross_ai.analise_reuniao.extractor_mode IS
  'deterministico | local | pago. Registrar o modo impede comparar análises produzidas por extratores diferentes como se fossem equivalentes.';

-- Idempotência: mesma reunião + mesmo conteúdo + mesmo extrator não gera
-- análise duplicada. Reanalisar após edição do texto muda o hash e cria nova.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analise_reuniao_idempotente
  ON cross_ai.analise_reuniao (reuniao_id, conteudo_hash, extractor_versao);

CREATE INDEX IF NOT EXISTS idx_analise_reuniao_reuniao
  ON cross_ai.analise_reuniao (reuniao_id, criado_em DESC);
