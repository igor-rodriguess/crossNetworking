import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";

// -----------------------------------------------------------------------------
// Cliente de busca web plugável — a fonte de coleta dos agentes.
//
// Provedor: Firecrawl (endpoint /v1/search — busca + scrape em uma chamada,
// via REST/fetch, sem SDK). Quando NÃO há FIRECRAWL_API_KEY (ou AI_MOCK), roda
// em MODO MOCK: gera resultados determinísticos plausíveis a partir do termo,
// para exercitar o pipeline de coleta sem chave nem custo.
//
// Devolve resultados BRUTOS (título, url, trecho). Não interpreta nem valida —
// isso é responsabilidade dos agentes seguintes (Credibility/Fact/Extractor).
// -----------------------------------------------------------------------------

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";

export interface ResultadoBusca {
  titulo: string;
  url: string;
  // Trecho/resumo do conteúdo encontrado.
  trecho: string;
  // De onde veio (domínio ou origem).
  fonte: string;
}

/** True quando a coleta deve usar o stub (sem chave Firecrawl ou AI_MOCK). */
export function coletaEmModoMock(): boolean {
  return env.aiMock || !env.firecrawlApiKey;
}

// --- Stub determinístico (modo mock) -----------------------------------------
// Gera resultados coerentes a partir do termo, para o pipeline rodar sem chave.
function buscaMock(termo: string, limite: number): ResultadoBusca[] {
  const base = termo.trim().slice(0, 60);
  const slug = encodeURIComponent(base.toLowerCase().replace(/\s+/g, "-"));
  const modelos = [
    {
      titulo: `${base} — panorama e principais players`,
      url: `https://exemplo-setorial.com/${slug}`,
      trecho: `Visão geral sobre "${base}", com os atores mais relevantes do setor e movimentos recentes de mercado. (resultado MOCK — sem chave Firecrawl)`,
      fonte: "exemplo-setorial.com",
    },
    {
      titulo: `Notícia: novidades sobre ${base}`,
      url: `https://noticias-exemplo.com/2026/${slug}`,
      trecho: `Cobertura recente relacionada a "${base}", incluindo lançamentos e parcerias anunciadas. (resultado MOCK)`,
      fonte: "noticias-exemplo.com",
    },
    {
      titulo: `Análise de mercado — ${base}`,
      url: `https://relatorios-exemplo.com/${slug}`,
      trecho: `Dados e tendências de "${base}": tamanho de mercado, público e oportunidades. (resultado MOCK)`,
      fonte: "relatorios-exemplo.com",
    },
  ];
  return modelos.slice(0, Math.max(1, Math.min(limite, modelos.length)));
}

// --- Busca real (Firecrawl) --------------------------------------------------
interface FirecrawlSearchResposta {
  data?: { title?: string; url?: string; description?: string; markdown?: string }[];
}

async function buscaFirecrawl(termo: string, limite: number): Promise<ResultadoBusca[]> {
  let resposta: Response;
  try {
    resposta = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.firecrawlApiKey}`,
      },
      body: JSON.stringify({ query: termo, limit: limite }),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao chamar o Firecrawl");
    throw new Error("Não foi possível contatar o provedor de busca.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe }, "Firecrawl retornou erro");
    throw new Error(`Provedor de busca retornou ${resposta.status}.`);
  }

  const json = (await resposta.json()) as FirecrawlSearchResposta;
  const itens = json.data ?? [];
  return itens.map((it) => {
    let fonte = it.url ?? "";
    try {
      fonte = it.url ? new URL(it.url).hostname : "";
    } catch {
      /* url inválida — mantém como está */
    }
    return {
      titulo: it.title ?? "(sem título)",
      url: it.url ?? "",
      trecho: (it.description ?? it.markdown ?? "").slice(0, 500),
      fonte,
    };
  });
}

export interface ResultadoColeta {
  resultados: ResultadoBusca[];
  origem: "firecrawl" | "mock";
}

/** Busca resultados para um termo. Em modo mock, não toca em rede. */
export async function buscar(termo: string, limite = 3): Promise<ResultadoColeta> {
  if (coletaEmModoMock()) {
    return { resultados: buscaMock(termo, limite), origem: "mock" };
  }
  return { resultados: await buscaFirecrawl(termo, limite), origem: "firecrawl" };
}
