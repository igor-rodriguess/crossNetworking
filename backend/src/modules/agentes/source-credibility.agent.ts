import {
  credibilidadeSaidaSchema,
  type AvaliarCredibilidadeInput,
  type CredibilidadeSaida,
  type NivelCredibilidade,
} from "./agentes.schema";
import type { ResultadoBusca } from "./shared/firecrawl";

// -----------------------------------------------------------------------------
// Source Credibility — parte 1 da validação (a origem é reputável?).
//
// Separado de "o fato é verdade" (Fact Verifier) e "é a mesma entidade"
// (Entity Resolver). Usa HEURÍSTICA barata e determinística — sem LLM, sem
// custo, roda sempre. A arquitetura alerta contra custo de LLM descontrolado:
// um filtro barato como este vem ANTES de qualquer raciocínio caro.
//
// Não afirma que o conteúdo é verdadeiro — só estima o quanto a FONTE merece
// confiança, pelos sinais do domínio/URL.
// -----------------------------------------------------------------------------

// TLDs que costumam indicar instituições/veículos mais confiáveis.
const TLDS_CONFIAVEIS = [".gov", ".gov.br", ".edu", ".edu.br", ".org", ".org.br"];

// Domínios de veículos/bases reconhecidos (amostra — cresce com o tempo).
const DOMINIOS_REPUTADOS = [
  "g1.globo.com", "globo.com", "estadao.com.br", "folha.uol.com.br", "valor.globo.com",
  "exame.com", "forbes.com.br", "meioemensagem.com.br", "propmark.com.br",
  "reuters.com", "bloomberg.com", "linkedin.com", "gov.br",
];

// Padrões que indicam baixa qualidade / conteúdo não confiável.
const PADROES_BAIXA = [/blogspot\./i, /wordpress\.com/i, /\.tk$/i, /\.xyz$/i, /forum/i, /reddit\.com/i];

function nivelDoScore(score: number): NivelCredibilidade {
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

/** Pontua a credibilidade de uma única fonte por sinais heurísticos. */
function avaliarUm(r: ResultadoBusca): { score: number; nivel: NivelCredibilidade; sinais: string[] } {
  const sinais: string[] = [];
  let score = 50; // base neutra

  const url = r.url ?? "";
  const dominio = (r.fonte || "").toLowerCase();

  // HTTPS
  if (url.startsWith("https://")) {
    score += 8;
    sinais.push("HTTPS");
  } else if (url.startsWith("http://")) {
    score -= 10;
    sinais.push("sem HTTPS");
  }

  // Domínio reputado (match forte)
  if (DOMINIOS_REPUTADOS.some((d) => dominio.includes(d))) {
    score += 30;
    sinais.push("veículo/base reconhecido");
  }

  // TLD confiável
  if (TLDS_CONFIAVEIS.some((t) => dominio.endsWith(t))) {
    score += 15;
    sinais.push("domínio institucional");
  }

  // Padrões de baixa qualidade
  if (PADROES_BAIXA.some((p) => p.test(dominio) || p.test(url))) {
    score -= 25;
    sinais.push("padrão de baixa qualidade");
  }

  // Sinal do modo mock (fontes de exemplo não são reais)
  if (dominio.includes("exemplo")) {
    score -= 10;
    sinais.push("fonte de exemplo (modo mock)");
  }

  // Domínio muito curto/ausente
  if (!dominio || dominio.length < 4) {
    score -= 15;
    sinais.push("origem indefinida");
  }

  score = Math.max(0, Math.min(100, score));
  if (sinais.length === 0) sinais.push("sinais neutros");
  return { score, nivel: nivelDoScore(score), sinais };
}

/** Extrai a lista de resultados da entrada (da coleta ou da lista solta). */
function resultadosDaEntrada(input: AvaliarCredibilidadeInput): ResultadoBusca[] {
  if (input.resultados && input.resultados.length > 0) return input.resultados;
  if (input.coleta) return input.coleta.coletas.flatMap((c) => c.resultados);
  return [];
}

export interface ResultadoCredibilidadeAgente {
  saida: CredibilidadeSaida;
}

/** Avalia a credibilidade das fontes coletadas. Determinístico — sempre roda. */
export function avaliarCredibilidade(input: AvaliarCredibilidadeInput): ResultadoCredibilidadeAgente {
  const resultados = resultadosDaEntrada(input);

  const avaliacoes = resultados.map((r) => {
    const { score, nivel, sinais } = avaliarUm(r);
    return { titulo: r.titulo, url: r.url, fonte: r.fonte, score, nivel, sinais };
  });

  const resumo = {
    alta: avaliacoes.filter((a) => a.nivel === "alta").length,
    media: avaliacoes.filter((a) => a.nivel === "media").length,
    baixa: avaliacoes.filter((a) => a.nivel === "baixa").length,
  };

  const saida = credibilidadeSaidaSchema.parse({ total: avaliacoes.length, resumo, avaliacoes });
  return { saida };
}
