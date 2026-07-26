import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";

// -----------------------------------------------------------------------------
// Cliente LLM plugável — fundação compartilhada de todos os agentes de IA.
//
// Provedor: OpenAI (Chat Completions via REST/fetch — sem SDK, para não somar
// dependência). Quando NÃO há OPENAI_API_KEY (ou AI_MOCK=true), roda em MODO
// MOCK: um stub determinístico fornecido por quem chama. Isso deixa todo o
// pipeline de agentes desenvolvível e testável sem chave nem custo.
//
// Contrato: sempre pedimos JSON (response_format json_object) e devolvemos o
// objeto já parseado e validado por quem chama (com Zod, na camada do agente).
// -----------------------------------------------------------------------------

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
}

export interface ResultadoLLM<T> {
  dados: T;
  /** "openai" quando veio da API real; "mock" quando do stub. */
  origem: "openai" | "mock";
  /** Tokens consumidos (só no modo real). */
  tokens?: { entrada: number; saida: number };
}

/** True quando os agentes devem usar o stub (sem chave ou AI_MOCK). */
export function emModoMock(): boolean {
  return env.aiMock;
}

/**
 * Executa uma chamada de LLM que retorna JSON. Em modo mock, devolve o stub
 * determinístico sem tocar em rede. A validação do formato fica com o chamador.
 */
export async function chamarLLMJson<T>(opcoes: OpcoesLLM<T>): Promise<ResultadoLLM<T>> {
  if (emModoMock()) {
    return { dados: opcoes.mock(opcoes.mensagens), origem: "mock" };
  }

  const modelo = opcoes.modelo ?? env.openaiModel;
  const corpo = {
    model: modelo,
    messages: opcoes.mensagens,
    temperature: opcoes.temperatura ?? 0.2,
    response_format: { type: "json_object" as const },
  };

  let resposta: Response;
  try {
    resposta = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify(corpo),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao chamar a OpenAI");
    throw new Error("Não foi possível contatar o provedor de IA.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe }, "OpenAI retornou erro");
    throw new Error(`Provedor de IA retornou ${resposta.status}.`);
  }

  const json = (await resposta.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const conteudo = json.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("Resposta da IA veio vazia.");

  let dados: T;
  try {
    dados = JSON.parse(conteudo) as T;
  } catch {
    throw new Error("Resposta da IA não é um JSON válido.");
  }

  return {
    dados,
    origem: "openai",
    tokens: {
      entrada: json.usage?.prompt_tokens ?? 0,
      saida: json.usage?.completion_tokens ?? 0,
    },
  };
}
