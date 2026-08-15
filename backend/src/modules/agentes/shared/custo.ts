// -----------------------------------------------------------------------------
// Estimativa de custo por execução de agente.
//
// Preço é por MODELO, não por provedor — por isso `execucao_agente.modelo`
// precisa estar preenchido para que haja estimativa. Modelo desconhecido
// devolve `null` (não estimado), nunca 0: "não sei quanto custou" é diferente
// de "custou zero", e confundir os dois subestimaria o gasto silenciosamente.
//
// Os valores abaixo são REFERÊNCIA e ficam desatualizados — provedores mudam
// preço. Enquanto não houver tabela de preços no banco, esta é a fonte única;
// revisar antes de ligar qualquer chave paga.
//
// Nenhuma chamada de rede acontece aqui: é aritmética pura, testável offline.
// -----------------------------------------------------------------------------

/** Preço em USD por 1 milhão de tokens. */
export interface PrecoModelo {
  entrada: number;
  saida: number;
  /** Preço do token de entrada servido de cache; ausente = mesmo da entrada. */
  cache?: number;
}

/**
 * Tabela de referência (USD por 1M de tokens), conferida em 2026-08.
 * Modelos locais (Ollama) custam 0 por token — a máquina já está paga.
 */
export const PRECOS_POR_MODELO: Record<string, PrecoModelo> = {
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6, cache: 0.075 },
  "gpt-4o": { entrada: 2.5, saida: 10, cache: 1.25 },
  "deepseek-chat": { entrada: 0.27, saida: 1.1, cache: 0.07 },
  "text-embedding-3-small": { entrada: 0.02, saida: 0 },
  "text-embedding-3-large": { entrada: 0.13, saida: 0 },
};

/** Modelos locais: consumo real de tokens, custo marginal zero. */
const PREFIXOS_LOCAIS = ["qwen", "llama", "mistral", "phi", "gemma", "deepseek-r1"];

export interface ConsumoTokens {
  entrada: number;
  saida: number;
  cache?: number;
}

/**
 * Custo estimado em USD. Devolve `null` quando o modelo é desconhecido ou não
 * informado — quem persiste grava NULL, sinalizando "não estimado".
 */
export function estimarCusto(
  modelo: string | null | undefined,
  tokens: ConsumoTokens | null | undefined
): number | null {
  if (!modelo || !tokens) return null;

  const normalizado = modelo.toLowerCase().trim();
  if (PREFIXOS_LOCAIS.some((p) => normalizado.startsWith(p))) return 0;

  const preco = PRECOS_POR_MODELO[normalizado];
  if (!preco) return null;

  // Tokens de cache já estão contidos em `entrada` (é assim que OpenAI e
  // DeepSeek reportam). Cobrar os dois contaria a mesma entrada duas vezes.
  const cache = Math.min(tokens.cache ?? 0, tokens.entrada);
  const entradaPlena = Math.max(0, tokens.entrada - cache);

  const custo =
    (entradaPlena / 1_000_000) * preco.entrada +
    (cache / 1_000_000) * (preco.cache ?? preco.entrada) +
    (tokens.saida / 1_000_000) * preco.saida;

  // 6 casas: o mesmo grão de NUMERIC(12,6) na coluna.
  return Math.round(custo * 1_000_000) / 1_000_000;
}
