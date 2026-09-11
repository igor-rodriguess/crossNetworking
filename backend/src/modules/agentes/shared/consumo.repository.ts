import type { PoolClient } from "pg";

// -----------------------------------------------------------------------------
// Consumo de IA persistente.
//
// Existe porque o orçamento em memória não sobrevive a restart: com teto apenas
// por execução, mil execuções de US$ 0,10 custam US$ 100 sem nunca disparar um
// bloqueio. Para ligar provider pago é preciso saber quanto já se gastou HOJE,
// NESTE MÊS e NESTE CLIENTE — e essa resposta tem de vir do banco.
//
// Consumo local (Ollama) é gravado para observabilidade, mas fica fora dos
// acumulados de custo: consome tempo, não dinheiro.
// -----------------------------------------------------------------------------

export interface RegistroConsumo {
  clienteCrossId?: string | null;
  agente: string;
  operacao: string;
  provedor: string;
  modelo?: string | null;
  tokensEntrada?: number;
  tokensSaida?: number;
  tokensCache?: number;
  custoEstimado?: number | null;
  custoReal?: number | null;
  execucaoId?: string | null;
  runId?: string | null;
  duracaoMs?: number | null;
  local?: boolean;
}

export interface AcumuladosConsumo {
  diario: number;
  mensal: number;
  cliente: number;
}

/** Grava uma chamada no livro-razão. Append-only. */
export async function registrarConsumo(
  client: PoolClient,
  r: RegistroConsumo
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.consumo_ia (
       cliente_cross_id, agente, operacao, provedor, modelo,
       tokens_entrada, tokens_saida, tokens_cache,
       custo_estimado, custo_real, execucao_id, run_id, duracao_ms, local
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      r.clienteCrossId ?? null,
      r.agente,
      r.operacao,
      r.provedor,
      r.modelo ?? null,
      r.tokensEntrada ?? 0,
      r.tokensSaida ?? 0,
      r.tokensCache ?? 0,
      r.custoEstimado ?? null,
      r.custoReal ?? null,
      r.execucaoId ?? null,
      r.runId ?? null,
      r.duracaoMs ?? null,
      r.local ?? false,
    ]
  );
  return rows[0].id;
}

/**
 * Lê os acumulados que sustentam os tetos.
 *
 * Prefere `custo_real` e cai para `custo_estimado` quando o real ainda não foi
 * apurado — subestimar o acumulado deixaria o teto passar batido. `NULL` em
 * ambos conta como 0 aqui de propósito: o bloqueio de custo desconhecido é do
 * modo estrito, na autorização, e não deve ser duplicado nesta soma.
 */
export async function lerAcumulados(
  client: PoolClient,
  clienteCrossId?: string | null
): Promise<AcumuladosConsumo> {
  const { rows } = await client.query<{
    diario: string | null;
    mensal: string | null;
    cliente: string | null;
  }>(
    `SELECT
       COALESCE(SUM(COALESCE(custo_real, custo_estimado, 0))
         FILTER (WHERE dia = CURRENT_DATE), 0) AS diario,
       COALESCE(SUM(COALESCE(custo_real, custo_estimado, 0))
         FILTER (WHERE mes = date_trunc('month', CURRENT_DATE)::date), 0) AS mensal,
       COALESCE(SUM(COALESCE(custo_real, custo_estimado, 0))
         FILTER (WHERE cliente_cross_id = $1
                   AND mes = date_trunc('month', CURRENT_DATE)::date), 0) AS cliente
     FROM cross_ai.consumo_ia
     WHERE local = FALSE`,
    [clienteCrossId ?? null]
  );

  const n = (v: string | null) => Number(v ?? 0);
  return {
    diario: n(rows[0]?.diario ?? null),
    mensal: n(rows[0]?.mensal ?? null),
    cliente: n(rows[0]?.cliente ?? null),
  };
}
