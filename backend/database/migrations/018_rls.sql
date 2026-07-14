-- =============================================================================
-- 018 – Segurança e controle de acesso (WAD 7.4.20)
-- Papéis técnicos por finalidade. Senhas/atributos de LOGIN são definidos por
-- ambiente (fora das migrations).
--
-- Todo o bloco é tolerante a falta de privilégio: em ambientes gerenciados
-- (ex.: alguns projetos Supabase) onde o usuário do editor não pode criar
-- roles, a etapa é ignorada com um aviso, sem abortar a migration. Nesse caso,
-- crie os papéis pelo painel do provedor.
-- =============================================================================

DO $$
DECLARE
    papel TEXT;
    papeis TEXT[] := ARRAY[
        'cross_app',       -- aplicação (leitura/escrita operacional)
        'cross_readonly',  -- consultas analíticas somente leitura
        'cross_migration', -- execução de migrations
        'cross_analytics', -- BI / análises
        'cross_ai'         -- agentes de IA (acesso restrito)
    ];
    schemas TEXT := 'cross_core, cross_intelligence, cross_commercial, cross_projects, '
                 || 'cross_methodologies, cross_partnerships, cross_execution, '
                 || 'cross_analytics, cross_governance';
BEGIN
    -- Criação dos papéis (pula tudo se não houver privilégio)
    BEGIN
        FOREACH papel IN ARRAY papeis LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
                EXECUTE format('CREATE ROLE %I NOLOGIN', papel);
            END IF;
        END LOOP;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Sem privilégio para criar roles; etapa 018 ignorada. Defina os papéis pelo painel do provedor.';
        RETURN;
    END;

    -- Uso dos schemas
    EXECUTE format('GRANT USAGE ON SCHEMA %s TO cross_app, cross_readonly, cross_analytics, cross_ai', schemas);

    -- Aplicação: CRUD nas tabelas (sem DDL, sem superusuário)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %s TO cross_app', schemas);

    -- Somente leitura
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %s TO cross_readonly, cross_analytics', schemas);

    -- IA: apenas leitura, sem os schemas com dados comerciais/pessoais sensíveis
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA '
         || 'cross_intelligence, cross_projects, cross_methodologies, '
         || 'cross_partnerships, cross_execution, cross_analytics TO cross_ai';

    -- Privilégios padrão para tabelas futuras
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cross_app', schemas);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT SELECT ON TABLES TO cross_readonly, cross_analytics', schemas);
END $$;

-- Observações (LGPD): CPF, CNPJ, e-mails e telefones não são expostos ao papel
-- de IA; o acesso de cross_ai a cross_core e cross_commercial deverá ser
-- concedido por visões específicas quando o módulo de IA for implementado.
-- Políticas de Row-Level Security por usuário/equipe/cliente poderão ser
-- adicionadas em migrations futuras.
