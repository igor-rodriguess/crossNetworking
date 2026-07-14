-- =============================================================================
-- 004 – Tabelas de referência / vocabulários controlados (WAD 7.3.3, 7.4.7)
-- Cada domínio possui seu próprio catálogo de status e tipos. Todos os
-- catálogos compartilham a mesma estrutura (codigo estável + rótulo mutável).
-- =============================================================================

DO $$
DECLARE
    catalogo TEXT;
    catalogos TEXT[] := ARRAY[
        -- cross_core
        'cross_core.status_parte',
        'cross_core.papel',
        'cross_core.tipo_organizacao',
        'cross_core.status_documento',
        -- cross_intelligence
        'cross_intelligence.tipo_disponibilidade',
        -- cross_commercial
        'cross_commercial.status_cliente',
        'cross_commercial.status_contrato',
        'cross_commercial.modelo_contratacao',
        'cross_commercial.tipo_remuneracao',
        -- cross_projects
        'cross_projects.status_projeto',
        'cross_projects.status_frente',
        'cross_projects.status_candidatura',
        'cross_projects.prioridade',
        'cross_projects.tipo_origem_demanda',
        'cross_projects.nivel_interesse',
        -- cross_methodologies
        'cross_methodologies.status_crossability',
        'cross_methodologies.status_paper',
        'cross_methodologies.status_validacao',
        'cross_methodologies.tipo_validacao',
        'cross_methodologies.status_avaliacao_score_card',
        'cross_methodologies.tipo_decisao',
        -- cross_partnerships
        'cross_partnerships.status_parceria',
        'cross_partnerships.status_negociacao',
        'cross_partnerships.tipo_parceria',
        -- cross_execution
        'cross_execution.status_execucao',
        'cross_execution.status_entrega',
        'cross_execution.status_pendencia',
        -- cross_analytics
        'cross_analytics.tipo_metrica'
    ];
BEGIN
    FOREACH catalogo IN ARRAY catalogos LOOP
        EXECUTE format($fmt$
            CREATE TABLE %s (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                codigo VARCHAR(50) NOT NULL UNIQUE,
                nome VARCHAR(100) NOT NULL,
                descricao TEXT,
                ordem INTEGER,
                ativo BOOLEAN NOT NULL DEFAULT TRUE
            )
        $fmt$, catalogo);
    END LOOP;
END $$;
