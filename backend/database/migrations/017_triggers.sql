-- =============================================================================
-- 017 – Triggers (WAD 7.4.5, 7.4.8, 7.4.13, 7.4.18)
-- Idempotente: usa DROP TRIGGER IF EXISTS antes de cada CREATE, para ser
-- seguro reexecutar após uma falha de rede parcial.
-- =============================================================================

-- Timestamp automático em todas as tabelas com coluna atualizado_em
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS table_schema, c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relkind = 'r'
          AND n.nspname LIKE 'cross\_%'
          AND a.attname = 'atualizado_em'
          AND NOT a.attisdropped
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_atualizar_timestamp ON %I.%I',
            r.table_name, r.table_schema, r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_atualizar_timestamp
             BEFORE UPDATE ON %I.%I
             FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp()',
            r.table_name, r.table_schema, r.table_name
        );
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Especialização de Parte (WAD 7.4.8)
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_organizacao_validar_especializacao ON cross_core.organizacao;
CREATE TRIGGER trg_organizacao_validar_especializacao
BEFORE INSERT OR UPDATE OF parte_id ON cross_core.organizacao
FOR EACH ROW
EXECUTE FUNCTION fn_validar_especializacao_organizacao();

DROP TRIGGER IF EXISTS trg_pessoa_validar_especializacao ON cross_core.pessoa;
CREATE TRIGGER trg_pessoa_validar_especializacao
BEFORE INSERT OR UPDATE OF parte_id ON cross_core.pessoa
FOR EACH ROW
EXECUTE FUNCTION fn_validar_especializacao_pessoa();

-- Diferível: a parte e sua especialização são criadas na mesma transação
DROP TRIGGER IF EXISTS trg_parte_validar_especializacao ON cross_core.parte;
CREATE CONSTRAINT TRIGGER trg_parte_validar_especializacao
AFTER INSERT OR UPDATE OF tipo ON cross_core.parte
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_validar_parte_possui_especializacao();

-- -----------------------------------------------------------------------------
-- Cross Score Card (WAD 7.4.13)
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_resposta_score_card_validar ON cross_methodologies.resposta_score_card;
CREATE TRIGGER trg_resposta_score_card_validar
BEFORE INSERT OR UPDATE ON cross_methodologies.resposta_score_card
FOR EACH ROW
EXECUTE FUNCTION fn_validar_resposta_score_card();

DROP TRIGGER IF EXISTS trg_avaliacao_validar_score_total ON cross_methodologies.avaliacao_score_card;
CREATE CONSTRAINT TRIGGER trg_avaliacao_validar_score_total
AFTER INSERT OR UPDATE ON cross_methodologies.avaliacao_score_card
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_validar_score_total();

DROP TRIGGER IF EXISTS trg_resposta_validar_score_total ON cross_methodologies.resposta_score_card;
CREATE CONSTRAINT TRIGGER trg_resposta_validar_score_total
AFTER INSERT OR UPDATE OR DELETE ON cross_methodologies.resposta_score_card
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_validar_score_total();

-- -----------------------------------------------------------------------------
-- Auditoria técnica nas principais entidades de negócio (WAD 7.4.18)
-- Entidades já versionadas mantêm seu próprio histórico; a auditoria genérica
-- cobre as entidades operacionais centrais.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY[
        'cross_core.parte',
        'cross_core.usuario_interno',
        'cross_commercial.cliente_cross',
        'cross_commercial.contrato_cliente',
        'cross_projects.projeto',
        'cross_projects.frente_oportunidade',
        'cross_projects.candidatura_parceiro',
        'cross_methodologies.avaliacao_score_card',
        'cross_partnerships.parceria'
    ];
BEGIN
    FOREACH alvo IN ARRAY alvos LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_auditoria ON %s',
            split_part(alvo, '.', 2), alvo);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_auditoria
             AFTER INSERT OR UPDATE OR DELETE ON %s
             FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria()',
            split_part(alvo, '.', 2), alvo
        );
    END LOOP;
END $$;
