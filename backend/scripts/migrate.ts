/**
 * Runner de migrations da Plataforma Cross (WAD 7.4.22).
 *
 * - Aplica os arquivos .sql de database/migrations em ordem, uma única vez,
 *   cada um dentro de sua própria transação.
 * - Registra um checksum SHA-256 de cada migration aplicada e, em execuções
 *   futuras, verifica que nenhuma migration já aplicada foi modificada
 *   (integridade do histórico — WAD 7.4.22). Migrations legadas sem checksum
 *   são preenchidas automaticamente.
 *
 * Uso:
 *   tsx scripts/migrate.ts           -> aplica pendentes
 *   tsx scripts/migrate.ts status    -> lista aplicadas/pendentes e sai
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "database", "migrations");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function makeClient(): Client {
  // Migrations usam a conexão administrativa; cai para DATABASE_URL se
  // MIGRATION_DATABASE_URL não estiver definida.
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("MIGRATION_DATABASE_URL/DATABASE_URL não definida. Copie .env.example para .env.");
  }
  return new Client({
    connectionString: url,
    ssl: url.includes("supabase.") ? { rejectUnauthorized: false } : undefined,
    keepAlive: true,
    statement_timeout: 120000,
    query_timeout: 120000,
    connectionTimeoutMillis: 30000,
  });
}

async function ensureTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64),
      aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    "ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS checksum CHAR(64)"
  );
}

async function getApplied(client: Client): Promise<Map<string, string | null>> {
  const { rows } = await client.query<{ nome: string; checksum: string | null }>(
    "SELECT nome, checksum FROM public.schema_migrations"
  );
  return new Map(rows.map((r) => [r.nome, r.checksum]));
}

async function status(): Promise<void> {
  const client = makeClient();
  await client.connect();
  try {
    await ensureTable(client);
    const applied = await getApplied(client);
    const arquivos = listMigrationFiles();
    console.log("Migration                              Estado");
    console.log("-------------------------------------  ----------");
    for (const f of arquivos) {
      const isApplied = applied.has(f);
      let estado = "PENDENTE";
      if (isApplied) {
        const stored = applied.get(f);
        const atual = sha256(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
        estado = !stored ? "aplicada" : stored === atual ? "aplicada" : "ADULTERADA!";
      }
      console.log(`${f.padEnd(38)} ${estado}`);
    }
    const pendentes = arquivos.filter((f) => !applied.has(f)).length;
    console.log(`\n${applied.size} aplicada(s), ${pendentes} pendente(s).`);
  } finally {
    await client.end();
  }
}

async function migrate(): Promise<void> {
  const client = makeClient();
  await client.connect();
  try {
    await ensureTable(client);
    const applied = await getApplied(client);
    const arquivos = listMigrationFiles();

    // Verifica integridade das já aplicadas (e preenche checksums legados).
    for (const [nome, stored] of applied) {
      const full = path.join(MIGRATIONS_DIR, nome);
      let atual: string;
      try {
        atual = sha256(readFileSync(full, "utf8"));
      } catch {
        console.warn(`Aviso: migration aplicada '${nome}' não existe mais no diretório.`);
        continue;
      }
      if (!stored) {
        await client.query(
          "UPDATE public.schema_migrations SET checksum = $1 WHERE nome = $2",
          [atual, nome]
        );
      } else if (stored !== atual) {
        throw new Error(
          `Migration já aplicada foi MODIFICADA: ${nome}. ` +
            `Migrations aplicadas não podem ser alteradas (WAD 7.4.22) — gere uma nova migration.`
        );
      }
    }

    let aplicadasAgora = 0;
    for (const arquivo of arquivos) {
      if (applied.has(arquivo)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, arquivo), "utf8");
      process.stdout.write(`Aplicando ${arquivo}... `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (nome, checksum) VALUES ($1, $2)",
          [arquivo, sha256(sql)]
        );
        await client.query("COMMIT");
        console.log("OK");
        aplicadasAgora++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("ERRO");
        throw err;
      }
    }

    console.log(
      aplicadasAgora === 0
        ? "Banco já está atualizado."
        : `${aplicadasAgora} migration(s) aplicada(s) com sucesso.`
    );
  } finally {
    await client.end();
  }
}

const run = process.argv[2] === "status" ? status : migrate;
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
