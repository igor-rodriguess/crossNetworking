import { describe, expect, it } from "vitest";
import {
  OrcamentoExecucao,
  OrcamentoExcedidoError,
  atrasoBackoffMs,
  classificarErro,
  podeRepetir,
  type LimitesOrcamento,
} from "./budget";

// -----------------------------------------------------------------------------
// Guardrails de custo — cenários A a J da Sprint 0D.
//
// Nenhuma chamada real (paga ou gratuita) acontece aqui: o guardrail é
// contabilidade em memória, exercitada offline. Os limites são injetados por
// construtor para não depender do .env da máquina que roda os testes.
// -----------------------------------------------------------------------------

/** Limites pequenos e explícitos, para os cenários serem legíveis. */
function limites(over: Partial<LimitesOrcamento> = {}): Partial<LimitesOrcamento> {
  return {
    custoMaximoUsd: 1.0,
    maxChamadasLlm: 3,
    maxBuscasWeb: 2,
    maxScrapes: 2,
    maxCandidatosReasoning: 3,
    maxTentativasPorEtapa: 2,
    providersPagosHabilitados: true,
    modoEstrito: true,
    // Allowlist de operações (AI-02.3). Os cenários abaixo exercitam orçamento
    // e kill switch, então declaram uma operação autorizada; a allowlist em si
    // tem seus próprios testes mais adiante.
    operacoesLlmPermitidas: new Set(["fact_extraction"]),
    ...over,
  };
}

/** Operação autorizada — declarada por toda chamada de LLM destes cenários. */
const OP = "fact_extraction";

// 1M entrada + 1M saída em gpt-4o-mini = 0.15 + 0.60 = 0.75 USD
const UMA_CHAMADA_CARA = { entrada: 1_000_000, saida: 1_000_000 };

describe("A · execução abaixo do orçamento é permitida", () => {
  it("autoriza e debita o consumo real", () => {
    const o = new OrcamentoExecucao(limites());

    const auth = o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA });
    expect(auth.permitido).toBe(true);
    expect(auth.custoProjetado).toBeCloseTo(0.75, 6);
    expect(auth.custoAtual).toBe(0);

    o.registrarConsumoLlm("gpt-4o-mini", UMA_CHAMADA_CARA);
    expect(o.custoAtual).toBeCloseTo(0.75, 6);
    expect(o.totalChamadasLlm).toBe(1);
    expect(o.foiBloqueada).toBe(false);
  });
});

describe("B · operação que ultrapassaria o limite é bloqueada ANTES da chamada", () => {
  it("nega a segunda chamada e registra o motivo com os números", () => {
    const o = new OrcamentoExecucao(limites());

    // Primeira: 0.75 de 1.00 — passa.
    expect(o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA }).permitido).toBe(true);
    o.registrarConsumoLlm("gpt-4o-mini", UMA_CHAMADA_CARA);

    // Segunda: 0.75 + 0.75 = 1.50 > 1.00 — bloqueada.
    const auth = o.autorizarLlm({
      operacao: OP,
      modelo: "gpt-4o-mini",
      tokens: UMA_CHAMADA_CARA,
      agente: "crossability_reasoning",
      etapa: "crossability_reasoning",
    });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("execution_cost_limit");
    expect(auth.custoAtual).toBeCloseTo(0.75, 6);
    expect(auth.custoProjetado).toBeCloseTo(0.75, 6);
    expect(auth.limite).toBe(1.0);

    // O custo NÃO avançou: a operação não aconteceu.
    expect(o.custoAtual).toBeCloseTo(0.75, 6);

    const bloqueio = o.historicoBloqueios[0];
    expect(bloqueio.motivo).toBe("execution_cost_limit");
    expect(bloqueio.agente).toBe("crossability_reasoning");
    expect(bloqueio.momento).toBeTruthy();
  });

  it("bloqueia por número de chamadas mesmo com orçamento sobrando", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 1000, maxChamadasLlm: 2 }));
    const barato = { entrada: 1000, saida: 100 };

    for (let i = 0; i < 2; i++) {
      expect(o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: barato }).permitido).toBe(true);
      o.registrarConsumoLlm("gpt-4o-mini", barato);
    }

    const auth = o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: barato });
    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("llm_call_limit");
  });
});

describe("C · modelo com custo desconhecido é bloqueado em modo estrito", () => {
  it("nega e NÃO trata null como gratuito", () => {
    const o = new OrcamentoExecucao(limites({ modoEstrito: true }));

    const auth = o.autorizarLlm({ operacao: OP, modelo: "modelo-que-nao-existe", tokens: UMA_CHAMADA_CARA });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("cost_unknown");
    expect(auth.custoProjetado).toBeNull();
    expect(o.foiBloqueada).toBe(true);
  });

  it("permite fora do modo estrito, sem registrar bloqueio", () => {
    const o = new OrcamentoExecucao(limites({ modoEstrito: false }));

    const auth = o.autorizarLlm({ operacao: OP, modelo: "modelo-que-nao-existe", tokens: UMA_CHAMADA_CARA });

    expect(auth.permitido).toBe(true);
    expect(auth.custoProjetado).toBeNull();
    expect(o.foiBloqueada).toBe(false);
  });
});

describe("D · provider local é permitido com custo zero", () => {
  it("autoriza mesmo com orçamento esgotado e ainda conta a chamada", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 0 }));

    const auth = o.autorizarLlm({ operacao: OP, modelo: "qwen3:4b", tokens: UMA_CHAMADA_CARA, local: true });

    expect(auth.permitido).toBe(true);
    expect(auth.custoProjetado).toBe(0);

    o.registrarConsumoLlm("qwen3:4b", UMA_CHAMADA_CARA, true);
    expect(o.custoAtual).toBe(0);
    // Consumo local não fatura, mas a chamada é registrada.
    expect(o.totalChamadasLlm).toBe(1);
  });

  it("respeita o kill switch apenas para provider pago", () => {
    const o = new OrcamentoExecucao(limites({ providersPagosHabilitados: false }));

    expect(o.autorizarLlm({ operacao: OP, modelo: "qwen3:4b", tokens: { entrada: 10, saida: 10 }, local: true }).permitido).toBe(true);
    expect(o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: { entrada: 10, saida: 10 } }).permitido).toBe(false);
  });
});

describe("E · limite de web search", () => {
  it("bloqueia a busca que excede o teto", () => {
    const o = new OrcamentoExecucao(limites({ maxBuscasWeb: 2 }));

    expect(o.autorizarFerramenta("web_search").permitido).toBe(true);
    o.registrarUsoFerramenta("web_search", 2);

    const auth = o.autorizarFerramenta("web_search", { agente: "source_collector" });
    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("web_search_limit");
    expect(auth.limite).toBe(2);
  });
});

describe("F · limite de scraping", () => {
  it("bloqueia o scrape que excede o teto", () => {
    const o = new OrcamentoExecucao(limites({ maxScrapes: 2 }));

    expect(o.autorizarFerramenta("firecrawl_scrape").permitido).toBe(true);
    o.registrarUsoFerramenta("firecrawl_scrape", 2);

    const auth = o.autorizarFerramenta("firecrawl_scrape");
    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("scrape_limit");
  });

  it("bloqueia ferramenta paga quando o kill switch está desligado", () => {
    const o = new OrcamentoExecucao(limites({ providersPagosHabilitados: false }));
    const auth = o.autorizarFerramenta("firecrawl_scrape");
    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("paid_providers_disabled");
  });
});

describe("G · limite de candidatos (candidate explosion)", () => {
  it("deixa passar apenas o TOP N e informa quantos foram cortados", () => {
    const o = new OrcamentoExecucao(limites({ maxCandidatosReasoning: 3 }));
    const candidatos = Array.from({ length: 50 }, (_, i) => `marca-${i + 1}`);

    const { selecionados, cortados } = o.limitarCandidatos(candidatos);

    expect(selecionados).toHaveLength(3);
    expect(cortados).toBe(47);
    // Preserva a ordem: o pré-filtro decide QUAIS; o guardrail, QUANTOS.
    expect(selecionados).toEqual(["marca-1", "marca-2", "marca-3"]);
  });

  it("não corta quando a lista já está dentro do teto", () => {
    const o = new OrcamentoExecucao(limites({ maxCandidatosReasoning: 10 }));
    const { selecionados, cortados } = o.limitarCandidatos(["a", "b"]);
    expect(selecionados).toHaveLength(2);
    expect(cortados).toBe(0);
  });
});

describe("H · retry de erro temporário dentro do limite é permitido", () => {
  it("classifica e permite repetir erro de rede/timeout", () => {
    expect(classificarErro(new Error("O provedor de IA não respondeu em 25s."))).toBe("temporario");
    expect(classificarErro(new Error("fetch failed: ECONNRESET"))).toBe("temporario");
    expect(classificarErro(new Error("Provedor retornou 503."))).toBe("temporario");

    expect(podeRepetir(new Error("timeout"), 1, 2)).toBe(true);
    // Esgotado o número de tentativas, não repete mais.
    expect(podeRepetir(new Error("timeout"), 2, 2)).toBe(false);
  });

  it("aplica backoff exponencial com teto", () => {
    expect(atrasoBackoffMs(1)).toBe(500);
    expect(atrasoBackoffMs(2)).toBe(1000);
    expect(atrasoBackoffMs(3)).toBe(2000);
    expect(atrasoBackoffMs(99)).toBe(8000);
  });
});

describe("I · retry NÃO acontece após budget_blocked", () => {
  it("erro de orçamento nunca é repetido", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 0.1 }));
    const auth = o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA });
    expect(auth.permitido).toBe(false);

    const erro = new OrcamentoExcedidoError(auth);

    expect(classificarErro(erro)).toBe("orcamento");
    // Nem na primeira tentativa: repetir gastaria de novo o que se quis evitar.
    expect(podeRepetir(erro, 0, 5)).toBe(false);
    expect(podeRepetir(erro, 1, 5)).toBe(false);
  });

  it("validação e Human Gate também não repetem", () => {
    expect(podeRepetir(new Error("payload inválido: campo obrigatório ausente"), 0, 3)).toBe(false);
    expect(podeRepetir(new Error("Human Gate rejeitou o rascunho"), 0, 3)).toBe(false);
    // Erro não reconhecido é tratado como permanente — conservador de propósito.
    expect(podeRepetir(new Error("algo estranho aconteceu"), 0, 3)).toBe(false);
  });
});

describe("J · kill switch impossibilita chamada paga", () => {
  it("nega LLM pago e ferramenta paga, mesmo com orçamento sobrando", () => {
    const o = new OrcamentoExecucao(
      limites({ providersPagosHabilitados: false, custoMaximoUsd: 9999 })
    );

    const llm = o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: { entrada: 10, saida: 10 } });
    expect(llm.permitido).toBe(false);
    expect(llm.motivo).toBe("paid_providers_disabled");

    const ferramenta = o.autorizarFerramenta("firecrawl_search");
    expect(ferramenta.permitido).toBe(false);
    expect(ferramenta.motivo).toBe("paid_providers_disabled");

    // Nada foi gasto.
    expect(o.custoAtual).toBe(0);
  });
});

describe("L · API key presente NÃO libera provider pago com kill switch desligado", () => {
  it("recusa a chamada mesmo havendo chave no ambiente", () => {
    // Simula o cenário mais perigoso: chave real colada no .env por engano.
    // O guardrail não consulta a chave — ele consulta o switch. Ter credencial
    // deixa de ser, por si só, autorização para gastar.
    const chavePresente = "sk-proj-chave-real-hipotetica-que-nao-sera-usada";
    expect(chavePresente.length).toBeGreaterThan(0); // a chave existe

    const o = new OrcamentoExecucao(
      limites({ providersPagosHabilitados: false, custoMaximoUsd: 9999, maxChamadasLlm: 999 })
    );

    const llm = o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA });
    expect(llm.permitido).toBe(false);
    expect(llm.motivo).toBe("paid_providers_disabled");

    // Nem orçamento generoso, nem teto de chamadas alto, nem chave presente
    // mudam o desfecho.
    expect(o.custoAtual).toBe(0);
    expect(o.totalChamadasLlm).toBe(0);

    // O bloqueio é rastreável e diz exatamente por quê.
    const b = o.historicoBloqueios[0];
    expect(b.motivo).toBe("paid_providers_disabled");
    expect(b.detalhe).toContain("mesmo havendo chave no ambiente");
    expect(b.decisao).toBe("bloqueado");
  });

  it("bloqueia LLM, scraping e embeddings — mas não o provedor local", () => {
    const o = new OrcamentoExecucao(limites({ providersPagosHabilitados: false, custoMaximoUsd: 9999 }));

    for (const ferramenta of ["firecrawl_search", "firecrawl_scrape", "embeddings"] as const) {
      expect(o.autorizarFerramenta(ferramenta).motivo).toBe("paid_providers_disabled");
    }
    expect(o.autorizarLlm({ operacao: OP, modelo: "qwen3:4b", tokens: UMA_CHAMADA_CARA, local: true }).permitido).toBe(true);
  });
});

describe("Contexto estruturado da decisão", () => {
  it("herda o contexto da execução e captura os contadores do instante", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 0.01 }), {
      runId: "run-abc",
      execucaoPaiId: "exec-pai-123",
      jornada: "partner_discovery",
      provedor: "openai",
      tentativa: 2,
    });

    // Consome antes, para os contadores não virem zerados no bloqueio.
    o.registrarUsoFerramenta("web_search", 2);
    o.limitarCandidatos(["a", "b", "c", "d", "e"]);

    o.autorizarLlm({
      operacao: OP,
      modelo: "gpt-4o-mini",
      tokens: UMA_CHAMADA_CARA,
      agente: "crossability_reasoning",
      etapa: "reasoning",
    });

    const b = o.historicoBloqueios[0];
    expect(b.runId).toBe("run-abc");
    expect(b.execucaoPaiId).toBe("exec-pai-123");
    expect(b.jornada).toBe("partner_discovery");
    expect(b.tentativa).toBe(2);
    expect(b.agente).toBe("crossability_reasoning");
    expect(b.etapa).toBe("reasoning");
    expect(b.tipoOperacao).toBe("llm");
    expect(b.buscasWeb).toBe(2);
    expect(b.candidatos).toBe(5);
    expect(b.decisao).toBe("bloqueado");
    expect(b.momento).toBeTruthy();
  });

  it("informa recebidos, permitidos e descartados no corte de candidatos", () => {
    const o = new OrcamentoExecucao(limites({ maxCandidatosReasoning: 10 }));
    const corte = o.limitarCandidatos(Array.from({ length: 67 }, (_, i) => i));

    expect(corte.recebidos).toBe(67);
    expect(corte.permitidos).toBe(10);
    expect(corte.cortados).toBe(57);
    expect(corte.limite).toBe(10);
  });
});

describe("M · allowlist de operações de LLM", () => {
  it("nega operação fora da allowlist, mesmo com orçamento e switch liberados", () => {
    const o = new OrcamentoExecucao(
      limites({
        custoMaximoUsd: 9999,
        providersPagosHabilitados: true,
        operacoesLlmPermitidas: new Set(["fact_extraction"]),
      })
    );

    const auth = o.autorizarLlm({
      operacao: "crossability_reasoning",
      modelo: "gpt-4o-mini",
      tokens: UMA_CHAMADA_CARA,
    });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("operation_not_allowed");
    expect(o.custoAtual).toBe(0);
  });

  it("nega operação NÃO DECLARADA — o que não se declara não se autoriza", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 9999 }));
    const auth = o.autorizarLlm({ modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("operation_not_allowed");
    expect(auth.detalhe).toContain("não declarada");
  });

  it("a allowlist vale também para provedor local", () => {
    // Ligar o LLM local para uma finalidade não pode liberar inferência no
    // pipeline inteiro — o custo é zero, mas a latência e o escopo não são.
    const o = new OrcamentoExecucao(limites());
    const auth = o.autorizarLlm({
      operacao: "planning",
      modelo: "qwen3:4b",
      tokens: UMA_CHAMADA_CARA,
      local: true,
    });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("operation_not_allowed");
  });

  it("allowlist vazia bloqueia tudo", () => {
    const o = new OrcamentoExecucao(limites({ operacoesLlmPermitidas: new Set<string>() }));
    const auth = o.autorizarLlm({
      operacao: "fact_extraction",
      modelo: "gpt-4o-mini",
      tokens: UMA_CHAMADA_CARA,
    });

    expect(auth.permitido).toBe(false);
    expect(auth.motivo).toBe("operation_not_allowed");
    expect(auth.detalhe).toContain("(nenhuma)");
  });

  it("autoriza a operação que está na lista", () => {
    const o = new OrcamentoExecucao(limites());
    expect(
      o.autorizarLlm({ operacao: "fact_extraction", modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA })
        .permitido
    ).toBe(true);
  });
});

describe("Observabilidade do guardrail", () => {
  it("resume consumo, limites e bloqueios para a telemetria", () => {
    const o = new OrcamentoExecucao(limites());
    o.registrarConsumoLlm("gpt-4o-mini", { entrada: 1_000_000, saida: 0 });
    o.registrarUsoFerramenta("web_search", 2);
    o.autorizarFerramenta("web_search"); // bloqueia: teto é 2

    const r = o.resumo();
    expect(r.custo_realizado_usd).toBeCloseTo(0.15, 6);
    expect(r.chamadas_llm).toBe(1);
    expect(r.uso_ferramentas).toEqual({ web_search: 2 });
    expect(r.bloqueios).toBe(1);
    expect(r.motivo_principal).toBe("web_search_limit");
  });

  it("preserva o motivo do PRIMEIRO bloqueio como principal", () => {
    const o = new OrcamentoExecucao(limites({ custoMaximoUsd: 0.01, maxBuscasWeb: 0 }));
    o.autorizarLlm({ operacao: OP, modelo: "gpt-4o-mini", tokens: UMA_CHAMADA_CARA });
    o.autorizarFerramenta("web_search");

    expect(o.historicoBloqueios).toHaveLength(2);
    expect(o.motivoPrincipal).toBe("execution_cost_limit");
  });
});
