import { describe, expect, it } from "vitest";
import { planejarDescobertaDeMercado } from "./market-discovery-planning.agent";

describe("Market Discovery Planning", () => {
  it("usa as frentes como território de pesquisa, sem reutilizar marcas do funil como resultado", () => {
    const plano = planejarDescobertaDeMercado({
      cliente: "Aramis",
      objetivo: "Mapear novas oportunidades de parceria.",
      frentes: [
        {
          frente_id: "11111111-1111-1111-1111-111111111111",
          frente_nome: "EXPERIÊNCIA DE MARCA · LIFESTYLE · GASTRONOMIA",
          categoria: "EXPERIÊNCIA DE MARCA · LIFESTYLE · GASTRONOMIA",
          objetivo: "Experiência de Marca",
        },
        {
          frente_id: "22222222-2222-2222-2222-222222222222",
          frente_nome: "COLLABS · MODA · CALÇADOS",
          categoria: "COLLABS · MODA · CALÇADOS",
          objetivo: "Collab",
        },
      ],
    });

    const consultas = plano.perguntas.flatMap((pergunta) => pergunta.consultas.map((consulta) => consulta.termo));
    expect(consultas.some((consulta) => /gastronomia/i.test(consulta))).toBe(true);
    expect(consultas.some((consulta) => /calcados/i.test(consulta))).toBe(true);
    expect(consultas.every((consulta) => !/aramis/i.test(consulta))).toBe(true);
    expect(plano.objetivo_interpretado).toContain("NOVAS oportunidades");
  });

  it("mantém as prioridades compatíveis com o contrato quando há muitos eixos", () => {
    const plano = planejarDescobertaDeMercado({
      cliente: "Cliente",
      objetivo: "Descoberta",
      frentes: ["beleza", "calçados", "corrida", "automobilismo", "gastronomia", "tecnologia"].map((categoria, indice) => ({
        frente_id: `${indice + 1}`.padStart(8, "0") + "-0000-0000-0000-000000000000",
        frente_nome: categoria,
        categoria,
        objetivo: "Collab",
      })),
    });

    expect(Math.max(...plano.perguntas.map((pergunta) => pergunta.prioridade))).toBeLessThanOrEqual(5);
  });

  it("incorpora o formato de parceria e o objetivo da frente nas consultas", () => {
    const plano = planejarDescobertaDeMercado({
      cliente: "Aramis",
      objetivo: "Mapear novas oportunidades.",
      frentes: [{
        frente_id: "33333333-3333-3333-3333-333333333333",
        frente_nome: "EXPERIENCIA DE MARCA LIFESTYLE EVENTOS",
        categoria: "EXPERIENCIA DE MARCA LIFESTYLE EVENTOS",
        objetivo: "collab produto ativacao Rio Open conteudo",
      }],
    });

    const consultas = plano.perguntas.flatMap((pergunta) => pergunta.consultas.map((consulta) => consulta.termo));
    expect(consultas.some((consulta) => /eventos/i.test(consulta))).toBe(true);
    expect(consultas[0]).toContain("Rio Open");
    expect(consultas.some((consulta) => /ativa/i.test(consulta))).toBe(true);
    expect(plano.objetivo_interpretado).toContain("Rio Open");
  });

  it("refina a pesquisa com direcionadores informados pela equipe, sem reutilizar o cliente como resultado", () => {
    const plano = planejarDescobertaDeMercado({
      cliente: "Aramis",
      objetivo: "Mapear novas oportunidades.",
      contexto: "Público prioritário: homens urbanos, corrida, bem-estar e posicionamento premium.",
      frentes: [{
        frente_id: "44444444-4444-4444-4444-444444444444",
        frente_nome: "EXPERIÊNCIA DE MARCA · ESPORTES · CORRIDA",
        categoria: "ESPORTES · CORRIDA",
        objetivo: "Ativação e conteúdo para lifestyle masculino",
      }],
    });

    const consultas = plano.perguntas.flatMap((pergunta) => pergunta.consultas.map((consulta) => consulta.termo));
    expect(consultas.some((consulta) => /corrida/i.test(consulta))).toBe(true);
    expect(consultas.some((consulta) => /premium/i.test(consulta))).toBe(true);
    expect(consultas.every((consulta) => !/aramis/i.test(consulta))).toBe(true);
  });

  it("ignora o texto de fallback quando a equipe não adiciona direcionadores", () => {
    const plano = planejarDescobertaDeMercado({
      cliente: "Aramis",
      objetivo: "Mapear novas oportunidades.",
      contexto: "Cliente: Aramis. Direcionadores estratégicos informados pela equipe: não informado; usar somente o briefing selecionado. Pesquise somente marcas externas que possam atender a este briefing.",
      frentes: [{
        frente_id: "55555555-5555-5555-5555-555555555555",
        frente_nome: "COLLABS · MODA · CALÇADOS",
        categoria: "MODA · CALÇADOS",
        objetivo: "Collab de produto",
      }],
    });

    const consultas = plano.perguntas.flatMap((pergunta) => pergunta.consultas.map((consulta) => consulta.termo));
    expect(consultas.every((consulta) => !/informado|somente/i.test(consulta))).toBe(true);
  });
});
