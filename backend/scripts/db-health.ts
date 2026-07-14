/**
 * Painel de saúde/observabilidade do banco (WAD 7.4.28).
 * Uso: tsx scripts/db-health.ts   (npm run db:health)
 * Usa a conexão administrativa para enxergar estatísticas globais.
 */
import { Client } from "pg";
import "dotenv/config";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL/DATABASE_URL não definida.");

const client = new Client({
  connectionString: url,
  ssl: url.includes("supabase.") ? { rejectUnauthorized: false } : undefined,
});

async function section(titulo: string, sql: string, params: unknown[] = []): Promise<void> {
  console.log(`\n=== ${titulo} ===`);
  try {
    const { rows } = await client.query(sql, params);
    if (rows.length === 0) {
      console.log("(sem registros)");
      return;
    }
    console.table(rows);
  } catch (e) {
    console.log("indisponível:", e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  await client.connect();
  try {
    await section("Tamanho do banco",
      "SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho");

    await section("Conexões por estado",
      `SELECT state, count(*)::int AS n
       FROM pg_stat_activity WHERE datname = current_database()
       GROUP BY state ORDER BY n DESC`);

    await section("Queries ativas há mais tempo (top 5)",
      `SELECT pid, state,
              round(extract(epoch FROM (now() - query_start)))::int AS seg,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 70) AS query
       FROM pg_stat_activity
       WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
       ORDER BY query_start ASC NULLS LAST LIMIT 5`);

    await section("Bloqueios (queries esperando lock)",
      `SELECT bl.pid AS bloqueado, ka.pid AS bloqueador,
              left(bl_a.query, 50) AS query_bloqueada
       FROM pg_locks bl
       JOIN pg_stat_activity bl_a ON bl_a.pid = bl.pid
       JOIN pg_locks kl ON kl.locktype = bl.locktype AND kl.pid <> bl.pid
         AND NOT kl.granted IS DISTINCT FROM TRUE
       JOIN pg_stat_activity ka ON ka.pid = kl.pid
       WHERE NOT bl.granted LIMIT 10`);

    await section("Maiores tabelas (top 10)",
      `SELECT schemaname AS schema, relname AS tabela,
              pg_size_pretty(pg_total_relation_size(relid)) AS tamanho,
              n_live_tup AS linhas
       FROM pg_stat_user_tables
       WHERE schemaname LIKE 'cross_%'
       ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`);

    await section("Índices sem uso (idx_scan = 0)",
      `SELECT schemaname AS schema, relname AS tabela, indexrelname AS indice,
              pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
       FROM pg_stat_user_indexes
       WHERE schemaname LIKE 'cross_%' AND idx_scan = 0
       ORDER BY pg_relation_size(indexrelid) DESC LIMIT 15`);

    await section("Cache hit ratio (ideal > 0.99)",
      `SELECT round(sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 4) AS cache_hit_ratio
       FROM pg_statio_user_tables WHERE schemaname LIKE 'cross_%'`);

    console.log("\nDica: use EXPLAIN (ANALYZE, BUFFERS) nas consultas críticas das rotas.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
