-- =============================================================================
-- 020 – Reforço de regras de negócio no banco (fecha gaps da auditoria WAD)
--
-- As regras abaixo eram, até aqui, garantidas apenas pela aplicação (WAD 7.4.21).
-- Esta migration passa a garanti-las também no banco:
--   • Parceria só pode existir com decisão aprovada + Paper validado (WAD 7.3.14).
--   • Avaliação Score Card exige validação de Paper aprovada (WAD 7.4.13).
--   • Índices únicos parciais faltantes da WAD 7.3.6 (contratos/responsáveis ativos).
--
-- Não modifica migrations anteriores (WAD 7.4.22): tudo é aditivo e idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gap 1 — Criação de parceria somente após aprovação (WAD 7.3.14 / 7.4.24)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validar_parceria_aprovacao()
RETURNS TRIGGER AS $$
BEGIN
    -- Exige ao menos uma decisão de aprovação para a candidatura de origem.
    IF NOT EXISTS (
        SELECT 1
        FROM cross_methodologies.decisao_candidatura d
        JOIN cross_methodologies.tipo_decisao td ON td.id = d.tipo_decisao_id
        WHERE d.candidatura_parceiro_id = NEW.candidatura_parceiro_id
          AND td.codigo = 'aprovada'
    ) THEN
        RAISE EXCEPTION
            'Parceria exige uma decisão de aprovação para a candidatura % (WAD 7.3.14)',
            NEW.candidatura_parceiro_id;
    END IF;

    -- Exige um Paper validado (validação aprovada) na frente da parceria.
    IF NOT EXISTS (
        SELECT 1
        FROM cross_methodologies.paper p
        JOIN cross_methodologies.versao_paper vp ON vp.paper_id = p.id
        JOIN cross_methodologies.validacao_paper v ON v.versao_paper_id = vp.id
        JOIN cross_methodologies.status_validacao sv ON sv.id = v.status_validacao_id
        WHERE p.frente_oportunidade_id = NEW.frente_oportunidade_id
          AND sv.codigo IN ('aprovada', 'aprovada_com_ajustes')
    ) THEN
        RAISE EXCEPTION
            'Parceria exige um Paper validado na frente % (WAD 7.3.14)',
            NEW.frente_oportunidade_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parceria_validar_aprovacao ON cross_partnerships.parceria;
CREATE TRIGGER trg_parceria_validar_aprovacao
BEFORE INSERT ON cross_partnerships.parceria
FOR EACH ROW
EXECUTE FUNCTION fn_validar_parceria_aprovacao();

-- -----------------------------------------------------------------------------
-- Gap 2 — Avaliação Score Card só após validação de Paper aprovada (WAD 7.4.13)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validar_avaliacao_validacao_aprovada()
RETURNS TRIGGER AS $$
DECLARE
    v_codigo TEXT;
BEGIN
    SELECT sv.codigo INTO v_codigo
    FROM cross_methodologies.validacao_paper v
    JOIN cross_methodologies.status_validacao sv ON sv.id = v.status_validacao_id
    WHERE v.id = NEW.validacao_paper_id;

    IF v_codigo IS DISTINCT FROM 'aprovada' AND v_codigo IS DISTINCT FROM 'aprovada_com_ajustes' THEN
        RAISE EXCEPTION
            'Avaliação Score Card exige validação de Paper aprovada (status atual: %) — WAD 7.4.13',
            COALESCE(v_codigo, 'inexistente');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avaliacao_validar_validacao_aprovada ON cross_methodologies.avaliacao_score_card;
CREATE TRIGGER trg_avaliacao_validar_validacao_aprovada
BEFORE INSERT OR UPDATE OF validacao_paper_id ON cross_methodologies.avaliacao_score_card
FOR EACH ROW
EXECUTE FUNCTION fn_validar_avaliacao_validacao_aprovada();

-- -----------------------------------------------------------------------------
-- Gap 3 — Índices únicos parciais faltantes (WAD 7.3.6)
-- Interpretação adotada (ajuste se a regra de negócio for outra):
--   • responsáveis ativos: um mesmo usuário não pode ser responsável ativo
--     duas vezes no mesmo projeto;
--   • contratos ativos: não pode haver dois contratos ativos com o mesmo código.
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_responsavel_projeto_ativo
ON cross_projects.responsavel_projeto (projeto_id, usuario_interno_id)
WHERE arquivado_em IS NULL AND fim IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_cliente_codigo_ativo
ON cross_commercial.contrato_cliente (codigo)
WHERE arquivado_em IS NULL AND codigo IS NOT NULL;
