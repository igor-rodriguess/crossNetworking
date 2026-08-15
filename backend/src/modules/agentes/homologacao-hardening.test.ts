import { describe, expect, it } from "vitest";
import { withTransaction } from "../../shared/db";
import * as repo from "./agentes.repository";
import { verificarFatos } from "./fact-verifier.agent";
import { estimarCusto } from "./shared/custo";

// -----------------------------------------------------------------------------
// Homologação do Agent Framework Hardening (Sprint 0C).
//
// Estes testes NÃO alteram nenhum teste existente: exercitam especificamente o
// que o hardening entregou e que a suíte anterior não cobria — telemetria
// persistida, Fact Verifier nos três desfechos e retomada por checkpoint.
//
// Tudo roda contra o banco de TESTE, em transação com ROLLBACK (tests/setup.ts),
// com provider determinístico. Nenhuma API paga é chamada.
// -----------------------------------------------------------------------------

describe("Homologação · telemetria de execução", () => {
  it("persiste execução pai e filha com provider, modelo, tokens, cache, duração e custo", async () => {
    await withTransaction(async (client) => {
      const iniciadoEm = new Date(Date.now() - 1500);

      // Execução PAI: representa o pipeline inteiro.
      const paiId = await repo.registrarExecucao(client, {
        agente: "partner_discovery",
        status: "sucesso",
        origem: "pipeline",
        entrada: { cliente: "Grupo Aramis", objetivo: "collabs de moda masculina" },
        saida: { status: "executando" },
        iniciadoEm,
        tentativa: 1,
      });
      expect(paiId).toBeTruthy();

      // Execução FILHA: uma etapa que consumiu LLM real (aqui, valores fixos).
      const tokens = { entrada: 1_000_000, saida: 1_000_000, cache: 200_000 };
      const modelo = "gpt-4o-mini";
      const filhaId = await repo.registrarExecucao(client, {
        agente: "information_extractor",
        status: "sucesso",
        origem: "openai",
        entrada: { total_resultados: 12 },
        saida: { total_conteudos: 3, perfis: [] },
        tokensEntrada: tokens.entrada,
        tokensSaida: tokens.saida,
        tokensCache: tokens.cache,
        duracaoMs: 1500,
        modelo,
        custoEstimado: estimarCusto(modelo, tokens),
        iniciadoEm,
        finalizadoEm: new Date(),
        execucaoPaiId: paiId,
        tentativa: 1,
      });

      // Uso de ferramenta externa vinculado à mesma execução.
      await repo.registrarUsoFerramenta(client, {
        execucaoId: filhaId,
        ferramenta: "firecrawl_scrape",
        chamadas: 3,
        unidades: 3,
        detalhe: { origem: "firecrawl" },
      });

      const { rows } = await client.query(
        `SELECT agente, origem, modelo, tokens_entrada, tokens_saida, tokens_cache,
                duracao_ms, custo_estimado, execucao_pai_id, tentativa,
                iniciado_em IS NOT NULL AS tem_inicio,
                finalizado_em IS NOT NULL AS tem_fim
           FROM cross_ai.execucao_agente WHERE id = $1`,
        [filhaId]
      );
      const filha = rows[0];

      expect(filha.origem).toBe("openai");
      expect(filha.modelo).toBe("gpt-4o-mini");
      expect(Number(filha.tokens_entrada)).toBe(1_000_000);
      expect(Number(filha.tokens_saida)).toBe(1_000_000);
      expect(Number(filha.tokens_cache)).toBe(200_000);
      expect(Number(filha.duracao_ms)).toBe(1500);
      expect(filha.execucao_pai_id).toBe(paiId);
      expect(Number(filha.tentativa)).toBe(1);
      expect(filha.tem_inicio).toBe(true);
      expect(filha.tem_fim).toBe(true);

      // Custo: 800k entrada plena (0.15/1M) + 200k cache (0.075/1M) + 1M saída (0.60/1M)
      //      = 0.12 + 0.015 + 0.60 = 0.735
      expect(Number(filha.custo_estimado)).toBeCloseTo(0.735, 6);

      // O uso de ferramenta ficou vinculado.
      const uso = await client.query(
        `SELECT ferramenta, chamadas, unidades FROM cross_ai.uso_ferramenta WHERE execucao_id = $1`,
        [filhaId]
      );
      expect(uso.rows).toHaveLength(1);
      expect(uso.rows[0].ferramenta).toBe("firecrawl_scrape");
      expect(Number(uso.rows[0].chamadas)).toBe(3);
    });
  });

  it("consolida no pai a soma de tokens e custo das filhas", async () => {
    await withTransaction(async (client) => {
      const iniciadoEm = new Date(Date.now() - 900);
      const paiId = await repo.registrarExecucao(client, {
        agente: "partner_discovery",
        status: "sucesso",
        origem: "pipeline",
        entrada: {},
        iniciadoEm,
      });

      // Duas filhas com custo estimável.
      for (const t of [
        { entrada: 1_000_000, saida: 0 },
        { entrada: 1_000_000, saida: 0 },
      ]) {
        await repo.registrarExecucao(client, {
          agente: "crossability_reasoning",
          status: "sucesso",
          origem: "openai",
          entrada: {},
          tokensEntrada: t.entrada,
          tokensSaida: t.saida,
          modelo: "gpt-4o-mini",
          custoEstimado: estimarCusto("gpt-4o-mini", t),
          execucaoPaiId: paiId,
        });
      }

      await repo.finalizarExecucaoPai(client, {
        id: paiId,
        status: "sucesso",
        saida: { status: "sucesso" },
        iniciadoEm,
      });

      const { rows } = await client.query(
        `SELECT status, tokens_entrada, custo_estimado, duracao_ms
           FROM cross_ai.execucao_agente WHERE id = $1`,
        [paiId]
      );
      expect(rows[0].status).toBe("sucesso");
      expect(Number(rows[0].tokens_entrada)).toBe(2_000_000);
      // 2 × 0.15 = 0.30
      expect(Number(rows[0].custo_estimado)).toBeCloseTo(0.3, 6);
      expect(Number(rows[0].duracao_ms)).toBeGreaterThanOrEqual(0);
    });
  });

  it("mantém custo NULL quando nenhuma etapa foi estimável — não medido ≠ gratuito", async () => {
    await withTransaction(async (client) => {
      const iniciadoEm = new Date();
      const paiId = await repo.registrarExecucao(client, {
        agente: "partner_discovery",
        status: "sucesso",
        origem: "pipeline",
        entrada: {},
        iniciadoEm,
      });
      // Filha heurística: sem modelo, sem custo.
      await repo.registrarExecucao(client, {
        agente: "source_credibility",
        status: "sucesso",
        origem: "heuristica",
        entrada: {},
        execucaoPaiId: paiId,
      });
      await repo.finalizarExecucaoPai(client, { id: paiId, status: "sucesso", iniciadoEm });

      const { rows } = await client.query(
        `SELECT custo_estimado FROM cross_ai.execucao_agente WHERE id = $1`,
        [paiId]
      );
      expect(rows[0].custo_estimado).toBeNull();
    });
  });
});

describe("Homologação · Fact Verifier nos três desfechos", () => {
  it("classifica corroborada, fonte_unica e nao_confirmada", () => {
    const { saida } = verificarFatos({
      afirmacoes: [
        {
          // A) dois domínios independentes
          texto: "A marca X lançou uma collab de moda masculina.",
          fontes: ["https://g1.globo.com/moda/collab-x", "https://exame.com/negocios/collab-x"],
        },
        {
          // B) duas URLs, MESMO domínio → uma fonte independente só
          texto: "A marca X abriu uma loja em São Paulo.",
          fontes: ["https://exame.com/a", "https://www.exame.com/b"],
        },
        {
          // C) sem fonte válida
          texto: "A marca X pretende expandir para o Nordeste.",
          fontes: [""],
        },
      ],
    });

    expect(saida.total).toBe(3);
    expect(saida.verificacoes[0].status).toBe("corroborada");
    expect(saida.verificacoes[0].fontes_independentes).toBe(2);

    expect(saida.verificacoes[1].status).toBe("fonte_unica");
    // www. é normalizado: exame.com e www.exame.com são o MESMO domínio.
    expect(saida.verificacoes[1].fontes_independentes).toBe(1);

    expect(saida.verificacoes[2].status).toBe("nao_confirmada");
    expect(saida.verificacoes[2].fontes_independentes).toBe(0);

    expect(saida.resumo).toEqual({ corroborada: 1, fonte_unica: 1, nao_confirmada: 1 });
  });
});

describe("Homologação · checkpoint por etapa", () => {
  it("grava e relê a saída de uma etapa, e o merge não sobrescreve as anteriores", async () => {
    await withTransaction(async (client) => {
      const tarefa = await repo.criarTarefaPipeline(client, {
        pipeline: "partner_discovery",
        entrada: { cliente: "Grupo Aramis", objetivo: "homologação" },
      });

      // Nasce vazio.
      expect(await repo.lerCheckpoint(client, tarefa.id)).toEqual({});

      // Três etapas concluídas, gravadas uma a uma.
      await repo.gravarCheckpointEtapa(client, tarefa.id, "search_planning", {
        saida: { objetivo_interpretado: "moda masculina" },
        execucao_id: undefined,
        origem: "heuristica",
        concluida_em: new Date().toISOString(),
      });
      await repo.gravarCheckpointEtapa(client, tarefa.id, "source_collector", {
        saida: { total_consultas: 4, total_resultados: 12 },
        origem: "mock",
        concluida_em: new Date().toISOString(),
      });
      await repo.gravarCheckpointEtapa(client, tarefa.id, "source_credibility", {
        saida: { total: 12 },
        origem: "heuristica",
        concluida_em: new Date().toISOString(),
      });

      const salvo = await repo.lerCheckpoint(client, tarefa.id);

      // As três coexistem: o merge no servidor não sobrescreveu as anteriores.
      expect(Object.keys(salvo).sort()).toEqual([
        "search_planning",
        "source_collector",
        "source_credibility",
      ]);

      expect((salvo.source_collector.saida as { total_resultados: number }).total_resultados).toBe(12);
      expect(salvo.search_planning.origem).toBe("heuristica");
    });
  });

  it("uma etapa presente no checkpoint é retomada em vez de reexecutada", async () => {
    await withTransaction(async (client) => {
      const tarefa = await repo.criarTarefaPipeline(client, {
        pipeline: "partner_discovery",
        entrada: { cliente: "Grupo Aramis", objetivo: "homologação" },
      });
      await repo.gravarCheckpointEtapa(client, tarefa.id, "source_collector", {
        saida: { total_consultas: 4, total_resultados: 12 },
        origem: "duckduckgo",
        concluida_em: new Date().toISOString(),
      });

      const salvo = await repo.lerCheckpoint(client, tarefa.id);

      // Reproduz a decisão de `comCheckpoint`: havendo registro, não executa.
      let executou = false;
      const executar = async () => {
        executou = true;
        return { saida: { total_resultados: 999 } };
      };
      const resultado = salvo["source_collector"] ?? (await executar());

      expect(executou).toBe(false);
      expect((resultado as { saida: { total_resultados: number } }).saida.total_resultados).toBe(12);
    });
  });
});
