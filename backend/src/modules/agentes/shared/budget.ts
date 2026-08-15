import { env } from "../../../config/env";
import { estimarCusto, type ConsumoTokens } from "./custo";

// -----------------------------------------------------------------------------
// Cost Budget Service — guardrail compartilhado do pipeline de IA.
//
// Medir custo não é controlar custo. O hardening (Sprint 0C) tornou o consumo
// mensurável; esta camada o torna LIMITÁVEL: cada operação potencialmente paga
// pede autorização ANTES de acontecer, e o consumo é debitado conforme avança.
//
// Duas decisões estruturais:
//
//  1. O guardrail é UM só, compartilhado. Regras de custo espalhadas por agente
//     divergem com o tempo e deixam brechas — a proteção passa a valer só onde
//     alguém lembrou de aplicá-la.
//
//  2. Ele não conhece provedor. Recebe "vou gastar N tokens no modelo X" ou
//     "vou chamar a ferramenta Y" e responde permitido/negado. Trocar OpenAI
//     por outro provedor não muda uma linha aqui.
//
// Nenhuma chamada de rede acontece neste arquivo: é contabilidade em memória
// sobre uma execução, testável offline.
// -----------------------------------------------------------------------------

/** Motivo estruturado de um bloqueio — nunca uma string solta. */
export type MotivoBloqueio =
  | "execution_cost_limit"
  | "cost_unknown"
  | "llm_call_limit"
  | "web_search_limit"
  | "scrape_limit"
  | "paid_providers_disabled";

/** Ferramentas externas sujeitas a limite. Espelha cross_ai.uso_ferramenta. */
export type FerramentaLimitada = "web_search" | "firecrawl_search" | "firecrawl_scrape" | "embeddings";

export interface LimitesOrcamento {
  custoMaximoUsd: number;
  maxChamadasLlm: number;
  maxBuscasWeb: number;
  maxScrapes: number;
  maxCandidatosReasoning: number;
  maxTentativasPorEtapa: number;
  providersPagosHabilitados: boolean;
  modoEstrito: boolean;
}

/** Limites vindos da configuração; sobrescritíveis em teste. */
export function limitesPadrao(): LimitesOrcamento {
  return {
    custoMaximoUsd: env.maxCostPerRunUsd,
    maxChamadasLlm: env.maxLlmCallsPerRun,
    maxBuscasWeb: env.maxWebSearchesPerRun,
    maxScrapes: env.maxScrapesPerRun,
    maxCandidatosReasoning: env.maxReasoningCandidates,
    maxTentativasPorEtapa: env.maxRetriesPerStep,
    providersPagosHabilitados: env.paidProvidersEnabled,
    modoEstrito: env.strictCostMode,
  };
}

export interface Autorizacao {
  permitido: boolean;
  motivo?: MotivoBloqueio;
  /** Texto legível para log e para a observação da etapa. */
  detalhe?: string;
  /** Custo já consumido nesta execução (USD). */
  custoAtual: number;
  /** Custo estimado da operação pedida; `null` = não estimável. */
  custoProjetado: number | null;
  /** Limite que motivou a decisão. */
  limite: number;
}

export interface OperacaoLlm {
  /** Modelo que atenderá; usado para o preço. */
  modelo: string | null | undefined;
  /** Estimativa de tokens da chamada. */
  tokens: ConsumoTokens;
  /** True quando o provedor é local (Ollama) — consome, mas não fatura. */
  local?: boolean;
  agente?: string;
  etapa?: string;
}

/**
 * Contexto de uma decisão de guardrail.
 *
 * Campos não aplicáveis vão como `null` EXPLÍCITO, nunca como 0 ou string
 * vazia: a diferença entre "não se aplica" e "vale zero" é justamente o que o
 * modo estrito protege. Ver `custoProjetado: null` = custo desconhecido.
 */
export interface ContextoDecisao {
  /** Identificador da tarefa/execução lógica (tarefa_pipeline.id). */
  runId?: string | null;
  /** Execução-pai na auditoria (execucao_agente.id). */
  execucaoPaiId?: string | null;
  /** Jornada de produto: cliente_parceiro | parceiro_cliente | prospeccao. */
  jornada?: string | null;
  agente?: string | null;
  etapa?: string | null;
  provedor?: string | null;
  modelo?: string | null;
  /** Natureza da operação — separa gasto de LLM de gasto de ferramenta. */
  tipoOperacao?: "llm" | "web_search" | "scraping" | "embeddings" | null;
  /** Número da tentativa (1 = primeira). */
  tentativa?: number | null;
}

export interface RegistroBloqueio extends ContextoDecisao {
  motivo: MotivoBloqueio;
  detalhe: string;
  ferramenta?: FerramentaLimitada | null;
  custoAtual: number;
  custoProjetado: number | null;
  limite: number;
  /** Contadores no instante da decisão — respondem "por que parou aqui?". */
  chamadasLlm: number;
  buscasWeb: number;
  scrapes: number;
  candidatos: number | null;
  decisao: "bloqueado";
  momento: string;
}

/**
 * Orçamento de UMA execução de pipeline.
 *
 * Instanciado por execução: o estado (custo acumulado, contadores) vive aqui,
 * não em variável global — duas execuções simultâneas não se contaminam.
 */
export class OrcamentoExecucao {
  private custoAcumulado = 0;
  private chamadasLlm = 0;
  private ultimoCandidatos: number | null = null;
  private readonly usoFerramenta = new Map<FerramentaLimitada, number>();
  private readonly bloqueios: RegistroBloqueio[] = [];
  readonly limites: LimitesOrcamento;
  /** Contexto fixo da execução (run, pai, jornada), herdado por cada decisão. */
  readonly contexto: ContextoDecisao;

  constructor(limites?: Partial<LimitesOrcamento>, contexto: ContextoDecisao = {}) {
    this.limites = { ...limitesPadrao(), ...limites };
    this.contexto = contexto;
  }

  get custoAtual(): number {
    return Math.round(this.custoAcumulado * 1_000_000) / 1_000_000;
  }

  get totalChamadasLlm(): number {
    return this.chamadasLlm;
  }

  chamadasDe(ferramenta: FerramentaLimitada): number {
    return this.usoFerramenta.get(ferramenta) ?? 0;
  }

  /** Bloqueios registrados nesta execução — vão para a telemetria. */
  get historicoBloqueios(): readonly RegistroBloqueio[] {
    return this.bloqueios;
  }

  /** True quando a execução foi interrompida por orçamento. */
  get foiBloqueada(): boolean {
    return this.bloqueios.length > 0;
  }

  /** O motivo do primeiro bloqueio — o que de fato interrompeu a execução. */
  get motivoPrincipal(): MotivoBloqueio | undefined {
    return this.bloqueios[0]?.motivo;
  }

  /**
   * Registra a negativa com o contexto completo da decisão.
   *
   * Os contadores são capturados NO INSTANTE do bloqueio: sem eles, a pergunta
   * "por que essa execução parou aqui?" só teria como resposta o motivo, não a
   * situação que o produziu.
   */
  private negar(
    registro: Omit<
      RegistroBloqueio,
      "momento" | "decisao" | "chamadasLlm" | "buscasWeb" | "scrapes" | "candidatos"
    >
  ): Autorizacao {
    const completo: RegistroBloqueio = {
      // Contexto fixo da execução primeiro; o da decisão específica sobrescreve.
      ...this.contexto,
      ...registro,
      chamadasLlm: this.chamadasLlm,
      buscasWeb: this.chamadasDe("web_search"),
      scrapes: this.chamadasDe("firecrawl_scrape"),
      candidatos: this.ultimoCandidatos,
      decisao: "bloqueado",
      momento: new Date().toISOString(),
    };
    this.bloqueios.push(completo);
    return {
      permitido: false,
      motivo: completo.motivo,
      detalhe: completo.detalhe,
      custoAtual: this.custoAtual,
      custoProjetado: completo.custoProjetado,
      limite: completo.limite,
    };
  }

  /**
   * Autoriza (ou não) uma chamada de LLM ANTES de ela acontecer.
   *
   * Ordem das verificações é deliberada: o kill switch vem primeiro porque é a
   * proteção mais forte — não adianta o orçamento permitir se providers pagos
   * estão desligados.
   */
  autorizarLlm(op: OperacaoLlm): Autorizacao {
    const local = op.local ?? false;

    // 1. Kill switch — só afeta operação paga; local segue livre.
    if (!local && !this.limites.providersPagosHabilitados) {
      return this.negar({
        motivo: "paid_providers_disabled",
        detalhe:
          "Providers pagos desabilitados (AI_PAID_PROVIDERS_ENABLED=false). " +
          "A chamada não foi realizada, mesmo havendo chave no ambiente.",
        agente: op.agente,
        etapa: op.etapa,
        modelo: op.modelo ?? null,
        tipoOperacao: "llm",
        custoAtual: this.custoAtual,
        custoProjetado: null,
        limite: 0,
      });
    }

    // 2. Teto de chamadas — protege contra laço que dispara inferência sem fim.
    if (this.chamadasLlm >= this.limites.maxChamadasLlm) {
      return this.negar({
        motivo: "llm_call_limit",
        detalhe: `Limite de ${this.limites.maxChamadasLlm} chamada(s) de LLM por execução atingido.`,
        agente: op.agente,
        etapa: op.etapa,
        modelo: op.modelo ?? null,
        tipoOperacao: "llm",
        custoAtual: this.custoAtual,
        custoProjetado: null,
        limite: this.limites.maxChamadasLlm,
      });
    }

    // 3. Provedor local: consome tokens, não fatura. Segue sem checar orçamento.
    if (local) {
      return {
        permitido: true,
        custoAtual: this.custoAtual,
        custoProjetado: 0,
        limite: this.limites.custoMaximoUsd,
      };
    }

    // 4. Custo desconhecido em modo estrito. `null` NÃO é gratuito: é "não sei
    //    quanto custa". Deixar passar seria assinar cheque em branco.
    const projetado = estimarCusto(op.modelo, op.tokens);
    if (projetado === null) {
      if (this.limites.modoEstrito) {
        return this.negar({
          motivo: "cost_unknown",
          detalhe:
            `Custo não estimável para o modelo "${op.modelo ?? "(não informado)"}" ` +
            "e o modo estrito está ativo. Cadastre o preço em shared/custo.ts " +
            "ou desative AI_STRICT_COST_MODE em desenvolvimento.",
          agente: op.agente,
          etapa: op.etapa,
          modelo: op.modelo ?? null,
          tipoOperacao: "llm",
          custoAtual: this.custoAtual,
          custoProjetado: null,
          limite: this.limites.custoMaximoUsd,
        });
      }
      // Fora do modo estrito, permite mas não debita — e o bloqueio não é
      // registrado, porque não houve bloqueio.
      return {
        permitido: true,
        custoAtual: this.custoAtual,
        custoProjetado: null,
        limite: this.limites.custoMaximoUsd,
      };
    }

    // 5. Orçamento: a projeção considera o que JÁ foi gasto mais esta operação.
    if (this.custoAcumulado + projetado > this.limites.custoMaximoUsd) {
      return this.negar({
        motivo: "execution_cost_limit",
        detalhe:
          `Custo atual ${this.custoAtual.toFixed(6)} + estimado ${projetado.toFixed(6)} ` +
          `excede o teto de ${this.limites.custoMaximoUsd.toFixed(6)} USD por execução.`,
        agente: op.agente,
        etapa: op.etapa,
        modelo: op.modelo ?? null,
        tipoOperacao: "llm",
        custoAtual: this.custoAtual,
        custoProjetado: projetado,
        limite: this.limites.custoMaximoUsd,
      });
    }

    return {
      permitido: true,
      custoAtual: this.custoAtual,
      custoProjetado: projetado,
      limite: this.limites.custoMaximoUsd,
    };
  }

  /**
   * Debita o consumo REAL após a operação. Separado da autorização de
   * propósito: o que se estima antes raramente é o que se gasta depois, e o
   * acumulado precisa refletir o real.
   */
  registrarConsumoLlm(modelo: string | null | undefined, tokens: ConsumoTokens, local = false): void {
    this.chamadasLlm += 1;
    if (local) return;
    const custo = estimarCusto(modelo, tokens);
    if (custo !== null) this.custoAcumulado += custo;
  }

  /** Autoriza uma chamada de ferramenta externa ANTES de ela acontecer. */
  autorizarFerramenta(ferramenta: FerramentaLimitada, opcoes?: { paga?: boolean; agente?: string; etapa?: string }): Autorizacao {
    const paga = opcoes?.paga ?? ferramenta !== "web_search";
    const usadas = this.chamadasDe(ferramenta);

    const limite =
      ferramenta === "web_search"
        ? this.limites.maxBuscasWeb
        : ferramenta === "embeddings"
          ? this.limites.maxScrapes
          : this.limites.maxScrapes;

    const tipoOperacao =
      ferramenta === "web_search" || ferramenta === "firecrawl_search"
        ? ("web_search" as const)
        : ferramenta === "embeddings"
          ? ("embeddings" as const)
          : ("scraping" as const);

    if (paga && !this.limites.providersPagosHabilitados) {
      return this.negar({
        motivo: "paid_providers_disabled",
        detalhe: `Ferramenta paga "${ferramenta}" bloqueada: providers pagos desabilitados.`,
        ferramenta,
        tipoOperacao,
        agente: opcoes?.agente,
        etapa: opcoes?.etapa,
        custoAtual: this.custoAtual,
        custoProjetado: null,
        limite: 0,
      });
    }

    if (usadas >= limite) {
      const motivo: MotivoBloqueio = ferramenta === "web_search" ? "web_search_limit" : "scrape_limit";
      return this.negar({
        motivo,
        detalhe: `Limite de ${limite} chamada(s) de "${ferramenta}" por execução atingido.`,
        ferramenta,
        tipoOperacao,
        agente: opcoes?.agente,
        etapa: opcoes?.etapa,
        custoAtual: this.custoAtual,
        custoProjetado: null,
        limite,
      });
    }

    return {
      permitido: true,
      custoAtual: this.custoAtual,
      custoProjetado: null,
      limite,
    };
  }

  /** Debita o uso real de uma ferramenta. */
  registrarUsoFerramenta(ferramenta: FerramentaLimitada, chamadas = 1, custoUsd?: number | null): void {
    this.usoFerramenta.set(ferramenta, this.chamadasDe(ferramenta) + chamadas);
    if (typeof custoUsd === "number") this.custoAcumulado += custoUsd;
  }

  /**
   * Corta a lista de candidatos ao teto configurado.
   *
   * É a proteção contra "candidate explosion": o reasoning gasta uma chamada de
   * LLM POR CANDIDATO, então uma base de 500 marcas sem corte viraria 500
   * chamadas. O pré-filtro (SQL, embeddings, heurística) decide QUAIS passam;
   * este corte garante QUANTOS — a proteção não depende do pré-filtro estar bom.
   */
  limitarCandidatos<T>(candidatos: T[]): {
    selecionados: T[];
    cortados: number;
    recebidos: number;
    permitidos: number;
    limite: number;
  } {
    const teto = this.limites.maxCandidatosReasoning;
    const recebidos = candidatos.length;
    this.ultimoCandidatos = recebidos;

    // Corte determinístico: preserva a ordem de entrada. O pré-filtro decide
    // QUAIS candidatos merecem passar; este corte decide QUANTOS cabem no
    // orçamento — a proteção não depende do pré-filtro estar bom.
    const selecionados = recebidos <= teto ? candidatos : candidatos.slice(0, teto);
    return {
      selecionados,
      cortados: recebidos - selecionados.length,
      recebidos,
      permitidos: selecionados.length,
      limite: teto,
    };
  }

  /** Resumo para telemetria e para o showcase. */
  resumo() {
    return {
      custo_realizado_usd: this.custoAtual,
      chamadas_llm: this.chamadasLlm,
      uso_ferramentas: Object.fromEntries(this.usoFerramenta),
      bloqueios: this.bloqueios.length,
      motivo_principal: this.motivoPrincipal ?? null,
      limites: this.limites,
    };
  }
}

// -----------------------------------------------------------------------------
// Retry policy
// -----------------------------------------------------------------------------

/** Classificação de uma falha, para decidir se vale repetir. */
export type ClasseErro = "temporario" | "permanente" | "orcamento" | "validacao" | "human_gate";

/**
 * Classifica um erro. Conservador por construção: o que não é reconhecido como
 * temporário é tratado como permanente — repetir um erro permanente gasta
 * dinheiro sem chance de sucesso.
 */
export function classificarErro(erro: unknown): ClasseErro {
  if (erro instanceof OrcamentoExcedidoError) return "orcamento";

  const mensagem = erro instanceof Error ? erro.message.toLowerCase() : String(erro).toLowerCase();

  if (/human gate|rejeit/.test(mensagem)) return "human_gate";
  if (/valida|schema|obrigat|inválid|invalid/.test(mensagem)) return "validacao";
  if (/timeout|não respondeu|tempo limite|econnreset|etimedout|socket hang up|network|rede|fetch failed|502|503|504|429/.test(mensagem)) {
    return "temporario";
  }
  return "permanente";
}

/**
 * Decide se uma etapa pode ser repetida.
 *
 * Só erro temporário é repetido. Orçamento excedido, custo desconhecido em modo
 * estrito, validação e Human Gate NUNCA repetem: repetir não muda o desfecho e,
 * no caso de orçamento, gastaria de novo exatamente o que se quis evitar.
 */
export function podeRepetir(
  erro: unknown,
  tentativaAtual: number,
  maxTentativas = env.maxRetriesPerStep
): boolean {
  if (tentativaAtual >= maxTentativas) return false;
  return classificarErro(erro) === "temporario";
}

/** Backoff exponencial simples (sem fila, sem scheduler). */
export function atrasoBackoffMs(tentativa: number, baseMs = 500): number {
  return Math.min(baseMs * 2 ** Math.max(0, tentativa - 1), 8_000);
}

/** Erro lançado quando o guardrail interrompe a execução. */
export class OrcamentoExcedidoError extends Error {
  readonly motivo: MotivoBloqueio;
  readonly autorizacao: Autorizacao;

  constructor(autorizacao: Autorizacao) {
    super(autorizacao.detalhe ?? "Operação bloqueada pelo guardrail de custo.");
    this.name = "OrcamentoExcedidoError";
    this.motivo = autorizacao.motivo ?? "execution_cost_limit";
    this.autorizacao = autorizacao;
  }
}
