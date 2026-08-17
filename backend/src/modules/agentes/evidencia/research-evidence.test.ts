import { describe, expect, it } from "vitest";
import { pesquisarEvidencias, type FatoBruto, type OpcoesPesquisa } from "./research-evidence.agent";
import { OrcamentoExecucao } from "../shared/budget";
import type { ColetaFontesSaida } from "../agentes.schema";
import type { PesquisarEvidenciasInput } from "./evidencia.schema";

// -----------------------------------------------------------------------------
// Research & Evidence Agent — cenários A a N da Sprint AI-02.
//
// Fontes e fatos são FIXTURES controladas, injetadas por `opcoes`. Isso é
// deliberado: com os providers pagos desligados, a extração real não roda, e
// testar contra o stub validaria o stub, não o agente. Aqui validamos o
// MECANISMO — credibilidade, dedupe, verificação, conflito, recência,
// proveniência e fail-safe.
//
// Nenhuma chamada de rede acontece.
// -----------------------------------------------------------------------------

const AGORA = new Date().toISOString();

/**
 * Fixture de resultado de busca.
 *
 * O título e o trecho trazem a entidade e contexto organizacional porque, desde
 * a AI-02.2, o agente exige os dois para gastar scraping — foi assim que
 * páginas de dicionário deixaram de virar "fatos". Fixtures genéricas demais
 * (só "Notícia") seriam barradas pelo gate, como acontece com resultados reais
 * irrelevantes.
 */
function fonte(over: Partial<{ titulo: string; url: string; trecho: string; fonte: string; publicado_em: string | null }>) {
  return {
    titulo: over.titulo ?? "Converse: marca anuncia novidades",
    url: over.url ?? "https://exemplo.com/a",
    trecho: over.trecho ?? "A empresa Converse divulgou novidades sobre sua coleção.",
    fonte: over.fonte ?? "exemplo.com",
    publicado_em: over.publicado_em ?? null,
    coletado_em: AGORA,
  };
}

/** Monta um coletor falso com os resultados dados. */
function coletorCom(resultados: ReturnType<typeof fonte>[]): OpcoesPesquisa["buscar"] {
  return async () => ({
    saida: {
      total_consultas: 1,
      total_resultados: resultados.length,
      coletas: [{ termo: "consulta", tipo_fonte: "web" as const, resultados }],
    } as ColetaFontesSaida,
    origem: "duckduckgo" as const,
  });
}

const ENTRADA: PesquisarEvidenciasInput = {
  entidade: "Converse",
  objetivo: "contexto_geral",
  limite_consultas: 4,
  limite_resultados_por_consulta: 3,
  limite_urls: 5,
};

describe("A · fonte oficial confiável é aceita", () => {
  it("classifica como oficial e mantém no pacote", async () => {
    const pkg = await pesquisarEvidencias(
      { ...ENTRADA, site_oficial: "https://www.converse.com" },
      {
        buscar: coletorCom([
          fonte({ url: "https://www.converse.com/newsroom/colecao", fonte: "converse.com", titulo: "Nova coleção" }),
        ]),
      }
    );

    expect(pkg.sources).toHaveLength(1);
    expect(pkg.sources[0].tipo_fonte).toBe("oficial");
    expect(pkg.sources[0].source_id).toMatch(/^src_/);
    expect(pkg.sources[0].query_origem).toBeTruthy();
  });
});

describe("B · fonte de baixa credibilidade é descartada", () => {
  it("não entra no pacote e o motivo fica registrado", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "http://qualquer.blogspot.com/post", fonte: "qualquer.blogspot.com", titulo: "Post" }),
      ]),
    });

    expect(pkg.sources).toHaveLength(0);
    const d = pkg.descartados.find((x) => x.motivo === "baixa_credibilidade");
    expect(d).toBeDefined();
    expect(d!.referencia).toContain("blogspot");
  });
});

describe("C · duas fontes independentes corroboram", () => {
  it("marca corroborada e conta domínios distintos", async () => {
    const fatos: FatoBruto[] = [
      {
        claim: "A marca lançou uma coleção cápsula em São Paulo.",
        categoria: "produto",
        fontes: ["https://g1.globo.com/moda/a", "https://exame.com/negocios/b"],
      },
    ];

    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/moda/a", fonte: "g1.globo.com", titulo: "Coleção cápsula anunciada" }),
        fonte({ url: "https://exame.com/negocios/b", fonte: "exame.com", titulo: "Marca anuncia coleção em SP" }),
      ]),
      extrairFatos: () => fatos,
    });

    expect(pkg.facts).toHaveLength(1);
    expect(pkg.facts[0].verificacao).toBe("corroborada");
    expect(pkg.facts[0].dominios_independentes).toBe(2);
    expect(pkg.facts[0].confianca).toBeGreaterThan(70);
    expect(pkg.status).toBe("sucesso");
  });
});

describe("D · fonte única", () => {
  it("marca fonte_unica com confiança menor", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/moda/a", fonte: "g1.globo.com", titulo: "Notícia" }),
      ]),
      extrairFatos: () => [
        { claim: "A marca abriu uma loja no Rio.", categoria: "expansao", fontes: ["https://g1.globo.com/moda/a"] },
      ],
    });

    expect(pkg.facts[0].verificacao).toBe("fonte_unica");
    expect(pkg.facts[0].dominios_independentes).toBe(1);
    expect(pkg.facts[0].confianca).toBeLessThan(70);
  });
});

describe("E · nenhuma fonte sustenta a afirmação", () => {
  it("descarta o fato por falta de suporte", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/moda/a", fonte: "g1.globo.com", titulo: "Notícia" }),
      ]),
      extrairFatos: () => [
        { claim: "Afirmação sem fonte associada.", categoria: "outro", fontes: ["https://inexistente.com/x"] },
      ],
    });

    expect(pkg.facts).toHaveLength(0);
    expect(pkg.descartados.some((d) => d.motivo === "afirmacao_sem_suporte")).toBe(true);
    expect(pkg.status).toBe("evidencia_insuficiente");
  });
});

describe("F · fontes conflitantes", () => {
  it("marca os dois lados como conflitante, sem escolher versão", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", titulo: "Marca confirma patrocínio do festival" }),
        fonte({ url: "https://exame.com/b", fonte: "exame.com", titulo: "Marca nega patrocínio do festival" }),
      ]),
      extrairFatos: () => [
        {
          claim: "A marca confirmou patrocínio do festival de música.",
          categoria: "patrocinio",
          fontes: ["https://g1.globo.com/a"],
        },
        {
          claim: "A marca não confirmou patrocínio do festival de música.",
          categoria: "patrocinio",
          fontes: ["https://exame.com/b"],
        },
      ],
    });

    expect(pkg.conflitos.length).toBeGreaterThanOrEqual(2);
    expect(pkg.facts.every((f) => f.verificacao === "conflitante")).toBe(true);
    // Só desacordo não é conhecimento: o pacote não se declara bem-sucedido.
    expect(pkg.status).toBe("evidencia_insuficiente");
    expect(pkg.lacunas.some((l) => l.descricao.includes("conflito"))).toBe(true);
    // As DUAS versões ficam preservadas, com suas fontes.
    const [a, b] = pkg.facts;
    expect(a.conflito?.claim_oposta).toBe(b.claim);
    expect(b.conflito?.claim_oposta).toBe(a.claim);
    expect(a.source_refs).not.toEqual(b.source_refs);
  });
});

describe("G · press release replicado", () => {
  it("não conta replicação como fontes independentes", async () => {
    const titulo = "Marca anuncia parceria com festival internacional de música";
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", titulo }),
        fonte({ url: "https://exame.com/b", fonte: "exame.com", titulo }),
        fonte({ url: "https://valor.globo.com/c", fonte: "valor.globo.com", titulo }),
      ]),
    });

    // Só a primeira sobrevive; as demais são o mesmo conteúdo replicado.
    expect(pkg.sources).toHaveLength(1);
    expect(pkg.descartados.filter((d) => d.motivo === "duplicado")).toHaveLength(2);
  });

  it("também deduplica a mesma URL repetida", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", titulo: "Primeira notícia" }),
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", titulo: "Segunda notícia diferente" }),
      ]),
    });
    expect(pkg.sources).toHaveLength(1);
  });
});

describe("H · entidade ambígua", () => {
  it("interrompe a pesquisa em vez de consolidar a entidade errada", async () => {
    // Client falso: devolve várias Partes parecidas → status "ambigua".
    const clientFalso = {
      query: async (sql: string) => {
        if (sql.includes("cross_core.parte")) {
          return {
            rows: [
              { id: "11111111-1111-1111-1111-111111111111", nome: "Converse Brasil" },
              { id: "22222222-2222-2222-2222-222222222222", nome: "Converse Calçados" },
              { id: "33333333-3333-3333-3333-333333333333", nome: "Converse Store" },
            ],
          };
        }
        return { rows: [] };
      },
    } as never;

    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com" })]),
      extrairFatos: () => [
        { claim: "Fato que não deveria ser produzido.", categoria: "outro", fontes: ["https://g1.globo.com/a"] },
      ],
      client: clientFalso,
    });

    expect(pkg.status).toBe("entidade_ambigua");
    expect(pkg.ambiguidade).not.toBeNull();
    expect(pkg.ambiguidade!.candidatas.length).toBeGreaterThanOrEqual(2);
    // Nenhum fato é produzido sob identidade ambígua.
    expect(pkg.facts).toHaveLength(0);
  });
});

describe("I · informação fora da janela temporal", () => {
  it("descarta quando o objetivo exige atualidade", async () => {
    const antigo = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const pkg = await pesquisarEvidencias(
      { ...ENTRADA, objetivo: "movimentos_recentes", janela_meses: 6 },
      {
        buscar: coletorCom([
          fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", publicado_em: antigo }),
        ]),
        extrairFatos: () => [
          {
            claim: "A marca fez um anúncio em 2025.",
            categoria: "movimento_estrategico",
            fontes: ["https://g1.globo.com/a"],
            publicadoEm: antigo,
          },
        ],
      }
    );

    expect(pkg.facts).toHaveLength(0);
    expect(pkg.descartados.some((d) => d.motivo === "desatualizado_para_objetivo")).toBe(true);
  });

  it("reclassifica como contexto histórico quando o objetivo não exige atualidade", async () => {
    const antigo = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const pkg = await pesquisarEvidencias(
      { ...ENTRADA, objetivo: "contexto_geral", janela_meses: 6 },
      {
        buscar: coletorCom([
          fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", publicado_em: antigo }),
        ]),
        extrairFatos: () => [
          {
            claim: "A marca atua no segmento de calçados desde 1908.",
            categoria: "posicionamento",
            fontes: ["https://g1.globo.com/a"],
            publicadoEm: antigo,
          },
        ],
      }
    );

    // Não descartado: reclassificado.
    expect(pkg.facts).toHaveLength(1);
    expect(pkg.facts[0].categoria).toBe("contexto_empresa");
  });
});

describe("J · published_at ausente", () => {
  it("mantém null em vez de inventar data", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", publicado_em: null }),
      ]),
      extrairFatos: () => [
        { claim: "A marca tem presença no Sudeste.", categoria: "territorio", fontes: ["https://g1.globo.com/a"] },
      ],
    });

    expect(pkg.sources[0].publicado_em).toBeNull();
    expect(pkg.facts[0].publicado_em).toBeNull();
    // collected_at é sempre conhecido.
    expect(pkg.facts[0].coletado_em).toBeTruthy();
  });
});

describe("K · guardrail bloqueia nova busca", () => {
  it("não executa consultas além do teto e registra o bloqueio", async () => {
    const orcamento = new OrcamentoExecucao({ maxBuscasWeb: 2 });

    const pkg = await pesquisarEvidencias(
      { ...ENTRADA, limite_consultas: 4 },
      { buscar: coletorCom([fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com" })]), orcamento }
    );

    expect(pkg.plano).toHaveLength(2);
    expect(pkg.telemetria.bloqueios_guardrail.length).toBeGreaterThan(0);
    expect(pkg.descartados.some((d) => d.motivo === "limite_guardrail")).toBe(true);
  });

  it("com zero buscas disponíveis, devolve bloqueado_por_guardrail", async () => {
    const orcamento = new OrcamentoExecucao({ maxBuscasWeb: 1 });
    orcamento.registrarUsoFerramenta("web_search", 1);

    const pkg = await pesquisarEvidencias(ENTRADA, { orcamento });

    expect(pkg.plano).toHaveLength(0);
    expect(pkg.status).toBe("bloqueado_por_guardrail");
    expect(pkg.facts).toHaveLength(0);
  });
});

describe("L · falha de extração", () => {
  it("não fabrica fatos quando a extração não produz nada", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com", titulo: "Notícia" }),
      ]),
      extrairFatos: () => [],
    });

    expect(pkg.facts).toHaveLength(0);
    expect(pkg.status).toBe("evidencia_insuficiente");
    expect(pkg.lacunas.length).toBeGreaterThan(0);
  });

  it("sem fonte confiável, a extração nem é executada", async () => {
    let extraiu = false;
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        // Domínio desconhecido: desde a AI-02.2 é classificado como baixa
        // autoridade e descartado ANTES do scrape — a extração nem chega a ser
        // considerada, e nenhuma página é raspada.
        fonte({
          url: "https://site-desconhecido.com.br/a",
          fonte: "site-desconhecido.com.br",
          titulo: "Converse: empresa divulga coleção",
        }),
      ]),
      extrairFatos: () => {
        extraiu = true;
        return [];
      },
    });

    expect(extraiu).toBe(false);
    expect(pkg.sources).toHaveLength(0);
    expect(pkg.descartados.some((d) => d.motivo === "baixa_credibilidade")).toBe(true);
    expect(pkg.lacunas.length).toBeGreaterThan(0);
  });
});

describe("M · Evidence não contém Cross Knowledge", () => {
  it("o pacote não tem campo algum de conhecimento metodológico", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com" })]),
      extrairFatos: () => [
        { claim: "A marca atua no Sudeste.", categoria: "territorio", fontes: ["https://g1.globo.com/a"] },
      ],
    });

    const chaves = Object.keys(pkg);
    for (const proibida of ["cross_knowledge", "knowledgeReferences", "conhecimento", "metodologia"]) {
      expect(chaves).not.toContain(proibida);
    }
    // E cada fato aponta para fonte externa, nunca para um chunk de metodologia.
    for (const f of pkg.facts) {
      expect(f.source_refs.every((r) => r.startsWith("src_"))).toBe(true);
    }
  });
});

describe("N · output não recomenda parceria nem gera score", () => {
  it("não há recomendação, score de fit nem Score Card no pacote", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com" })]),
      extrairFatos: () => [
        { claim: "A marca atua no Sudeste.", categoria: "territorio", fontes: ["https://g1.globo.com/a"] },
      ],
    });

    const chaves = Object.keys(pkg);
    for (const proibida of ["recomendacao", "recommendation", "score_fit", "score_card", "crossability"]) {
      expect(chaves).not.toContain(proibida);
    }
    // Confiança factual é permitida; score de fit não.
    expect(pkg.facts[0].confianca).toBeGreaterThan(0);
  });

  it("distingue fato de inferência e limita a confiança da inferência", async () => {
    const pkg = await pesquisarEvidencias(ENTRADA, {
      buscar: coletorCom([
        fonte({ url: "https://g1.globo.com/a", fonte: "g1.globo.com" }),
        fonte({ url: "https://exame.com/b", fonte: "exame.com", titulo: "Outro assunto totalmente distinto" }),
      ]),
      extrairFatos: () => [
        {
          claim: "A marca lançou uma coleção cápsula.",
          categoria: "produto",
          natureza: "fato",
          fontes: ["https://g1.globo.com/a", "https://exame.com/b"],
        },
        {
          claim: "O lançamento indica mudança de posicionamento da marca.",
          categoria: "posicionamento",
          natureza: "inferencia",
          fontes: ["https://g1.globo.com/a", "https://exame.com/b"],
        },
      ],
    });

    const fato = pkg.facts.find((f) => f.natureza === "fato")!;
    const inferencia = pkg.facts.find((f) => f.natureza === "inferencia")!;

    expect(fato.confianca).toBeGreaterThan(inferencia.confianca);
    // Inferência nunca se apresenta com a força de fato verificado.
    expect(inferencia.confianca).toBeLessThanOrEqual(40);
  });
});
