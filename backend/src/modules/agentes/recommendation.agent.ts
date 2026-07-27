import {
  recomendacaoSaidaSchema,
  type AnaliseCrossabilitySaida,
  type NivelCompat,
  type RecomendacaoSaida,
  type RecomendarParceirosInput,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Recommendation — o SEXTO nó (Planning -> ... -> Reason -> RECOMMEND).
//
// Recebe a análise Crossability de vários candidatos e devolve o ranking:
// quem recomendar primeiro. Score derivado das 6 dimensões, ponderado pela
// confiança da análise. Determinístico — sem LLM, sem custo. É um RASCUNHO de
// priorização; a decisão final é humana (Human Gate).
// -----------------------------------------------------------------------------

const PESO_NIVEL: Record<NivelCompat, number> = { alta: 100, media: 55, baixa: 15 };

const DIMENSOES = [
  ["compatibilidade_publicos", "públicos"],
  ["compatibilidade_territorios", "territórios"],
  ["complementaridade_ativos", "ativos"],
  ["sinergias", "sinergias"],
  ["fit_estrategico", "fit estratégico"],
  ["momento_estrategico", "momento"],
] as const;

/** Score 0..100 de uma análise: média das 6 dimensões, ajustada pela confiança. */
function calcularScore(a: AnaliseCrossabilitySaida): number {
  const soma = DIMENSOES.reduce((s, [chave]) => s + PESO_NIVEL[a[chave].nivel], 0);
  const medioDimensoes = soma / DIMENSOES.length;
  // A confiança modula: análise pouco confiável não infla o ranking.
  // Mistura 80% do mérito das dimensões com 20% da confiança declarada.
  const score = Math.round(medioDimensoes * 0.8 + a.confianca * 0.2);
  return Math.max(0, Math.min(100, score));
}

function fortalezasFraquezas(a: AnaliseCrossabilitySaida): { fortalezas: string[]; fraquezas: string[] } {
  const fortalezas: string[] = [];
  const fraquezas: string[] = [];
  for (const [chave, rotulo] of DIMENSOES) {
    if (a[chave].nivel === "alta") fortalezas.push(rotulo);
    if (a[chave].nivel === "baixa") fraquezas.push(rotulo);
  }
  return { fortalezas, fraquezas };
}

export interface ResultadoRecomendacaoAgente {
  saida: RecomendacaoSaida;
}

/** Ranqueia os candidatos pela análise Crossability. */
export function recomendarParceiros(input: RecomendarParceirosInput): ResultadoRecomendacaoAgente {
  const avaliados = input.candidatos.map((c) => {
    const score = calcularScore(c.analise);
    const { fortalezas, fraquezas } = fortalezasFraquezas(c.analise);
    return { parceiro: c.parceiro, score, recomendacao: c.analise.recomendacao, fortalezas, fraquezas };
  });

  // Ordena por score desc; empate: quem tem menos fraquezas primeiro.
  avaliados.sort((a, b) => b.score - a.score || a.fraquezas.length - b.fraquezas.length);

  const ranking = avaliados.map((a, i) => {
    const forte = a.fortalezas.length ? `forte em ${a.fortalezas.join(", ")}` : "sem dimensões de destaque";
    const fraco = a.fraquezas.length ? `; atenção a ${a.fraquezas.join(", ")}` : "";
    return {
      posicao: i + 1,
      parceiro: a.parceiro,
      score: a.score,
      recomendacao: a.recomendacao,
      fortalezas: a.fortalezas,
      fraquezas: a.fraquezas,
      justificativa: `Score ${a.score}: ${forte}${fraco}.`,
    };
  });

  const saida = recomendacaoSaidaSchema.parse({ total: ranking.length, ranking });
  return { saida };
}
