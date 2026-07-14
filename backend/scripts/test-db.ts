/**
 * Executa os testes de integridade do banco (WAD 7.4.24).
 * O arquivo database/tests/integridade.sql roda inteiro dentro de uma
 * transação com ROLLBACK ao final — nada é persistido.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

const TESTS_FILE = path.resolve(
  __dirname,
  "..",
  "database",
  "tests",
  "integridade.sql"
);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.") ? { rejectUnauthorized: false } : undefined,
  });

  // Mensagens RAISE NOTICE dos testes são exibidas no console
  client.on("notice", (msg) => {
    console.log(msg.message);
  });

  await client.connect();
  try {
    const sql = readFileSync(TESTS_FILE, "utf8");
    await client.query(sql);
    console.log("\nTodos os testes de integridade passaram.");
  } catch (err) {
    console.error("\nFALHA nos testes de integridade:");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
