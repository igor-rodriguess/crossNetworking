import type { PoolClient } from "pg";
import { env } from "../../../config/env";
import { lerAcumulados, registrarConsumo, type RegistroConsumo } from "./consumo.repository";

// -----------------------------------------------------------------------------
// Guardrails globais persistentes.
//
// Complementam o `OrcamentoExecucao`, que continua responsável pelo teto POR
// EXECUÇÃO. A diferença é o que cada um protege:
//
//   OrcamentoExecucao  → uma execução não pode explodir sozinha
//   Guardrail global   → o conjunto das execuções não pode explodir ao longo
//                        do dia, do mês ou dentro de um cliente
//
// Os dois são necessários. Sem o segundo, mil execuções baratas somam uma conta
// cara sem nunca disparar bloqueio — e é justamente esse o risco de ligar um
// provider pago.
//
// A decisão é PREDITIVA: soma o já gasto ao custo projetado da operação e
// compara com o teto ANTES de chamar. Bloquear depois do gasto não é guardrail,
// é relatório.
// -----------------------------------------------------------------------------

export type MotivoBloqueioGlobal =
  | "daily_cost_limit"
  | "monthly_cost_limit"
  | "client_cost_limit";

export interface DecisaoGlobal {
  permitido: boolean;
  motivo?: MotivoBloqueioGlobal;
  detalhe?: string;
  acumulados: { diario: number; mensal: number; cliente: number };
  /** Custo projetado da operação; `null` = não estimável. */
  projetado: number | null;
  limites: { diario: number; mensal: number; cliente: number };
}

export interface ConsultaGuardrail {
  /** Custo projetado da operação. `null` NÃO é zero: é "não sei quanto custa". */
  custoProjetado: number | null;
  clienteCrossId?: string | null;
  /** Operação local não fatura: passa direto, mas continua sendo registrada. */
  local?: boolean;
}

/**
 * Autoriza uma operação paga contra os tetos persistentes.
 *
 * Ordem deliberada: diário → mensal → cliente. O diário é o mais apertado e o
 * que mais provavelmente barra um laço acidental, então checá-lo primeiro dá a
 * mensagem mais útil.
 */
export async function autorizarGlobal(
  client: PoolClient,
  consulta: ConsultaGuardrail
): Promise<DecisaoGlobal> {
  const limites = {
    diario: env.maxCostPerDayUsd,
    mensal: env.maxCostPerMonthUsd,
    cliente: env.maxCostPerClientMonthUsd,
  };

  const acumulados = await lerAcumulados(client, consulta.clienteCrossId);

  // Operação local consome tempo, não dinheiro. Continua sendo registrada para
  // observabilidade, mas não pode ser barrada por teto de custo.
  if (consulta.local) {
    return { permitido: true, acumulados, projetado: 0, limites };
  }

  // Custo desconhecido em modo estrito é decisão do OrcamentoExecucao, que roda
  // antes. Aqui, sem projeção, projetamos 0 para não bloquear duas vezes pelo
  // mesmo motivo — mas também não somamos nada de fantasia ao acumulado.
  const projetado = consulta.custoProjetado ?? 0;

  if (acumulados.diario + projetado > limites.diario) {
    return {
      permitido: false,
      motivo: "daily_cost_limit",
      detalhe:
        `Gasto de hoje ${acumulados.diario.toFixed(6)} + estimado ${projetado.toFixed(6)} ` +
        `excede o teto diário de ${limites.diario.toFixed(6)} USD.`,
      acumulados,
      projetado: consulta.custoProjetado,
      limites,
    };
  }

  if (acumulados.mensal + projetado > limites.mensal) {
    return {
      permitido: false,
      motivo: "monthly_cost_limit",
      detalhe:
        `Gasto do mês ${acumulados.mensal.toFixed(6)} + estimado ${projetado.toFixed(6)} ` +
        `excede o teto mensal de ${limites.mensal.toFixed(6)} USD.`,
      acumulados,
      projetado: consulta.custoProjetado,
      limites,
    };
  }

  // Teto por cliente só se aplica quando há cliente: consumo global não é
  // atribuível a ninguém e não deve ser barrado por um limite de terceiro.
  if (consulta.clienteCrossId && acumulados.cliente + projetado > limites.cliente) {
    return {
      permitido: false,
      motivo: "client_cost_limit",
      detalhe:
        `Gasto do cliente no mês ${acumulados.cliente.toFixed(6)} + estimado ${projetado.toFixed(6)} ` +
        `excede o teto de ${limites.cliente.toFixed(6)} USD por cliente/mês.`,
      acumulados,
      projetado: consulta.custoProjetado,
      limites,
    };
  }

  return { permitido: true, acumulados, projetado: consulta.custoProjetado, limites };
}

/** Registra o consumo após a chamada. Reexportado para manter um só ponto de uso. */
export async function registrar(client: PoolClient, r: RegistroConsumo): Promise<string> {
  return registrarConsumo(client, r);
}

export { lerAcumulados };
