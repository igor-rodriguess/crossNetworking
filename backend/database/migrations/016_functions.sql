-- =============================================================================
-- 016 – Funções (WAD 7.4.5, 7.4.8, 7.4.13, 7.4.18)
-- =============================================================================

-- Atualização automática de atualizado_em (WAD 7.4.5)
CREATE OR REPLACE FUNCTION fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Especialização de Parte (WAD 7.3.4, 7.4.8)
-- -----------------------------------------------------------------------------

-- A especialização precisa corresponder ao tipo da parte e ser exclusiva
CREATE OR REPLACE FUNCTION fn_validar_especializacao_organizacao()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo tipo_parte;
BEGIN
    SELECT tipo INTO v_tipo FROM cross_core.parte WHERE id = NEW.parte_id;

    IF v_tipo IS DISTINCT FROM 'organizacao' THEN
        RAISE EXCEPTION 'Parte % não é do tipo organizacao', NEW.parte_id;
    END IF;

    IF EXISTS (SELECT 1 FROM cross_core.pessoa WHERE parte_id = NEW.parte_id) THEN
        RAISE EXCEPTION 'Parte % já possui especialização como pessoa', NEW.parte_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_especializacao_pessoa()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo tipo_parte;
BEGIN
    SELECT tipo INTO v_tipo FROM cross_core.parte WHERE id = NEW.parte_id;

    IF v_tipo IS DISTINCT FROM 'pessoa' THEN
        RAISE EXCEPTION 'Parte % não é do tipo pessoa', NEW.parte_id;
    END IF;

    IF EXISTS (SELECT 1 FROM cross_core.organizacao WHERE parte_id = NEW.parte_id) THEN
        RAISE EXCEPTION 'Parte % já possui especialização como organizacao', NEW.parte_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Garante, ao fim da transação, que toda parte possui sua especialização
CREATE OR REPLACE FUNCTION fn_validar_parte_possui_especializacao()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo = 'organizacao'
       AND NOT EXISTS (SELECT 1 FROM cross_core.organizacao WHERE parte_id = NEW.id) THEN
        RAISE EXCEPTION 'Parte % (organizacao) criada sem registro em cross_core.organizacao', NEW.id;
    END IF;

    IF NEW.tipo = 'pessoa'
       AND NOT EXISTS (SELECT 1 FROM cross_core.pessoa WHERE parte_id = NEW.id) THEN
        RAISE EXCEPTION 'Parte % (pessoa) criada sem registro em cross_core.pessoa', NEW.id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Cross Score Card: validação determinística (WAD 7.3.13, 7.4.13)
-- A engine da aplicação calcula; o banco valida e preserva os valores.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validar_resposta_score_card()
RETURNS TRIGGER AS $$
DECLARE
    v_peso_sim NUMERIC(10,4);
    v_peso_nao NUMERIC(10,4);
BEGIN
    -- Pesos aplicados devem corresponder à versão do critério
    SELECT peso_sim, peso_nao INTO v_peso_sim, v_peso_nao
    FROM cross_methodologies.criterio_score_card
    WHERE id = NEW.criterio_score_card_id;

    IF NEW.peso_sim_aplicado IS DISTINCT FROM v_peso_sim
       OR NEW.peso_nao_aplicado IS DISTINCT FROM v_peso_nao THEN
        RAISE EXCEPTION 'Pesos aplicados não correspondem ao critério %', NEW.criterio_score_card_id;
    END IF;

    -- Pontuação deve corresponder à resposta
    IF NEW.valor_resposta = 'sim' AND NEW.pontuacao_obtida IS DISTINCT FROM NEW.peso_sim_aplicado THEN
        RAISE EXCEPTION 'Resposta SIM exige pontuacao_obtida = peso_sim_aplicado';
    ELSIF NEW.valor_resposta = 'nao' AND NEW.pontuacao_obtida IS DISTINCT FROM NEW.peso_nao_aplicado THEN
        RAISE EXCEPTION 'Resposta NAO exige pontuacao_obtida = peso_nao_aplicado';
    ELSIF NEW.valor_resposta = 'nao_avaliado' AND NEW.pontuacao_obtida <> 0 THEN
        RAISE EXCEPTION 'Resposta NAO_AVALIADO exige pontuacao_obtida = 0';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- score_total = SUM(pontuacao_obtida) + potencial_disruptivo, validado ao
-- final da transação (trigger diferível)
CREATE OR REPLACE FUNCTION fn_validar_score_total()
RETURNS TRIGGER AS $$
DECLARE
    v_avaliacao_id UUID;
    v_potencial INTEGER;
    v_score NUMERIC(12,4);
    v_soma NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'avaliacao_score_card' THEN
        v_avaliacao_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_avaliacao_id := OLD.avaliacao_score_card_id;
    ELSE
        v_avaliacao_id := NEW.avaliacao_score_card_id;
    END IF;

    SELECT potencial_disruptivo, score_total INTO v_potencial, v_score
    FROM cross_methodologies.avaliacao_score_card
    WHERE id = v_avaliacao_id;

    IF NOT FOUND THEN
        RETURN NULL; -- avaliação removida na mesma transação (cascade)
    END IF;

    SELECT COALESCE(SUM(pontuacao_obtida), 0) INTO v_soma
    FROM cross_methodologies.resposta_score_card
    WHERE avaliacao_score_card_id = v_avaliacao_id;

    IF v_score IS DISTINCT FROM (v_soma + v_potencial) THEN
        RAISE EXCEPTION
            'score_total (%) difere da soma das pontuações (%) + potencial disruptivo (%)',
            v_score, v_soma, v_potencial;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Auditoria técnica genérica (WAD 7.3.21, 7.4.18)
-- O usuário é lido de current_setting('app.usuario_id'), definido pela
-- aplicação a cada transação (SET LOCAL app.usuario_id = '<uuid>').
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_registrar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario UUID;
    v_registro UUID;
    v_operacao VARCHAR(20);
    v_anteriores JSONB;
    v_novos JSONB;
BEGIN
    BEGIN
        v_usuario := NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_usuario := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_operacao := 'INSERT';
        v_novos := to_jsonb(NEW);
        v_registro := (to_jsonb(NEW) ->> 'id')::UUID;
    ELSIF TG_OP = 'UPDATE' THEN
        v_anteriores := to_jsonb(OLD);
        v_novos := to_jsonb(NEW);
        v_registro := (to_jsonb(NEW) ->> 'id')::UUID;
        IF (to_jsonb(OLD) ->> 'arquivado_em') IS NULL
           AND (to_jsonb(NEW) ->> 'arquivado_em') IS NOT NULL THEN
            v_operacao := 'ARCHIVE';
        ELSIF (to_jsonb(OLD) ->> 'arquivado_em') IS NOT NULL
           AND (to_jsonb(NEW) ->> 'arquivado_em') IS NULL THEN
            v_operacao := 'RESTORE';
        ELSE
            v_operacao := 'UPDATE';
        END IF;
    ELSE
        v_operacao := 'DELETE';
        v_anteriores := to_jsonb(OLD);
        v_registro := (to_jsonb(OLD) ->> 'id')::UUID;
    END IF;

    INSERT INTO cross_governance.auditoria (
        usuario_id, schema_afetado, tabela_afetada, registro_id,
        operacao, dados_anteriores, dados_novos, origem
    ) VALUES (
        v_usuario, TG_TABLE_SCHEMA, TG_TABLE_NAME, v_registro,
        v_operacao, v_anteriores, v_novos, 'trigger'
    );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
