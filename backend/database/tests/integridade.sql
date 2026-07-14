-- =============================================================================
-- Testes de integridade do Modelo Físico (WAD 7.4.24)
-- Executa cenários inválidos e verifica se o banco os rejeita.
-- Roda inteiro em uma transação com ROLLBACK — nada é persistido.
-- Executar após as migrations: npm run db:test
-- =============================================================================

BEGIN;

DO $$
DECLARE
    -- fixtures
    v_usuario_id UUID;
    v_parte_org_id UUID;
    v_parte_org2_id UUID;
    v_cliente_id UUID;
    v_projeto_id UUID;
    v_frente_id UUID;
    v_candidatura_id UUID;
    v_paper_id UUID;
    v_modelo_id UUID;
    v_versao_modelo_id UUID;
    v_criterio_id UUID;
    v_versao_paper_id UUID;
    v_validacao_id UUID;
    v_avaliacao_id UUID;
    -- catálogos
    v_status_parte UUID;
    v_status_cliente UUID;
    v_status_projeto UUID;
    v_status_frente UUID;
    v_status_candidatura UUID;
    v_status_paper UUID;
    v_status_validacao UUID;
    v_tipo_validacao UUID;
    v_status_avaliacao UUID;
    v_tipo_disponibilidade UUID;
    v_status_parceria UUID;
    v_status_validacao_pendente UUID;
    v_validacao_pendente_id UUID;
BEGIN
    -- -------------------------------------------------------------------------
    -- Fixtures (dados temporários; a transação sofre ROLLBACK ao final)
    -- -------------------------------------------------------------------------
    SELECT id INTO v_status_parte FROM cross_core.status_parte WHERE codigo = 'ativa';
    SELECT id INTO v_status_cliente FROM cross_commercial.status_cliente WHERE codigo = 'ativo';
    SELECT id INTO v_status_projeto FROM cross_projects.status_projeto WHERE codigo = 'em_andamento';
    SELECT id INTO v_status_frente FROM cross_projects.status_frente WHERE codigo = 'aberta';
    SELECT id INTO v_status_candidatura FROM cross_projects.status_candidatura WHERE codigo = 'em_analise';
    SELECT id INTO v_status_paper FROM cross_methodologies.status_paper WHERE codigo = 'em_elaboracao';
    SELECT id INTO v_status_validacao FROM cross_methodologies.status_validacao WHERE codigo = 'aprovada';
    SELECT id INTO v_tipo_validacao FROM cross_methodologies.tipo_validacao WHERE codigo = 'interna';
    SELECT id INTO v_status_avaliacao FROM cross_methodologies.status_avaliacao_score_card WHERE codigo = 'em_andamento';
    SELECT id INTO v_tipo_disponibilidade FROM cross_intelligence.tipo_disponibilidade WHERE codigo = 'disponivel';
    SELECT id INTO v_status_parceria FROM cross_partnerships.status_parceria WHERE codigo = 'em_estruturacao';
    SELECT id INTO v_status_validacao_pendente FROM cross_methodologies.status_validacao WHERE codigo = 'pendente';

    INSERT INTO cross_core.usuario_interno (nome, email)
    VALUES ('Usuário de Teste', 'teste@crossnetworking.com.br')
    RETURNING id INTO v_usuario_id;

    INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
    VALUES ('organizacao', 'Marca Teste', v_status_parte)
    RETURNING id INTO v_parte_org_id;

    INSERT INTO cross_core.organizacao (parte_id, nome_fantasia)
    VALUES (v_parte_org_id, 'Marca Teste');

    INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
    VALUES ('organizacao', 'Parceiro Teste', v_status_parte)
    RETURNING id INTO v_parte_org2_id;

    INSERT INTO cross_core.organizacao (parte_id, nome_fantasia)
    VALUES (v_parte_org2_id, 'Parceiro Teste');

    INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
    VALUES (v_parte_org_id, v_status_cliente)
    RETURNING id INTO v_cliente_id;

    INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
    VALUES (v_cliente_id, 'Projeto Teste', 'Objetivo de teste', v_status_projeto)
    RETURNING id INTO v_projeto_id;

    INSERT INTO cross_projects.frente_oportunidade
        (projeto_id, nome, objetivo, data_abertura, status_frente_id)
    VALUES (v_projeto_id, 'Frente Teste', 'Objetivo da frente', CURRENT_DATE, v_status_frente)
    RETURNING id INTO v_frente_id;

    INSERT INTO cross_projects.candidatura_parceiro
        (frente_oportunidade_id, parte_id, status_candidatura_id)
    VALUES (v_frente_id, v_parte_org2_id, v_status_candidatura)
    RETURNING id INTO v_candidatura_id;

    INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
    VALUES (v_frente_id, 'Paper Teste', v_status_paper)
    RETURNING id INTO v_paper_id;

    INSERT INTO cross_methodologies.versao_paper
        (paper_id, numero_versao, estrategia_proposta, status_versao)
    VALUES (v_paper_id, 1, 'Estratégia teste', 'vigente')
    RETURNING id INTO v_versao_paper_id;

    INSERT INTO cross_methodologies.validacao_paper
        (versao_paper_id, tipo_validacao_id, status_validacao_id, data_validacao)
    VALUES (v_versao_paper_id, v_tipo_validacao, v_status_validacao, NOW())
    RETURNING id INTO v_validacao_id;

    INSERT INTO cross_methodologies.modelo_score_card (nome)
    VALUES ('Modelo Teste')
    RETURNING id INTO v_modelo_id;

    INSERT INTO cross_methodologies.versao_modelo_score_card
        (modelo_score_card_id, numero_versao, status_versao)
    VALUES (v_modelo_id, 1, 'vigente')
    RETURNING id INTO v_versao_modelo_id;

    INSERT INTO cross_methodologies.criterio_score_card
        (versao_modelo_score_card_id, nome, peso_sim, peso_nao, ordem)
    VALUES (v_versao_modelo_id, 'Critério Teste', 2.0, 0.0, 1)
    RETURNING id INTO v_criterio_id;

    RAISE NOTICE 'Fixtures criadas. Iniciando cenários inválidos...';

    -- -------------------------------------------------------------------------
    -- Teste 1: cadastrar pessoa sem uma Parte correspondente
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_core.pessoa (parte_id, nome_completo)
        VALUES (gen_random_uuid(), 'Pessoa Órfã');
        RAISE EXCEPTION 'TESTE FALHOU: pessoa sem parte foi aceita';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'OK 1: pessoa sem parte correspondente rejeitada';
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'TESTE FALHOU%' THEN RAISE; END IF;
            RAISE NOTICE 'OK 1: pessoa sem parte correspondente rejeitada (trigger)';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 2: especialização incompatível (pessoa sobre parte organizacao)
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_core.pessoa (parte_id, nome_completo)
        VALUES (v_parte_org_id, 'Especialização Errada');
        RAISE EXCEPTION 'TESTE FALHOU: dupla especialização foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'TESTE FALHOU%' THEN RAISE; END IF;
            RAISE NOTICE 'OK 2: especialização incompatível rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 3: mesma Parte duas vezes na mesma frente ativa
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_projects.candidatura_parceiro
            (frente_oportunidade_id, parte_id, status_candidatura_id)
        VALUES (v_frente_id, v_parte_org2_id, v_status_candidatura);
        RAISE EXCEPTION 'TESTE FALHOU: candidatura duplicada na frente foi aceita';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'OK 3: parte duplicada na mesma frente ativa rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 4: potencial disruptivo fora do intervalo 1..5
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_methodologies.avaliacao_score_card
            (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
             potencial_disruptivo, score_total, status_avaliacao_score_card_id)
        VALUES (v_candidatura_id, v_versao_modelo_id, v_validacao_id, 7, 7, v_status_avaliacao);
        RAISE EXCEPTION 'TESTE FALHOU: potencial disruptivo 7 foi aceito';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'OK 4: potencial disruptivo fora de 1..5 rejeitado';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 5: disponibilidade sem Parte e sem Ativo
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_intelligence.disponibilidade
            (tipo_disponibilidade_id, data_inicio, data_fim)
        VALUES (v_tipo_disponibilidade, NOW(), NOW() + INTERVAL '1 day');
        RAISE EXCEPTION 'TESTE FALHOU: disponibilidade sem alvo foi aceita';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'OK 5: disponibilidade sem parte e sem ativo rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 6: data final anterior à data inicial
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_intelligence.disponibilidade
            (parte_id, tipo_disponibilidade_id, data_inicio, data_fim)
        VALUES (v_parte_org_id, v_tipo_disponibilidade, NOW(), NOW() - INTERVAL '1 day');
        RAISE EXCEPTION 'TESTE FALHOU: data_fim < data_inicio foi aceita';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'OK 6: data final anterior à inicial rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 7: duas versões vigentes do mesmo Paper
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_methodologies.versao_paper
            (paper_id, numero_versao, estrategia_proposta, status_versao)
        VALUES (v_paper_id, 2, 'Segunda versão vigente', 'vigente');
        RAISE EXCEPTION 'TESTE FALHOU: segunda versão vigente do Paper foi aceita';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'OK 7: duas versões vigentes do mesmo Paper rejeitadas';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 8: resposta duplicada para o mesmo critério e avaliação,
    --          e validação determinística da pontuação
    -- -------------------------------------------------------------------------
    INSERT INTO cross_methodologies.avaliacao_score_card
        (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
         potencial_disruptivo, score_total, status_avaliacao_score_card_id)
    VALUES (v_candidatura_id, v_versao_modelo_id, v_validacao_id, 3, 5.0, v_status_avaliacao)
    RETURNING id INTO v_avaliacao_id;

    -- Pontuação incoerente com a resposta deve ser rejeitada
    BEGIN
        INSERT INTO cross_methodologies.resposta_score_card
            (avaliacao_score_card_id, criterio_score_card_id, valor_resposta,
             peso_sim_aplicado, peso_nao_aplicado, pontuacao_obtida)
        VALUES (v_avaliacao_id, v_criterio_id, 'sim', 2.0, 0.0, 99.0);
        RAISE EXCEPTION 'TESTE FALHOU: pontuação incoerente foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'TESTE FALHOU%' THEN RAISE; END IF;
            RAISE NOTICE 'OK 8a: pontuação incoerente com a resposta rejeitada';
    END;

    -- Resposta válida (sim → pontuacao = peso_sim = 2.0; score 2 + 3 = 5)
    INSERT INTO cross_methodologies.resposta_score_card
        (avaliacao_score_card_id, criterio_score_card_id, valor_resposta,
         peso_sim_aplicado, peso_nao_aplicado, pontuacao_obtida)
    VALUES (v_avaliacao_id, v_criterio_id, 'sim', 2.0, 0.0, 2.0);

    BEGIN
        INSERT INTO cross_methodologies.resposta_score_card
            (avaliacao_score_card_id, criterio_score_card_id, valor_resposta,
             peso_sim_aplicado, peso_nao_aplicado, pontuacao_obtida)
        VALUES (v_avaliacao_id, v_criterio_id, 'nao', 2.0, 0.0, 0.0);
        RAISE EXCEPTION 'TESTE FALHOU: resposta duplicada foi aceita';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'OK 8b: resposta duplicada para o mesmo critério rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 9: moeda fora do padrão ISO 4217
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_intelligence.ativo (parte_id, nome, valor_referencia, moeda)
        VALUES (v_parte_org_id, 'Ativo Teste', 1000.00, 'br1');
        RAISE EXCEPTION 'TESTE FALHOU: moeda inválida foi aceita';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'OK 9: moeda fora do padrão ISO 4217 rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 10: valor monetário negativo
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_intelligence.ativo (parte_id, nome, valor_referencia, moeda)
        VALUES (v_parte_org_id, 'Ativo Negativo', -50.00, 'BRL');
        RAISE EXCEPTION 'TESTE FALHOU: valor negativo foi aceito';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'OK 10: valor monetário negativo rejeitado';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 11: geração de registros de auditoria
    -- -------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM cross_governance.auditoria
        WHERE tabela_afetada = 'projeto' AND registro_id = v_projeto_id AND operacao = 'INSERT'
    ) THEN
        RAISE EXCEPTION 'TESTE FALHOU: auditoria de INSERT em projeto não registrada';
    END IF;
    RAISE NOTICE 'OK 11: auditoria de INSERT registrada';

    -- -------------------------------------------------------------------------
    -- Teste 12: exclusão lógica libera reentrada (candidatura arquivada
    --           não impede nova candidatura da mesma parte na frente)
    -- -------------------------------------------------------------------------
    UPDATE cross_projects.candidatura_parceiro
    SET arquivado_em = NOW()
    WHERE id = v_candidatura_id;

    INSERT INTO cross_projects.candidatura_parceiro
        (frente_oportunidade_id, parte_id, status_candidatura_id)
    VALUES (v_frente_id, v_parte_org2_id, v_status_candidatura);
    RAISE NOTICE 'OK 12: candidatura arquivada não impede reentrada da parte';

    -- -------------------------------------------------------------------------
    -- Teste 13: criar parceria sem candidatura aprovada (WAD 7.3.14 / 7.4.24)
    -- (v_candidatura_id não possui decisão de aprovação registrada)
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO cross_partnerships.parceria
            (candidatura_parceiro_id, projeto_id, frente_oportunidade_id,
             cliente_cross_id, parte_parceira_id, status_parceria_id)
        VALUES (v_candidatura_id, v_projeto_id, v_frente_id,
                v_cliente_id, v_parte_org2_id, v_status_parceria);
        RAISE EXCEPTION 'TESTE FALHOU: parceria sem aprovação foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'TESTE FALHOU%' THEN RAISE; END IF;
            RAISE NOTICE 'OK 13: parceria sem decisão de aprovação rejeitada';
    END;

    -- -------------------------------------------------------------------------
    -- Teste 14: avaliação Score Card com validação de Paper NÃO aprovada (WAD 7.4.13)
    -- -------------------------------------------------------------------------
    INSERT INTO cross_methodologies.validacao_paper
        (versao_paper_id, tipo_validacao_id, status_validacao_id)
    VALUES (v_versao_paper_id, v_tipo_validacao, v_status_validacao_pendente)
    RETURNING id INTO v_validacao_pendente_id;

    BEGIN
        INSERT INTO cross_methodologies.avaliacao_score_card
            (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
             potencial_disruptivo, score_total, status_avaliacao_score_card_id)
        VALUES (v_candidatura_id, v_versao_modelo_id, v_validacao_pendente_id,
                3, 3, v_status_avaliacao);
        RAISE EXCEPTION 'TESTE FALHOU: avaliação com validação pendente foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'TESTE FALHOU%' THEN RAISE; END IF;
            RAISE NOTICE 'OK 14: avaliação sem validação de Paper aprovada rejeitada';
    END;

    RAISE NOTICE 'Todos os cenários de integridade validados.';
END $$;

ROLLBACK;
