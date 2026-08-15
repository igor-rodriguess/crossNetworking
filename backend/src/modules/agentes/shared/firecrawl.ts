import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";

// -----------------------------------------------------------------------------
// Extração estruturada via Firecrawl — o "olho" do Information Extractor.
//
// O Firecrawl faz scrape de uma URL e, com o recurso de extração (formats:
// ["json"] + um schema JSON), usa o LLM DELE para devolver dados estruturados —
// sem precisarmos de OpenAI/DeepSeek próprios. Endpoint /v1/scrape.
//
// Também expõe scrapeMarkdown() para quando quisermos só o texto da página
// (fallback / conteúdo bruto).
//
// Sem FIRECRAWL_API_KEY (ou AI_MOCK), roda em MODO MOCK determinístico.
// -----------------------------------------------------------------------------

// A API v2 recebe os formatos estruturados diretamente no array `formats`.
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

/**
 * True quando a extração deve usar o stub.
 *
 * Cobre três situações: AI_MOCK ligado, ausência de chave Firecrawl e — desde
 * os guardrails de custo — kill switch de providers pagos desligado. O Firecrawl
 * é cobrado por página, então entra no mesmo regime das demais chamadas pagas.
 * As três funções de scraping deste arquivo passam por aqui.
 */
export function extracaoEmModoMock(): boolean {
  return env.extracaoMock || !env.paidProvidersEnabled;
}

// Schema do perfil que pedimos ao Firecrawl extrair de uma página. Alinhado ao
// perfil que o Information Extractor produz (setor/públicos/territórios/ativos/
// sinais de parceria).
const SCHEMA_PERFIL = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Nome da organização/marca principal da página" },
    setor: { type: "string", description: "Setor ou indústria de atuação" },
    publicos: {
      type: "array",
      items: { type: "string" },
      description: "Públicos-alvo / audiências atendidas",
    },
    territorios: {
      type: "array",
      items: { type: "string" },
      description: "Regiões, praças ou territórios de atuação",
    },
    ativos: {
      type: "array",
      items: { type: "string" },
      description: "Ativos de marca: eventos, canais, produtos, propriedades, patrocínios",
    },
    sinais_parceria: {
      type: "array",
      items: { type: "string" },
      description: "Sinais de abertura a parcerias, colaborações, co-marketing ou patrocínio",
    },
  },
  required: ["setor"],
} as const;

// Diferente de uma página institucional, uma matéria jornalística pode citar
// diversas marcas. Este contrato impede que o título da matéria ou o veículo
// sejam confundidos com uma candidata a parceria.
const SCHEMA_CANDIDATAS_ARTIGO = {
  type: "object",
  properties: {
    candidatas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Marca ou empresa explicitamente citada no artigo" },
          setor: { type: "string", description: "Setor da marca, apenas quando sustentado pelo artigo" },
          publicos: { type: "array", items: { type: "string" } },
          territorios: { type: "array", items: { type: "string" } },
          ativos: { type: "array", items: { type: "string" } },
          sinais_parceria: { type: "array", items: { type: "string" } },
          evidencia: { type: "string", description: "Trecho curto do artigo que cita a marca e o contexto" },
          confianca: { type: "number", description: "Confiança de 0 a 100 baseada apenas no artigo" },
        },
        required: ["nome", "evidencia", "confianca"],
      },
    },
  },
  required: ["candidatas"],
} as const;

export interface PerfilExtraidoWeb {
  nome?: string;
  setor?: string;
  publicos?: string[];
  territorios?: string[];
  ativos?: string[];
  sinais_parceria?: string[];
}

export interface ResultadoExtracao {
  perfil: PerfilExtraidoWeb;
  origem: "firecrawl" | "mock";
}

export interface CandidataExtraidaDeArtigo extends PerfilExtraidoWeb {
  nome: string;
  setor: string;
  publicos: string[];
  territorios: string[];
  ativos: string[];
  sinais_parceria: string[];
  evidencia: string;
  confianca: number;
  fonte_url: string;
}

export interface ResultadoCandidatasArtigo {
  candidatas: CandidataExtraidaDeArtigo[];
  origem: "firecrawl" | "mock";
}

// --- Stub determinístico (modo mock) -----------------------------------------
function extracaoMock(url: string): PerfilExtraidoWeb {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* url inválida — mantém como está */
  }
  const nomeBase = host.split(".")[0] ?? host;
  return {
    nome: nomeBase.charAt(0).toUpperCase() + nomeBase.slice(1),
    setor: "(setor não determinado — extração MOCK, sem chave Firecrawl)",
    publicos: [],
    territorios: [],
    ativos: [],
    sinais_parceria: [],
  };
}

// --- Extração real (Firecrawl /scrape com formats: json) ---------------------
interface FirecrawlScrapeResposta {
  success?: boolean;
  data?: { json?: PerfilExtraidoWeb; markdown?: string };
}

async function extrairFirecrawl(url: string): Promise<PerfilExtraidoWeb> {
  let resposta: Response;
  try {
    resposta = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: [
          {
            type: "json",
            prompt:
              "Extraia o perfil da organização/marca desta página para avaliação de parceria estratégica: setor, públicos-alvo, territórios de atuação, ativos de marca (eventos, canais, patrocínios) e sinais de abertura a parcerias.",
            schema: SCHEMA_PERFIL,
          },
        ],
        onlyMainContent: true,
      }),
      // Uma página bloqueada ou não suportada não pode segurar a edição manual
      // do perfil. O enriquecedor continua útil usando o snippet da busca e o
      // Ollama local quando esta tentativa expira.
      signal: AbortSignal.timeout(12_000),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao extrair via Firecrawl");
    throw new Error("Não foi possível contatar o provedor de extração.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe: detalhe.slice(0, 300) }, "Firecrawl retornou erro");
    throw new Error(`Provedor de extração retornou ${resposta.status}.`);
  }

  const json = (await resposta.json()) as FirecrawlScrapeResposta;
  return json.data?.json ?? {};
}

/** Extrai um perfil estruturado de uma URL. Em modo mock, não toca em rede. */
export async function extrairPerfil(url: string): Promise<ResultadoExtracao> {
  if (extracaoEmModoMock()) {
    return { perfil: extracaoMock(url), origem: "mock" };
  }
  return { perfil: await extrairFirecrawl(url), origem: "firecrawl" };
}

interface FirecrawlCandidatasResposta {
  success?: boolean;
  data?: {
    json?: {
      candidatas?: Array<{
        nome?: string;
        setor?: string;
        publicos?: string[];
        territorios?: string[];
        ativos?: string[];
        sinais_parceria?: string[];
        evidencia?: string;
        confianca?: number;
      }>;
    };
  };
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10)
    : [];
}

async function extrairCandidatasFirecrawl(url: string, foco?: string): Promise<CandidataExtraidaDeArtigo[]> {
  let resposta: Response;
  try {
    resposta = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: [
          {
            type: "json",
            prompt: [
              "Esta página é uma matéria externa usada para descobrir novas oportunidades de parceria.",
              foco ? `O briefing que a candidata precisa atender é: ${foco}` : null,
              "Extraia no máximo três MARCAS ou EMPRESAS explicitamente citadas no texto.",
              "Retorne uma marca somente se a evidência citar a própria marca E trouxer uma relação direta com o briefing informado. Menções incidentais não são candidatas.",
              "Nunca retorne o título da matéria, o nome do veículo, categorias genéricas, eventos ou pessoas que não sejam uma marca/empresa.",
              "Para cada candidata, a evidência deve citar literalmente a própria marca e explicar seu contexto no artigo.",
              "Se não houver uma marca/empresa específica e comprovável, retorne candidatas vazia.",
              "Não invente atributos: use listas vazias e setor não identificado quando o artigo não sustentar o dado.",
            ].filter(Boolean).join(" "),
            schema: SCHEMA_CANDIDATAS_ARTIGO,
          },
        ],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (causa) {
    logger.warn({ causa }, "Falha ao identificar candidatas em matéria via Firecrawl");
    return [];
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.warn({ status: resposta.status, detalhe: detalhe.slice(0, 300) }, "Firecrawl não extraiu candidatas da matéria");
    return [];
  }

  const json = (await resposta.json()) as FirecrawlCandidatasResposta;
  return (json.data?.json?.candidatas ?? [])
    .flatMap((candidata): CandidataExtraidaDeArtigo[] => {
      const nome = candidata.nome?.trim();
      const evidencia = candidata.evidencia?.trim();
      if (!nome || nome.length < 3 || !evidencia || evidencia.length < 15) return [];
      return [{
        nome,
        setor: candidata.setor?.trim() || "não identificado",
        publicos: textos(candidata.publicos),
        territorios: textos(candidata.territorios),
        ativos: textos(candidata.ativos),
        sinais_parceria: textos(candidata.sinais_parceria),
        evidencia: evidencia.slice(0, 700),
        confianca: Math.max(0, Math.min(100, Math.round(candidata.confianca ?? 0))),
        fonte_url: url,
      }];
    })
    .slice(0, 3);
}

/**
 * Identifica candidatas reais citadas em uma matéria. Em modo mock, retorna
 * vazio de propósito: um stub não é evidência para criar oportunidade.
 */
export async function extrairCandidatasDeArtigo(url: string, foco?: string): Promise<ResultadoCandidatasArtigo> {
  if (extracaoEmModoMock()) return { candidatas: [], origem: "mock" };
  return { candidatas: await extrairCandidatasFirecrawl(url, foco), origem: "firecrawl" };
}

// --- Busca de conteúdo bruto (markdown) ---------------------------------------
// Diferente de extrairPerfil() (que pede ao Firecrawl um JSON já estruturado),
// buscarConteudo() só traz o texto da página em markdown — para alimentar um
// extrator próprio (ex.: Information Extractor, que usa LLM sobre texto bruto).
// Útil quando o resultado de busca (DuckDuckGo) só traz um trecho curto e
// queremos a página inteira.

export interface ResultadoConteudo {
  markdown: string;
  origem: "firecrawl" | "mock";
}

// --- Stub determinístico (modo mock) -----------------------------------------
function conteudoMock(url: string): string {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* url inválida — mantém como está */
  }
  const nome = host.split(".")[0] ?? host;
  return (
    `# ${nome}\n\n` +
    `Página institucional de ${nome} (${host}). Setor de tecnologia e serviços, ` +
    `com atuação nacional e público jovem entre seus principais consumidores. ` +
    `A marca mantém patrocínios e ativações em festivais e eventos como parte de sua ` +
    `estratégia de ativação de marca, e sinaliza abertura a parcerias e colaborações ` +
    `com outras empresas do setor. (conteúdo MOCK — sem chave Firecrawl)`
  );
}

async function scrapeMarkdown(url: string): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (causa) {
    logger.error({ causa }, "Falha de rede ao buscar conteúdo via Firecrawl");
    throw new Error("Não foi possível contatar o provedor de extração.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    logger.error({ status: resposta.status, detalhe: detalhe.slice(0, 300) }, "Firecrawl retornou erro");
    throw new Error(`Provedor de extração retornou ${resposta.status}.`);
  }

  const json = (await resposta.json()) as FirecrawlScrapeResposta;
  return json.data?.markdown ?? "";
}

/** Busca o conteúdo (markdown) de uma URL. Em modo mock, não toca em rede. */
export async function buscarConteudo(url: string): Promise<ResultadoConteudo> {
  if (extracaoEmModoMock()) {
    return { markdown: conteudoMock(url), origem: "mock" };
  }
  return { markdown: await scrapeMarkdown(url), origem: "firecrawl" };
}
