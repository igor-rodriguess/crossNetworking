import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";

// -----------------------------------------------------------------------------
// Busca web plugável — a fonte de coleta dos agentes (Source Collector).
//
// Provedor: DuckDuckGo (endpoint HTML `html.duckduckgo.com/html/`, GRÁTIS e sem
// chave). Fazemos a requisição e extraímos os resultados do HTML. Quando
// AI_MOCK está ligado, usa um stub determinístico para rodar offline em testes.
//
// Devolve resultados BRUTOS (título, url, trecho). Não interpreta nem valida —
// isso é responsabilidade dos agentes seguintes (Credibility/Fact/Extractor).
// -----------------------------------------------------------------------------

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface ResultadoBusca {
  titulo: string;
  url: string;
  // Trecho/resumo do conteúdo encontrado.
  trecho: string;
  // De onde veio (domínio ou origem).
  fonte: string;
}

/** True quando a busca deve usar o stub. DuckDuckGo não precisa de chave, então
 *  só cai em mock quando AI_MOCK=true é pedido explicitamente (ex.: testes/CI). */
export function buscaEmModoMock(): boolean {
  return env.forcarMock;
}

// --- Stub determinístico (modo mock/offline) ---------------------------------
function buscaMock(termo: string, limite: number): ResultadoBusca[] {
  const base = termo.trim().slice(0, 60);
  const slug = encodeURIComponent(base.toLowerCase().replace(/\s+/g, "-"));
  const modelos: ResultadoBusca[] = [
    {
      titulo: `${base} — panorama e principais players`,
      url: `https://exemplo-setorial.com/${slug}`,
      trecho: `Visão geral sobre "${base}", com os atores mais relevantes do setor. (resultado MOCK)`,
      fonte: "exemplo-setorial.com",
    },
    {
      titulo: `Notícia: novidades sobre ${base}`,
      url: `https://noticias-exemplo.com/2026/${slug}`,
      trecho: `Cobertura recente relacionada a "${base}", incluindo parcerias anunciadas. (resultado MOCK)`,
      fonte: "noticias-exemplo.com",
    },
    {
      titulo: `Análise de mercado — ${base}`,
      url: `https://relatorios-exemplo.com/${slug}`,
      trecho: `Dados e tendências de "${base}": tamanho de mercado, público, oportunidades. (resultado MOCK)`,
      fonte: "relatorios-exemplo.com",
    },
  ];
  return modelos.slice(0, Math.max(1, Math.min(limite, modelos.length)));
}

// --- Parsing do HTML do DuckDuckGo -------------------------------------------
// O endpoint /html/ devolve resultados em blocos com class="result__a" (link do
// título) e class="result__snippet" (trecho). Os links vêm embrulhados num
// redirecionador `//duckduckgo.com/l/?uddg=<url-encoded>` — desembrulhamos.

function decodificarEntidades(txt: string): string {
  return txt
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function tirarTags(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]+>/g, "")).trim();
}

function desembrulharUrl(href: string): string {
  // Ex.: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fx&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fallback abaixo */
    }
  }
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

function extrairResultadosHtml(html: string, limite: number): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = [];
  // Cada resultado tem um <a class="result__a" href="...">título</a> seguido,
  // mais adiante, de <a class="result__snippet">trecho</a>. Percorremos os
  // links de título e, para cada um, pegamos o snippet mais próximo à frente.
  const reLink = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const reSnippet = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets: { idx: number; texto: string }[] = [];
  let ms: RegExpExecArray | null;
  while ((ms = reSnippet.exec(html)) !== null) {
    snippets.push({ idx: ms.index, texto: tirarTags(ms[1]) });
  }

  let ml: RegExpExecArray | null;
  while ((ml = reLink.exec(html)) !== null && resultados.length < limite) {
    const href = desembrulharUrl(ml[1]);
    const titulo = tirarTags(ml[2]);
    if (!href || !titulo) continue;
    // snippet mais próximo depois deste link
    const linkIdx = ml.index;
    const snip = snippets.find((s) => s.idx > linkIdx);
    let fonte = href;
    try {
      fonte = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      /* url inválida — mantém como está */
    }
    resultados.push({ titulo, url: href, trecho: (snip?.texto ?? "").slice(0, 500), fonte });
  }
  return resultados;
}

async function buscaDuckDuckGo(termo: string, limite: number): Promise<ResultadoBusca[]> {
  let resposta: Response;
  try {
    resposta = await fetch(DDG_HTML_URL, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Sem um User-Agent de navegador, o DuckDuckGo pode devolver página vazia.
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ q: termo, kl: "br-pt" }).toString(),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao buscar no DuckDuckGo");
    throw new Error("Não foi possível contatar o provedor de busca.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe: detalhe.slice(0, 200) }, "DuckDuckGo retornou erro");
    throw new Error(`Provedor de busca retornou ${resposta.status}.`);
  }

  const resultados = extrairResultadosHtml(await resposta.text(), limite);
  if (resultados.length) return resultados;

  // O POST do endpoint HTML ocasionalmente responde 200 com uma página sem
  // cards de resultado (proteção anti-bot do DuckDuckGo). Repetimos via GET,
  // no mesmo provedor e sem trocar a política de fontes do agente.
  try {
    const url = new URL(DDG_HTML_URL);
    url.searchParams.set("q", termo);
    url.searchParams.set("kl", "br-pt");
    const alternativa = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!alternativa.ok) return resultados;
    return extrairResultadosHtml(await alternativa.text(), limite);
  } catch (causa) {
    logger.warn({ causa }, "Fallback GET do DuckDuckGo indisponível");
    return resultados;
  }
}

interface FirecrawlResultadoBusca {
  title?: string;
  description?: string;
  url?: string;
}

interface FirecrawlBuscaResposta {
  success?: boolean;
  data?: { web?: FirecrawlResultadoBusca[] };
}

/**
 * Segundo provedor de descoberta. O Firecrawl entra somente quando o
 * DuckDuckGo não entrega resultados: ele pesquisa a web, mas não substitui a
 * etapa posterior de extração, credibilidade e validação do candidato.
 */
async function buscaFirecrawl(termo: string, limite: number): Promise<ResultadoBusca[]> {
  if (env.extracaoMock || !env.firecrawlApiKey) return [];

  try {
    const resposta = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        query: termo,
        limit: Math.max(1, Math.min(limite, 10)),
        sources: ["web"],
        country: "BR",
        timeout: 15_000,
      }),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      logger.warn(
        { status: resposta.status, detalhe: detalhe.slice(0, 240) },
        "Fallback de busca Firecrawl retornou erro"
      );
      return [];
    }

    const json = (await resposta.json()) as FirecrawlBuscaResposta;
    return (json.data?.web ?? [])
      .flatMap((resultado): ResultadoBusca[] => {
        if (!resultado.url || !resultado.title) return [];
        let fonte = resultado.url;
        try {
          fonte = new URL(resultado.url).hostname.replace(/^www\./, "");
        } catch {
          // URL inválida: preserva o valor para que as etapas seguintes a descartem.
        }
        return [{
          titulo: resultado.title.trim(),
          url: resultado.url,
          trecho: (resultado.description ?? "").trim().slice(0, 500),
          fonte,
        }];
      })
      .slice(0, limite);
  } catch (causa) {
    logger.warn({ causa }, "Fallback de busca Firecrawl indisponível");
    return [];
  }
}

export interface ResultadoColeta {
  resultados: ResultadoBusca[];
  origem: "duckduckgo" | "firecrawl" | "mock";
}

/** Busca resultados para um termo. Em modo mock, não toca em rede. */
export async function buscar(termo: string, limite = 3): Promise<ResultadoColeta> {
  if (buscaEmModoMock()) {
    return { resultados: buscaMock(termo, limite), origem: "mock" };
  }
  const resultadosDuckDuckGo = await buscaDuckDuckGo(termo, limite);
  if (resultadosDuckDuckGo.length > 0) {
    return { resultados: resultadosDuckDuckGo, origem: "duckduckgo" };
  }

  const resultadosFirecrawl = await buscaFirecrawl(termo, limite);
  return {
    resultados: resultadosFirecrawl,
    origem: resultadosFirecrawl.length > 0 ? "firecrawl" : "duckduckgo",
  };
}
