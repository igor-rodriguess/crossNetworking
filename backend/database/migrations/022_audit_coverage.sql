-- =============================================================================
-- 022 – Ampliação da cobertura de auditoria (WAD 7.3.21, 7.4.18)
-- Adiciona o trigger de auditoria técnica às demais entidades de negócio que
-- sofrem mudança de estado, além das já cobertas na migration 017.
-- Idempotente (DROP TRIGGER IF EXISTS antes de criar). Não altera a 017.
-- =============================================================================

DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY[
        'cross_core.organizacao',
        'cross_core.pessoa',
        'cross_core.contato',
        'cross_core.documento',
        'cross_commercial.componente_remuneracao',
        'cross_intelligence.perfil_estrategico',
        'cross_intelligence.ativo',
        'cross_projects.briefing',
        'cross_projects.planejamento_estrategico',
        'cross_projects.responsavel_projeto',
        'cross_methodologies.analise_crossability',
        'cross_methodologies.paper',
        'cross_methodologies.versao_paper',
        'cross_methodologies.validacao_paper',
        'cross_methodologies.decisao_candidatura',
        'cross_partnerships.negociacao',
        'cross_partnerships.contrapartida',
        'cross_partnerships.contrato_parceria',
        'cross_execution.plano_execucao',
        'cross_execution.etapa_execucao',
        'cross_execution.entrega',
        'cross_execution.pendencia',
        'cross_analytics.medicao_indicador',
        'cross_analytics.resultado',
        'cross_analytics.calculo_roi',
        'cross_analytics.encerramento_projeto',
        'cross_analytics.encerramento_parceria'
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
