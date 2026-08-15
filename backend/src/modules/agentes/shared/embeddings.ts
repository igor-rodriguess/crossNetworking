import { createHash } from "node:crypto";
import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";

// -----------------------------------------------------------------------------
// Wrapper de embeddings plugável — a base do RAG.
//
// Provedor: OpenAI (endpoint /v1/embeddings via REST/fetch) quando há
// OPENAI_API_KEY. Sem chave (ou AI_MOCK), gera um embedding MOCK determinístico
// de 1536 dimensões por hashing de palavras — textos com palavras em comum
// ficam próximos no espaço vetorial, então a busca semântica funciona de forma
// plausível para desenvolver e testar sem chave.
//
// A dimensão (1536) casa com text-embedding-3-small e com a coluna vector(1536).
// -----------------------------------------------------------------------------

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
export const DIMENSAO_EMBEDDING = 1536;

/** True quando os embeddings devem usar o stub. Embeddings reais exigem chave
 *  OpenAI — o DeepSeek não oferece embeddings —, então isto segue
 *  `env.embeddingMock` (só é false com OPENAI_API_KEY), não `env.aiMock`. */
export function embeddingEmModoMock(): boolean {
  return env.embeddingMock;
}

// --- Mock determinístico -----------------------------------------------------
// Distribui o "peso" de cada palavra por posições estáveis do vetor (via hash).
// Palavras iguais caem sempre nas mesmas posições → similaridade de cosseno
// captura sobreposição de vocabulário. Normaliza no fim.
function embeddingMock(texto: string): number[] {
  const vetor = new Array<number>(DIMENSAO_EMBEDDING).fill(0);
  const palavras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2);

  for (const palavra of palavras) {
    // 4 posições por palavra (hash → índices estáveis), sinais alternados.
    const h = createHash("sha256").update(palavra).digest();
    for (let k = 0; k < 4; k++) {
      const idx = ((h[k * 2] << 8) | h[k * 2 + 1]) % DIMENSAO_EMBEDDING;
      const sinal = h[k * 2] % 2 === 0 ? 1 : -1;
      vetor[idx] += sinal;
    }
  }

  // Normaliza (vetor unitário) para a distância de cosseno se comportar bem.
  const norma = Math.sqrt(vetor.reduce((s, v) => s + v * v, 0)) || 1;
  return vetor.map((v) => v / norma);
}

// --- OpenAI real -------------------------------------------------------------
async function embeddingOpenAI(textos: string[]): Promise<number[][]> {
  let resposta: Response;
  try {
    resposta = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({ model: env.openaiEmbedModel, input: textos }),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao gerar embeddings na OpenAI");
    throw new Error("Não foi possível gerar os embeddings.");
  }
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe }, "OpenAI embeddings retornou erro");
    throw new Error(`Provedor de embeddings retornou ${resposta.status}.`);
  }
  const json = (await resposta.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((d) => d.embedding);
}

export interface ResultadoEmbedding {
  vetores: number[][];
  origem: "openai" | "mock";
}

/** Gera embeddings para um ou mais textos. Em modo mock, não toca em rede. */
export async function gerarEmbeddings(textos: string[]): Promise<ResultadoEmbedding> {
  if (embeddingEmModoMock()) {
    return { vetores: textos.map(embeddingMock), origem: "mock" };
  }
  // Kill switch, última linha de defesa junto do fetch. Embeddings da OpenAI são
  // cobrados por uso; `env.embeddingMock` já considera o switch, mas esta
  // checagem protege qualquer caminho futuro que contorne aquele cálculo.
  if (!env.paidProvidersEnabled) {
    logger.warn({}, "Embeddings pagos bloqueados: AI_PAID_PROVIDERS_ENABLED=false. Usando stub determinístico.");
    return { vetores: textos.map(embeddingMock), origem: "mock" };
  }
  return { vetores: await embeddingOpenAI(textos), origem: "openai" };
}

/** Serializa um vetor no formato literal que o pgvector aceita: "[a,b,c]". */
export function vetorParaSql(vetor: number[]): string {
  return `[${vetor.join(",")}]`;
}
