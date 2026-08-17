import { buscarConteudo } from "../shared/firecrawl";
import {
  contemPiiIncidental,
  extrairDataPublicacao,
  validarConteudoPosScrape,
  type OrigemData,
} from "./qualidade-fonte";
import type { FatoBruto } from "./research-evidence.agent";
import type { CategoriaFato, FonteEvidencia } from "./evidencia.schema";

// -----------------------------------------------------------------------------
// Extração determinística de fatos a partir de conteúdo REAL.
//
// Existe porque a validação live precisa produzir fatos vindos de páginas de
// verdade, e o LLM pago está desligado. Em vez de fingir extração semântica,
// aqui a regra é explícita: um fato só nasce de uma FRASE literal da página que
// menciona a entidade e contém um verbo de ação factual.
//
// Limites assumidos e declarados:
//   · não interpreta, não resume, não infere — copia a frase da fonte;
//   · erra por omissão: frase ambígua é ignorada, não adivinhada;
//   · a categoria vem de palavras-chave, então é grosseira.
//
// Isso NÃO substitui a extração por LLM. Serve para responder uma pergunta
// específica: o conteúdo coletado sustenta fatos rastreáveis até a frase de
// origem? Cada fato carrega o trecho literal que o sustenta.
// -----------------------------------------------------------------------------

/** Verbos que indicam ação factual reportável. */
const VERBOS_FACTUAIS = [
  "lançou", "lança", "anunciou", "anuncia", "abriu", "abre", "firmou", "firma",
  "fechou", "assinou", "apresentou", "apresenta", "estreou", "inaugurou",
  "expandiu", "adquiriu", "comprou", "patrocina", "patrocinou", "celebrou",
  "revelou", "confirmou", "divulgou", "iniciou", "criou", "desenvolveu",
];

/** Palavra-chave → categoria. Grosseiro por construção. */
const CATEGORIA_POR_TERMO: Array<[RegExp, CategoriaFato]> = [
  [/colab|collab|parceria|parceir|co-brand/i, "parceria"],
  [/patroc[ií]ni|naming rights/i, "patrocinio"],
  [/campanha|publicit|an[uú]ncio public/i, "campanha"],
  [/cole[cç][aã]o|lan[cç]amento|produto|linha de/i, "produto"],
  [/loja|inaugur|expans[aã]o|novo mercado|filial/i, "expansao"],
  [/festival|evento|feira|show/i, "evento"],
  [/CEO|diretor|presidente|executiv/i, "lideranca"],
  [/p[uú]blico|consumidor|audi[eê]ncia/i, "publico"],
  [/regi[aã]o|estado|cidade|territ[oó]rio|nacional/i, "territorio"],
];

function categorizar(frase: string): CategoriaFato {
  for (const [re, cat] of CATEGORIA_POR_TERMO) if (re.test(frase)) return cat;
  return "contexto_empresa";
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Divide markdown em frases, descartando ruído estrutural. */
function frasesDe(markdown: string): string[] {
  return markdown
    // Remove links markdown, imagens, cabeçalhos e blocos de código.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[|>*_`]/g, " ")
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter((f) => f.length >= 40 && f.length <= 400);
}

export interface FatoComTrecho extends FatoBruto {
  /** A frase literal da página que sustenta o claim. Base da proveniência. */
  trecho_fonte: string;
  url_fonte: string;
}

export interface ResultadoExtracaoReal {
  fatos: FatoComTrecho[];
  /** Diagnóstico por URL: o que foi raspado e o que saiu dali. */
  paginas: Array<{
    url: string;
    /** `descartada` = raspada, mas reprovada na validação pós-scrape. */
    status: "ok" | "erro" | "descartada";
    origem: "firecrawl" | "mock" | null;
    caracteres: number;
    frases_candidatas: number;
    fatos_extraidos: number;
    /** Frases barradas por conterem dado pessoal de terceiro. */
    descartados_pii?: number;
    publicado_em?: string | null;
    origem_data?: OrigemData;
    erro?: string;
    duracao_ms: number;
  }>;
}

/**
 * Raspa as fontes e extrai fatos literais.
 *
 * `registrarScrape` permite ao chamador debitar cada página no orçamento —
 * o guardrail de scraping continua valendo.
 */
export async function extrairFatosReais(
  fontes: FonteEvidencia[],
  entidade: string,
  opcoes: {
    limiteUrls?: number;
    aliases?: string[];
    siteOficial?: string | null;
    autorizarScrape?: () => boolean;
    registrarScrape?: () => void;
  } = {}
): Promise<ResultadoExtracaoReal> {
  const limite = opcoes.limiteUrls ?? 3;
  const nomes = [entidade, ...(opcoes.aliases ?? [])].map(normalizar);
  const fatos: FatoComTrecho[] = [];
  const paginas: ResultadoExtracaoReal["paginas"] = [];

  for (const fonte of fontes.slice(0, limite)) {
    // Guardrail antes de cada página — sem bypass.
    if (opcoes.autorizarScrape && !opcoes.autorizarScrape()) {
      paginas.push({
        url: fonte.url,
        status: "erro",
        origem: null,
        caracteres: 0,
        frases_candidatas: 0,
        fatos_extraidos: 0,
        erro: "bloqueado pelo guardrail de scraping",
        duracao_ms: 0,
      });
      break;
    }

    const t0 = Date.now();
    try {
      const { markdown, origem } = await buscarConteudo(fonte.url);
      opcoes.registrarScrape?.();

      // --- Porta 4: validação pós-scrape ---------------------------------
      // Segunda barreira, agora sobre o CONTEÚDO. Um resultado pode passar no
      // título e revelar-se irrelevante no corpo — foi assim que páginas de
      // dicionário viraram "fatos" sobre a marca Reserva.
      const validacao = validarConteudoPosScrape({
        markdown,
        entidade,
        aliases: opcoes.aliases,
        url: fonte.url,
        siteOficial: opcoes.siteOficial,
      });
      if (!validacao.valido) {
        paginas.push({
          url: fonte.url,
          status: "descartada",
          origem,
          caracteres: markdown.length,
          frases_candidatas: 0,
          fatos_extraidos: 0,
          erro: `entity_mismatch pós-scrape: ${validacao.motivo} (${validacao.sinais.join(", ")})`,
          duracao_ms: Date.now() - t0,
        });
        continue;
      }

      // Data de publicação a partir da metadata da página. O DuckDuckGo não
      // fornece; o conteúdo raspado às vezes sim.
      const data = extrairDataPublicacao(markdown);

      const frases = frasesDe(markdown);
      // Só frases que mencionam a entidade E têm verbo factual.
      const candidatas = frases.filter((f) => {
        const n = normalizar(f);
        return nomes.some((nome) => n.includes(nome)) &&
          VERBOS_FACTUAIS.some((v) => n.includes(normalizar(v)));
      });

      let extraidos = 0;
      let descartadosPii = 0;
      for (const frase of candidatas.slice(0, 3)) {
        // Evita repetir a mesma frase vinda de páginas diferentes.
        if (fatos.some((f) => normalizar(f.trecho_fonte) === normalizar(frase))) continue;

        // --- Porta 5: PII incidental -------------------------------------
        // Frase de exemplo com e-mail de terceiro não vira fato da empresa.
        const pii = contemPiiIncidental(frase);
        if (pii.contem) {
          descartadosPii++;
          continue;
        }

        fatos.push({
          claim: frase,
          categoria: categorizar(frase),
          natureza: "fato",
          fontes: [fonte.url],
          publicadoEm: data.publicadoEm ?? fonte.publicado_em,
          trecho_fonte: frase,
          url_fonte: fonte.url,
        });
        extraidos++;
      }

      paginas.push({
        url: fonte.url,
        status: "ok",
        origem,
        caracteres: markdown.length,
        frases_candidatas: candidatas.length,
        fatos_extraidos: extraidos,
        descartados_pii: descartadosPii,
        publicado_em: data.publicadoEm,
        origem_data: data.origem,
        duracao_ms: Date.now() - t0,
      });
    } catch (e) {
      paginas.push({
        url: fonte.url,
        status: "erro",
        origem: null,
        caracteres: 0,
        frases_candidatas: 0,
        fatos_extraidos: 0,
        erro: e instanceof Error ? e.message : String(e),
        duracao_ms: Date.now() - t0,
      });
    }
  }

  return { fatos, paginas };
}
