import { describe, expect, it } from "vitest";
import {
  analisarCandidataDaBase,
  qualificarCandidaturasDaBase,
  validarCandidataExterna,
  type CandidataDaBase,
} from "./opportunity-qualification.agent";

function candidata(status: string, extras = ""): CandidataDaBase {
  return {
    parceiro_id: "11111111-1111-1111-1111-111111111111",
    parceiro_nome: "Marca Exemplo",
    segmento: "Moda",
    projeto_id: "22222222-2222-2222-2222-222222222222",
    projeto_nome: "Aramis",
    frente_id: "33333333-3333-3333-3333-333333333333",
    frente_nome: "Collabs",
    observacoes: `Status de origem: ${status}\nObjetivo: Collab de produto e conteúdo\nTerritório: Lifestyle\n${extras || "Reunião feita; aguardando retorno comercial."}`,
  };
}

describe("Opportunity Qualification — Base Cross", () => {
  it("prioriza candidatas em negociação com contexto operacional", () => {
    const qualificadas = qualificarCandidaturasDaBase([
      candidata("VALIDAR COM CLIENTE"),
      candidata("EM NEGOCIAÇÃO", "Proposta enviada e reunião de retorno agendada."),
    ], 5);

    expect(qualificadas).toHaveLength(2);
    expect(qualificadas[0].status).toBe("EM NEGOCIAÇÃO");
    expect(qualificadas[0].confianca).toBeGreaterThanOrEqual(70);
  });

  it("não transforma histórico parado em sugestão ativa", () => {
    const qualificadas = qualificarCandidaturasDaBase([
      candidata("SEM RETORNO"),
      candidata("DECLINADO"),
      candidata("STAND BY"),
    ], 5);

    expect(qualificadas).toEqual([]);
  });

  it("marca como baixa o que a Base Cross ainda não sabe", () => {
    const [qualificada] = qualificarCandidaturasDaBase([candidata("EM NEGOCIAÇÃO")], 1);
    const analise = analisarCandidataDaBase("Aramis", qualificada);

    expect(analise.compatibilidade_publicos.nivel).toBe("baixa");
    expect(analise.momento_estrategico.nivel).toBe("alta");
    expect(analise.recomendacao).toBe("recomendada");
  });
});

describe("Opportunity Qualification — descoberta externa", () => {
  const coleta = {
    total_consultas: 1,
    total_resultados: 1,
    coletas: [{
      termo: "Marca Exemplo parceria",
      tipo_fonte: "web" as const,
      resultados: [{
        titulo: "Marca Exemplo anuncia parceria cultural",
        trecho: "A Marca Exemplo abriu uma frente de parceria em São Paulo.",
        url: "https://meioemensagem.com.br/marca-exemplo",
        fonte: "meioemensagem.com.br",
      }],
    }],
  };
  const extracao = {
    total_conteudos: 1,
    perfis: [{
      nome: "Marca Exemplo",
      setor: "Moda",
      publicos: ["adultos"],
      territorios: ["São Paulo"],
      ativos: ["conteúdo"],
      sinais_parceria: ["parceria anunciada"],
      confianca: 80,
    }],
  };
  const credibilidade = {
    total: 1,
    resumo: { alta: 1, media: 0, baixa: 0 },
    avaliacoes: [{
      titulo: "Marca Exemplo anuncia parceria cultural",
      url: "https://meioemensagem.com.br/marca-exemplo",
      fonte: "meioemensagem.com.br",
      score: 88,
      nivel: "alta" as const,
      sinais: ["veículo reconhecido"],
    }],
  };

  it("exige perfil e menção da entidade em fonte confiável", () => {
    expect(validarCandidataExterna({ cliente: "Aramis", parceiro: "Marca Exemplo", extracao, coleta, credibilidade }).aprovada).toBe(true);
  });

  it("bloqueia nomes genéricos, mesmo que uma página tenha sido coletada", () => {
    expect(validarCandidataExterna({ cliente: "Aramis", parceiro: "Login", extracao, coleta, credibilidade }).aprovada).toBe(false);
  });

  it("exige a âncora de uma propriedade específica do briefing", () => {
    const resultado = validarCandidataExterna({
      cliente: "Aramis",
      parceiro: "Marca Exemplo",
      objetivo: "Collab de produto e ativação no Rio Open",
      extracao,
      coleta,
      credibilidade,
    });

    expect(resultado.aprovada).toBe(false);
    expect(resultado.motivos.join(" ")).toMatch(/rio open/i);
  });

  it("exige que a evidência trate do tema específico da frente, não só de uma parceria genérica", () => {
    const generica = validarCandidataExterna({
      cliente: "Aramis",
      parceiro: "Marca Exemplo",
      objetivo: "Experiência de marca em esportes e corrida",
      extracao,
      coleta,
      credibilidade,
    });
    const focoVindoDoContexto = validarCandidataExterna({
      cliente: "Aramis",
      parceiro: "Marca Exemplo",
      objetivo: "Experiência de marca",
      contexto: "Briefing selecionado: Esportes · Corrida. Direcionador: bem-estar.",
      extracao,
      coleta,
      credibilidade,
    });
    const relacionada = validarCandidataExterna({
      cliente: "Aramis",
      parceiro: "Marca Exemplo",
      objetivo: "Experiência de marca em esportes e corrida",
      extracao: {
        ...extracao,
        perfis: [{
          ...extracao.perfis[0],
          ativos: ["circuito de corrida de rua"],
          sinais_parceria: ["patrocínio de corrida e ativações para runners"],
        }],
      },
      coleta,
      credibilidade,
    });

    expect(generica.aprovada).toBe(false);
    expect(generica.motivos.join(" ")).toContain("corrida");
    expect(focoVindoDoContexto.aprovada).toBe(false);
    expect(focoVindoDoContexto.motivos.join(" ")).toContain("corrida");
    expect(relacionada.aprovada).toBe(true);
  });
});
