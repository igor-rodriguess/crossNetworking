import { describe, expect, it } from "vitest";
import {
  calcularDiff,
  calcularHashEntrada,
  construirPerfil,
  type EntradaPerfil,
} from "./entity-intelligence.agent";
import type { EvidencePackage } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Entity Intelligence — cenários A a P da Sprint AI-03.
//
// Determinístico e sem banco: o agente consolida estruturas que recebe. Nenhuma
// chamada de LLM, nenhuma rede.
// -----------------------------------------------------------------------------

const AGORA = new Date().toISOString();

function pacote(over: Partial<EvidencePackage> = {}): EvidencePackage {
  return {
    entidade: "Converse",
    objetivo: "movimentos_recentes",
    status: "sucesso",
    plano: ["Converse notícias"],
    planning_mode: "heuristica",
    extraction_mode: "firecrawl",
    facts: [],
    sources: [],
    descartados: [],
    conflitos: [],
    lacunas: [],
    ambiguidade: null,
    telemetria: {
      duracao_ms: 100, consultas: 1, buscas_web: 1, scrapes: 1,
      fontes_coletadas: 1, fontes_descartadas: 0, fatos_extraidos: 0,
      fatos_verificados: 0, custo_estimado_usd: 0, bloqueios_guardrail: [],
    },
    ...over,
  } as EvidencePackage;
}

function fato(over: Record<string, unknown> = {}) {
  return {
    fact_id: "fact_001",
    claim: "A Converse abriu uma loja conceito em Salvador.",
    entidade: "Converse",
    categoria: "expansao",
    natureza: "fato",
    source_refs: ["src_a"],
    dominios_independentes: 1,
    verificacao: "fonte_unica",
    confianca: 50,
    publicado_em: null,
    coletado_em: AGORA,
    conflito: null,
    ...over,
  } as EvidencePackage["facts"][number];
}

const SEM_INTERNO: EntradaPerfil["internos"] = { parte_id: null, eh_cliente_cross: false };

describe("A · Evidence Package válido vira Profile", () => {
  it("consolida fatos nas seções corretas com proveniência externa", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato()] }),
    });

    expect(p.movimentos).toHaveLength(1);
    expect(p.movimentos[0].valor).toContain("Salvador");
    expect(p.movimentos[0].proveniencia.origem).toBe("externo");
    expect(p.movimentos[0].proveniencia.evidence_refs).toContain("fact_001");
    expect(p.movimentos[0].proveniencia.registro_interno).toBeNull();
  });
});

describe("B · dados internos + evidência externa", () => {
  it("consolida os dois sem misturar origens", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: {
        parte_id: "11111111-1111-1111-1111-111111111111",
        nome_exibicao: "Converse Brasil",
        eh_cliente_cross: true,
        papeis: ["cliente", "parceiro"],
        oportunidades: [{ id: "op-1", descricao: "Collab verão 2026" }],
      },
      evidencia: pacote({ facts: [fato()] }),
    });

    // Relação vem do banco.
    expect(p.relacao_interna.eh_cliente_cross).toBe(true);
    expect(p.relacao_interna.papeis).toHaveLength(2);
    expect(p.relacao_interna.papeis[0].proveniencia.origem).toBe("interno");
    expect(p.relacao_interna.papeis[0].proveniencia.evidence_refs).toHaveLength(0);

    // Movimento vem da internet.
    expect(p.movimentos[0].proveniencia.origem).toBe("externo");

    // Nenhum elemento interno carrega evidence_ref e vice-versa.
    const internos = [...p.relacao_interna.papeis, ...p.relacao_interna.oportunidades];
    expect(internos.every((e) => e.proveniencia.evidence_refs.length === 0)).toBe(true);
  });
});

describe("C · mesmo fato em duas fontes", () => {
  it("gera UM elemento com as duas referências", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato({ fact_id: "fact_a", source_refs: ["src_1"] }),
          fato({
            fact_id: "fact_b",
            claim: "A Converse abriu loja conceito em Salvador.",
            source_refs: ["src_2"],
            verificacao: "corroborada",
            confianca: 80,
          }),
        ],
      }),
    });

    expect(p.movimentos).toHaveLength(1);
    const e = p.movimentos[0];
    expect(e.proveniencia.evidence_refs).toEqual(expect.arrayContaining(["fact_a", "fact_b"]));
    expect(e.proveniencia.source_refs).toEqual(expect.arrayContaining(["src_1", "src_2"]));
    // Mantém a verificação mais forte e a maior confiança.
    expect(e.verificacao).toBe("corroborada");
    expect(e.confianca).toBe(80);
    expect(p.telemetria.duplicatas_mescladas).toBe(1);
  });
});

describe("D · conflitos preservados", () => {
  it("mantém os dois lados, sem escolher vencedor", () => {
    const a = fato({
      fact_id: "fact_a",
      claim: "A marca confirmou o patrocínio do festival.",
      verificacao: "conflitante",
      source_refs: ["src_1"],
      conflito: { claim_oposta: "A marca não confirmou o patrocínio.", source_refs_oposta: ["src_2"] },
    });

    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [a], conflitos: [a] }),
    });

    expect(p.conflitos).toHaveLength(1);
    expect(p.conflitos[0].claim_a).toContain("confirmou");
    expect(p.conflitos[0].claim_b).toContain("não confirmou");
    expect(p.conflitos[0].fontes_a).not.toEqual(p.conflitos[0].fontes_b);
  });
});

describe("E · lacunas não são preenchidas", () => {
  it("declara o que não sabe em vez de inventar", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato()] }),
    });

    // Sem fato de público/territórios/ativos, cada um vira lacuna declarada.
    const campos = p.lacunas.map((l) => l.campo);
    expect(campos).toEqual(expect.arrayContaining(["publicos", "territorios", "ativos"]));
    expect(p.publicos).toHaveLength(0);
  });
});

describe("F · Cliente Cross representado corretamente", () => {
  it("papel vem do banco, não da internet", () => {
    const p = construirPerfil({
      entidade: "Grupo Aramis",
      internos: {
        parte_id: "22222222-2222-2222-2222-222222222222",
        eh_cliente_cross: true,
        papeis: ["cliente"],
      },
      evidencia: null,
    });

    expect(p.relacao_interna.eh_cliente_cross).toBe(true);
    expect(p.relacao_interna.papeis[0].proveniencia.origem).toBe("interno");
    expect(p.relacao_interna.papeis[0].proveniencia.registro_interno).toContain("parte_papel");
  });
});

describe("G · empresa sem Parte", () => {
  it("fica NOT_LINKED e exige resolução humana", () => {
    const p = construirPerfil({
      entidade: "Empresa Nova SA",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato({ entidade: "Empresa Nova SA" })] }),
    });

    expect(p.identidade.vinculo).toBe("nao_vinculada");
    expect(p.identidade.requer_resolucao_humana).toBe(true);
    expect(p.identidade.parte_id).toBeNull();
  });

  it("marca ambígua quando há candidatas parecidas", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: {
        parte_id: null,
        eh_cliente_cross: false,
        candidatas: [
          { nome: "Converse Brasil", parte_id: "a" },
          { nome: "Converse Calçados", parte_id: "b" },
        ],
      },
      evidencia: null,
    });

    expect(p.identidade.vinculo).toBe("ambigua");
    expect(p.identidade.requer_resolucao_humana).toBe(true);
    expect(p.identidade.candidatas).toHaveLength(2);
  });
});

describe("H · não cria Parte automaticamente", () => {
  it("o perfil nunca inventa parte_id", () => {
    const p = construirPerfil({
      entidade: "Empresa Inexistente",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato()] }),
    });
    expect(p.identidade.parte_id).toBeNull();
    expect(p.identidade.vinculo).not.toBe("vinculada");
  });
});

describe("I/J/K · o que o agente NÃO produz", () => {
  it("não consome Cross Knowledge nem gera score, matching ou recomendação", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato()] }),
    });

    const chaves = Object.keys(p);
    for (const proibida of [
      "cross_knowledge", "knowledgeReferences", "conhecimento",
      "crossability", "score_fit", "score_card", "scoreCard",
      "recomendacao", "recommendation", "matches", "matching",
    ]) {
      expect(chaves).not.toContain(proibida);
    }

    // Nenhuma referência de conhecimento nas provenances.
    const todos = [...p.movimentos, ...p.contexto_empresa, ...p.publicos];
    expect(todos.every((e) => e.proveniencia.evidence_refs.every((r) => !r.startsWith("K")))).toBe(true);
    expect(p.telemetria.llm_calls).toBe(0);
    expect(p.telemetria.custo_estimado_usd).toBe(0);
  });

  it("inferência do Evidence Package não entra no perfil factual", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato(),
          fato({ fact_id: "fact_inf", claim: "A marca está em expansão agressiva.", natureza: "inferencia" }),
        ],
      }),
    });

    // Percorre só as seções factuais — as demais chaves do perfil têm formas
    // diferentes (telemetria, frescor, identidade).
    const secoes = [
      ...p.contexto_empresa, ...p.posicionamento, ...p.publicos, ...p.territorios,
      ...p.ativos, ...p.produtos, ...p.relacionamentos, ...p.movimentos,
    ];
    expect(secoes.some((e) => e.valor.includes("agressiva"))).toBe(false);
  });
});

describe("Q · inteligência interna preenchida pela equipe", () => {
  it("preenche públicos, territórios e ativos que a web não entrega", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: {
        parte_id: "p1",
        eh_cliente_cross: false,
        // Apurado em reunião e digitado na ficha da Empresa.
        publicos: ["Jovens urbanos 18-24", "Cultura de rua"],
        territorios: ["Moda", "Música"],
        pracas: ["São Paulo"],
        ativos: [{ id: "at-1", descricao: "Embaixadores do basquete" }],
        perfil_estrategico: { posicionamento: "Marca de streetwear com herança esportiva" },
      },
      evidencia: pacote({ facts: [fato()] }),
    });

    expect(p.publicos).toHaveLength(2);
    expect(p.territorios).toHaveLength(3); // 2 territórios + 1 praça
    expect(p.ativos).toHaveLength(1);
    expect(p.posicionamento).toHaveLength(1);

    // Tudo com proveniência INTERNA — não se confunde com evidência externa.
    for (const e of [...p.publicos, ...p.territorios, ...p.ativos, ...p.posicionamento]) {
      expect(e.proveniencia.origem).toBe("interno");
      expect(e.proveniencia.registro_interno).toContain("cross_intelligence");
      expect(e.proveniencia.evidence_refs).toHaveLength(0);
    }

    // As lacunas dessas dimensões desaparecem — o dado existe agora.
    const campos = p.lacunas.map((l) => l.campo);
    expect(campos).not.toContain("publicos");
    expect(campos).not.toContain("territorios");
    expect(campos).not.toContain("ativos");
  });

  it("interno e externo convivem sem se misturar na mesma seção", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: { parte_id: "p1", eh_cliente_cross: false, territorios: ["Moda"] },
      evidencia: pacote({
        facts: [fato({ claim: "A Converse tem lojas em São Paulo.", categoria: "territorio" })],
      }),
    });

    expect(p.territorios).toHaveLength(2);
    const origens = p.territorios.map((t) => t.proveniencia.origem);
    expect(origens).toContain("interno");
    expect(origens).toContain("externo");
  });
});

describe("L · idempotência", () => {
  it("mesmos inputs produzem o mesmo hash", () => {
    const entrada: EntradaPerfil = {
      entidade: "Converse",
      internos: { parte_id: "p1", eh_cliente_cross: true, papeis: ["cliente"] },
      evidencia: pacote({ facts: [fato()] }),
    };
    expect(calcularHashEntrada(entrada)).toBe(calcularHashEntrada({ ...entrada }));
  });

  it("reordenar fatos não muda o hash", () => {
    const f1 = fato({ fact_id: "a" });
    const f2 = fato({ fact_id: "b", claim: "Outro fato distinto sobre a marca." });
    const base = { entidade: "Converse", internos: SEM_INTERNO };

    const h1 = calcularHashEntrada({ ...base, evidencia: pacote({ facts: [f1, f2] }) });
    const h2 = calcularHashEntrada({ ...base, evidencia: pacote({ facts: [f2, f1] }) });
    expect(h1).toBe(h2);
  });

  it("evidência nova muda o hash", () => {
    const base = { entidade: "Converse", internos: SEM_INTERNO };
    const h1 = calcularHashEntrada({ ...base, evidencia: pacote({ facts: [fato()] }) });
    const h2 = calcularHashEntrada({
      ...base,
      evidencia: pacote({ facts: [fato(), fato({ fact_id: "novo" })] }),
    });
    expect(h1).not.toBe(h2);
  });
});

describe("M/N · versionamento e diff", () => {
  it("nova evidência gera nova versão e o diff mostra o que entrou", () => {
    const v1 = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({ facts: [fato()] }),
    });
    expect(v1.versao_perfil).toBe(1);

    const v2 = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato(),
          fato({ fact_id: "fact_novo", claim: "A Converse lançou uma coleção cápsula.", categoria: "produto" }),
        ],
      }),
      anterior: v1,
    });

    expect(v2.versao_perfil).toBe(2);
    const diff = calcularDiff(v1, v2);
    expect(diff.adicionados.some((a) => a.includes("cápsula"))).toBe(true);
  });
});

describe("O · ausência não é remoção", () => {
  it("fato que some da nova pesquisa é preservado e sinalizado como ausente", () => {
    const v1 = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato({ fact_id: "f1", claim: "A Converse expandiu para o Nordeste.", categoria: "expansao" }),
        ],
      }),
    });

    // Nova rodada NÃO menciona a expansão.
    const v2 = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato({ fact_id: "f2", claim: "A Converse lançou uma coleção nova.", categoria: "produto" }),
        ],
      }),
      anterior: v1,
    });

    // O fato antigo continua no perfil — não foi apagado.
    const todos = [...v2.movimentos, ...v2.produtos];
    expect(todos.some((e) => e.valor.includes("Nordeste"))).toBe(true);
  });
});

describe("P · proveniência reconstruível", () => {
  it("todo elemento externo aponta para fato e fonte", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: { parte_id: "p1", eh_cliente_cross: true, papeis: ["cliente"] },
      evidencia: pacote({ facts: [fato({ source_refs: ["src_bloomberg"] })] }),
    });

    for (const e of p.movimentos) {
      expect(e.proveniencia.origem).toBe("externo");
      expect(e.proveniencia.evidence_refs.length).toBeGreaterThan(0);
      expect(e.proveniencia.source_refs.length).toBeGreaterThan(0);
    }
    for (const e of p.relacao_interna.papeis) {
      expect(e.proveniencia.origem).toBe("interno");
      expect(e.proveniencia.registro_interno).toBeTruthy();
    }
  });

  it("timeline só inclui itens com data", () => {
    const p = construirPerfil({
      entidade: "Converse",
      internos: SEM_INTERNO,
      evidencia: pacote({
        facts: [
          fato({ fact_id: "com_data", publicado_em: "2026-06-15T00:00:00Z" }),
          fato({ fact_id: "sem_data", claim: "Outro acontecimento sem data conhecida.", publicado_em: null }),
        ],
      }),
    });

    expect(p.timeline).toHaveLength(1);
    expect(p.timeline[0].data).toContain("2026-06-15");
  });
});
