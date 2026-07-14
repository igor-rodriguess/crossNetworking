-- =============================================================================
-- 014 – Constraints complementares: FKs das colunas de auditoria e de
-- responsáveis para cross_core.usuario_interno (WAD 7.4.5)
-- Colunas nullable recebem ON DELETE SET NULL; NOT NULL recebem RESTRICT.
-- A tabela de auditoria fica de fora para preservar registros históricos.
--
-- Usa pg_catalog (não information_schema) para descobrir colunas e FKs
-- existentes — as views do information_schema (key_column_usage,
-- table_constraints) são lentíssimas e travam em schemas grandes.
-- Idempotente: pula colunas que já possuem FK.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    acao TEXT;
BEGIN
    FOR r IN
        SELECT n.nspname AS table_schema,
               c.relname AS table_name,
               a.attname AS column_name,
               a.attnotnull AS notnull,
               a.attnum
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relkind = 'r'
          AND n.nspname LIKE 'cross\_%'
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname IN (
              'criado_por_id',
              'atualizado_por_id',
              'arquivado_por_id',
              'responsavel_id',
              'validado_por_id',
              'responsavel_conta_id'
          )
          AND NOT (n.nspname = 'cross_governance' AND c.relname = 'auditoria')
          -- pula colunas que já possuem qualquer FK
          AND NOT EXISTS (
              SELECT 1
              FROM pg_constraint fk
              WHERE fk.contype = 'f'
                AND fk.conrelid = c.oid
                AND a.attnum = ANY (fk.conkey)
          )
    LOOP
        acao := CASE WHEN r.notnull THEN 'RESTRICT' ELSE 'SET NULL' END;

        EXECUTE format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I
                 FOREIGN KEY (%I)
                 REFERENCES cross_core.usuario_interno(id)
                 ON DELETE %s',
            r.table_schema,
            r.table_name,
            format('fk_%s_%s', r.table_name, replace(r.column_name, '_id', '')),
            r.column_name,
            acao
        );
    END LOOP;
END $$;
