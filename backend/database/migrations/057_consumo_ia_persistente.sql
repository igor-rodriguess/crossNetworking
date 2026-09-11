-- =============================================================================
-- 057 — Consumo de IA persistente (guardrails globais)
--
-- Sprint AI-04.1 · pré-condição bloqueante.
--
-- O guardrail existente vive na memória do processo: `OrcamentoExecucao` conta
-- custo POR EXECUÇÃO e some quando o Node reinicia. Isso basta para impedir um
-- laço descontrolado numa execução, e não basta para ligar provider pago: com
-- teto só por execução, mil execuções de US$ 0,10 custam US$ 100 sem nenhum
-- bloqueio.
--
-- Aqui persistimos o consumo para sustentar tetos DIÁRIO, MENSAL e POR CLIENTE.
-- Deliberadamente simples: um livro-razão append-only e uma view de acumulados.
-- Não é sistema financeiro — é o mínimo para responder "quanto já gastamos
-- hoje/este mês/neste cliente?" depois de um restart.
--
-- Idempotente. Aplicada apenas em teste/homologação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Livro-razão de consumo
--
-- Uma linha por chamada cobrável. Append-only: corrigir consumo passado
-- reescrevendo história tornaria a auditoria inútil.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.consumo_ia (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dia de competência. Coluna própria (não derivada em consulta) para o
  -- índice do teto diário ser direto e barato.
  dia               DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Primeiro dia do mês de competência; mesma razão.
  mes               DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,

  -- Contexto de cobrança. NULL = consumo global, não atribuível a um cliente.
  cliente_cross_id  UUID REFERENCES cross_commercial.cliente_cross(id) ON DELETE SET NULL,

  agente            VARCHAR(60)  NOT NULL,
  operacao          VARCHAR(60)  NOT NULL,
  provedor          VARCHAR(30)  NOT NULL,
  modelo            VARCHAR(80),

  tokens_entrada    INTEGER      NOT NULL DEFAULT 0,
  tokens_saida      INTEGER      NOT NULL DEFAULT 0,
  tokens_cache      INTEGER      NOT NULL DEFAULT 0,

  -- Estimado ANTES da chamada; real DEPOIS. Guardar os dois permite medir o
  -- erro da estimativa, que é o que sustenta a projeção do bloqueio preditivo.
  custo_estimado    NUMERIC(12,6),
  custo_real        NUMERIC(12,6),

  -- Rastreabilidade até a execução que originou o gasto.
  execucao_id       UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,
  run_id            VARCHAR(80),

  duracao_ms        INTEGER,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Consumo local (Ollama) é registrado para observabilidade, mas não fatura.
  -- Sem esta marca, medir uso do modelo local inflaria o custo acumulado.
  local             BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE cross_ai.consumo_ia IS
  'Livro-razão append-only de consumo de IA. Sustenta tetos diário, mensal e por cliente que sobrevivem a restart do processo.';
COMMENT ON COLUMN cross_ai.consumo_ia.local IS
  'TRUE para provedor local (Ollama): consome tempo, não dinheiro. Excluído dos acumulados de custo.';
COMMENT ON COLUMN cross_ai.consumo_ia.custo_estimado IS
  'Projeção feita ANTES da chamada. NULL = não estimável — em modo estrito isso bloqueia, nunca é tratado como zero.';

CREATE INDEX IF NOT EXISTS idx_consumo_ia_dia
  ON cross_ai.consumo_ia (dia) WHERE local = FALSE;
CREATE INDEX IF NOT EXISTS idx_consumo_ia_mes
  ON cross_ai.consumo_ia (mes) WHERE local = FALSE;
CREATE INDEX IF NOT EXISTS idx_consumo_ia_cliente_mes
  ON cross_ai.consumo_ia (cliente_cross_id, mes) WHERE cliente_cross_id IS NOT NULL AND local = FALSE;
CREATE INDEX IF NOT EXISTS idx_consumo_ia_execucao
  ON cross_ai.consumo_ia (execucao_id) WHERE execucao_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Análise Crossability persistida (§23)
--
-- Guarda REFERÊNCIAS, não o payload inteiro: o perfil e a evidência já vivem em
-- suas tabelas, e duplicá-los criaria duas versões da verdade.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cross_ai.analise_crossability (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entidade              VARCHAR(200) NOT NULL,
  parte_id              UUID REFERENCES cross_core.parte(id) ON DELETE SET NULL,
  cliente_cross_id      UUID REFERENCES cross_commercial.cliente_cross(id) ON DELETE SET NULL,

  -- Contexto da análise: não existe fit absoluto, então a mesma entidade pode
  -- ter análises diferentes e ambas corretas.
  objetivo              TEXT,

  -- Qual Entity Intelligence sustentou.
  perfil_versao         INTEGER,
  perfil_hash           VARCHAR(64),

  -- Qual metodologia sustentou. Sem isso não se responde "que versão da
  -- metodologia embasou esta decisão?" depois que a metodologia mudar.
  metodologia_codigo    VARCHAR(80),
  metodologia_versao    INTEGER,

  provedor              VARCHAR(30),
  modelo                VARCHAR(80),

  -- Saída validada pelo backend (já sem referências inventadas).
  analise               JSONB NOT NULL,
  -- Resposta crua do modelo, para auditar o que ele realmente disse.
  saida_bruta           JSONB,

  confianca_global      SMALLINT,
  dimensoes_suportadas  SMALLINT,
  referencias_rejeitadas SMALLINT NOT NULL DEFAULT 0,

  custo_estimado        NUMERIC(12,6),
  duracao_ms            INTEGER,

  -- Agrupa reexecuções da MESMA análise lógica. Nova execução gera nova linha
  -- (histórico preservado) mas compartilha esta chave — §24.
  analise_logica_id     UUID NOT NULL DEFAULT gen_random_uuid(),
  execucao_id           UUID REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL,

  criado_por_id         UUID,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_ai.analise_crossability IS
  'Análise Crossability persistida por referência. Permite auditar depois qual perfil, metodologia e modelo sustentaram cada conclusão.';
COMMENT ON COLUMN cross_ai.analise_crossability.analise_logica_id IS
  'Agrupa reexecuções da mesma análise lógica. Reexecutar cria nova linha; o histórico nunca é sobrescrito.';
COMMENT ON COLUMN cross_ai.analise_crossability.saida_bruta IS
  'Resposta crua do modelo, preservada para auditoria. A coluna `analise` guarda a versão já validada.';

CREATE INDEX IF NOT EXISTS idx_analise_cross_entidade
  ON cross_ai.analise_crossability (entidade, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_analise_cross_logica
  ON cross_ai.analise_crossability (analise_logica_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_analise_cross_parte
  ON cross_ai.analise_crossability (parte_id) WHERE parte_id IS NOT NULL;
