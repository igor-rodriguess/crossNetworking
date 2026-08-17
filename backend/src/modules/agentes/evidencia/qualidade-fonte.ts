// -----------------------------------------------------------------------------
// Qualidade de fonte e segurança de identidade.
//
// Corrige os quatro defeitos que a validação live (AI-02.1) expôs:
//   1. anúncios do buscador entravam como fonte
//   2. credibilidade dava 58 para tudo — Bloomberg, site oficial e anúncio
//   3. (extração — fora do escopo desta sprint)
//   4. páginas de dicionário viravam "fatos" sobre a empresa
//
// Tudo aqui é determinístico e sem custo: são portas que rodam ANTES do
// scraping, para que o gasto só aconteça sobre página que vale a pena.
// -----------------------------------------------------------------------------

/** Classificação da fonte — substitui o score plano anterior. */
export type ClassificacaoFonte =
  | "oficial"
  | "imprensa_reconhecida"
  | "imprensa_especializada"
  | "agregador"
  | "baixa_autoridade"
  | "anuncio";

export interface AvaliacaoFonte {
  classificacao: ClassificacaoFonte;
  score: number;
  /** Por que recebeu esta classificação — auditável, não caixa-preta. */
  sinais: string[];
}

// -----------------------------------------------------------------------------
// Configuração de veículos.
//
// Centralizada de propósito: a lógica do agente não conhece domínio nenhum.
// Lista pequena, auditável e extensível — não é banco universal de reputação.
// -----------------------------------------------------------------------------

/** Imprensa de referência (economia, negócios, geral). */
export const IMPRENSA_RECONHECIDA = new Set([
  "g1.globo.com", "globo.com", "valor.globo.com", "oglobo.globo.com",
  "estadao.com.br", "folha.uol.com.br", "uol.com.br",
  "exame.com", "infomoney.com.br", "bloomberglinea.com.br",
  "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com",
  "cnnbrasil.com.br", "poder360.com.br", "gazetadopovo.com.br",
]);

/** Imprensa setorial relevante para o domínio da Cross (moda, marketing, negócios). */
export const IMPRENSA_ESPECIALIZADA = new Set([
  "meioemensagem.com.br", "propmark.com.br", "adnews.com.br",
  "fashionunited.com.br", "ffw.uol.com.br", "vogue.globo.com",
  "forbes.com.br", "startupi.com.br", "mercadoeconsumo.com.br",
  "portalnovarejo.com.br", "adage.com", "businessoffashion.com",
]);

/** Agregadores e republicadores — não são fonte original. */
export const AGREGADORES = new Set([
  "news.google.com", "msn.com", "yahoo.com", "flipboard.com",
  "medium.com", "linkedin.com", "reddit.com", "quora.com",
]);

/** Padrões de domínio sem autoridade editorial verificável. */
const PADROES_BAIXA_AUTORIDADE = [
  /blogspot\./i, /wordpress\.com$/i, /substack\.com$/i,
  /\.tk$/i, /\.xyz$/i, /\.top$/i, /forum/i, /wikia\./i,
];

// -----------------------------------------------------------------------------
// 1. Filtro de anúncios
// -----------------------------------------------------------------------------

/**
 * Sinais extraídos das URLs reais capturadas na baseline. Anúncios do
 * DuckDuckGo chegam como `duckduckgo.com/y.js?ad_domain=...&ad_provider=...`
 * — um redirecionador de clique, não a página anunciada.
 */
const PADROES_ANUNCIO: Array<{ re: RegExp; sinal: string }> = [
  { re: /\/y\.js\?/i, sinal: "redirecionador_de_anuncio" },
  { re: /[?&]ad_domain=/i, sinal: "parametro_ad_domain" },
  { re: /[?&]ad_provider=/i, sinal: "parametro_ad_provider" },
  { re: /[?&]ad_type=/i, sinal: "parametro_ad_type" },
  { re: /[?&]click_metadata=/i, sinal: "metadata_de_clique" },
  { re: /bing\.com\/aclick/i, sinal: "redirecionador_bing_ads" },
  { re: /googleadservices\.com|doubleclick\.net/i, sinal: "rede_de_anuncios" },
  { re: /[?&]msclkid=/i, sinal: "identificador_de_clique_pago" },
];

/** Domínios de buscador: legítimos como buscador, nunca como fonte editorial. */
const DOMINIOS_DE_BUSCADOR = ["duckduckgo.com", "bing.com", "google.com", "search.yahoo.com"];

export interface DeteccaoAnuncio {
  ehAnuncio: boolean;
  sinais: string[];
}

/**
 * Detecta resultado patrocinado ANTES de qualquer gasto.
 *
 * Não bloqueia todo resultado que passou por buscador — bloqueia o que carrega
 * marca publicitária reconhecível. Um link normal do DuckDuckGo já vem
 * desembrulhado pelo `web-search.ts`; o que continua apontando para o domínio
 * do buscador é redirecionador.
 */
export function detectarAnuncio(url: string, titulo = ""): DeteccaoAnuncio {
  const sinais: string[] = [];

  for (const { re, sinal } of PADROES_ANUNCIO) {
    if (re.test(url)) sinais.push(sinal);
  }

  // URL que permaneceu no domínio do buscador não é a página de conteúdo.
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    /* url malformada — tratada abaixo */
  }
  if (host && DOMINIOS_DE_BUSCADOR.some((d) => host === d || host.endsWith(`.${d}`))) {
    sinais.push("dominio_do_buscador_como_fonte");
  }

  if (/^(an[uú]ncio|ad|sponsored)\b/i.test(titulo.trim())) {
    sinais.push("titulo_marcado_como_anuncio");
  }

  return { ehAnuncio: sinais.length > 0, sinais };
}

// -----------------------------------------------------------------------------
// 2. Credibilidade discriminante
// -----------------------------------------------------------------------------

/** Normaliza domínio para comparação: sem protocolo, sem `www.`, minúsculo. */
export function normalizarDominio(valor: string): string {
  let v = valor.trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(v)) v = new URL(v).hostname;
  } catch {
    /* segue com o valor cru */
  }
  return v.replace(/^www\./, "").replace(/\/$/, "");
}

/**
 * O domínio pertence à entidade?
 *
 * Aceita o domínio oficial e seus subdomínios (`news.converse.com`), e também
 * variações de país sobre o mesmo rótulo registrável (`converse.com` ↔
 * `converse.com.br`) — a baseline falhou exatamente aí.
 *
 * NÃO aceita domínio que apenas CONTÉM o nome (`converse-blog.com`).
 */
export function ehDominioOficial(dominio: string, siteOficial?: string | null): boolean {
  if (!siteOficial) return false;
  const alvo = normalizarDominio(siteOficial);
  const atual = normalizarDominio(dominio);
  if (!alvo || !atual) return false;

  if (atual === alvo || atual.endsWith(`.${alvo}`)) return true;

  // Compara o rótulo registrável: "converse" de converse.com e converse.com.br.
  const rotulo = (d: string) => d.split(".")[0];
  const sufixoPais = /\.(com?|net|org)(\.[a-z]{2})?$/;
  if (rotulo(atual) === rotulo(alvo) && sufixoPais.test(atual) && sufixoPais.test(alvo)) {
    return true;
  }
  return false;
}

/**
 * Avalia a fonte com classificação explicável.
 *
 * Substitui a heurística plana anterior, que somava sinais genéricos (HTTPS,
 * TLD) e produzia 58 para tudo. Agora a natureza da fonte decide a faixa, e os
 * sinais genéricos só ajustam dentro dela.
 */
export function avaliarFonte(input: {
  url: string;
  titulo?: string;
  dominio?: string;
  siteOficial?: string | null;
}): AvaliacaoFonte {
  const dominio = normalizarDominio(input.dominio ?? input.url);
  const sinais: string[] = [];

  const anuncio = detectarAnuncio(input.url, input.titulo);
  if (anuncio.ehAnuncio) {
    return { classificacao: "anuncio", score: 0, sinais: anuncio.sinais };
  }

  if (ehDominioOficial(dominio, input.siteOficial)) {
    sinais.push("dominio_oficial_da_entidade");
    if (/^(news|newsroom|imprensa|press|about|sobre)\./.test(dominio)) {
      sinais.push("subdominio_institucional");
    }
    return { classificacao: "oficial", score: 95, sinais };
  }

  if (/\.gov(\.[a-z]{2})?$|\.edu(\.[a-z]{2})?$/.test(dominio)) {
    sinais.push("dominio_institucional_gov_edu");
    return { classificacao: "oficial", score: 90, sinais };
  }

  if (IMPRENSA_RECONHECIDA.has(dominio)) {
    sinais.push("veiculo_de_imprensa_reconhecido");
    return { classificacao: "imprensa_reconhecida", score: 85, sinais };
  }

  if (IMPRENSA_ESPECIALIZADA.has(dominio)) {
    sinais.push("veiculo_setorial_relevante");
    return { classificacao: "imprensa_especializada", score: 75, sinais };
  }

  if (AGREGADORES.has(dominio)) {
    sinais.push("agregador_ou_republicador");
    return { classificacao: "agregador", score: 40, sinais };
  }

  if (PADROES_BAIXA_AUTORIDADE.some((p) => p.test(dominio))) {
    sinais.push("padrao_de_baixa_autoridade");
    return { classificacao: "baixa_autoridade", score: 20, sinais };
  }

  // Desconhecido: parte de uma faixa baixa e só sobe com sinal objetivo.
  // Domínio desconhecido NÃO deve passar no gate sem mais evidência.
  let score = 45;
  if (input.url.startsWith("https://")) {
    score += 5;
    sinais.push("https");
  } else {
    score -= 15;
    sinais.push("sem_https");
  }
  sinais.push("dominio_nao_reconhecido");
  return { classificacao: "baixa_autoridade", score: Math.max(0, score), sinais };
}

// -----------------------------------------------------------------------------
// 3. Entity Resolution pré-scrape
// -----------------------------------------------------------------------------

export type MotivoMismatch =
  | "conteudo_lexicografico"
  | "sem_mencao_a_entidade"
  | "sem_contexto_organizacional"
  | "dominio_nao_relacionado";

export interface RelevanciaEntidade {
  relevante: boolean;
  sinais: string[];
  motivo?: MotivoMismatch;
}

/** Domínios cujo propósito é definir palavras — nunca falam da empresa. */
const DOMINIOS_LEXICOGRAFICOS = [
  "dictionary.com", "collinsdictionary.com", "spanishdict.com",
  "wordreference.com", "merriam-webster.com", "linguee.com",
  "dicio.com.br", "priberam.org", "michaelis.uol.com.br",
  "conjugacao.com.br", "reverso.net", "translate.google.com",
  "thefreedictionary.com", "vocabulary.com", "wiktionary.org",
];

/** Termos que revelam conteúdo lexicográfico mesmo em domínio genérico. */
const TERMOS_LEXICOGRAFICOS = [
  "conjugation", "conjugação", "conjugacao", "translate", "tradução", "traducao",
  "significado de", "definición", "definicao", "definition of", "sinônimos",
  "sinonimos", "synonyms", "dicionário", "dicionario", "dictionary",
  "verbo", "substantivo", "gramática", "gramatica", "grammar",
];

/** Termos que indicam contexto de organização/negócio. */
const TERMOS_ORGANIZACIONAIS = [
  "empresa", "marca", "loja", "companhia", "negócio", "negocio", "varejo",
  "coleção", "colecao", "produto", "cliente", "mercado", "campanha", "cnpj",
  "fundada", "ceo", "diretor", "faturamento", "lançou", "lancou", "parceria",
  "brand", "company", "store", "retail", "launch", "collection", "business",
];

function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Decide se um resultado de busca merece scraping.
 *
 * Regra central: menção ao nome NÃO basta. "Reserva" aparece em dicionário de
 * espanhol sem ter relação alguma com a marca. Exigimos menção À entidade E
 * contexto organizacional — ou domínio oficial, que dispensa o resto.
 */
export function avaliarRelevanciaPreScrape(input: {
  titulo: string;
  url: string;
  snippet?: string;
  entidade: string;
  aliases?: string[];
  siteOficial?: string | null;
}): RelevanciaEntidade {
  const sinais: string[] = [];
  const dominio = normalizarDominio(input.url);
  const texto = normalizarTexto(`${input.titulo} ${input.snippet ?? ""}`);
  const nomes = [input.entidade, ...(input.aliases ?? [])].map(normalizarTexto).filter(Boolean);

  // Domínio oficial é prova suficiente de identidade.
  if (ehDominioOficial(dominio, input.siteOficial)) {
    return { relevante: true, sinais: ["dominio_oficial_da_entidade"] };
  }

  // Barreira 1: domínio lexicográfico. Nunca fala de empresa.
  if (DOMINIOS_LEXICOGRAFICOS.some((d) => dominio === d || dominio.endsWith(`.${d}`))) {
    return {
      relevante: false,
      sinais: ["dominio_lexicografico"],
      motivo: "conteudo_lexicografico",
    };
  }

  // Barreira 2: título/snippet com cara de verbete.
  const termosLex = TERMOS_LEXICOGRAFICOS.filter((t) => texto.includes(normalizarTexto(t)));
  if (termosLex.length >= 1) {
    return {
      relevante: false,
      sinais: [`termo_lexicografico:${termosLex[0]}`],
      motivo: "conteudo_lexicografico",
    };
  }

  // Barreira 3: a entidade precisa ser mencionada.
  const mencionada = nomes.some((n) => n && texto.includes(n));
  if (!mencionada) {
    // O nome no domínio também conta (ex.: reserva.is).
    const noDominio = nomes.some((n) => n && normalizarTexto(dominio).includes(n.replace(/\s+/g, "")));
    if (!noDominio) {
      return { relevante: false, sinais: ["entidade_nao_mencionada"], motivo: "sem_mencao_a_entidade" };
    }
    sinais.push("entidade_no_dominio");
  } else {
    sinais.push("entidade_mencionada");
  }

  // Barreira 4: contexto organizacional. Sem ele, a menção pode ser
  // homônimo — palavra comum, lugar, pessoa.
  const termosOrg = TERMOS_ORGANIZACIONAIS.filter((t) => texto.includes(normalizarTexto(t)));
  if (termosOrg.length > 0) {
    sinais.push(`contexto_organizacional:${termosOrg.slice(0, 3).join(",")}`);
    return { relevante: true, sinais };
  }

  // Nome no domínio já é sinal forte o bastante para seguir.
  if (sinais.includes("entidade_no_dominio")) return { relevante: true, sinais };

  return { relevante: false, sinais, motivo: "sem_contexto_organizacional" };
}

// -----------------------------------------------------------------------------
// 4. Validação pós-scrape
// -----------------------------------------------------------------------------

export interface ValidacaoPosScrape {
  valido: boolean;
  sinais: string[];
  motivo?: MotivoMismatch;
}

/**
 * Segunda barreira, agora sobre o conteúdo real da página.
 *
 * Um resultado pode passar no título e revelar-se irrelevante no corpo. Sem
 * esta porta, a página raspada seguiria para a extração e viraria "fato".
 */
export function validarConteudoPosScrape(input: {
  markdown: string;
  entidade: string;
  aliases?: string[];
  url: string;
  siteOficial?: string | null;
}): ValidacaoPosScrape {
  const dominio = normalizarDominio(input.url);
  if (ehDominioOficial(dominio, input.siteOficial)) {
    return { valido: true, sinais: ["dominio_oficial_da_entidade"] };
  }

  const texto = normalizarTexto(input.markdown.slice(0, 20_000));
  const nomes = [input.entidade, ...(input.aliases ?? [])].map(normalizarTexto).filter(Boolean);
  const sinais: string[] = [];

  // Conteúdo de dicionário se revela por densidade de marcadores.
  const marcadores = TERMOS_LEXICOGRAFICOS.filter((t) => texto.includes(normalizarTexto(t)));
  if (marcadores.length >= 3) {
    return {
      valido: false,
      sinais: [`marcadores_lexicograficos:${marcadores.slice(0, 4).join(",")}`],
      motivo: "conteudo_lexicografico",
    };
  }

  // A entidade precisa aparecer com alguma consistência, não uma vez de passagem.
  const ocorrencias = nomes.reduce((total, nome) => {
    if (!nome) return total;
    return total + (texto.match(new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0);
  }, 0);

  if (ocorrencias === 0) {
    return { valido: false, sinais: ["entidade_ausente_no_conteudo"], motivo: "sem_mencao_a_entidade" };
  }
  sinais.push(`mencoes_a_entidade:${ocorrencias}`);

  const termosOrg = TERMOS_ORGANIZACIONAIS.filter((t) => texto.includes(normalizarTexto(t)));
  if (termosOrg.length === 0) {
    return { valido: false, sinais, motivo: "sem_contexto_organizacional" };
  }
  sinais.push(`contexto_organizacional:${termosOrg.slice(0, 3).join(",")}`);

  return { valido: true, sinais };
}

// -----------------------------------------------------------------------------
// 5. Proteção contra PII incidental
// -----------------------------------------------------------------------------

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const RE_TELEFONE = /(\+?\d{2,3}[\s-]?)?\(?\d{2,3}\)?[\s-]?\d{4,5}[\s-]?\d{4}/;
const RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

/**
 * Uma frase que carrega dado pessoal não vira fato da empresa.
 *
 * A baseline promoveu a Evidence uma frase de exemplo de dicionário contendo o
 * e-mail de um terceiro. Defensivo e deliberadamente simples — não é um sistema
 * completo de PII.
 */
export function contemPiiIncidental(frase: string): { contem: boolean; tipo?: string } {
  if (RE_EMAIL.test(frase)) return { contem: true, tipo: "email" };
  if (RE_CPF.test(frase)) return { contem: true, tipo: "cpf" };
  if (RE_TELEFONE.test(frase)) return { contem: true, tipo: "telefone" };
  return { contem: false };
}

// -----------------------------------------------------------------------------
// 6. published_at a partir de metadata
// -----------------------------------------------------------------------------

export type OrigemData =
  | "firecrawl_metadata"
  | "json_ld"
  | "open_graph"
  | "page_metadata"
  | "desconhecida";

export interface DataPublicacao {
  publicadoEm: string | null;
  origem: OrigemData;
}

/**
 * Extrai a data de publicação do markdown/metadata coletado.
 *
 * O DuckDuckGo HTML não fornece data — por isso a baseline não exercitou
 * recência. O Firecrawl traz metadata da página; aqui procuramos os formatos
 * usuais, em ordem de confiabilidade. Sem data legível: `null`. Nunca inventa.
 */
export function extrairDataPublicacao(
  markdown: string,
  metadata?: Record<string, unknown> | null
): DataPublicacao {
  const normalizarData = (v: unknown): string | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    // Data futura é erro de parsing, não publicação.
    if (d.getTime() > Date.now() + 86_400_000) return null;
    return d.toISOString();
  };

  if (metadata) {
    for (const [chave, origem] of [
      ["publishedTime", "firecrawl_metadata"],
      ["publishedDate", "firecrawl_metadata"],
      ["article:published_time", "open_graph"],
      ["datePublished", "json_ld"],
      ["date", "page_metadata"],
    ] as const) {
      const valor = normalizarData(metadata[chave]);
      if (valor) return { publicadoEm: valor, origem };
    }
  }

  // JSON-LD embutido no markdown coletado.
  const jsonLd = markdown.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (jsonLd) {
    const valor = normalizarData(jsonLd[1]);
    if (valor) return { publicadoEm: valor, origem: "json_ld" };
  }

  // Aceita tanto `article:published_time="..."` quanto a forma completa de meta
  // tag (`property="article:published_time" content="..."`).
  const og =
    markdown.match(/article:published_time["']?\s*(?:content=)?["']([^"']+)["']/i) ??
    markdown.match(/article:published_time["'][^>]*content=["']([^"']+)["']/i);
  if (og) {
    const valor = normalizarData(og[1]);
    if (valor) return { publicadoEm: valor, origem: "open_graph" };
  }

  return { publicadoEm: null, origem: "desconhecida" };
}
