import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { env } from "../../../config/env";
import { logger } from "../../../shared/logger";
import { coletarFontes } from "../source-collector.agent";
import { avaliarCredibilidade } from "../source-credibility.agent";
import { verificarFatos } from "../fact-verifier.agent";
import { resolverEntidades } from "../entity-resolver.agent";
import { OrcamentoExecucao } from "../shared/budget";
import {
  avaliarFonte,
  avaliarRelevanciaPreScrape,
  detectarAnuncio,
} from "./qualidade-fonte";
import type { ResultadoBusca } from "../shared/web-search";
import {
  evidencePackageSchema,
  type CategoriaFato,
  type Descarte,
  type EvidencePackage,
  type Fato,
  type FonteEvidencia,
  type Lacuna,
  type ObjetivoPesquisa,
  type PesquisarEvidenciasInput,
  type TipoFonte,
} from "./evidencia.schema";

// -----------------------------------------------------------------------------
// Research & Evidence Agent.
//
// Produz um EVIDENCE PACKAGE: fatos estruturados com proveniência, verificação
// e lacunas declaradas. Reutiliza os componentes já homologados — Source
// Collector, Credibility, Fact Verifier, Entity Resolver e os Cost Guardrails.
//
// O que este agente NÃO faz, por desenho:
//   · não avalia fit (Crossability)
//   · não recomenda parceria (Recommendation)
//   · não produz score de Score Card
//   · não consulta Cross Knowledge — preencher lacuna factual com metodologia
//     seria transformar interpretação em prova de fato (ADR-009)
// -----------------------------------------------------------------------------

/** Consultas por objetivo. Determinístico e auditável — sem custo de LLM. */
const TERMOS_POR_OBJETIVO: Record<ObjetivoPesquisa, string[]> = {
  contexto_geral: ["", "empresa sobre", "posicionamento marca", "público-alvo"],
  movimentos_recentes: ["notícias", "anúncio recente", "novidades", "movimento estratégico"],
  campanhas: ["campanha", "ação de marketing", "campanha publicitária", "ativação"],
  patrocinios: ["patrocínio", "patrocinador", "naming rights", "apoio a evento"],
  produtos: ["lançamento produto", "nova coleção", "portfólio", "linha de produtos"],
  expansao_mercado: ["expansão", "novo mercado", "abertura de loja", "internacionalização"],
  movimentos_culturais: ["cultura", "collab cultural", "movimento cultural", "comunidade"],
  liderancas: ["CEO", "diretoria", "executivo", "liderança"],
  eventos: ["evento", "festival", "feira", "ativação em evento"],
  parcerias: ["parceria", "collab", "co-branding", "acordo comercial"],
  sinais_estrategicos: ["estratégia", "plano de negócios", "investimento", "reposicionamento"],

  // Dirigidos às dimensões da Crossability.
  //
  // Os termos buscam ANÁLISE SOBRE a marca, não a marca. A primeira tentativa
  // usava "público-alvo" e "onde atua lojas", e o buscador devolveu o site
  // institucional — que vende tênis, não descreve o próprio público. O
  // resultado foram fatos verdadeiros e inúteis ("tem termos de uso").
  //
  // Vocabulário de imprensa setorial e de análise de marca puxa matéria e
  // estudo, onde essa informação de fato mora.
  publico_alvo: [
    "estratégia de marca análise consumidor",
    "quem consome a marca pesquisa perfil",
    "posicionamento geração público entrevista",
    "case marketing target",
    // Vocabulário de subcultura SEMPRE ancorado na marca. Uma tentativa com
    // "subcultura cena juventude" solto trouxe artigo acadêmico sobre
    // subculturas juvenis em geral — corretamente barrado por não falar da
    // entidade, mas gastando a vaga de uma consulta útil.
    "subculturas que usam a marca reportagem",
  ],
  territorios_atuacao: [
    "mercados onde opera análise",
    "operação no Brasil reportagem",
    "expansão internacional mercados",
    "presença varejo países",
    // Este objetivo terminou com ZERO fontes em duas rodadas. Varejo setorial
    // é onde a informação de distribuição costuma sair.
    "marca varejo distribuição lojas notícia",
  ],
  ativos_marca: [
    "embaixadores patrocínios da marca",
    "colaborações artistas parcerias",
    "propriedades ativos de marca análise",
    "ativações comunidade cultura",
    // Programas próprios e plataformas de marca — o tipo de ativo mais valioso
    // para o Crossability e o que menos aparece em busca institucional.
    "collab colaboração edição limitada artista",
  ],
};

/**
 * Teto de fontes por domínio, por execução.
 *
 * Sem isso, o site oficial ocupa todas as vagas: ele passa na credibilidade com
 * score 95 e domina o ranking do buscador. Na primeira rodada dirigida, 8 de 11
 * fontes eram converse.com.br — e o institucional não fala do próprio público
 * nem lista ativos de marca.
 *
 * Diversidade de domínio não é preferência estética: é o que traz o olhar
 * externo sobre a marca.
 */
const MAX_FONTES_POR_DOMINIO = 2;

/** Objetivos que exigem informação recente; contexto histórico é secundário. */
const OBJETIVOS_SENSIVEIS_A_TEMPO: ObjetivoPesquisa[] = [
  "movimentos_recentes",
  "campanhas",
  "eventos",
  "expansao_mercado",
  "sinais_estrategicos",
];

const DOMINIOS_AGREGADORES = ["news.google", "msn.com", "yahoo.com", "flipboard", "medium.com"];
const PADROES_BLOG = [/blogspot\./i, /wordpress\.com/i, /substack\.com/i, /\.tk$/i, /\.xyz$/i];

function idDe(prefixo: string, valor: string): string {
  return `${prefixo}_${createHash("sha1").update(valor).digest("hex").slice(0, 10)}`;
}

function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Classifica o tipo da fonte — sustenta a hierarquia de credibilidade. */
function classificarTipoFonte(dominio: string, siteOficial?: string): TipoFonte {
  if (siteOficial && dominio === dominioDe(siteOficial)) return "oficial";
  if (/\.gov(\.|$)|\.edu(\.|$)/.test(dominio)) return "oficial";
  if (DOMINIOS_AGREGADORES.some((d) => dominio.includes(d))) return "agregador";
  if (PADROES_BLOG.some((p) => p.test(dominio))) return "blog";
  if (
    /globo\.com|estadao|folha|valor|exame|forbes|reuters|bloomberg|meioemensagem|propmark/.test(
      dominio
    )
  ) {
    return "imprensa";
  }
  return "desconhecido";
}

/** Normaliza texto para comparação de similaridade entre claims. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Similaridade de Jaccard sobre palavras — barata e suficiente para dedupe. */
function similaridade(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((w) => w.length > 3));
  const pb = new Set(normalizar(b).split(" ").filter((w) => w.length > 3));
  if (!pa.size || !pb.size) return 0;
  let inter = 0;
  for (const w of pa) if (pb.has(w)) inter++;
  return inter / new Set([...pa, ...pb]).size;
}

/** Marcadores de negação: base da detecção de contradição. */
const NEGACOES = ["não", "nao", "nunca", "negou", "desmentiu", "encerrou", "cancelou", "desistiu"];

function temNegacao(texto: string): boolean {
  const n = normalizar(texto);
  return NEGACOES.some((neg) => n.includes(normalizar(neg)));
}

/**
 * Duas afirmações se contradizem quando falam do MESMO assunto e uma nega o que
 * a outra afirma. Heurística deliberadamente simples: erra para o lado de não
 * detectar (deixa como fontes separadas) em vez de inventar conflito.
 */
function saoContraditorias(a: string, b: string): boolean {
  if (similaridade(a, b) < 0.5) return false;
  return temNegacao(a) !== temNegacao(b);
}

export interface FatoBruto {
  claim: string;
  categoria: CategoriaFato;
  natureza?: "fato" | "inferencia";
  /** URLs das fontes que sustentam. */
  fontes: string[];
  publicadoEm?: string | null;
}

export interface OpcoesPesquisa {
  /**
   * Extração de fatos. Injetável para permitir cenários controlados sem rede.
   * Quando ausente, o agente usa os trechos coletados como base factual.
   */
  extrairFatos?: (fontes: FonteEvidencia[]) => Promise<FatoBruto[]> | FatoBruto[];
  /** Resultados de busca; injetável nos cenários. */
  buscar?: typeof coletarFontes;
  orcamento?: OrcamentoExecucao;
  /** Client de banco para a resolução de entidade. Sem ele, a etapa é pulada. */
  client?: PoolClient;
}

/**
 * Executa a pesquisa e devolve o Evidence Package.
 *
 * A ordem das etapas importa: credibilidade ANTES da extração (porta de custo),
 * verificação DEPOIS da extração (só se verifica o que foi extraído).
 */
export async function pesquisarEvidencias(
  input: PesquisarEvidenciasInput,
  opcoes: OpcoesPesquisa = {}
): Promise<EvidencePackage> {
  const inicio = Date.now();
  const orcamento = opcoes.orcamento ?? new OrcamentoExecucao(undefined, {
    agente: "research_evidence",
    jornada: "prospeccao",
  });
  const descartados: Descarte[] = [];
  const lacunas: Lacuna[] = [];
  const bloqueios: string[] = [];

  // ---------------------------------------------------------------- Planning
  const termos = TERMOS_POR_OBJETIVO[input.objetivo];
  const planoCompleto = termos
    .map((t) => `${input.entidade} ${t}`.trim())
    .slice(0, input.limite_consultas);

  // Guardrail de busca ANTES de disparar qualquer consulta.
  const buscasDisponiveis = Math.max(
    0,
    orcamento.limites.maxBuscasWeb - orcamento.chamadasDe("web_search")
  );
  const plano = planoCompleto.slice(0, buscasDisponiveis);
  if (plano.length < planoCompleto.length) {
    const auth = orcamento.autorizarFerramenta("web_search", { agente: "research_evidence" });
    bloqueios.push(auth.motivo ?? "web_search_limit");
    for (const q of planoCompleto.slice(plano.length)) {
      descartados.push({
        tipo: "fonte",
        referencia: q,
        motivo: "limite_guardrail",
        detalhe: `Consulta não executada: ${auth.detalhe ?? "limite de busca atingido"}`,
      });
    }
  }

  // ----------------------------------------------------------------- Collect
  const buscarFn = opcoes.buscar ?? coletarFontes;
  const coleta = plano.length
    ? await buscarFn({
        consultas: plano.map((termo) => ({
          termo,
          tipo_fonte: "web" as const,
          justificativa: `Objetivo: ${input.objetivo}`,
        })),
        limite_por_consulta: input.limite_resultados_por_consulta,
      })
    : { saida: { total_consultas: 0, total_resultados: 0, coletas: [] }, origem: "mock" as const };
  orcamento.registrarUsoFerramenta("web_search", plano.length);

  // Achata os resultados, guardando a query que os originou.
  const brutos: Array<{ r: ResultadoBusca; query: string }> = [];
  for (const c of coleta.saida.coletas) {
    for (const r of c.resultados) brutos.push({ r, query: c.termo });
  }

  // ------------------------------------------------------------- Credibility
  const credibilidade = avaliarCredibilidade({ resultados: brutos.map((b) => b.r) });
  const porUrl = new Map(credibilidade.saida.avaliacoes.map((a) => [a.url, a]));

  const fontes: FonteEvidencia[] = [];
  const urlsVistas = new Set<string>();
  const titulosVistos: string[] = [];
  const porDominio = new Map<string, number>();

  for (const { r, query } of brutos) {
    const dominio = dominioDe(r.url);
    const aval = porUrl.get(r.url);
    const tipo = classificarTipoFonte(dominio, input.site_oficial);

    // --- Porta 1: anúncio -----------------------------------------------
    // Antes de qualquer outra coisa. Resultado patrocinado não é fonte
    // editorial nem institucional, e descartá-lo aqui economiza scrape.
    const anuncio = detectarAnuncio(r.url, r.titulo);
    if (anuncio.ehAnuncio) {
      descartados.push({
        tipo: "fonte",
        referencia: r.url.slice(0, 120),
        motivo: "anuncio",
        detalhe: `Resultado patrocinado (${anuncio.sinais.join(", ")}). Não foi raspado.`,
      });
      continue;
    }

    // --- Porta 2: relevância para a entidade (pré-scrape) ----------------
    // Menção ao nome não basta: "Reserva" aparece em dicionário de espanhol.
    const relevancia = avaliarRelevanciaPreScrape({
      titulo: r.titulo,
      url: r.url,
      snippet: r.trecho,
      entidade: input.entidade,
      aliases: input.aliases,
      siteOficial: input.site_oficial,
    });
    if (!relevancia.relevante) {
      descartados.push({
        tipo: "fonte",
        referencia: r.url,
        motivo: "entidade_divergente",
        detalhe: `${relevancia.motivo ?? "sem relação com a entidade"} (${relevancia.sinais.join(", ")}). Não foi raspado.`,
      });
      continue;
    }

    // Dedupe: mesma URL, ou mesmo título em domínio diferente (press release
    // replicado não é evidência independente).
    if (urlsVistas.has(r.url)) {
      descartados.push({
        tipo: "fonte",
        referencia: r.url,
        motivo: "duplicado",
        detalhe: "URL já coletada nesta execução.",
      });
      continue;
    }
    const tituloDuplicado = titulosVistos.find((t) => similaridade(t, r.titulo) > 0.75);
    if (tituloDuplicado) {
      descartados.push({
        tipo: "fonte",
        referencia: r.url,
        motivo: "duplicado",
        detalhe: `Mesmo conteúdo já coletado ("${tituloDuplicado.slice(0, 60)}…") — replicação não é fonte independente.`,
      });
      continue;
    }

    // --- Porta 3: credibilidade discriminante ----------------------------
    // Substitui a heurística plana, que dava 58 a Bloomberg, ao site oficial
    // e a um anúncio. Agora a natureza da fonte decide a faixa.
    const qualidade = avaliarFonte({
      url: r.url,
      titulo: r.titulo,
      dominio,
      siteOficial: input.site_oficial,
    });

    if (qualidade.classificacao === "baixa_autoridade" || qualidade.classificacao === "agregador") {
      descartados.push({
        tipo: "fonte",
        referencia: r.url,
        motivo: "baixa_credibilidade",
        detalhe: `${qualidade.classificacao} · score ${qualidade.score} (${qualidade.sinais.join(", ")}).`,
      });
      continue;
    }

    // --- Porta 4: diversidade de domínio -----------------------------------
    // Um só domínio não pode ocupar todas as vagas. O site oficial é excelente
    // para o que a marca faz, e cego para como ela é percebida.
    const usadasDoDominio = porDominio.get(dominio) ?? 0;
    if (usadasDoDominio >= MAX_FONTES_POR_DOMINIO) {
      descartados.push({
        tipo: "fonte",
        referencia: r.url,
        motivo: "duplicado",
        detalhe: `Domínio "${dominio}" já contribuiu com ${MAX_FONTES_POR_DOMINIO} fonte(s); vaga reservada para outra origem.`,
      });
      continue;
    }
    porDominio.set(dominio, usadasDoDominio + 1);

    urlsVistas.add(r.url);
    titulosVistos.push(r.titulo);
    fontes.push({
      source_id: idDe("src", r.url),
      url: r.url,
      titulo: r.titulo,
      dominio,
      tipo_fonte: tipo,
      credibilidade_score: qualidade.score,
      credibilidade_nivel:
        qualidade.score >= 70 ? "alta" : qualidade.score >= 40 ? "media" : "baixa",
      // Mantém os sinais da nova avaliação junto dos da heurística antiga:
      // os dois compõem o rastro do "por quê".
      credibilidade_sinais: [
        `classificacao:${qualidade.classificacao}`,
        ...qualidade.sinais,
        ...(aval?.sinais ?? []),
      ],
      publicado_em: r.publicado_em ?? null,
      coletado_em: r.coletado_em ?? new Date().toISOString(),
      query_origem: query,
    });
  }

  // ------------------------------------------------------- Entity Resolution
  let ambiguidade: EvidencePackage["ambiguidade"] = null;
  if (opcoes.client) {
    const resolucao = await resolverEntidades(opcoes.client, {
      entidades: [input.entidade],
      tipo: "organizacao",
    });
    const r = resolucao.saida.resolucoes[0];
    if (r?.status === "ambigua") {
      ambiguidade = {
        motivo: r.observacao,
        candidatas: r.candidatas.map((c) => ({ nome: c.nome, parte_id: c.parte_id })),
      };
    }
  }

  // Identidade ambígua interrompe: pesquisar a entidade errada e consolidar o
  // resultado é pior do que não pesquisar.
  if (ambiguidade) {
    return montarPacote({
      input, plano, fontes: [], facts: [], descartados, lacunas: [
        { descricao: `Identidade ambígua para "${input.entidade}" — pesquisa interrompida.`, categoria: null },
      ],
      ambiguidade, status: "entidade_ambigua", orcamento, bloqueios, inicio,
      extractionMode: "mock", buscas: plano.length,
    });
  }

  // -------------------------------------------------- Porta de custo (gate)
  const haFonteConfiavel = fontes.some((f) => f.credibilidade_score >= 70);
  if (fontes.length && !haFonteConfiavel) {
    logger.warn(
      { entidade: input.entidade, fontes: fontes.length },
      "Nenhuma fonte atingiu credibilidade mínima; extração poupada"
    );
  }

  // ------------------------------------------------------------- Extraction
  const extrair = opcoes.extrairFatos;
  const brutosFatos: FatoBruto[] = extrair && haFonteConfiavel ? await extrair(fontes) : [];
  const extractionMode: EvidencePackage["extraction_mode"] = extrair
    ? env.extracaoMock ? "mock" : "firecrawl"
    : "mock";

  // ------------------------------------------------------------ Verification
  const facts: Fato[] = [];
  const conflitos: Fato[] = [];
  const agora = new Date();
  const janelaMs = input.janela_meses ? input.janela_meses * 30 * 86_400_000 : null;
  const sensivelATempo = OBJETIVOS_SENSIVEIS_A_TEMPO.includes(input.objetivo);

  for (const bruto of brutosFatos) {
    const refs = bruto.fontes
      .map((u) => fontes.find((f) => f.url === u || f.source_id === u))
      .filter((f): f is FonteEvidencia => Boolean(f));

    // Fato sem fonte válida não entra: proveniência é requisito, não enfeite.
    if (refs.length === 0) {
      descartados.push({
        tipo: "afirmacao",
        referencia: bruto.claim,
        motivo: "afirmacao_sem_suporte",
        detalhe: "Nenhuma fonte aceita sustenta esta afirmação.",
      });
      continue;
    }

    // Recência: fora da janela, o fato não é descartado — é reclassificado como
    // contexto histórico. Só descarta quando o objetivo exige atualidade.
    const publicado = bruto.publicadoEm ?? refs[0].publicado_em;
    if (janelaMs && publicado) {
      const idade = agora.getTime() - new Date(publicado).getTime();
      if (idade > janelaMs) {
        if (sensivelATempo) {
          descartados.push({
            tipo: "afirmacao",
            referencia: bruto.claim,
            motivo: "desatualizado_para_objetivo",
            detalhe: `Publicado em ${publicado}, fora da janela de ${input.janela_meses} meses para "${input.objetivo}".`,
          });
          continue;
        }
        bruto.categoria = "contexto_empresa";
      }
    }

    // Contradição contra um fato já aceito.
    const oposto = facts.find((f) => saoContraditorias(f.claim, bruto.claim));

    const verificacao = verificarFatos({
      afirmacoes: [
        {
          texto: bruto.claim,
          fontes: refs.map((r) => r.url),
          contradita: Boolean(oposto),
        },
      ],
    }).saida.verificacoes[0];

    const dominios = new Set(refs.map((r) => r.dominio)).size;
    const natureza = bruto.natureza ?? "fato";

    // Confiança: corroboração pesa mais que quantidade. Inferência tem teto
    // baixo — nunca se apresenta com a força de um fato verificado.
    const base =
      verificacao.status === "corroborada" ? 75
        : verificacao.status === "fonte_unica" ? 45
          : verificacao.status === "conflitante" ? 30
            : 20;
    const bonusCredibilidade = Math.round(
      (refs.reduce((s, r) => s + r.credibilidade_score, 0) / refs.length - 50) / 5
    );
    const confianca = Math.max(
      5,
      Math.min(natureza === "inferencia" ? 40 : 90, base + bonusCredibilidade)
    );

    const fato: Fato = {
      fact_id: idDe("fact", `${input.entidade}|${bruto.claim}`),
      claim: bruto.claim,
      entidade: input.entidade,
      categoria: bruto.categoria,
      natureza,
      source_refs: refs.map((r) => r.source_id),
      dominios_independentes: dominios,
      verificacao: verificacao.status,
      confianca,
      publicado_em: publicado ?? null,
      coletado_em: refs[0].coletado_em,
      conflito: oposto
        ? { claim_oposta: oposto.claim, source_refs_oposta: oposto.source_refs }
        : null,
    };

    if (verificacao.status === "conflitante") {
      // Marca os DOIS lados: nenhuma versão é escolhida silenciosamente.
      oposto!.verificacao = "conflitante";
      oposto!.conflito = { claim_oposta: fato.claim, source_refs_oposta: fato.source_refs };
      if (!conflitos.includes(oposto!)) conflitos.push(oposto!);
      conflitos.push(fato);
    }

    facts.push(fato);
  }

  // ---------------------------------------------------------------- Lacunas
  const categoriasPedidas = input.categorias_desejadas ?? [];
  for (const cat of categoriasPedidas) {
    if (!facts.some((f) => f.categoria === cat && f.natureza === "fato")) {
      lacunas.push({ descricao: `Nenhum fato confirmado na categoria "${cat}".`, categoria: cat });
    }
  }
  if (fontes.length === 0) {
    lacunas.push({ descricao: "Nenhuma fonte aceita foi coletada.", categoria: null });
  } else if (!haFonteConfiavel) {
    lacunas.push({
      descricao: "Nenhuma fonte atingiu credibilidade alta; extração não foi executada.",
      categoria: null,
    });
  } else if (facts.length === 0) {
    // Fontes boas, mas nenhum fato saiu delas. Declarar a lacuna é o que
    // distingue "pesquisei e não achei" de "não pesquisei".
    lacunas.push({
      descricao: `Fontes confiáveis foram coletadas (${fontes.length}), mas nenhum fato pôde ser extraído delas.`,
      categoria: null,
    });
  }
  if (facts.length && !facts.some((f) => f.verificacao === "corroborada")) {
    lacunas.push({
      descricao: "Nenhum fato foi corroborado por duas fontes independentes.",
      categoria: null,
    });
  }

  if (conflitos.length) {
    lacunas.push({
      descricao: `${conflitos.length} afirmação(ões) em conflito entre fontes independentes — nenhuma versão foi escolhida.`,
      categoria: null,
    });
  }

  // Fail-safe: sem fato utilizável, o pacote declara evidência insuficiente em
  // vez de entregar um relatório com aparência de completo.
  //
  // Fato conflitante NÃO conta como útil: se tudo o que se obteve foi
  // desacordo entre fontes, o agente não sabe o que afirmar — e dizer
  // "sucesso" faria o próximo agente tratar a divergência como conhecimento.
  const temFatoUtil = facts.some(
    (f) =>
      f.natureza === "fato" &&
      f.verificacao !== "nao_confirmada" &&
      f.verificacao !== "conflitante"
  );
  const status: EvidencePackage["status"] = bloqueios.length && !facts.length
    ? "bloqueado_por_guardrail"
    : temFatoUtil
      ? "sucesso"
      : "evidencia_insuficiente";

  return montarPacote({
    input, plano, fontes, facts, descartados, lacunas, ambiguidade: null,
    status, orcamento, bloqueios, inicio, extractionMode, conflitos,
    buscas: plano.length,
  });
}

function montarPacote(a: {
  input: PesquisarEvidenciasInput;
  plano: string[];
  fontes: FonteEvidencia[];
  facts: Fato[];
  descartados: Descarte[];
  lacunas: Lacuna[];
  ambiguidade: EvidencePackage["ambiguidade"];
  status: EvidencePackage["status"];
  orcamento: OrcamentoExecucao;
  bloqueios: string[];
  inicio: number;
  extractionMode: EvidencePackage["extraction_mode"];
  conflitos?: Fato[];
  buscas: number;
}): EvidencePackage {
  return evidencePackageSchema.parse({
    entidade: a.input.entidade,
    objetivo: a.input.objetivo,
    status: a.status,
    plano: a.plano,
    // Planning é determinístico por objetivo — não consome LLM.
    planning_mode: "heuristica",
    extraction_mode: a.extractionMode,
    facts: a.facts,
    sources: a.fontes,
    descartados: a.descartados,
    conflitos: a.conflitos ?? [],
    lacunas: a.lacunas,
    ambiguidade: a.ambiguidade,
    telemetria: {
      duracao_ms: Date.now() - a.inicio,
      consultas: a.plano.length,
      buscas_web: a.buscas,
      scrapes: a.orcamento.chamadasDe("firecrawl_scrape"),
      fontes_coletadas: a.fontes.length,
      fontes_descartadas: a.descartados.filter((d) => d.tipo === "fonte").length,
      fatos_extraidos: a.facts.length,
      fatos_verificados: a.facts.filter((f) => f.verificacao === "corroborada").length,
      custo_estimado_usd: a.orcamento.custoAtual,
      bloqueios_guardrail: a.bloqueios,
    },
  });
}
