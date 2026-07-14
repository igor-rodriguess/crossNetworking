-- =============================================================================
-- 012 – cross_analytics: acompanhamento, indicadores, medições, resultados,
-- ROI e encerramentos (WAD 7.3.18, 7.3.19)
-- =============================================================================

CREATE TABLE cross_analytics.acompanhamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    descricao TEXT NOT NULL,
    data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsavel_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_acompanhamento_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT
);

CREATE TABLE cross_analytics.indicador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    tipo_metrica_id UUID NOT NULL,
    unidade VARCHAR(50),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_indicador_tipo_metrica
        FOREIGN KEY (tipo_metrica_id)
        REFERENCES cross_analytics.tipo_metrica(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_indicador_nome UNIQUE (nome)
);

-- Indicadores acompanhados por parceria, com meta opcional (N:N)
CREATE TABLE cross_analytics.parceria_indicador (
    parceria_id UUID NOT NULL,
    indicador_id UUID NOT NULL,
    meta NUMERIC(18,2),

    PRIMARY KEY (parceria_id, indicador_id),

    CONSTRAINT fk_parceria_indicador_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_parceria_indicador_indicador
        FOREIGN KEY (indicador_id)
        REFERENCES cross_analytics.indicador(id)
        ON DELETE RESTRICT
);

CREATE TABLE cross_analytics.medicao_indicador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    indicador_id UUID NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    valor NUMERIC(18,2) NOT NULL,
    unidade VARCHAR(50),
    fonte VARCHAR(200),
    responsavel_id UUID,
    data_coleta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    nivel_confianca d_nivel_confianca,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_medicao_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_medicao_indicador
        FOREIGN KEY (indicador_id)
        REFERENCES cross_analytics.indicador(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_medicao_periodo CHECK (periodo_fim >= periodo_inicio)
);

CREATE TABLE cross_analytics.resultado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    descricao TEXT NOT NULL,
    valor d_valor_monetario,
    moeda d_moeda,
    alcance_realizado NUMERIC(18,2),
    data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsavel_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_resultado_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_resultado_moeda
        CHECK (valor IS NULL OR moeda IS NOT NULL)
);

-- Cada cálculo de ROI é um registro histórico independente (WAD 7.3.18)
CREATE TABLE cross_analytics.calculo_roi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    investimento_estimado d_valor_monetario,
    investimento_realizado d_valor_monetario,
    retorno_estimado d_valor_monetario,
    retorno_realizado d_valor_monetario,
    moeda d_moeda NOT NULL,
    roi NUMERIC(12,6),
    premissas TEXT,
    nivel_confianca d_nivel_confianca,
    responsavel_id UUID,
    data_calculo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_calculo_roi_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT
);

-- Encerramentos separados de projeto e parceria (WAD 7.3.19)
CREATE TABLE cross_analytics.encerramento_projeto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL,
    motivo TEXT NOT NULL,
    resultados_gerais TEXT,
    aprendizados TEXT,
    proximos_passos TEXT,
    responsavel_id UUID,
    data_encerramento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_encerramento_projeto_projeto
        FOREIGN KEY (projeto_id)
        REFERENCES cross_projects.projeto(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_encerramento_projeto UNIQUE (projeto_id)
);

CREATE TABLE cross_analytics.encerramento_parceria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,
    motivo TEXT NOT NULL,
    resultados TEXT,
    cumprimento_contrapartidas TEXT,
    indicadores_finais TEXT,
    aprendizados TEXT,
    responsavel_id UUID,
    data_encerramento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_encerramento_parceria_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_encerramento_parceria UNIQUE (parceria_id)
);
