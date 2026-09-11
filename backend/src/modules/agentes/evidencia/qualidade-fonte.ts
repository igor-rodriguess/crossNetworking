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
  "fashionunited.com.br", "fashionunited.com", "ffw.uol.com.br", "vogue.globo.com",
  "forbes.com.br", "forbes.com", "startupi.com.br", "mercadoeconsumo.com.br",
  "portalnovarejo.com.br", "adage.com", "businessoffashion.com",
  // Cultura, moda de rua e música — territórios onde a Cross opera e onde
  // mora a informação sobre público e ativos de marca.
  "hypebeast.com", "highsnobiety.com", "complex.com", "dazeddigital.com",
  "gq.globo.com", "elle.com.br", "harpersbazaar.com.br", "lofficielbrasil.com",
  "billboard.com.br", "rollingstone.com.br", "tracklist.com.br",
  "sneakernews.com", "solecollector.com", "footwearnews.com",
  "marketingdive.com", "campaignlive.com", "wwd.com", "drapersonline.com",
  "b9.com.br", "casadecriadores.com.br", "revistapegn.globo.com",
  "consumidormoderno.com.br", "clientesa.com.br", "exameinvest.com.br",
]);

/**
 * Sinais estruturais de veículo editorial em domínio não listado.
 *
 * Existe porque a lista fechada era o verdadeiro teto da pesquisa: numa rodada
 * real, 24 dos 40 descartes foram `dominio_nao_reconhecido` com score 50 — todos
 * idênticos, e o objetivo `territorios_atuacao` terminou com ZERO fontes. Não
 * era o mundo que estava vazio; era a lista que era pequena.
 *
 * Aumentar a lista à mão não escala e envelhece mal. Estes sinais permitem que
 * um veículo desconhecido PROVE ser editorial, sem abrir a porta para qualquer
 * domínio: continuam valendo o filtro de anúncio, o de baixa autoridade e a
 * verificação de entidade.
 */
const SINAIS_EDITORIAIS: Array<{ re: RegExp; sinal: string; pontos: number }> = [
  // Seção de notícia no caminho da URL — marca de veículo, não de loja.
  { re: /\/(noticias?|news|materias?|reportagens?|artigos?|story|stories)\//i, sinal: "secao_de_noticia", pontos: 12 },
  // Padrão de permalink datado, típico de CMS editorial.
  { re: /\/20\d{2}\/\d{1,2}\//, sinal: "permalink_datado", pontos: 12 },
  // Vocabulário de imprensa no próprio domínio.
  { re: /(revista|jornal|portal|diario|gazeta|magazine|press|news|midia|media)/i, sinal: "nome_de_veiculo", pontos: 10 },
  // Editorias que cobrem o domínio da Cross.
  { re: /\/(moda|fashion|marketing|negocios|business|cultura|culture|music|musica|esporte|sports|varejo|retail)\//i, sinal: "editoria_relevante", pontos: 8 },
  // Seções editoriais que não usam o vocabulário de "notícia" mas são conteúdo
  // analítico — foi assim que uma matéria sobre subculturas e collabs (o que o
  // Crossability mais precisa) acabou barrada por não ter "/noticias/" na URL.
  { re: /\/(style-guide|trends?|subcultures?|colabora|collabs?|editorial|insights?|analise|analysis|especial|tag)\b/i, sinal: "secao_editorial_analitica", pontos: 12 },
  { re: /\/(home-destaque|destaques?|blog\/[a-z0-9-]{8,})/i, sinal: "destaque_editorial", pontos: 8 },
];

/**
 * Domínios que NUNCA são fonte editorial, por mais sinais que a URL exiba.
 *
 * Repositório de trabalho acadêmico, rede social e agregador de avaliação
 * publicam texto sobre a marca sem apuração — e um SWOT de estudante tem a
 * mesma aparência estrutural de uma análise setorial. Barrar aqui é mais
 * honesto do que tentar pontuar a diferença.
 */
const DOMINIOS_NAO_EDITORIAIS = [
  /scribd\./i, /studocu\./i, /passeidireto\./i, /coursehero\./i, /academia\.edu/i,
  /dspace\./i, /repositorio/i, /webartigos\./i, /trabalhosfeitos\./i, /monografias\./i,
  /wikipedia\./i, /fandom\./i, /wikiwand\./i,
  /instagram\./i, /facebook\./i, /twitter\./i, /x\.com$/i, /tiktok\./i, /pinterest\./i,
  /glassdoor\./i, /indeed\./i, /reclameaqui\./i, /trustpilot\./i,
  /youtube\./i, /vimeo\./i,
  // Fazendas de conteúdo de "marketing strategy": reescrevem case genérico sem
  // apuração. Aparecem em massa em busca sobre estratégia de marca e teriam
  // passado no bar editorial pela URL de aparência analítica.
  /businessmodelanalyst\./i, /projectpractical\./i, /latterly\.org/i,
  /thebrandhopper\./i, /marketing91\./i, /iide\.co/i, /edrawmind\./i,
  /1library\./i, /studylib\./i, /slideshare\./i,
];

/** TLDs de país/organização com barreira mínima de registro. */
const TLD_CONFIAVEL = /\.(com\.br|org\.br|net\.br|com|org|net|co\.uk|fr|de|it|es|jp)$/i;

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

  // Antes de qualquer pontuação por sinais: estes domínios não se qualificam
  // como editorial nem com URL de aparência jornalística.
  if (DOMINIOS_NAO_EDITORIAIS.some((p) => p.test(dominio))) {
    sinais.push("nao_editorial_por_natureza");
    return { classificacao: "baixa_autoridade", score: 25, sinais };
  }

  // Desconhecido: parte de uma faixa baixa e só sobe com sinal objetivo.
  // Domínio desconhecido NÃO passa no gate sem PROVAR natureza editorial.
  let score = 45;
  if (input.url.startsWith("https://")) {
    score += 5;
    sinais.push("https");
  } else {
    score -= 15;
    sinais.push("sem_https");
  }

  // Sinais estruturais: permitem que um veículo fora da lista se qualifique.
  // Sem isso, a lista fechada era o teto da pesquisa — e objetivos inteiros
  // terminavam com zero fontes por falta de cadastro, não por falta de fonte.
  let pontosEditoriais = 0;
  const alvo = `${dominio}${(() => {
    try {
      return new URL(input.url).pathname;
    } catch {
      return "";
    }
  })()}`;
  for (const s of SINAIS_EDITORIAIS) {
    if (s.re.test(alvo)) {
      pontosEditoriais += s.pontos;
      sinais.push(s.sinal);
    }
  }

  if (TLD_CONFIAVEL.test(dominio)) {
    pontosEditoriais += 4;
    sinais.push("tld_com_barreira_de_registro");
  }

  score += pontosEditoriais;

  // Bar de qualificação editorial.
  //
  // 16 = um sinal forte de seção editorial (12) + TLD com barreira (4). Foi
  // calibrado contra fontes reais: admite uma matéria de style-guide sobre
  // subculturas e um portal de varejo setorial — ambos com o conteúdo que o
  // Crossability precisa — enquanto Scribd, Studocu, Wikipedia e Instagram
  // ficam em 25 pelo filtro de natureza, sem chance de alcançar este bar.
  //
  // O teto de 72 mantém a hierarquia: veículo não catalogado nunca supera um
  // curado (75) nem imprensa de referência (85).
  if (pontosEditoriais >= 16) {
    sinais.push("veiculo_editorial_por_sinais");
    return { classificacao: "imprensa_especializada", score: Math.min(72, score), sinais };
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
