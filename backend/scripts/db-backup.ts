/**
 * Backup lógico dos dados (WAD 7.4.27). Exporta os dados de todas as tabelas
 * dos schemas cross_* via COPY (streaming), comprimidos em .gz, num diretório
 * com timestamp. O schema em si já está versionado nas migrations (git).
 *
 * Uso: tsx scripts/db-backup.ts   (npm run db:backup)
 *
 * Restauração (banco já migrado/vazio) — exemplo por tabela:
 *   gunzip -c <arquivo>.copy.gz | psql "<conn>" -c "COPY <schema>.<tab> FROM STDIN"
 * ou via scripts/db-restore.ts (se disponível).
 *
 * Observação: para DR de produção, combine este backup com os backups
 * gerenciados do Supabase (automáticos/PITR) e um restore testado.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Client } from "pg";
import { to as copyTo } from "pg-copy-streams";
import "dotenv/config";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL/DATABASE_URL não definida.");

async function main(): Promise<void> {
  const client = new Client({
    connectionString: url,
    ssl: url!.includes("supabase.") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(__dirname, "..", "backups", stamp);
  mkdirSync(outDir, { recursive: true });

  try {
    const { rows: tabelas } = await client.query<{ schema: string; tabela: string }>(`
      SELECT table_schema AS schema, table_name AS tabela
      FROM information_schema.tables
      WHERE table_schema LIKE 'cross_%' AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    let totalLinhas = 0;
    for (const { schema, tabela } of tabelas) {
      const alvo = `${schema}.${tabela}`;
      const arquivo = path.join(outDir, `${alvo}.copy.gz`);
      const stream = client.query(
        copyTo(`COPY ${alvo} TO STDOUT (FORMAT text)`)
      );
      await pipeline(stream, createGzip(), createWriteStream(arquivo));

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${alvo}`
      );
      totalLinhas += Number(rows[0].n);
      if (Number(rows[0].n) > 0) console.log(`  ${alvo}: ${rows[0].n} linha(s)`);
    }

    console.log(
      `\nBackup concluído: ${tabelas.length} tabelas, ${totalLinhas} linha(s) totais.`
    );
    console.log(`Diretório: backups/${stamp}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
