import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Cliente LLM plugável — fundação compartilhada de todos os agentes de IA.
//
// Provedores: OpenAI e DeepSeek (Chat Completions via REST/fetch — sem SDK, para
// não somar dependência). A API do DeepSeek é compatível com o formato da OpenAI
// (mesmo endpoint, mesmo response_format json_object), então só muda a URL base,
// a chave e o modelo — decididos por env.aiProvider. Quando o provedor
// selecionado não tem chave (ou AI_MOCK=true), roda em MODO MOCK: um stub
// determinístico fornecido por quem chama, deixando o pipeline testável sem
// chave nem custo.
//
// Contrato: sempre pedimos JSON (response_format json_object) e devolvemos o
// objeto já parseado e validado por quem chama (com Zod, na camada do agente).
// -----------------------------------------------------------------------------

const URLS_POR_PROVEDOR = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
} as const;

export interface MensagemLLM {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpcoesLLM<T> {
  /** Mensagens da conversa (system + user, tipicamente). */
  mensagens: MensagemLLM[];
  /** Fábrica do resultado MOCK — usada quando não há chave. Recebe as mensagens. */
  mock: (mensagens: MensagemLLM[]) => T;
  /** Temperatura (0 = determinístico). Padrão 0.2 para planejamento estável. */
  temperatura?: number;
  /** Modelo específico; por padrão, env.openaiModel. */
  modelo?: string;
  /** Schema Zod opcional para impor JSON estruturado no Ollama local. */
  formatoJson?: z.ZodType;
  /** Teto desta chamada. Omitido, usa env.llmTimeoutMs — nunca fica sem limite. */
  timeoutMs?: number;
  /** Força um provedor específico para um agente que não pode delegar a outro. */
  provedor?: "ollama";
}

/** De onde veio a saída de um agente LLM: um provedor real ou o stub. */
export type OrigemLLM = "openai" | "deepseek" | "ollama" | "mock" | "heuristica";

export interface ResultadoLLM<T> {
  dados: T;
  /** Provedor que atendeu ("openai"/"deepseek") ou "mock" quando do stub. */
  origem: OrigemLLM;
  /**
   * Tokens consumidos (só no modo real). `cache` conta os tokens de entrada que
   * o provedor serviu de cache — cobrados a preço menor, então precisam ser
   * separados de `entrada` para o custo estimado não ficar superdimensionado.
   */
  tokens?: { entrada: number; saida: number; cache?: number };
  /**
   * Modelo que efetivamente atendeu ("gpt-4o-mini", "qwen3:4b"). Distinto de
   * `origem`, que guarda só o provedor: o preço por token varia por modelo, não
   * por provedor, então sem este campo não há como estimar custo.
   */
  modelo?: string;
}

/** True quando os agentes devem usar o stub (sem chave ou AI_MOCK). */
export function emModoMock(): boolean {
  return env.aiMock;
}

/**
 * Carrega o modelo local em segundo plano durante a subida da API. A primeira
 * inferência de um Ollama em CPU pode levar dezenas de segundos; aquecê-lo
 * antes da interação deixa importações e pesquisas mais responsivas sem
 * bloquear a disponibilidade do servidor.
 */
export async function aquecerOllama(): Promise<void> {
  if (env.aiProvider !== "ollama" || emModoMock()) return;

  const resposta = await fetch(`${env.ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.ollamaModel,
      prompt: "Responda somente: ok",
      stream: false,
      keep_alive: "15m",
      options: { temperature: 0, num_predict: 1 },
    }),
    // Não deixa um Ollama indisponível prender a inicialização em segundo plano.
    signal: AbortSignal.timeout(60_000),
  });
  if (!resposta.ok) throw new Error(`Ollama respondeu HTTP ${resposta.status} durante o aquecimento.`);
  await resposta.text();
}

/**
 * Executa uma chamada de LLM que retorna JSON. Em modo mock, devolve o stub
 * determinístico sem tocar em rede. A validação do formato fica com o chamador.
 */
export async function chamarLLMJson<T>(opcoes: OpcoesLLM<T>): Promise<ResultadoLLM<T>> {
  if (emModoMock()) {
    return { dados: opcoes.mock(opcoes.mensagens), origem: "mock" };
  }

  const provedor = opcoes.provedor ?? env.aiProvider;

  // Kill switch, última linha de defesa. `env.aiMock` já considera o switch, mas
  // esta checagem fica junto do `fetch`: se alguém no futuro chamar este wrapper
  // por um caminho que contorne aquele cálculo, a chamada paga ainda não sai.
  // Provedor local (Ollama) não é afetado — não fatura.
  if (provedor !== "ollama" && !env.paidProvidersEnabled) {
    logger.warn(
      { provedor },
      "Chamada a provedor pago bloqueada: AI_PAID_PROVIDERS_ENABLED=false. Usando stub determinístico."
    );
    return { dados: opcoes.mock(opcoes.mensagens), origem: "mock" };
  }
  const usarFallbackLocal = provedor === "ollama";
  const fallbackLocal = (motivo: string, causa?: unknown): ResultadoLLM<T> => {
    logger.warn({ causa, provedor, motivo }, "Ollama indisponível ou lento; agente seguirá com fallback local");
    return { dados: opcoes.mock(opcoes.mensagens), origem: "mock" };
  };
  const url = provedor === "ollama" ? `${env.ollamaBaseUrl}/api/chat` : URLS_POR_PROVEDOR[provedor];
  const modeloPadrao = provedor === "ollama" ? env.ollamaModel : provedor === "deepseek" ? env.deepseekModel : env.openaiModel;
  const modelo = opcoes.modelo ?? modeloPadrao;
  const corpo = provedor === "ollama"
    ? {
        model: modelo,
        messages: opcoes.mensagens,
        stream: false,
        // Mantém o modelo local carregado entre etapas de um mesmo pipeline.
        // Evita que cada agente pague novamente o custo de inicialização.
        keep_alive: "15m",
        think: false,
          format: opcoes.formatoJson ? z.toJSONSchema(opcoes.formatoJson) : ("json" as const),
        options: { temperature: opcoes.temperatura ?? 0.2 },
      }
    : {
        model: modelo,
        messages: opcoes.mensagens,
        temperature: opcoes.temperatura ?? 0.2,
        response_format: { type: "json_object" as const },
      };

  let resposta: Response;
  const controller = new AbortController();
  // Sempre há um teto: sem ele, uma chamada travada pendura o pipeline inteiro
  // sem erro nem rastro. Quem chama pode apertar o limite; nunca removê-lo.
  const limiteMs = opcoes.timeoutMs ?? env.llmTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), limiteMs);
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provedor === "ollama" || !env.llmApiKey ? {} : { Authorization: `Bearer ${env.llmApiKey}` }),
      },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
  } catch (causa) {
    clearTimeout(timeout);
    const expirou = controller.signal.aborted;
    logger.error({ causa, provedor, limiteMs }, "Falha de rede ao chamar o provedor de IA");
    if (usarFallbackLocal) return fallbackLocal(expirou ? "tempo limite" : "falha de rede", causa);
    throw new Error(
      expirou
        ? `O provedor de IA (${provedor}/${modelo}) não respondeu em ${Math.round(limiteMs / 1000)}s.`
        : "Não foi possível contatar o provedor de IA."
    );
  }

  // O timeout continua armado: o fetch resolve nos headers, e ler o corpo de um
  // modelo lento pode demorar tanto quanto. Só desarmamos depois de ter o JSON.
  type RespostaLLM = {
    choices?: { message?: { content?: string } }[];
    message?: { content?: string };
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      // OpenAI expõe os tokens servidos de cache aqui; o DeepSeek usa o campo
      // plano `prompt_cache_hit_tokens`. Lemos os dois — ausente vira 0.
      prompt_tokens_details?: { cached_tokens?: number };
      prompt_cache_hit_tokens?: number;
    };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  let json: RespostaLLM;
  try {
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      logger.error({ status: resposta.status, detalhe, provedor }, "Provedor de IA retornou erro");
      if (usarFallbackLocal) return fallbackLocal(`HTTP ${resposta.status}`, detalhe);
      throw new Error(`Provedor de IA retornou ${resposta.status}.`);
    }
    json = (await resposta.json()) as RespostaLLM;
  } catch (causa) {
    if (usarFallbackLocal) {
      return fallbackLocal(controller.signal.aborted ? "tempo limite ao ler resposta" : "resposta inválida", causa);
    }
    throw causa;
  } finally {
    clearTimeout(timeout);
  }
  const conteudo = provedor === "ollama" ? json.message?.content : json.choices?.[0]?.message?.content;
  if (!conteudo) {
    if (usarFallbackLocal) return fallbackLocal("resposta vazia");
    throw new Error("Resposta da IA veio vazia.");
  }

  let dados: T;
  try {
    dados = JSON.parse(conteudo) as T;
  } catch {
    if (usarFallbackLocal) return fallbackLocal("JSON inválido");
    throw new Error("Resposta da IA não é um JSON válido.");
  }

  return {
    dados,
    origem: provedor,
    modelo,
    tokens: {
      entrada: json.usage?.prompt_tokens ?? json.prompt_eval_count ?? 0,
      saida: json.usage?.completion_tokens ?? json.eval_count ?? 0,
      cache:
        json.usage?.prompt_tokens_details?.cached_tokens ??
        json.usage?.prompt_cache_hit_tokens ??
        0,
    },
  };
}
