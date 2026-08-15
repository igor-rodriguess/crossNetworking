import { chamarLLMJson, type MensagemLLM, type OrigemLLM } from "./shared/llm";
import { buscarConteudo, extrairCandidatasDeArtigo } from "./shared/firecrawl";
import {
  extracaoSaidaSchema,
  type ExtracaoSaida,
  type ExtrairInformacoesInput,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Information Extractor — o QUARTO nó da espinha (Planning -> Collect ->
// Validate -> EXTRACT -> Reason -> Recommend).
//
// Transforma conteúdo bruto (texto de páginas coletadas) em campos
// ESTRUTURADOS alinhados ao domínio: nome, setor, públicos, territórios,
// ativos e sinais de parceria — o vocabulário que o Crossability Reasoning
// consome. Usa LLM (extração estruturada); sem chave, um stub determinístico
// deriva campos plausíveis do próprio texto.
//
// Além de 'conteudos' (texto já em mãos), aceita 'urls' e/ou 'coleta' (saída
// do Source Collector) — nesse caso busca a página inteira via Firecrawl
// (Source Collector só traz um trecho curto do resultado de busca) e usa esse
// markdown como conteúdo bruto para o LLM.
// -----------------------------------------------------------------------------

/** Junta as URLs de 'urls' e 'coleta', deduplica e corta em 'limite'. */
function urlsDaEntrada(input: ExtrairInformacoesInput): string[] {
  const dasColetas = (input.coleta?.coletas ?? []).flatMap((c) => c.resultados.map((r) => r.url));
  const todas = [...(input.urls ?? []), ...dasColetas];
  return Array.from(new Set(todas)).slice(0, input.limite_urls);
}

/** Busca o conteúdo (markdown) de cada URL via Firecrawl.
 * Uma URL bloqueada, indisponível ou incompatível não pode anular todos os
 * demais resultados da pesquisa. Os snippets do coletor cobrem esse fallback.
 */
async function conteudosDeUrls(urls: string[]): Promise<{ conteudos: string[]; origem: "firecrawl" | "mock" | null }> {
  if (urls.length === 0) return { conteudos: [], origem: null };
  const resultados = await Promise.allSettled(urls.map((url) => buscarConteudo(url)));
  const concluidos = resultados
    .filter((resultado): resultado is PromiseFulfilledResult<Awaited<ReturnType<typeof buscarConteudo>>> => resultado.status === "fulfilled")
    .map((resultado) => resultado.value);
  if (concluidos.length === 0) return { conteudos: [], origem: null };
  const origem: "firecrawl" | "mock" = concluidos.some((r) => r.origem === "mock") ? "mock" : "firecrawl";
  return { conteudos: concluidos.map((r) => r.markdown.slice(0, MAX_CHARS_POR_CONTEUDO)), origem };
}

/** Os trechos do DuckDuckGo são evidência utilizável quando a página bloqueia o scraper. */
function conteudosDosSnippets(input: ExtrairInformacoesInput): string[] {
  return (input.coleta?.coletas ?? [])
    .flatMap((coleta) => coleta.resultados)
    .map((resultado) => [
      `Título: ${resultado.titulo}`,
      `URL: ${resultado.url}`,
      resultado.trecho ? `Trecho: ${resultado.trecho}` : null,
    ].filter(Boolean).join("\n"))
    .filter((conteudo) => conteudo.length > 20);
}

const SYSTEM = `Você é o Agente Extrator de Informações da plataforma Cross (estratégia de parcerias).
Recebe textos brutos coletados sobre empresas/marcas/eventos e extrai informação ESTRUTURADA útil para avaliar potencial de parceria.

Para CADA conteúdo, produza um perfil com:
- nome: a entidade principal do texto
- setor: segmento de atuação
- publicos: públicos-alvo mencionados ou claramente inferíveis
- territorios: praças/regiões de atuação
- ativos: propriedades, canais, patrocínios, produtos relevantes
- sinais_parceria: indícios de interesse/abertura/potencial para parcerias
- confianca: 0-100, o quanto o texto sustenta o que você extraiu (seja honesto; texto vago = confiança baixa)

Não invente dados que o texto não sustenta — liste vazio [] quando não houver.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{ "perfis": [ { "nome": "", "setor": "", "publicos": [], "territorios": [], "ativos": [], "sinais_parceria": [], "confianca": 0 } ] }`;

// Teto de texto por página enviado ao LLM. Uma página de notícia rende ~20 mil
// caracteres; cinco delas passam de 95 mil, e o tempo de inferência cresce com
// o tamanho do prompt — foi o que fazia a extração levar minutos num modelo
// local. O que identifica uma entidade (título, abertura, primeiros parágrafos)
// está no começo do markdown, então cortar a cauda quase não custa qualidade.
const MAX_CHARS_POR_CONTEUDO = 3_000;

function truncar(texto: string): string {
  const limpo = texto.trim();
  if (limpo.length <= MAX_CHARS_POR_CONTEUDO) return limpo;
  return `${limpo.slice(0, MAX_CHARS_POR_CONTEUDO)}\n[...conteúdo truncado...]`;
}

function montarMensagens(conteudos: string[], foco?: string): MensagemLLM[] {
  const blocos = conteudos.map((c, i) => `--- Conteúdo ${i + 1} ---\n${truncar(c)}`).join("\n\n");
  const focoTexto = foco ? `\n\nFoco da extração: ${foco}` : "";
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Extraia os perfis dos conteúdos abaixo.${focoTexto}\n\n${blocos}` },
  ];
}

// --- Stub determinístico (modo mock) -----------------------------------------
// Deriva campos simples do texto — previsível, para o pipeline rodar sem chave.
function extracaoMock(conteudos: string[]): ExtracaoSaida {
  const perfis = conteudos.map((texto) => {
    const limpo = texto.trim();
    // Prioriza título Markdown; Firecrawl frequentemente inicia o conteúdo com
    // uma imagem/link e isso não deve virar o nome da entidade.
    const titulo = /^#{1,6}\s+(.+)$/m.exec(limpo)?.[1] ?? limpo.split(/[.—\-|:]/)[0] ?? limpo;
    const nome = titulo
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^[-*\s]+|[-*\s]+$/g, "")
      .trim()
      .slice(0, 60) || "Entidade não identificada";
    const temSetor = /bebida|festival|m[uú]sica|tecnologia|varejo|banco|energia|moda/i.exec(limpo);
    return {
      nome,
      setor: temSetor ? temSetor[0] : "não identificado",
      publicos: /jovem|jovens|18-24|classe|público/i.test(limpo) ? ["público jovem (inferido)"] : [],
      territorios: /nordeste|sul|sudeste|nacional|brasil/i.exec(limpo)?.slice(0, 1) ?? [],
      ativos: /patroc[ií]nio|palco|canal|festival|propriedade/i.exec(limpo)?.slice(0, 1) ?? [],
      sinais_parceria: /parceria|patroc[ií]nio|colabora|ativa[çc][aã]o/i.test(limpo)
        ? ["menção a parceria/patrocínio no texto"]
        : [],
      confianca: 40, // MOCK: confiança moderada-baixa, honesta
    };
  });
  return { total_conteudos: conteudos.length, perfis };
}

export interface ResultadoExtracaoAgente {
  saida: ExtracaoSaida;
  origem: OrigemLLM;
  tokens?: { entrada: number; saida: number; cache?: number };
  /** Modelo que atendeu; ausente no modo mock/heurístico. */
  modelo?: string;
  // De onde veio o conteúdo buscado via URL (quando havia 'urls'/'coleta'); ausente se só 'conteudos'.
  fonteConteudo?: "firecrawl" | "mock";
}

/** Extrai perfis estruturados dos conteúdos coletados (texto direto e/ou URLs). */
export async function extrairInformacoes(input: ExtrairInformacoesInput): Promise<ResultadoExtracaoAgente> {
  const urls = urlsDaEntrada(input);
  const { conteudos: conteudosDeUrl, origem: fonteConteudo } = await conteudosDeUrls(urls);
  const conteudosDiretos = input.conteudos ?? [];
  // Os snippets só entram quando nenhum markdown foi obtido. Assim evitamos
  // duplicar a mesma fonte, mas mantemos a descoberta operacional diante de 403.
  const conteudos = [...conteudosDiretos, ...(conteudosDeUrl.length ? conteudosDeUrl : conteudosDosSnippets(input))];
  if (conteudos.length === 0) {
    throw new Error("Nenhum conteúdo para extrair: informe 'conteudos', 'urls' ou 'coleta'.");
  }

  const resultado = await chamarLLMJson<unknown>({
    mensagens: montarMensagens(conteudos, input.foco),
    mock: () => extracaoMock(conteudos),
    temperatura: 0.1,
    timeoutMs: 30_000,
    formatoJson: extracaoSaidaSchema,
  });

  // Normaliza: o LLM devolve { perfis: [...] }; o mock devolve o objeto completo.
  const bruto = resultado.dados as { perfis?: unknown; total_conteudos?: unknown };
  const candidato = {
    total_conteudos: typeof bruto.total_conteudos === "number" ? bruto.total_conteudos : conteudos.length,
    perfis: bruto.perfis ?? [],
  };
  const saida = extracaoSaidaSchema.parse(candidato);
  return {
    saida,
    origem: resultado.origem,
    tokens: resultado.tokens,
    modelo: resultado.modelo,
    fonteConteudo: fonteConteudo ?? undefined,
  };
}

function normalizarChave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unirTextos(...listas: string[][]): string[] {
  const vistos = new Set<string>();
  return listas.flat().filter((valor) => {
    const texto = valor.trim();
    const chave = normalizarChave(texto);
    if (!texto || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

const NOMES_NAO_CANDIDATOS = new Set([
  "rio open", "lollapalooza", "brasil", "marcas", "patrocinadores",
  "patrocinador", "ativacoes", "ativacao", "experiencia", "conteudo",
  "marketing", "evento", "eventos",
]);

const PALAVRA_DE_NOME = "[A-ZÀ-Ý][\\p{L}\\d&.'’-]*";
const ACOES_DE_MARCA = "(?:patrocina(?:ra|ram|ndo)?|patrocinadora|renovou|retorna|tera|terao|promovera|promovem|prepara|preparam|realizou|realizara|lancou|integra)";

function limparNomeDeMarca(nome: string): string {
  const semMarcacao = nome.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
  // Títulos e snippets às vezes juntam o fim de uma frase e o começo da
  // seguinte ("Marketing A Allos"). A última locução com artigo preserva o
  // nome da marca e remove esse ruído editorial.
  return semMarcacao.split(/\s+(?:A|O|As|Os)\s+/u).at(-1)?.trim() || semMarcacao;
}

function adicionarNome(encontrados: Set<string>, bruto: string | undefined) {
  if (!bruto) return;
  const nome = limparNomeDeMarca(bruto).replace(/[,:;.!]+$/g, "").trim();
  const chave = normalizarChave(nome);
  if (chave.length >= 3 && !NOMES_NAO_CANDIDATOS.has(chave)) encontrados.add(nome);
}

function nomesDeMarcaNoResultado(texto: string): string[] {
  const encontrados = new Set<string>();
  const porAcao = new RegExp(
    `(?:\\b(?:A|O|As|Os)\\s+)?(${PALAVRA_DE_NOME}(?:\\s+${PALAVRA_DE_NOME}){0,2})\\s+(?=${ACOES_DE_MARCA}\\b)`,
    "gu",
  );
  const porLista = new RegExp(
    `(?:^|[:.;])\\s*(${PALAVRA_DE_NOME}(?:\\s+${PALAVRA_DE_NOME}){0,2})\\s*[–—-]\\s*(?=(?:[Pp]atrocin|[Aa]tiv))`,
    "gu",
  );
  for (const padrao of [porAcao, porLista]) {
    for (const correspondencia of texto.matchAll(padrao)) {
      adicionarNome(encontrados, correspondencia[1]);
    }
  }

  // Listas editoriais são comuns em resultados de eventos: "marcas como
  // Claro, XP Investimentos, Ademicon e Betnacional promovem...". Elas são
  // evidência especialmente boa porque já ligam cada marca à ativação.
  const listaEditorial = /(?:[Pp]atrocinadores?|[Mm]arcas)\s+como\s+(.{1,220}?)(?=\s+(?:promovem|promover[aã]o|ter[aã]o|realizam|preparam)\b)/gu;
  for (const correspondencia of texto.matchAll(listaEditorial)) {
    for (const item of (correspondencia[1] ?? "").split(/,|\s+e\s+/u)) {
      const nome = item.replace(/^(?:os|as)\s+/i, "").trim();
      if (new RegExp(`^${PALAVRA_DE_NOME}(?:\\s+${PALAVRA_DE_NOME}){0,2}$`, "u").test(nome)) {
        adicionarNome(encontrados, nome);
      }
    }
  }
  return [...encontrados];
}

/**
 * Os resultados da busca frequentemente já trazem uma citação de marca com o
 * contexto comercial (ex.: "Magnum renovou o patrocínio ao Rio Open"). Esse
 * caminho é mais rápido e auditável que raspar toda matéria; o Firecrawl de
 * página completa fica como fallback quando o snippet não é conclusivo.
 */
function candidatasDosSnippets(input: ExtrairInformacoesInput) {
  const candidatas = new Map<string, {
    nome: string;
    setor: string;
    publicos: string[];
    territorios: string[];
    ativos: string[];
    sinais_parceria: string[];
    confianca: number;
    fontes: Array<{ url: string; evidencia: string }>;
  }>();

  for (const resultado of (input.coleta?.coletas ?? []).flatMap((coleta) => coleta.resultados)) {
    const evidencia = `${resultado.titulo}. ${resultado.trecho ?? ""}`.replace(/\s+/g, " ").trim();
    if (evidencia.length < 30) continue;
    const temSinalDeParceria = /collab|colabor|parceria|ativac|patrocin|co[- ]?brand|apoio/i.test(evidencia);
    if (!temSinalDeParceria) continue;

    for (const nome of nomesDeMarcaNoResultado(evidencia)) {
      const chave = normalizarChave(nome);
      if (!chave || !normalizarChave(evidencia).includes(chave)) continue;
      const anterior = candidatas.get(chave);
      if (!anterior) {
        candidatas.set(chave, {
          nome,
          setor: "não identificado",
          publicos: [],
          territorios: [],
          ativos: /rio open/i.test(evidencia) ? ["Rio Open citado na fonte externa"] : [],
          sinais_parceria: ["Sinal de patrocínio, ativação ou parceria citado no resultado de busca"],
          confianca: 70,
          fontes: [{ url: resultado.url, evidencia: evidencia.slice(0, 700) }],
        });
      } else if (!anterior.fontes.some((fonte) => fonte.url === resultado.url)) {
        anterior.fontes.push({ url: resultado.url, evidencia: evidencia.slice(0, 700) });
      }
    }
  }
  return [...candidatas.values()].map((candidata) => ({ ...candidata, fontes: candidata.fontes.slice(0, 5) }));
}

/**
 * Descoberta externa não deve usar o título da notícia como perfil de marca.
 * Esta variante pede ao Firecrawl que identifique somente marcas/empresas que
 * o artigo cita e devolve junto a evidência e URL que sustentam cada uma.
 */
export async function extrairCandidatasExternas(input: ExtrairInformacoesInput): Promise<ResultadoExtracaoAgente> {
  const urls = urlsDaEntrada(input);
  if (urls.length === 0) {
    return { saida: { total_conteudos: 0, perfis: [] }, origem: "mock" };
  }

  const candidatasRapidas = candidatasDosSnippets(input);
  if (candidatasRapidas.length) {
    return {
      saida: extracaoSaidaSchema.parse({ total_conteudos: urls.length, perfis: candidatasRapidas }),
      origem: "heuristica",
    };
  }

  const resultados = await Promise.allSettled(urls.map((url) => extrairCandidatasDeArtigo(url, input.foco)));
  const concluidos = resultados
    .filter((resultado): resultado is PromiseFulfilledResult<Awaited<ReturnType<typeof extrairCandidatasDeArtigo>>> => resultado.status === "fulfilled")
    .map((resultado) => resultado.value);
  const porNome = new Map<string, {
    nome: string;
    setor: string;
    publicos: string[];
    territorios: string[];
    ativos: string[];
    sinais_parceria: string[];
    confianca: number;
    fontes: Array<{ url: string; evidencia: string }>;
  }>();

  for (const resultado of concluidos) {
    for (const candidata of resultado.candidatas) {
      const chave = normalizarChave(candidata.nome);
      const evidencia = candidata.evidencia.trim();
      // A marca precisa aparecer na própria evidência extraída do artigo. Essa
      // checagem evita que o modelo transforme assunto, título ou inferência em
      // uma candidata sem citação verificável.
      if (!chave || !normalizarChave(evidencia).includes(chave)) continue;
      const anterior = porNome.get(chave);
      if (!anterior) {
        porNome.set(chave, {
          nome: candidata.nome.trim(),
          setor: candidata.setor || "não identificado",
          publicos: candidata.publicos,
          territorios: candidata.territorios,
          ativos: candidata.ativos,
          sinais_parceria: candidata.sinais_parceria,
          confianca: candidata.confianca,
          fontes: [{ url: candidata.fonte_url, evidencia }],
        });
        continue;
      }
      anterior.publicos = unirTextos(anterior.publicos, candidata.publicos);
      anterior.territorios = unirTextos(anterior.territorios, candidata.territorios);
      anterior.ativos = unirTextos(anterior.ativos, candidata.ativos);
      anterior.sinais_parceria = unirTextos(anterior.sinais_parceria, candidata.sinais_parceria);
      anterior.confianca = Math.max(anterior.confianca, candidata.confianca);
      if (!anterior.fontes.some((fonte) => fonte.url === candidata.fonte_url)) {
        anterior.fontes.push({ url: candidata.fonte_url, evidencia });
      }
    }
  }

  const saida = extracaoSaidaSchema.parse({
    total_conteudos: urls.length,
    perfis: [...porNome.values()].map((perfil) => ({ ...perfil, fontes: perfil.fontes.slice(0, 5) })),
  });
  return {
    saida,
    origem: concluidos.some((resultado) => resultado.origem === "firecrawl") ? "heuristica" : "mock",
    fonteConteudo: concluidos.some((resultado) => resultado.origem === "firecrawl") ? "firecrawl" : "mock",
  };
}
