-- =============================================================================
-- 015 – Índices: FKs recorrentes, índices compostos, únicos parciais para
-- exclusão lógica e busca textual (WAD 7.3.6, 7.4.9, 7.4.19)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Índices únicos parciais (unicidade apenas entre registros ativos)
-- -----------------------------------------------------------------------------

-- Uma parte não pode aparecer duas vezes simultaneamente na mesma frente
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidatura_frente_parte_ativa
ON cross_projects.candidatura_parceiro (frente_oportunidade_id, parte_id)
WHERE arquivado_em IS NULL;

-- Uma parte possui no máximo um vínculo ativo como cliente Cross
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_cross_parte_ativa
ON cross_commercial.cliente_cross (parte_id)
WHERE arquivado_em IS NULL;

-- Uma candidatura gera no máximo uma parceria ativa
CREATE UNIQUE INDEX IF NOT EXISTS uq_parceria_candidatura_ativa
ON cross_partnerships.parceria (candidatura_parceiro_id)
WHERE arquivado_em IS NULL;

-- Apenas uma versão vigente e não arquivada por entidade versionada
CREATE UNIQUE INDEX IF NOT EXISTS uq_versao_paper_vigente
ON cross_methodologies.versao_paper (paper_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_briefing_vigente
ON cross_projects.briefing (projeto_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planejamento_vigente
ON cross_projects.planejamento_estrategico (projeto_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_perfil_estrategico_vigente
ON cross_intelligence.perfil_estrategico (parte_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_versao_modelo_score_card_vigente
ON cross_methodologies.versao_modelo_score_card (modelo_score_card_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plano_execucao_vigente
ON cross_execution.plano_execucao (parceria_id)
WHERE status_versao = 'vigente' AND arquivado_em IS NULL;

-- Papel ativo único por parte
CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_papel_ativo
ON cross_core.parte_papel (parte_id, papel_id)
WHERE arquivado_em IS NULL;

-- Contato principal único por parte
CREATE UNIQUE INDEX IF NOT EXISTS uq_contato_principal_ativo
ON cross_core.contato (parte_id)
WHERE principal = TRUE AND arquivado_em IS NULL;

-- Associações estratégicas vigentes únicas
CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_publico_ativo
ON cross_intelligence.parte_publico (parte_id, publico_id)
WHERE arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_praca_ativo
ON cross_intelligence.parte_praca (parte_id, praca_id)
WHERE arquivado_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_territorio_ativo
ON cross_intelligence.parte_territorio (parte_id, territorio_id)
WHERE arquivado_em IS NULL;

-- -----------------------------------------------------------------------------
-- Índices de foreign keys recorrentes (WAD 7.4.19)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projeto_cliente_cross ON cross_projects.projeto (cliente_cross_id);
CREATE INDEX IF NOT EXISTS idx_projeto_status ON cross_projects.projeto (status_projeto_id);
CREATE INDEX IF NOT EXISTS idx_frente_projeto ON cross_projects.frente_oportunidade (projeto_id);
CREATE INDEX IF NOT EXISTS idx_candidatura_frente ON cross_projects.candidatura_parceiro (frente_oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_candidatura_parte ON cross_projects.candidatura_parceiro (parte_id);
CREATE INDEX IF NOT EXISTS idx_historico_candidatura_candidatura ON cross_projects.historico_candidatura (candidatura_parceiro_id);

CREATE INDEX IF NOT EXISTS idx_analise_crossability_candidatura ON cross_methodologies.analise_crossability (candidatura_parceiro_id);
CREATE INDEX IF NOT EXISTS idx_paper_frente ON cross_methodologies.paper (frente_oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_versao_paper_paper ON cross_methodologies.versao_paper (paper_id);
CREATE INDEX IF NOT EXISTS idx_validacao_paper_versao ON cross_methodologies.validacao_paper (versao_paper_id);
CREATE INDEX IF NOT EXISTS idx_avaliacao_candidatura ON cross_methodologies.avaliacao_score_card (candidatura_parceiro_id);
CREATE INDEX IF NOT EXISTS idx_resposta_avaliacao ON cross_methodologies.resposta_score_card (avaliacao_score_card_id);
CREATE INDEX IF NOT EXISTS idx_decisao_candidatura ON cross_methodologies.decisao_candidatura (candidatura_parceiro_id);

CREATE INDEX IF NOT EXISTS idx_parceria_candidatura ON cross_partnerships.parceria (candidatura_parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceria_projeto ON cross_partnerships.parceria (projeto_id);
CREATE INDEX IF NOT EXISTS idx_parceria_cliente ON cross_partnerships.parceria (cliente_cross_id);
CREATE INDEX IF NOT EXISTS idx_parceria_parte ON cross_partnerships.parceria (parte_parceira_id);

CREATE INDEX IF NOT EXISTS idx_plano_execucao_parceria ON cross_execution.plano_execucao (parceria_id);
CREATE INDEX IF NOT EXISTS idx_etapa_plano ON cross_execution.etapa_execucao (plano_execucao_id);
CREATE INDEX IF NOT EXISTS idx_entrega_etapa ON cross_execution.entrega (etapa_execucao_id);
CREATE INDEX IF NOT EXISTS idx_pendencia_parceria ON cross_execution.pendencia (parceria_id);
CREATE INDEX IF NOT EXISTS idx_reuniao_parceria ON cross_execution.reuniao (parceria_id);

CREATE INDEX IF NOT EXISTS idx_medicao_indicador_parceria ON cross_analytics.medicao_indicador (parceria_id);
CREATE INDEX IF NOT EXISTS idx_calculo_roi_parceria ON cross_analytics.calculo_roi (parceria_id);

CREATE INDEX IF NOT EXISTS idx_contrato_cliente_cliente ON cross_commercial.contrato_cliente (cliente_cross_id);
CREATE INDEX IF NOT EXISTS idx_cliente_cross_parte ON cross_commercial.cliente_cross (parte_id);

CREATE INDEX IF NOT EXISTS idx_contato_parte ON cross_core.contato (parte_id);
CREATE INDEX IF NOT EXISTS idx_ativo_parte ON cross_intelligence.ativo (parte_id);
CREATE INDEX IF NOT EXISTS idx_canal_midia_parte ON cross_intelligence.canal_midia (parte_id);
CREATE INDEX IF NOT EXISTS idx_medicao_midia_canal ON cross_intelligence.medicao_midia (canal_midia_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_registro
ON cross_governance.auditoria (schema_afetado, tabela_afetada, registro_id);

-- -----------------------------------------------------------------------------
-- Índices compostos para filtros recorrentes (WAD 7.4.19)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projeto_cliente_status
ON cross_projects.projeto (cliente_cross_id, status_projeto_id)
WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_candidatura_frente_status
ON cross_projects.candidatura_parceiro (frente_oportunidade_id, status_candidatura_id)
WHERE arquivado_em IS NULL;

-- -----------------------------------------------------------------------------
-- Busca textual aproximada (WAD 7.4.19)
-- -----------------------------------------------------------------------------

-- Resolve o schema onde pg_trgm foi instalado (public no Postgres local,
-- extensions no Supabase) para o operator class ser encontrado independente
-- do search_path.
DO $$
DECLARE
    ext_schema TEXT;
BEGIN
    SELECT n.nspname INTO ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm';

    IF ext_schema IS NULL THEN
        RAISE EXCEPTION 'Extensão pg_trgm não encontrada. Rode o batch_1 (001_extensions.sql) antes.';
    END IF;

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_parte_nome_trgm
             ON cross_core.parte
             USING GIN (nome_exibicao %I.gin_trgm_ops)',
        ext_schema
    );
END $$;
