import { describe, expect, it } from "vitest";
import { recomendar, EntradaRecomendacaoInvalida } from "./recommendation.agent";
import type { InternalMatchingResult, CandidatoMatching } from "../matching/matching.schema";
import type { EntityIntelligenceProfile } from "../entidade/perfil.schema";
import type { CrossabilityAnalysis } from "../crossability/crossability.schema";

// -----------------------------------------------------------------------------
// Recommendation Agent — cenários A a X da Sprint AI-06.
//
// Determinístico e sem banco: o agente consome artefatos já produzidos por
// AI-03/04/05 e não escreve nada. Nenhuma LLM, nenhum embedding.
// -----------------------------------------------------------------------------

function sinal(tipo: string, forca: string, valor: number | null) {
  return {
    tipo: tipo as never,
    forca: forca as never,
    valor,
    descricao: `${tipo}: ${forca}`,
    origem_refs: [],
    candidato_refs: [],
    proveniencia: `cross_intelligence.parte_${tipo}(parte_id=cand-1)`,
    nivel_validacao: "estrutural" as const,
  };
}

function candidato(over: Partial<CandidatoMatching> = {}): CandidatoMatching {
  return {
    parte_id: "cand-1",
    nome: "Marca Candidata",
    papeis: ["parceiro"],
    tipo: "organizacao",
    eh_cliente_cross: false,
    elegibilidade: "elegivel",
    pre_match_score: 66.67,
    componentes: [],
    sinais: [
      sinal("publico", "forte", 1),
      sinal("territorio", "forte", 1),
      sinal("ativo", "nenhum", 0),
    ],
    informacao_faltante: [],
    status_perfil: "completo",
    necessita_enriquecimento: false,
    relacionamento: "sem_relacionamento_conhecido",
    nivel_validacao: "estrutural",
    ...over,
  } as CandidatoMatching;
}

function matching(over: Partial<InternalMatchingResult> = {}): InternalMatchingResult {
  return {
    direcao: "cliente_para_parceiro",
    origem: {
      parte_id: "origem-1",
      nome: "Cliente Alfa",
      vinculo: "vinculada",
      requer_resolucao_humana: false,
      papeis: ["cliente"],
    },
    objetivo: "ativação cultural conjunta",
    universo: { total_no_pool_sql: 9, considerados: 7, pontuados: 5, shortlist: 5 },
    shortlist: [candidato()],
    excluidos: [],
    nao_resolvidos: [],
    nivel_validacao: "estrutural",
    validacao_semantica: "pendente_embedding_real",
    telemetria: {
      duracao_ms: 38, duracao_sql_ms: 3, llm_calls: 0, embedding_calls: 0,
      custo_estimado_usd: 0, pesos_versao: "retrieval-v1",
    },
    ...over,
  } as InternalMatchingResult;
}

function elemento(valor: string, factId: string) {
  return {
    valor,
    proveniencia: {
      origem: "externo" as const,
      registro_interno: null,
      evidence_refs: [factId],
      source_refs: [`src_${factId}`],
    },
    verificacao: "corroborada",
    confianca: 80,
    publicado_em: null,
  };
}

function perfil(over: Partial<EntityIntelligenceProfile> = {}): EntityIntelligenceProfile {
  return {
    identidade: {
      nome: "Marca Candidata", aliases: [], dominio_oficial: null, tipo: "organizacao",
      parte_id: "cand-1", vinculo: "vinculada", requer_resolucao_humana: false, candidatas: [],
    },
    relacao_interna: { eh_cliente_cross: false, papeis: [], oportunidades: [], parcerias: [], projetos: [] },
    contexto_empresa: [], posicionamento: [],
    publicos: [elemento("Jovens urbanos de 18 a 24 anos", "fact_pub1")],
    territorios: [elemento("Atua em moda e música", "fact_ter1")],
    ativos: [], produtos: [], relacionamentos: [], movimentos: [],
    timeline: [], conflitos: [], lacunas: [],
    frescor: {
      perfil_gerado_em: new Date().toISOString(),
      evidencia_mais_recente_em: null, atualizacao_interna_mais_recente_em: null,
    },
    versao_perfil: 1, hash_entrada: "hash-cand",
    telemetria: {
      duracao_ms: 1, registros_internos_considerados: 0, fatos_considerados: 2,
      fatos_consolidados: 2, duplicatas_mescladas: 0, conflitos: 0, lacunas: 0,
      llm_calls: 0, custo_estimado_usd: 0,
    },
    ...over,
  } as EntityIntelligenceProfile;
}

function crossability(over: Partial<CrossabilityAnalysis> = {}): CrossabilityAnalysis {
  return {
    entidade: "Marca Candidata",
    contexto: { objetivo: "ativação cultural", cliente_cross_id: null, contexto_ausente: false },
    methodology_version: [{ codigo: "metodologia-crossability", documento: "Metodologia", versao: 2 }],
    dimensions: [
      {
        dimensao: "publicos", assessment: "media",
        reasoning: "Público identificável.",
        supporting_points: [{ texto: "Jovens urbanos.", evidence_refs: ["E1"], knowledge_refs: ["K1"] }],
        counterpoints: [{ texto: "Sem dado demográfico estruturado.", evidence_refs: ["E1"], knowledge_refs: [] }],
        gaps: ["Faixa etária não confirmada."],
        confidence: 45, status: "suportado",
        evidence_status: "suficiente", knowledge_status: "suficiente",
        knowledge_refs: [{
          ref: "K1", chunk_id: "chunk-1", documento_id: "doc-1", codigo: "metodologia-crossability",
          documento: "Metodologia", secao: "Públicos", versao: 2, escopo: "global", relevancia: 0.45,
        }],
        retrieval: { consulta: "publicos", top_k: 3, limiar: 0.35, considerados: 7, entregues: 1, descartados: 6 },
      },
    ],
    overall_synthesis: "sintese",
    conflicts: [], evidence_gaps: [], knowledge_gaps: [],
    confidence: 45, rejeitados: [],
    provenance: {
      perfil_versao: 1, perfil_hash: "hash-cross",
      evidence_fact_ids: ["fact_pub1"], knowledge_chunk_ids: ["chunk-1"],
    },
    telemetria: {
      duracao_ms: 10, provedor: "mock", modelo: null, llm_calls: 0,
      tokens_entrada: 0, tokens_saida: 0, tokens_cache: 0, custo_estimado_usd: 0,
      contexto_caracteres: 0, retrieval_calls: 6, bloqueios: [],
    },
    ...over,
  } as CrossabilityAnalysis;
}

// -----------------------------------------------------------------------------

describe("A/B/C · As três jornadas", () => {
  it("Cliente → Parceiro produz proposta", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.direcao).toBe("cliente_para_parceiro");
    expect(r.hipotese_oportunidade).toBeTruthy();
    expect(r.status).toBe("pronta_para_revisao");
  });

  it("Parceiro → Cliente preserva que o candidato é Cliente Cross", () => {
    const r = recomendar({
      matching: matching({
        direcao: "parceiro_para_cliente",
        origem: {
          parte_id: "parceiro-1", nome: "Converse", vinculo: "vinculada",
          requer_resolucao_humana: false, papeis: ["parceiro"],
        },
        shortlist: [candidato({ eh_cliente_cross: true, nome: "Cliente Delta" })],
      }),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.direcao).toBe("parceiro_para_cliente");
    expect(r.candidato.eh_cliente_cross).toBe(true);
  });

  it("Prospecção do zero mantém origem não vinculada", () => {
    const r = recomendar({
      matching: matching({
        direcao: "prospeccao_do_zero",
        origem: {
          parte_id: null, nome: "Marca Externa", vinculo: "nao_vinculada",
          requer_resolucao_humana: true, papeis: [],
        },
      }),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.origem.vinculo).toBe("nao_vinculada");
    expect(r.origem.parte_id).toBeNull();
  });
});

describe("D/E · Candidato forte vs fraco", () => {
  it("candidato com sinais, evidência e Crossability fica pronto para revisão", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.nivel_sustentacao).toBe("sustentacao_forte");
    expect(r.status).toBe("pronta_para_revisao");
    expect(r.proximo_passo).toBe("preparar_para_human_gate");
  });

  it("candidato sem sinais úteis não recebe hipótese", () => {
    const r = recomendar({
      matching: matching({
        shortlist: [candidato({
          sinais: [sinal("publico", "nenhum", 0), sinal("territorio", "desconhecido", null)],
          pre_match_score: 0,
        })],
      }),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
    });
    expect(r.hipotese_oportunidade).toBeNull();
    expect(r.nivel_sustentacao).toBe("sustentacao_insuficiente");
    expect(r.status).toBe("sustentacao_insuficiente");
  });
});

describe("F/G · Perfil ausente e parcial", () => {
  it("perfil ausente exige enriquecimento e não inventa racional", () => {
    const r = recomendar({
      matching: matching({
        shortlist: [candidato({ status_perfil: "ausente", necessita_enriquecimento: true })],
      }),
      candidatoParteId: "cand-1",
    });
    expect(r.status).toBe("requer_enriquecimento");
    expect(r.hipotese_oportunidade).toBeNull();
    expect(r.proximo_passo).toBe("solicitar_enriquecimento");
    expect(r.riscos.some((x) => x.categoria === "perfil_incompleto")).toBe(true);
  });

  it("perfil parcial gera proposta com limitação declarada", () => {
    const r = recomendar({
      matching: matching({
        shortlist: [candidato({ status_perfil: "parcial", necessita_enriquecimento: true })],
      }),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.hipotese_oportunidade).toBeTruthy();
    expect(r.riscos.some((x) => x.categoria === "perfil_incompleto")).toBe(true);
    // Confiança precisa refletir a incompletude.
    expect(r.confianca).toBeLessThan(100);
  });
});

describe("H/I · Contra-evidência e Crossability questionável", () => {
  it("preserva contra-evidência vinda do Crossability", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.contra_evidencias.length).toBeGreaterThan(0);
    expect(r.contra_evidencias[0].texto).toContain("demográfico");
  });

  it("dimensão insuficiente não vira argumento favorável", () => {
    const cross = crossability();
    cross.dimensions[0].status = "insuficiente";
    cross.dimensions[0].assessment = "indeterminado";

    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: cross,
    });

    // Sem dimensão sustentada, a proposta cai para parcial — não forte.
    expect(r.nivel_sustentacao).toBe("sustentacao_parcial");
    expect(r.limitacoes).toContain("crossability_real_reasoning_pendente");
  });

  it("conflito factual aparece e derruba o fator de confiança", () => {
    const cross = crossability({
      conflicts: [{ claim_a: "Atua no Brasil", claim_b: "Não opera no Brasil", observacao: "Fontes divergem." }],
    });
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: cross,
    });

    expect(r.contra_evidencias.some((c) => c.tipo === "conflito_factual")).toBe(true);
    expect(r.riscos.some((x) => x.categoria === "conflito_factual")).toBe(true);
    const fator = r.componentes_confianca.find((c) => c.fator === "ausencia_conflito")!;
    expect(fator.valor).toBe(0);
  });
});

describe("J · Score alto não produz proposta forte sozinho", () => {
  it("pre_match_score 95 com perfil ausente continua exigindo enriquecimento", () => {
    const r = recomendar({
      matching: matching({
        shortlist: [candidato({
          pre_match_score: 95,
          status_perfil: "ausente",
          necessita_enriquecimento: true,
        })],
      }),
      candidatoParteId: "cand-1",
    });

    // Esta é a prova de que Matching prioriza, mas não decide.
    expect(r.status).toBe("requer_enriquecimento");
    expect(r.nivel_sustentacao).toBe("sustentacao_insuficiente");
    expect(r.hipotese_oportunidade).toBeNull();
  });

  it("o score é apresentado como contexto de priorização, não como avaliação", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    const linha = r.racional.find((l) => l.includes("pre_match_score"));
    expect(linha).toBeTruthy();
    expect(linha).toContain("retrieval");
  });
});

describe("K/L/M · Entradas inválidas", () => {
  it("candidato fora da shortlist é rejeitado", () => {
    expect(() =>
      recomendar({ matching: matching(), candidatoParteId: "nao-existe" })
    ).toThrow(EntradaRecomendacaoInvalida);
  });

  it("shortlist vazia impede qualquer proposta", () => {
    expect(() =>
      recomendar({ matching: matching({ shortlist: [] }), candidatoParteId: "cand-1" })
    ).toThrow(EntradaRecomendacaoInvalida);
  });

  it("evidências citadas vêm do perfil, não de refs inventadas", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    // Todas as refs existem no perfil fornecido.
    for (const e of r.evidencias_suporte) {
      expect(e.evidence_ref).toMatch(/^fact_/);
      expect(e.proveniencia).toBeTruthy();
    }
  });
});

describe("N/X · Determinismo", () => {
  it("confiança é determinística e explicada por componentes", () => {
    const entrada = {
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    };
    const r1 = recomendar(entrada);
    const r2 = recomendar(entrada);

    expect(r1.confianca).toBe(r2.confianca);
    expect(r1.componentes_confianca).toEqual(r2.componentes_confianca);
    // A soma das contribuições reproduz a confiança.
    const soma = Math.round(r1.componentes_confianca.reduce((s, c) => s + c.contribuicao, 0) * 100);
    expect(r1.confianca).toBe(soma);
  });

  it("mesmos inputs produzem o mesmo hash de entrada", () => {
    const entrada = {
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    };
    expect(recomendar(entrada).proveniencia.hash_entrada).toBe(
      recomendar(entrada).proveniencia.hash_entrada
    );
  });
});

describe("O · Nível de validação", () => {
  it("nunca reivindica produção homologada", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.nivel_validacao).toBe("estrutural");
    expect(r.limitacoes).toContain("semantic_matching_pendente");
    expect(r.limitacoes).toContain("crossability_real_reasoning_pendente");
  });
});

describe("P–W · O que o agente NÃO faz", () => {
  it("zero IA paga e zero ação operacional", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });

    expect(r.telemetria.llm_calls).toBe(0);
    expect(r.telemetria.embedding_calls).toBe(0);
    expect(r.telemetria.custo_estimado_usd).toBe(0);
    expect(r.telemetria.oportunidades_criadas).toBe(0);
    expect(r.telemetria.projetos_criados).toBe(0);
    expect(r.telemetria.parcerias_criadas).toBe(0);
    expect(r.telemetria.reunioes_criadas).toBe(0);
    expect(r.telemetria.mudancas_funil).toBe(0);
    expect(r.telemetria.score_card_executado).toBe(false);
  });

  it("não produz estado de aprovação nem executa a próxima etapa", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    // `aprovada` não existe no contrato: aprovar é ato humano.
    expect(["pronta_para_revisao", "requer_enriquecimento", "sustentacao_insuficiente", "rascunho"])
      .toContain(r.status);
    expect(r).not.toHaveProperty("aprovada");
    // O próximo passo é sugestão, e o agente não o executou.
    expect(r.proximo_passo).toBeTruthy();
  });
});

describe("Rastreabilidade e especificidade", () => {
  it("todo sinal de suporte carrega proveniência", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.sinais_suporte.length).toBeGreaterThan(0);
    for (const s of r.sinais_suporte) {
      expect(s.proveniencia).toMatch(/cross_/);
    }
  });

  it("a hipótese cita as dimensões que casaram, não frase genérica", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.hipotese_oportunidade).toContain("público");
    expect(r.hipotese_oportunidade).toContain("território");
    // Linguagem de hipótese, não de certeza comercial.
    expect(r.hipotese_oportunidade).toContain("hipótese");
    expect(r.hipotese_oportunidade).not.toMatch(/parceria ideal|excelente oportunidade/i);
  });

  it("lacunas preservam a origem", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil({
        lacunas: [{ campo: "ativos", descricao: "Nenhum fato sobre ativos." }],
      }),
      crossability: crossability(),
    });
    expect(r.lacunas.some((l) => l.origem === "entity_intelligence")).toBe(true);
    expect(r.lacunas.some((l) => l.origem === "crossability")).toBe(true);
  });

  it("questões abertas são perguntas, não afirmações", () => {
    const r = recomendar({
      matching: matching(),
      candidatoParteId: "cand-1",
      perfilCandidato: perfil(),
      crossability: crossability(),
    });
    expect(r.questoes_abertas.length).toBeGreaterThan(0);
    expect(r.questoes_abertas.some((q) => /confirmar|validar|enriquecer|revisar/i.test(q))).toBe(true);
  });
});
