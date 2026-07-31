import { describe, expect, it } from "vitest";
import { extrairCandidatasExternas } from "./information-extractor.agent";

describe("Information Extractor - candidatas externas", () => {
  it("aproveita o snippet verificavel antes de raspar paginas externas", async () => {
    const resultado = await extrairCandidatasExternas({
      coleta: {
        total_consultas: 1,
        total_resultados: 1,
        coletas: [{
          termo: '"Rio Open" marcas patrocinadoras ativacao',
          tipo_fonte: "web",
          resultados: [{
            titulo: "Rio Open 2026: patrocinadores preparam ativacoes",
            trecho: "Patrocinadores como Claro, XP Investimentos e Ademicon promovem ativacoes e experiencias interativas no Rio Open 2026.",
            url: "https://fonte-exemplo.com/rio-open-2026",
            fonte: "fonte-exemplo.com",
          }],
        }],
      },
      limite_urls: 1,
      foco: "ativacao no Rio Open",
    });

    expect(resultado.origem).toBe("heuristica");
    expect(resultado.saida.perfis.map((perfil) => perfil.nome)).toEqual(expect.arrayContaining(["Claro", "XP Investimentos", "Ademicon"]));
    expect(resultado.saida.perfis.every((perfil) => perfil.fontes?.[0]?.evidencia.includes("Rio Open"))).toBe(true);
  });
});
