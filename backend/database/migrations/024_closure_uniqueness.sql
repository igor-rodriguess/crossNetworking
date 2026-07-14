-- =============================================================================
-- 024 – Unicidade dos encerramentos (RN034)
--
-- RN034: o encerramento de projeto e o de parceria são processos separados,
-- com no máximo um registro por entidade. Até aqui a regra existia apenas no
-- documento; esta migration passa a garanti-la no banco.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_encerramento_projeto
ON cross_analytics.encerramento_projeto (projeto_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_encerramento_parceria
ON cross_analytics.encerramento_parceria (parceria_id);

-- Uma parceria não repete o mesmo indicador no mesmo período de medição.
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicao_indicador_periodo
ON cross_analytics.medicao_indicador (parceria_id, indicador_id, periodo_inicio, periodo_fim);

-- O período de medição respeita fim >= início (RN030).
ALTER TABLE cross_analytics.medicao_indicador
    DROP CONSTRAINT IF EXISTS ck_medicao_indicador_periodo;
ALTER TABLE cross_analytics.medicao_indicador
    ADD CONSTRAINT ck_medicao_indicador_periodo
    CHECK (periodo_fim >= periodo_inicio);
