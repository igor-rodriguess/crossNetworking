-- =============================================================================
-- 061 — Reunião com contexto flexível
--
-- Sprint DOMAIN-01. Pré-requisito para AI-08 (Meeting Intelligence).
--
-- PROBLEMA ENCONTRADO NA AUDITORIA
--
--   cross_execution.reuniao.parceria_id  NOT NULL
--   fk_reuniao_parceria → cross_partnerships.parceria(id) ON DELETE RESTRICT
--
-- Ou seja: nenhuma reunião podia existir sem uma parceria JÁ FECHADA. Isso
-- inverte a ordem real do negócio — a conversa acontece muito antes da
-- parceria, e é justamente ela que decide se vai existir parceria.
--
-- Consequência prática: uma reunião exploratória com uma marca em prospecção
-- simplesmente não tinha onde ser registrada.
--
-- O QUE ESTA MIGRATION FAZ
--
--   1. torna `parceria_id` opcional (o vínculo legado continua funcionando)
--   2. adiciona contexto opcional de oportunidade e projeto
--   3. adiciona tipo e status de reunião
--
-- ADITIVA: nenhuma coluna é removida, nenhum dado é perdido. Reuniões
-- existentes continuam com sua parceria e seguem válidas.
--
-- Idempotente. Aplicada apenas em teste/homologação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Parceria deixa de ser obrigatória
--
-- Continua sendo uma referência legítima quando a parceria existe. O que muda é
-- que ela para de ser pré-condição para a reunião existir.
-- -----------------------------------------------------------------------------
ALTER TABLE cross_execution.reuniao
  ALTER COLUMN parceria_id DROP NOT NULL;

COMMENT ON COLUMN cross_execution.reuniao.parceria_id IS
  'Contexto de parceria. OPCIONAL desde a 061: a reunião costuma acontecer antes de existir parceria.';

-- -----------------------------------------------------------------------------
-- 2. Contexto opcional de oportunidade e projeto
--
-- ON DELETE SET NULL, não CASCADE: arquivar uma oportunidade não pode apagar a
-- reunião que aconteceu de verdade. O histórico da conversa sobrevive ao
-- contexto que a motivou.
-- -----------------------------------------------------------------------------
ALTER TABLE cross_execution.reuniao
  ADD COLUMN IF NOT EXISTS candidatura_parceiro_id UUID
    REFERENCES cross_projects.candidatura_parceiro(id) ON DELETE SET NULL;

ALTER TABLE cross_execution.reuniao
  ADD COLUMN IF NOT EXISTS projeto_id UUID
    REFERENCES cross_projects.projeto(id) ON DELETE SET NULL;

COMMENT ON COLUMN cross_execution.reuniao.candidatura_parceiro_id IS
  'Oportunidade que contextualiza a reunião. OPCIONAL: conversa exploratória não tem oportunidade formal.';
COMMENT ON COLUMN cross_execution.reuniao.projeto_id IS
  'Projeto que contextualiza a reunião. OPCIONAL. ON DELETE SET NULL preserva a reunião histórica.';

CREATE INDEX IF NOT EXISTS idx_reuniao_candidatura
  ON cross_execution.reuniao (candidatura_parceiro_id)
  WHERE candidatura_parceiro_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reuniao_projeto
  ON cross_execution.reuniao (projeto_id)
  WHERE projeto_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Tipo e status
--
-- A tabela não tinha nenhum dos dois. Sem eles, não há como distinguir uma
-- reunião planejada de uma já realizada — e o Meeting Intelligence precisará
-- saber se há conteúdo a analisar.
--
-- Status são poucos e descritivos de propósito. NÃO existe estado "aprovada":
-- o domínio atual não tem Human Gate de reunião, e inventar um aqui criaria
-- uma regra de negócio que ninguém pediu.
-- -----------------------------------------------------------------------------
ALTER TABLE cross_execution.reuniao
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(40) NOT NULL DEFAULT 'reuniao';

ALTER TABLE cross_execution.reuniao
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'planejada';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_reuniao_status'
  ) THEN
    ALTER TABLE cross_execution.reuniao
      ADD CONSTRAINT ck_reuniao_status
      CHECK (status IN ('planejada', 'realizada', 'cancelada'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_reuniao_tipo'
  ) THEN
    ALTER TABLE cross_execution.reuniao
      ADD CONSTRAINT ck_reuniao_tipo
      CHECK (tipo IN ('reuniao', 'exploratoria', 'apresentacao', 'negociacao', 'acompanhamento'));
  END IF;
END $$;

COMMENT ON COLUMN cross_execution.reuniao.status IS
  'planejada | realizada | cancelada. Não existe "aprovada": o domínio não possui Human Gate de reunião.';

-- -----------------------------------------------------------------------------
-- 4. Integridade de contexto
--
-- Uma reunião de oportunidade não pode apontar para um projeto de outra cadeia.
-- A relação real é candidatura → frente_oportunidade → projeto, então quando os
-- dois vierem preenchidos eles precisam pertencer ao mesmo projeto.
--
-- Trigger em vez de CHECK porque a validação atravessa três tabelas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cross_execution.fn_validar_contexto_reuniao()
RETURNS TRIGGER AS $$
DECLARE
  projeto_da_candidatura UUID;
BEGIN
  IF NEW.candidatura_parceiro_id IS NOT NULL AND NEW.projeto_id IS NOT NULL THEN
    SELECT fo.projeto_id INTO projeto_da_candidatura
      FROM cross_projects.candidatura_parceiro cp
      JOIN cross_projects.frente_oportunidade fo ON fo.id = cp.frente_oportunidade_id
     WHERE cp.id = NEW.candidatura_parceiro_id;

    IF projeto_da_candidatura IS DISTINCT FROM NEW.projeto_id THEN
      RAISE EXCEPTION
        'Contexto inconsistente: a candidatura % pertence ao projeto %, não ao projeto %',
        NEW.candidatura_parceiro_id, projeto_da_candidatura, NEW.projeto_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reuniao_validar_contexto ON cross_execution.reuniao;
CREATE TRIGGER trg_reuniao_validar_contexto
  BEFORE INSERT OR UPDATE ON cross_execution.reuniao
  FOR EACH ROW EXECUTE FUNCTION cross_execution.fn_validar_contexto_reuniao();

COMMENT ON FUNCTION cross_execution.fn_validar_contexto_reuniao() IS
  'Impede reunião apontando para candidatura e projeto de cadeias diferentes. Validação proporcional: só age quando ambos existem.';
