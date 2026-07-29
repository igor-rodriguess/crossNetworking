import { describe, expect, it } from "vitest";
import { avaliarCredibilidade } from "./source-credibility.agent";
import { recomendarParceiros } from "./recommendation.agent";
import { mapearComLimite } from "./shared/concorrencia";
import type { AnaliseCrossabilitySaida, NivelCompat } from "./agentes.schema";

// Agentes determinísticos (sem LLM, sem rede) e utilitários compartilhados.
// São a espinha do pipeline: quando o Reasoning propõe, é a Credibility que
// filtra a evidência e a Recommendation que decide a ordem. Ambos rodam sempre,
// inclusive em modo mock, então merecem cobertura direta.

function analise(niveis: Partial<Record<keyof AnaliseCrossabilitySaida, NivelCompat>>, confianca = 50): AnaliseCrossabilitySaida {
  const dim = (n: NivelCompat = "media") => ({ nivel: n, texto: "justificativa" });
  return {
    compatibilidade_publicos: dim(niveis.compatibilidade_publicos as NivelCompat),
    compatibilidade_territorios: dim(niveis.compatibilidade_territorios as NivelCompat),
    complementaridade_ativos: dim(niveis.complementaridade_ativos as NivelCompat),
    sinergias: dim(niveis.sinergias as NivelCompat),
    fit_estrategico: dim(niveis.fit_estrategico as NivelCompat),
    momento_estrategico: dim(niveis.momento_estrategico as NivelCompat),
    recomendacao: "em_estudo",
    racional_recomendacao: "racional",
    confianca,
  };
}

describe("Source Credibility — heurística de reputação da fonte", () => {
  it("pontua veículo reconhecido acima de blog anônimo", () => {
    const { saida } = avaliarCredibilidade({
      resultados: [
        { titulo: "Notícia", url: "https://g1.globo.com/x", trecho: "", fonte: "g1.globo.com" },
        { titulo: "Post", url: "http://qualquer.blogspot.com/y", trecho: "", fonte: "qualquer.blogspot.com" },
      ],
    });

    const [veiculo, blog] = saida.avaliacoes;
    expect(veiculo.score).toBeGreaterThan(blog.score);
    expect(veiculo.nivel).toBe("alta");
    expect(blog.nivel).toBe("baixa");
  });

  it("penaliza ausência de HTTPS e sinaliza o motivo", () => {
    const { saida } = avaliarCredibilidade({
      resultados: [{ titulo: "T", url: "http://site-neutro.com.br/a", trecho: "", fonte: "site-neutro.com.br" }],
    });
    expect(saida.avaliacoes[0].sinais).toContain("sem HTTPS");
  });

  it("marca fontes de exemplo do modo mock, para não passarem por evidência real", () => {
    const { saida } = avaliarCredibilidade({
      resultados: [{ titulo: "T", url: "https://exemplo-setorial.com/a", trecho: "", fonte: "exemplo-setorial.com" }],
    });
    expect(saida.avaliacoes[0].sinais).toContain("fonte de exemplo (modo mock)");
  });

  it("resume a distribuição por nível e aceita coleta vazia", () => {
    const { saida } = avaliarCredibilidade({ resultados: [] });
    expect(saida.total).toBe(0);
    expect(saida.resumo).toEqual({ alta: 0, media: 0, baixa: 0 });
  });
});

describe("Recommendation — ranking pela análise Crossability", () => {
  it("ordena por score e numera as posições a partir de 1", () => {
    const { saida } = recomendarParceiros({
      candidatos: [
        { parceiro: "Fraco", analise: analise({ compatibilidade_publicos: "baixa", sinergias: "baixa" }, 20) },
        {
          parceiro: "Forte",
          analise: analise(
            {
              compatibilidade_publicos: "alta",
              compatibilidade_territorios: "alta",
              complementaridade_ativos: "alta",
              sinergias: "alta",
            },
            90
          ),
        },
      ],
    });

    expect(saida.total).toBe(2);
    expect(saida.ranking[0].parceiro).toBe("Forte");
    expect(saida.ranking[0].posicao).toBe(1);
    expect(saida.ranking[1].parceiro).toBe("Fraco");
    expect(saida.ranking[0].score).toBeGreaterThan(saida.ranking[1].score);
  });

  it("deixa a confiança modular o score — mesma análise, confiança menor, score menor", () => {
    const dimensoes = { compatibilidade_publicos: "alta" as NivelCompat, sinergias: "alta" as NivelCompat };
    const { saida } = recomendarParceiros({
      candidatos: [
        { parceiro: "Confiante", analise: analise(dimensoes, 100) },
        { parceiro: "Incerto", analise: analise(dimensoes, 0) },
      ],
    });
    expect(saida.ranking[0].parceiro).toBe("Confiante");
  });

  it("lista fortalezas e fraquezas pelas dimensões alta/baixa", () => {
    const { saida } = recomendarParceiros({
      candidatos: [
        {
          parceiro: "Misto",
          analise: analise({ compatibilidade_publicos: "alta", momento_estrategico: "baixa" }),
        },
      ],
    });
    expect(saida.ranking[0].fortalezas).toContain("públicos");
    expect(saida.ranking[0].fraquezas).toContain("momento");
  });

  it("devolve ranking vazio sem candidatos, em vez de estourar", () => {
    const { saida } = recomendarParceiros({ candidatos: [] });
    expect(saida.total).toBe(0);
    expect(saida.ranking).toEqual([]);
  });
});

describe("Concorrência limitada", () => {
  it("preserva a ordem da entrada mesmo com tarefas terminando fora de ordem", async () => {
    const entrada = [30, 10, 20, 0];
    const saida = await mapearComLimite(entrada, 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(saida).toEqual(entrada);
  });

  it("nunca ultrapassa o limite de tarefas simultâneas", async () => {
    let emVoo = 0;
    let pico = 0;
    await mapearComLimite([1, 2, 3, 4, 5, 6], 2, async () => {
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return null;
    });
    expect(pico).toBeLessThanOrEqual(2);
  });

  it("trata lista vazia sem disparar nenhuma tarefa", async () => {
    let chamou = false;
    const saida = await mapearComLimite([], 4, async () => {
      chamou = true;
      return 1;
    });
    expect(saida).toEqual([]);
    expect(chamou).toBe(false);
  });
});
