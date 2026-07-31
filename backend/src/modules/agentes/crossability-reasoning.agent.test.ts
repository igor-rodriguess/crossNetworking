import { describe, expect, it } from "vitest";
import { raciocinarCrossabilityComEvidenciaExterna } from "./crossability-reasoning.agent";

describe("raciocinarCrossabilityComEvidenciaExterna", () => {
  it("mantém a sugestão em estudo e explicita a evidência externa", () => {
    const resultado = raciocinarCrossabilityComEvidenciaExterna({
      cliente: "Aramis",
      parceiro: "Marca Externa",
      objetivo: "Criar uma parceria de experiência de marca",
      perfil_parceiro: {
        setor: "beleza",
        publicos: ["público adulto"],
        territorios: ["Brasil"],
        ativos: ["eventos proprietários"],
        sinais_parceria: ["realizou collab recente"],
        confianca: 80,
        fontes: [{
          url: "https://veiculo-exemplo.com.br/marca-externa",
          evidencia: "Marca Externa realizou uma collab recente em um evento proprietário.",
        }],
      },
    });

    expect(resultado.origem).toBe("heuristica");
    expect(resultado.saida.recomendacao).toBe("em_estudo");
    expect(resultado.saida.confianca).toBeLessThanOrEqual(58);
    expect(resultado.saida.racional_recomendacao).toContain("evidência externa verificável");
    expect(resultado.saida.racional_recomendacao).toContain("não usa a Base Cross como prova de fit");
  });

  it("diferencia uma evidência ancorada e corroborada de uma fonte única genérica", () => {
    const comum = {
      cliente: "Aramis",
      parceiro: "Marca Externa",
      objetivo: "Criar collab de produtos e ativação no Rio Open",
      perfil_parceiro: {
        setor: "bebidas",
        publicos: [],
        territorios: [],
        ativos: ["patrocínio esportivo"],
        sinais_parceria: ["ativações de marca"],
        confianca: 80,
      },
    };
    const fonteUnica = raciocinarCrossabilityComEvidenciaExterna({
      ...comum,
      perfil_parceiro: {
        ...comum.perfil_parceiro,
        fontes: [{
          url: "https://veiculo-um.com.br/marca",
          evidencia: "Marca Externa realiza ativações de marca em eventos esportivos.",
        }],
      },
    });
    const corroborada = raciocinarCrossabilityComEvidenciaExterna({
      ...comum,
      perfil_parceiro: {
        ...comum.perfil_parceiro,
        fontes: [
          {
            url: "https://veiculo-um.com.br/marca",
            evidencia: "Marca Externa confirma ativações e patrocínio no Rio Open.",
          },
          {
            url: "https://veiculo-dois.com.br/marca",
            evidencia: "No Rio Open, Marca Externa ativa sua plataforma de conteúdo e produtos.",
          },
        ],
      },
    });

    expect(fonteUnica.saida.fit_estrategico.nivel).toBe("baixa");
    expect(corroborada.saida.fit_estrategico.nivel).toBe("alta");
    expect(corroborada.saida.complementaridade_ativos.nivel).toBe("alta");
    expect(corroborada.saida.confianca).toBeGreaterThan(fonteUnica.saida.confianca);
  });

  it("não eleva o fit de uma ativação genérica quando o briefing exige corrida", () => {
    const resultado = raciocinarCrossabilityComEvidenciaExterna({
      cliente: "Aramis",
      parceiro: "Marca Externa",
      objetivo: "Ativação de marca para corrida e bem-estar",
      perfil_parceiro: {
        ativos: ["evento cultural"],
        sinais_parceria: ["ativação de marca em festival"],
        confianca: 80,
        fontes: [{
          url: "https://veiculo-exemplo.com.br/marca",
          evidencia: "Marca Externa realizou ativação de marca em um festival cultural.",
        }],
      },
    });

    expect(resultado.saida.fit_estrategico.nivel).toBe("baixa");
    expect(resultado.saida.complementaridade_ativos.nivel).toBe("baixa");
    expect(resultado.saida.racional_recomendacao).toContain("aderência ao briefing ainda é insuficiente");
  });
});
