import { describe, expect, it } from "vitest";
import { withTransaction } from "../../../shared/db";
import { salvarAnalise, listarExecucoes } from "./crossability.repository";
import type { CrossabilityAnalysis } from "./crossability.schema";

// -----------------------------------------------------------------------------
// Persistência da análise Crossability — §23 e §24 da AI-04.1.
//
// O que se prova aqui: depois de gravada, uma análise responde qual perfil,
// qual metodologia e qual modelo a sustentaram; e reexecutar não apaga o
// histórico.
// -----------------------------------------------------------------------------

function analiseFalsa(over: Partial<CrossabilityAnalysis> = {}): CrossabilityAnalysis {
  return {
    entidade: "Marca Teste",
    contexto: { objetivo: "ativação cultural", cliente_cross_id: null, contexto_ausente: false },
    methodology_version: [
      { codigo: "metodologia-crossability", documento: "Metodologia Crossability", versao: 2 },
    ],
    dimensions: [],
    overall_synthesis: "sintese",
    conflicts: [],
    evidence_gaps: [],
    knowledge_gaps: [],
    confidence: 42,
    rejeitados: [],
    provenance: {
      perfil_versao: 3,
      perfil_hash: "hash-abc",
      evidence_fact_ids: ["fact_1"],
      knowledge_chunk_ids: ["chunk_1"],
    },
    telemetria: {
      duracao_ms: 1200,
      provedor: "ollama",
      modelo: "qwen3:4b",
      llm_calls: 6,
      tokens_entrada: 5000,
      tokens_saida: 900,
      tokens_cache: 0,
      custo_estimado_usd: 0,
      contexto_caracteres: 21000,
      retrieval_calls: 6,
      bloqueios: [],
    },
    ...over,
  } as CrossabilityAnalysis;
}

describe("Persistência da análise Crossability", () => {
  it("grava e permite auditar perfil, metodologia e modelo depois", async () => {
    await withTransaction(async (client) => {
      const r = await salvarAnalise(client, { analise: analiseFalsa() });

      const { rows } = await client.query(
        `SELECT entidade, perfil_versao, perfil_hash, metodologia_codigo,
                metodologia_versao, modelo, provedor, confianca_global
           FROM cross_ai.analise_crossability WHERE id = $1`,
        [r.id]
      );

      const linha = rows[0];
      expect(linha.entidade).toBe("Marca Teste");
      expect(linha.perfil_versao).toBe(3);
      expect(linha.perfil_hash).toBe("hash-abc");
      expect(linha.metodologia_codigo).toBe("metodologia-crossability");
      expect(linha.metodologia_versao).toBe(2);
      expect(linha.modelo).toBe("qwen3:4b");
      expect(linha.confianca_global).toBe(42);
    });
  });

  it("preserva a saída crua do modelo separada da análise validada", async () => {
    await withTransaction(async (client) => {
      const bruta = { assessment: "alta", reasoning: "texto cru do modelo" };
      const r = await salvarAnalise(client, { analise: analiseFalsa(), saidaBruta: bruta });

      const { rows } = await client.query(
        `SELECT saida_bruta, analise FROM cross_ai.analise_crossability WHERE id = $1`,
        [r.id]
      );
      expect(rows[0].saida_bruta.reasoning).toBe("texto cru do modelo");
      // A análise validada é outra coisa, e continua íntegra.
      expect(rows[0].analise.entidade).toBe("Marca Teste");
    });
  });

  it("reexecutar cria nova linha sem apagar a anterior", async () => {
    await withTransaction(async (client) => {
      const primeira = await salvarAnalise(client, { analise: analiseFalsa() });

      // Mesma análise lógica, metodologia evoluída.
      const segunda = await salvarAnalise(client, {
        analise: analiseFalsa({
          confidence: 55,
          methodology_version: [
            { codigo: "metodologia-crossability", documento: "Metodologia Crossability", versao: 3 },
          ],
        }),
        analiseLogicaId: primeira.analiseLogicaId,
      });

      expect(segunda.analiseLogicaId).toBe(primeira.analiseLogicaId);
      expect(segunda.id).not.toBe(primeira.id);

      const historico = await listarExecucoes(client, primeira.analiseLogicaId);
      expect(historico).toHaveLength(2);
      // As duas versões da metodologia continuam auditáveis.
      expect(historico.map((h) => h.metodologiaVersao).sort()).toEqual([2, 3]);
    });
  });

  it("análises independentes recebem ids lógicos distintos", async () => {
    await withTransaction(async (client) => {
      const a = await salvarAnalise(client, { analise: analiseFalsa() });
      const b = await salvarAnalise(client, { analise: analiseFalsa({ entidade: "Outra Marca" }) });
      expect(a.analiseLogicaId).not.toBe(b.analiseLogicaId);
    });
  });
});
