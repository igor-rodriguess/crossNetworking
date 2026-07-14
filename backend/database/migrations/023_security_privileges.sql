-- =============================================================================
-- 023 – Endurecimento de privilégios do papel de aplicação (cross_app)
--
-- Princípio: a aplicação (cross_app) NUNCA deve poder adulterar a trilha de
-- auditoria nem apagar registros de valor histórico. Exclusão de negócio é
-- lógica (arquivado_em), não física.
--
-- As migrations continuam rodando como papel administrativo (postgres), que
-- não é afetado por estes REVOKEs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auditoria imutável: cross_app só pode inserir (via trigger) e ler.
-- -----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON cross_governance.auditoria FROM cross_app;

-- -----------------------------------------------------------------------------
-- Tabelas append-only (histórico/proveniência): cross_app não pode DELETE.
-- Mantém INSERT/UPDATE/SELECT onde faz sentido; remove a exclusão física.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY[
        'cross_projects.historico_candidatura',
        'cross_methodologies.decisao_candidatura',
        'cross_methodologies.analise_crossability',
        'cross_analytics.calculo_roi',
        'cross_analytics.medicao_indicador',
        'cross_intelligence.medicao_midia'
    ];
BEGIN
    FOREACH alvo IN ARRAY alvos LOOP
        EXECUTE format('REVOKE DELETE ON %s FROM cross_app', alvo);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Observação: os valores calculados do Score Card (pontuacao_obtida,
-- score_total) já são protegidos contra adulteração pelos triggers
-- fn_validar_resposta_score_card e fn_validar_score_total (migration 016/017):
-- qualquer valor inconsistente é rejeitado, então não há como "editá-los à mão"
-- para um valor arbitrário. Cumpre a regra da WAD 7.4.13.
-- -----------------------------------------------------------------------------
