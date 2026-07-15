import { Pool, PoolClient } from "pg";
import { env } from "../config/env";

const usaSsl = env.databaseUrl.includes("supabase.") || env.isProd;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  // TLS obrigatório em Supabase/produção. A verificação estrita do certificado
  // é controlada por env (default relaxado para o pooler do Supabase).
  ssl: usaSsl ? { rejectUnauthorized: env.databaseSslStrict } : undefined,
  // Sondas TCP keepalive evitam que o pooler/NAT derrube conexões ociosas
  // durante operações longas (visto em suítes pesadas contra o pooler).
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// -----------------------------------------------------------------------------
// Suporte a testes com rollback: em modo de teste, todas as transações usam
// um único client (dentro de uma transação externa controlada pelo harness),
// usando SAVEPOINTs no lugar de BEGIN/COMMIT. Assim, o ROLLBACK externo do
// harness descarta tudo e nenhum dado é persistido.
// -----------------------------------------------------------------------------
let testClient: PoolClient | null = null;
let savepointSeq = 0;

/** Usado apenas pelo harness de testes (tests/setup.ts). */
export function __setTestClient(client: PoolClient | null): void {
  testClient = client;
}

export interface TxOptions {
  /** UUID do usuário para a trilha de auditoria (app.usuario_id). */
  usuarioId?: string | null;
}

/**
 * Executa `fn` dentro de uma transação. Define `app.usuario_id` (usado pelos
 * triggers de auditoria) quando informado. Em produção usa BEGIN/COMMIT do
 * pool; em testes usa SAVEPOINT sobre o client compartilhado.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  opts: TxOptions = {}
): Promise<T> {
  if (testClient) {
    const sp = `sp_${++savepointSeq}`;
    await testClient.query(`SAVEPOINT ${sp}`);
    try {
      if (opts.usuarioId) {
        await testClient.query("SELECT set_config('app.usuario_id', $1, true)", [opts.usuarioId]);
      }
      const result = await fn(testClient);
      await testClient.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      await testClient.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (opts.usuarioId) {
      await client.query("SELECT set_config('app.usuario_id', $1, true)", [opts.usuarioId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
