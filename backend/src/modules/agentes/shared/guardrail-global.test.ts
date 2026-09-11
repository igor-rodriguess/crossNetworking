import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { autorizarGlobal, registrar, lerAcumulados } from "./guardrail-global";
import { env } from "../../../config/env";

// -----------------------------------------------------------------------------
// Guardrails globais persistentes — Sprint AI-04.1, §1 e §3.
//
// O que se testa aqui é a diferença entre o orçamento em memória e o teto que
// sobrevive a restart. O `OrcamentoExecucao` protege UMA execução; estes tetos
// protegem o conjunto delas ao longo do dia, do mês e por cliente.
//
// Rodam contra o banco de teste com ROLLBACK. Nenhuma chamada paga é feita: o
// que se valida é a decisão de bloqueio, não o provider.
// -----------------------------------------------------------------------------

async function criarCliente(client: PoolClient, nome: string): Promise<string> {
  const statusParte = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
  );
  const parte = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
     VALUES ('organizacao', $1, $2) RETURNING id`,
    [nome, statusParte.rows[0].id]
  );
  const statusCliente = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`
  );
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
     VALUES ($1, $2) RETURNING id`,
    [parte.rows[0].id, statusCliente.rows[0].id]
  );
  return cliente.rows[0].id;
}

/** Gasto base de uma chamada qualquer, para compor acumulados. */
function gasto(custo: number, clienteCrossId?: string | null) {
  return {
    agente: "crossability_reasoning",
    operacao: "crossability_reasoning",
    provedor: "openai",
    modelo: "gpt-4o-mini",
    custoReal: custo,
    clienteCrossId,
  };
}

describe("Consumo persistente", () => {
  it("acumula custo do dia e do mês", async () => {
    await withTransaction(async (client) => {
      await registrar(client, gasto(0.10));
      await registrar(client, gasto(0.25));

      const a = await lerAcumulados(client);
      expect(a.diario).toBeCloseTo(0.35, 6);
      expect(a.mensal).toBeCloseTo(0.35, 6);
    });
  });

  it("consumo local não entra no acumulado de custo", async () => {
    await withTransaction(async (client) => {
      await registrar(client, {
        agente: "crossability_reasoning",
        operacao: "crossability_reasoning",
        provedor: "ollama",
        modelo: "qwen3:4b",
        custoReal: 0,
        local: true,
        tokensEntrada: 5000,
        tokensSaida: 900,
      });

      const a = await lerAcumulados(client);
      expect(a.diario).toBe(0);

      // Mas o registro existe: observabilidade preservada.
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.consumo_ia WHERE local = TRUE`
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  it("usa custo_real quando existe e cai para o estimado quando não", async () => {
    await withTransaction(async (client) => {
      await registrar(client, {
        agente: "a", operacao: "o", provedor: "openai", modelo: "gpt-4o-mini",
        custoEstimado: 0.50, custoReal: 0.20,
      });
      await registrar(client, {
        agente: "a", operacao: "o", provedor: "openai", modelo: "gpt-4o-mini",
        custoEstimado: 0.30, custoReal: null,
      });

      // 0.20 (real preferido) + 0.30 (estimado como fallback)
      const a = await lerAcumulados(client);
      expect(a.diario).toBeCloseTo(0.50, 6);
    });
  });
});

describe("Teto diário", () => {
  it("bloqueia quando acumulado + projetado excede o limite", async () => {
    await withTransaction(async (client) => {
      await registrar(client, gasto(env.maxCostPerDayUsd));

      const d = await autorizarGlobal(client, { custoProjetado: 0.01 });
      expect(d.permitido).toBe(false);
      expect(d.motivo).toBe("daily_cost_limit");
    });
  });

  it("é PREDITIVO: bloqueia antes de gastar, não depois", async () => {
    await withTransaction(async (client) => {
      // Ainda abaixo do teto, mas a operação projetada estouraria.
      await registrar(client, gasto(env.maxCostPerDayUsd - 0.01));

      const d = await autorizarGlobal(client, { custoProjetado: 1 });
      expect(d.permitido).toBe(false);
      expect(d.motivo).toBe("daily_cost_limit");
      // O gasto não aconteceu: o acumulado continua abaixo do teto.
      expect(d.acumulados.diario).toBeLessThan(env.maxCostPerDayUsd);
    });
  });

  it("permite quando cabe no teto", async () => {
    await withTransaction(async (client) => {
      const d = await autorizarGlobal(client, { custoProjetado: 0.001 });
      expect(d.permitido).toBe(true);
    });
  });
});

describe("Teto mensal", () => {
  it("bloqueia por mês mesmo com o diário livre", async () => {
    await withTransaction(async (client) => {
      // Gasto lançado em dia anterior do mesmo mês: não conta no diário, conta
      // no mensal. É exatamente o caso que um teto só diário deixaria passar.
      await client.query(
        `INSERT INTO cross_ai.consumo_ia
           (dia, mes, agente, operacao, provedor, modelo, custo_real, local)
         VALUES (CURRENT_DATE - 1, date_trunc('month', CURRENT_DATE)::date,
                 'a','o','openai','gpt-4o-mini', $1, FALSE)`,
        [env.maxCostPerMonthUsd]
      );

      const a = await lerAcumulados(client);
      expect(a.diario).toBe(0);
      expect(a.mensal).toBeCloseTo(env.maxCostPerMonthUsd, 6);

      const d = await autorizarGlobal(client, { custoProjetado: 0.01 });
      expect(d.permitido).toBe(false);
      expect(d.motivo).toBe("monthly_cost_limit");
    });
  });
});

describe("Teto por cliente", () => {
  /**
   * Lança o gasto do cliente em mês corrente mas dia anterior.
   *
   * Sem isso o teto DIÁRIO barraria antes do teto por cliente, e o teste
   * passaria pelo motivo errado. Os tetos se aninham (cliente/mês ≤ diário),
   * então isolar a dimensão testada exige tirar o gasto do dia de hoje.
   */
  async function gastoDoMesAnterior(client: PoolClient, custo: number, clienteId: string) {
    await client.query(
      `INSERT INTO cross_ai.consumo_ia
         (dia, mes, cliente_cross_id, agente, operacao, provedor, modelo, custo_real, local)
       VALUES (CURRENT_DATE - 1, date_trunc('month', CURRENT_DATE)::date,
               $1, 'a','o','openai','gpt-4o-mini', $2, FALSE)`,
      [clienteId, custo]
    );
  }

  it("bloqueia o cliente que estourou sem afetar os demais", async () => {
    await withTransaction(async (client) => {
      const clienteA = await criarCliente(client, "Cliente A guardrail");
      const clienteB = await criarCliente(client, "Cliente B guardrail");

      await gastoDoMesAnterior(client, env.maxCostPerClientMonthUsd, clienteA);

      const dA = await autorizarGlobal(client, {
        custoProjetado: 0.01,
        clienteCrossId: clienteA,
      });
      expect(dA.permitido).toBe(false);
      expect(dA.motivo).toBe("client_cost_limit");

      // O gasto de A não pode bloquear B.
      const dB = await autorizarGlobal(client, {
        custoProjetado: 0.01,
        clienteCrossId: clienteB,
      });
      expect(dB.permitido).toBe(true);
    });
  });

  it("consumo sem cliente não é barrado por teto de cliente", async () => {
    await withTransaction(async (client) => {
      const cliente = await criarCliente(client, "Cliente C guardrail");
      await gastoDoMesAnterior(client, env.maxCostPerClientMonthUsd, cliente);

      // Operação global: não atribuível a esse cliente.
      const d = await autorizarGlobal(client, { custoProjetado: 0.01 });
      expect(d.permitido).toBe(true);
    });
  });

  it("os tetos se aninham: cliente/mês ≤ diário ≤ mensal", () => {
    // Configuração incoerente tornaria o teto por cliente inalcançável.
    expect(env.maxCostPerClientMonthUsd).toBeLessThanOrEqual(env.maxCostPerDayUsd);
    expect(env.maxCostPerDayUsd).toBeLessThanOrEqual(env.maxCostPerMonthUsd);
  });
});

describe("Persistência sobrevive a restart", () => {
  it("acumulado vem do banco, não da memória do processo", async () => {
    await withTransaction(async (client) => {
      await registrar(client, gasto(0.42));

      // Simula restart: nenhuma instância de OrcamentoExecucao é reaproveitada,
      // e mesmo assim o acumulado continua lá.
      const a = await lerAcumulados(client);
      expect(a.diario).toBeCloseTo(0.42, 6);

      const d = await autorizarGlobal(client, { custoProjetado: 0.001 });
      expect(d.acumulados.diario).toBeCloseTo(0.42, 6);
    });
  });
});

describe("Operação local", () => {
  it("nunca é barrada por teto de custo", async () => {
    await withTransaction(async (client) => {
      await registrar(client, gasto(env.maxCostPerDayUsd * 10));

      const d = await autorizarGlobal(client, { custoProjetado: null, local: true });
      expect(d.permitido).toBe(true);
    });
  });
});
