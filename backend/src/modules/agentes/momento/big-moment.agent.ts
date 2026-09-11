import { createHash } from "node:crypto";
import {
  CLASSIFIER_VERSAO,
  LIMITES_MOMENTO,
  PESOS_RELEVANCIA,
  bigMomentAnalysisResultSchema,
  type BigMomentAnalysisResult,
  type BigMomentSignal,
  type JanelaOportunidade,
  type StatusTemporal,
  type TipoEvento,
} from "./momento.schema";
import type { Fato } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Big Moment Intelligence Agent.
//
// Consome Evidence JÁ PRODUZIDA e responde se algum fato representa um momento
// temporal relevante para a Cross.
//
// O que este agente NÃO faz, por desenho:
//   · não rasteja a web, não chama Firecrawl, não reexecuta Research
//   · não reexecuta Crossability, Matching nem Recommendation
//   · não cria oportunidade, projeto, parceria; não move funil
//   · não altera Entity Intelligence, Cross Knowledge ou Cross Memory
//   · não trata claim de reunião como fato verificado
//
// Trabalha sobre fatos limpos, não sobre HTML — é o que mantém o custo de
// tokens baixo quando um classificador real substituir o determinístico.
// -----------------------------------------------------------------------------

export interface EntradaBigMoment {
  entidade: string;
  parteId?: string | null;
  /** Fatos do Evidence Package. Autoridade factual. */
  evidencias: Fato[];
  /** Momentos já conhecidos, para distinguir novo de atualização. */
  momentosConhecidos?: BigMomentSignal[];
  /** Claims de reunião — sinais internos, NÃO Evidence. */
  meetingClaims?: Array<{ texto: string; referencia?: string | null }>;
  /** Dimensões que o Crossability já apontou como relevantes. Só contexto. */
  crossabilityDimensoes?: string[];
  /** Relógio da execução; injetável para teste determinístico. */
  agora?: Date;
  classificador?: ClassificadorMomento;
}

/**
 * Contrato do classificador.
 *
 * Separado do pipeline para que trocar determinístico por modelo real não
 * exija reescrever proveniência, agrupamento, temporalidade ou persistência.
 */
export interface ClassificadorMomento {
  modo: "deterministico" | "local" | "pago";
  versao: string;
  classificar(fato: Fato): {
    tipo: TipoEvento | null;
    magnitude: number;
    marketingApenas: boolean;
  };
}

// -----------------------------------------------------------------------------
// Classificação determinística
// -----------------------------------------------------------------------------

/**
 * Padrões por tipo, em ordem de especificidade.
 *
 * SEM `\b` à esquerda em termos acentuados: em JS a fronteira de palavra não é
 * confiável antes de caractere não-ASCII, e `\bturn[êe]\b` simplesmente não
 * casava com "turnê" — o evento mais óbvio da taxonomia passava despercebido.
 *
 * A ordem importa: "turnê nacional com show" é uma TURNÊ, não um show isolado.
 * Por isso `tour` precede `concert`.
 */
const PADROES_EVENTO: Array<{ tipo: TipoEvento; re: RegExp; magnitude: number }> = [
  { tipo: "tour", re: /(turn[êe]|tour\b)/i, magnitude: 0.9 },
  { tipo: "festival", re: /(festival|lollapalooza|rock in rio|coachella)/i, magnitude: 0.85 },
  { tipo: "concert", re: /(\bshow\b|concerto|apresenta[çc][ãa]o ao vivo)/i, magnitude: 0.7 },
  { tipo: "media_release", re: /([áa]lbum|\bsingle\b|\bep\b|\bdisco\b|filme|s[ée]rie|document[áa]rio)/i, magnitude: 0.8 },
  { tipo: "collection_launch", re: /(cole[çc][ãa]o|\bdrop\b|linha (nova|de))/i, magnitude: 0.75 },
  { tipo: "geographic_expansion", re: /(expans[ãa]o|expandir para|chega (a|ao|à)|entra no mercado)/i, magnitude: 0.85 },
  { tipo: "store_opening", re: /(inaugur(a|ou)|abre (loja|unidade)|nova loja|primeira loja)/i, magnitude: 0.8 },
  { tipo: "market_entry", re: /(entrada no mercado|passa a operar|come[çc]a a vender em)/i, magnitude: 0.85 },
  { tipo: "sponsorship", re: /(patroc[íi]nio|patrocina|naming rights)/i, magnitude: 0.8 },
  { tipo: "partnership_announcement", re: /(parceria|collab|colabora[çc][ãa]o com|co-?branding)/i, magnitude: 0.8 },
  { tipo: "ambassadorship", re: /(embaixador|garoto-propaganda|nova cara d[ao])/i, magnitude: 0.75 },
  { tipo: "acquisition", re: /(aquisi[çc][ãa]o|adquiriu|comprou a|fus[ãa]o)/i, magnitude: 0.9 },
  { tipo: "leadership_change", re: /(novo (ceo|presidente|diretor)|assume (a presid[êe]ncia|o cargo))/i, magnitude: 0.7 },
  { tipo: "sport_event", re: /(\bcopa\b|olimp[íi]ada|campeonato|mundial)/i, magnitude: 0.8 },
  { tipo: "anniversary", re: /(\d+\s*anos de|anivers[áa]rio|centen[áa]rio)/i, magnitude: 0.6 },
  { tipo: "product_launch", re: /(lan[çc](a|ou|amento)|novo produto|estreia)/i, magnitude: 0.75 },
  { tipo: "campaign", re: /(campanha|a[çc][ãa]o (publicit[áa]ria|de marketing)|ativa[çc][ãa]o)/i, magnitude: 0.6 },
  { tipo: "milestone", re: /(\bmarco\b|atingiu \d|alcan[çc]ou \d)/i, magnitude: 0.6 },
  { tipo: "cultural_moment", re: /(movimento cultural|tend[êe]ncia cultural)/i, magnitude: 0.55 },
  { tipo: "corporate_move", re: /(reestrutura[çc][ãa]o|mudan[çc]a estrat[ée]gica|novo posicionamento)/i, magnitude: 0.7 },
];

/** Conteúdo rotineiro que nunca é momento, por mais factual que seja. */
const ROTINEIRO = /(termos de uso|pol[íi]tica de privacidade|hor[áa]rio de funcionamento|foto de perfil|atualizou o site|nota de rodap[ée]|cookies)/i;

/** Superlativo de marketing sem evento verificável por trás. */
const MARKETING = /(de todos os tempos|revolucion[áa]ri[oa]|incr[íi]vel|imperd[íi]vel|o melhor do mundo|nunca visto|simplesmente)/i;

const RE_PII = /\b([\w.+-]+@[\w-]+\.[\w.]+|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|\d{3}\.\d{3}\.\d{3}-\d{2})\b/;

export const classificadorDeterministico: ClassificadorMomento = {
  modo: "deterministico",
  versao: CLASSIFIER_VERSAO,
  classificar(fato) {
    const texto = fato.claim;
    if (ROTINEIRO.test(texto)) return { tipo: null, magnitude: 0, marketingApenas: false };

    // Superlativo não é magnitude objetiva. "Nossa maior coleção de todos os
    // tempos" é retórica, não medida — e não pode inflar relevância.
    const marketingApenas = MARKETING.test(texto);

    for (const p of PADROES_EVENTO) {
      if (p.re.test(texto)) {
        return {
          tipo: p.tipo,
          magnitude: marketingApenas ? p.magnitude * 0.5 : p.magnitude,
          marketingApenas,
        };
      }
    }
    return { tipo: null, magnitude: 0, marketingApenas };
  },
};

// -----------------------------------------------------------------------------
// Temporalidade
// -----------------------------------------------------------------------------

const RE_DATA_ISO = /\b(\d{4}-\d{2}-\d{2})\b/;
const RE_DATA_BR = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
/** Expressões vagas: preservadas como texto, nunca normalizadas. */
const RE_VAGA = /(segundo semestre|primeiro semestre|pr[óo]ximo (m[êe]s|ano|semestre)|em breve|ainda este ano|nos pr[óo]ximos meses)/i;

/**
 * Extrai data do fato.
 *
 * `publicado_em` da Evidence é quando a notícia saiu, NÃO quando o evento
 * ocorre. Confundir os dois inventaria cronologia.
 */
function extrairData(claim: string): { valor: string | null; expressao: string | null } {
  const iso = RE_DATA_ISO.exec(claim);
  if (iso) return { valor: iso[1], expressao: iso[1] };

  const br = RE_DATA_BR.exec(claim);
  if (br) {
    const [, d, m, y] = br;
    return { valor: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, expressao: br[0] };
  }

  const vaga = RE_VAGA.exec(claim);
  // Expressão vaga não vira data. "Segundo semestre" não é 01/07.
  if (vaga) return { valor: null, expressao: vaga[0] };

  return { valor: null, expressao: null };
}

// Sem `\b` à esquerda: mesma armadilha de acentuação dos padrões de evento.
const RE_CANCELADO = /(cancelad[oa]|suspens[oa]|adiad[oa] indefinidamente|n[ãa]o (vai|ir[áa]) acontecer)/i;
const RE_OCORRIDO = /(aconteceu|realizou|foi realizad[oa]|estreou|inaugurou|encerrou)/i;
const RE_ANUNCIO = /(anunci(a|ou|ado)|revelou|confirmou|divulgou)/i;

function determinarStatusTemporal(
  claim: string, dataEvento: string | null, agora: Date
): StatusTemporal {
  if (RE_CANCELADO.test(claim)) return "cancelled";
  if (RE_OCORRIDO.test(claim)) return "completed";

  if (dataEvento) {
    const d = new Date(dataEvento);
    if (d > agora) return RE_ANUNCIO.test(claim) ? "announced" : "scheduled";
    return "completed";
  }

  if (RE_ANUNCIO.test(claim)) return "announced";
  return "unknown";
}

/** Janela derivada das datas + relógio. Sem data suficiente, `unknown`. */
function determinarJanela(
  status: StatusTemporal, inicia: string | null, termina: string | null, agora: Date
): JanelaOportunidade {
  if (status === "cancelled") return "expired";
  if (!inicia && !termina) return "unknown";

  const dia = 86_400_000;
  const ini = inicia ? new Date(inicia) : null;
  const fim = termina ? new Date(termina) : ini;

  if (ini && agora < ini) return "pre_event";
  if (ini && fim && agora >= ini && agora <= fim) return "active";
  if (fim) {
    const diasDepois = (agora.getTime() - fim.getTime()) / dia;
    return diasDepois <= LIMITES_MOMENTO.diasPosEvento ? "post_event" : "expired";
  }
  return "unknown";
}

// -----------------------------------------------------------------------------
// Fingerprint e agrupamento
// -----------------------------------------------------------------------------

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Termos que identificam o assunto do evento, além do tipo. */
function assuntoDe(claim: string): string {
  const palavras = normalizar(claim).split(" ")
    .filter((w) => w.length > 4 && !/^(sobre|para|pelos|pelas|nossa|nosso|serao|estao)$/.test(w));
  return [...new Set(palavras)].sort().slice(0, 5).join("-");
}

/**
 * Impressão digital do evento.
 *
 * entidade + tipo + assunto + contexto temporal. É o que faz dez matérias sobre
 * o mesmo lançamento virarem UM momento com dez Evidence refs.
 *
 * O contexto temporal entra para NÃO colapsar eventos distintos: dois shows da
 * mesma turnê, em datas diferentes, são eventos diferentes.
 */
export function calcularFingerprint(
  entidade: string, tipo: TipoEvento, claim: string, dataEvento: string | null
): string {
  const material = [
    normalizar(entidade),
    tipo,
    assuntoDe(claim),
    dataEvento ?? "sem-data",
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

export async function analisarBigMoments(
  entrada: EntradaBigMoment
): Promise<BigMomentAnalysisResult> {
  const inicioMs = Date.now();
  const agora = entrada.agora ?? new Date();
  const classificador = entrada.classificador ?? classificadorDeterministico;
  const avisos: string[] = [];

  const naoMomentos: BigMomentAnalysisResult["non_moments"] = [];
  const duplicadas: BigMomentAnalysisResult["duplicate_evidence"] = [];
  const naoResolvidos: BigMomentAnalysisResult["unresolved_signals"] = [];

  // Claims de reunião entram como SINAL INTERNO, jamais como Evidence. Sem
  // fonte externa, "vamos abrir 20 lojas" não é um momento factual.
  for (const mc of entrada.meetingClaims ?? []) {
    naoResolvidos.push({
      origem: "meeting_claim",
      texto: mc.texto,
      status: "unverified_internal_signal",
      referencia: mc.referencia ?? null,
    });
  }

  // Teto de entrada — mesma disciplina do candidate explosion do Matching.
  let evidencias = entrada.evidencias;
  if (evidencias.length > LIMITES_MOMENTO.maxEvidencePorAnalise) {
    avisos.push(
      `Evidence truncada em ${LIMITES_MOMENTO.maxEvidencePorAnalise} de ${evidencias.length}.`
    );
    evidencias = evidencias.slice(0, LIMITES_MOMENTO.maxEvidencePorAnalise);
  }
  const recebidas = entrada.evidencias.length;

  // ------------------------------------------------ classificação e filtro
  interface Candidato {
    fato: Fato;
    tipo: TipoEvento;
    magnitude: number;
    marketingApenas: boolean;
    data: { valor: string | null; expressao: string | null };
    fingerprint: string;
  }
  const candidatos: Candidato[] = [];

  for (const fato of evidencias) {
    // Só FATO sustenta momento. Inferência e marketing ficam de fora.
    if (fato.natureza !== "fato") {
      naoMomentos.push({
        evidence_ref: fato.fact_id, claim: fato.claim,
        motivo: "nao_e_fato",
        detalhe: `Natureza "${fato.natureza}" não sustenta momento factual.`,
      });
      continue;
    }
    if (RE_PII.test(fato.claim)) {
      naoMomentos.push({
        evidence_ref: fato.fact_id, claim: fato.claim,
        motivo: "pii_incidental", detalhe: "Contém dado pessoal incidental.",
      });
      continue;
    }

    const c = classificador.classificar(fato);
    if (!c.tipo) {
      naoMomentos.push({
        evidence_ref: fato.fact_id, claim: fato.claim,
        motivo: ROTINEIRO.test(fato.claim) ? "conteudo_rotineiro" : "baixa_relevancia_temporal",
        detalhe: ROTINEIRO.test(fato.claim)
          ? "Conteúdo operacional de rotina; não caracteriza acontecimento."
          : "Nenhum tipo de evento reconhecido no fato.",
      });
      continue;
    }
    // Retórica PURA não vira momento — mas retórica em cima de evento real
    // apenas reduz a magnitude. "A maior coleção de todos os tempos" continua
    // sendo um lançamento; o superlativo é que não conta como magnitude.
    if (c.marketingApenas && c.magnitude === 0) {
      naoMomentos.push({
        evidence_ref: fato.fact_id, claim: fato.claim,
        motivo: "marketing_sem_evento",
        detalhe: "Linguagem promocional sem acontecimento verificável.",
      });
      continue;
    }

    const data = extrairData(fato.claim);
    candidatos.push({
      fato, tipo: c.tipo, magnitude: c.magnitude,
      marketingApenas: c.marketingApenas, data,
      fingerprint: calcularFingerprint(entrada.entidade, c.tipo, fato.claim, data.valor),
    });
  }

  // ------------------------------------------------------- agrupamento
  const grupos = new Map<string, Candidato[]>();
  for (const c of candidatos) {
    const g = grupos.get(c.fingerprint);
    if (g) {
      if (g.length >= LIMITES_MOMENTO.maxEvidencePorGrupo) {
        duplicadas.push({ evidence_ref: c.fato.fact_id, agrupado_em: c.fingerprint });
        continue;
      }
      g.push(c);
      duplicadas.push({ evidence_ref: c.fato.fact_id, agrupado_em: c.fingerprint });
    } else {
      grupos.set(c.fingerprint, [c]);
    }
  }

  // ------------------------------------------------------- montagem
  const conhecidos = new Map(
    (entrada.momentosConhecidos ?? []).map((m) => [m.event_fingerprint, m])
  );
  const momentos: BigMomentSignal[] = [];
  let novos = 0;
  let atualizados = 0;

  for (const [fingerprint, grupo] of grupos) {
    if (momentos.length >= LIMITES_MOMENTO.maxMomentosPorEntidade) {
      avisos.push(`Teto de ${LIMITES_MOMENTO.maxMomentosPorEntidade} momentos atingido.`);
      break;
    }

    const principal = grupo[0];
    const refs = grupo.map((g) => g.fato.fact_id);
    const dominios = Math.max(...grupo.map((g) => g.fato.dominios_independentes));

    // Força vem da Evidence — não é recalculada aqui.
    const temConflito = grupo.some((g) => g.fato.verificacao === "conflitante");
    const forca = temConflito ? "conflitante"
      : dominios >= 2 || grupo.length >= 2 ? "corroborada" : "fonte_unica";

    // Conflito de data entre fontes: preservado, nenhuma escolhida.
    const conflitos: BigMomentSignal["conflitos"] = [];
    const datas = [...new Set(grupo.map((g) => g.data.valor).filter(Boolean))] as string[];
    if (datas.length > 1) {
      conflitos.push({
        campo: "data_evento", valor_a: datas[0], valor_b: datas[1],
        evidence_a: grupo[0].fato.fact_id, evidence_b: grupo[1]?.fato.fact_id ?? "",
        observacao: "Fontes divergem sobre a data. Nenhuma foi escolhida.",
      });
    }

    // Cancelamento em qualquer fonte do grupo domina o status: é a informação
    // mais recente e mais consequente sobre o evento.
    const cancelado = grupo.find((g) => RE_CANCELADO.test(g.fato.claim));
    const dataEvento = datas.length === 1 ? datas[0] : null;
    const status = cancelado
      ? "cancelled"
      : determinarStatusTemporal(principal.fato.claim, dataEvento, agora);

    const janela = determinarJanela(status, dataEvento, dataEvento, agora);

    // Frescor pela publicação mais recente do grupo.
    const publicados = grupo.map((g) => g.fato.publicado_em).filter(Boolean) as string[];
    const maisRecente = publicados.length
      ? publicados.sort().reverse()[0]
      : null;
    const diasDesde = maisRecente
      ? (agora.getTime() - new Date(maisRecente).getTime()) / 86_400_000
      : null;

    const componentes = montarComponentes({
      status, janela, forca, dominios,
      magnitude: principal.magnitude,
      diasDesde, marketingApenas: principal.marketingApenas,
      temParte: Boolean(entrada.parteId),
    });
    const score = Math.round(
      componentes.reduce((s, c) => s + c.contribuicao, 0) * 10000
    ) / 100;

    const lacunas: string[] = [];
    if (!dataEvento && principal.data.expressao) {
      lacunas.push(`Data não normalizável: "${principal.data.expressao}".`);
    } else if (!dataEvento) {
      lacunas.push("Nenhuma data do evento identificada.");
    }
    if (forca === "fonte_unica") lacunas.push("Sustentado por fonte única.");

    const riscos: string[] = [];
    if (principal.marketingApenas) {
      riscos.push("Linguagem promocional presente; magnitude reduzida.");
    }
    if (status === "announced") {
      riscos.push("Anúncio, não ocorrência confirmada.");
    }

    const anterior = conhecidos.get(fingerprint);
    const situacao = !anterior ? "novo"
      : refs.some((r) => !anterior.evidence_refs.includes(r)) || anterior.temporal_status !== status
        ? "atualizado" : "inalterado";
    if (situacao === "novo") novos++;
    if (situacao === "atualizado") atualizados++;

    momentos.push({
      id: anterior?.id ?? `BM-${fingerprint.slice(0, 8)}`,
      entidade: entrada.entidade,
      parte_id: entrada.parteId ?? null,
      event_type: principal.tipo,
      titulo: principal.fato.claim.slice(0, 200),
      resumo_factual: grupo.map((g) => g.fato.claim).join(" · ").slice(0, 800),
      temporal_status: status,
      expressao_temporal: principal.data.expressao,
      anunciado_em: status === "announced" ? maisRecente?.slice(0, 10) ?? null : null,
      inicia_em: dataEvento,
      termina_em: null,
      ocorreu_em: status === "completed" ? dataEvento : null,
      primeiro_visto_em: anterior?.primeiro_visto_em ?? agora.toISOString(),
      ultimo_visto_em: agora.toISOString(),
      janela_oportunidade: janela,
      evidence_refs: [...new Set([...(anterior?.evidence_refs ?? []), ...refs])],
      forca_verificacao: forca,
      dominios_independentes: dominios,
      prioridade_score: score,
      componentes_relevancia: componentes,
      // Só aponta o que o Crossability JÁ identificou. Não recalcula nada.
      crossability_activation_candidates: entrada.crossabilityDimensoes ?? [],
      riscos,
      conflitos,
      lacunas,
      situacao,
      event_fingerprint: fingerprint,
      versao: anterior ? anterior.versao + (situacao === "atualizado" ? 1 : 0) : 1,
      nivel_validacao: "estrutural",
    });
  }

  // Ordenação determinística: score → fingerprint (desempate estável).
  momentos.sort((a, b) =>
    b.prioridade_score !== a.prioridade_score
      ? b.prioridade_score - a.prioridade_score
      : a.event_fingerprint.localeCompare(b.event_fingerprint)
  );

  // Propostas de atualização do perfil — NUNCA promovidas.
  const candidatosPerfil = momentos
    .filter((m) => ["geographic_expansion", "market_entry", "store_opening"].includes(m.event_type))
    .map((m) => ({
      campo: "territorios", valor: m.titulo,
      origem_momento: m.id, promotion_status: "nao_promovido" as const,
    }));

  return bigMomentAnalysisResultSchema.parse({
    entidade: entrada.entidade,
    parte_id: entrada.parteId ?? null,
    analisado_em: agora.toISOString(),
    moments: momentos,
    non_moments: naoMomentos,
    duplicate_evidence: duplicadas,
    unresolved_signals: naoResolvidos,
    entity_intelligence_update_candidates: candidatosPerfil,
    classifier_mode: classificador.modo,
    classifier_versao: classificador.versao,
    nivel_validacao: "estrutural",
    validacao_semantica_real: "pendente",
    telemetria: {
      duracao_ms: Date.now() - inicioMs,
      evidence_recebida: recebidas,
      evidence_considerada: candidatos.length,
      evidence_descartada: naoMomentos.length,
      grupos_de_evento: grupos.size,
      momentos_novos: novos,
      momentos_atualizados: atualizados,
      nao_momentos: naoMomentos.length,
      llm_calls: 0,
      embedding_calls: 0,
      custo_estimado_usd: 0,
      // O agente não escreve nada operacional; zeros estruturais.
      oportunidades_criadas: 0,
      recomendacoes_criadas: 0,
      matching_disparado: 0,
      perfis_alterados: 0,
      score_cards_alterados: 0,
      cross_knowledge_escrito: 0,
      cross_memory_promovido: 0,
      avisos,
    },
  });
}

/** Componentes do score de triagem, cada um explicável. */
function montarComponentes(a: {
  status: StatusTemporal; janela: JanelaOportunidade;
  forca: string; dominios: number; magnitude: number;
  diasDesde: number | null; marketingApenas: boolean; temParte: boolean;
}): BigMomentSignal["componentes_relevancia"] {
  const temporal = a.janela === "active" ? 1
    : a.janela === "pre_event" ? 0.9
    : a.janela === "post_event" ? 0.4
    : a.janela === "expired" ? 0 : 0.5;

  const evidencia = a.forca === "corroborada" ? 1
    : a.forca === "fonte_unica" ? 0.5 : 0.3;

  const frescor = a.diasDesde === null ? 0.5
    : a.diasDesde <= 30 ? 1
    : a.diasDesde <= 90 ? 0.7
    : a.diasDesde <= LIMITES_MOMENTO.diasParaObsoleto ? 0.3 : 0;

  const entidade = a.temParte ? 1 : 0.6;

  const mk = (
    componente: string, peso: number, valor: number, justificativa: string
  ) => ({
    componente, peso,
    valor: Math.round(valor * 100) / 100,
    contribuicao: Math.round(peso * valor * 10000) / 10000,
    justificativa,
  });

  return [
    mk("relevancia_temporal", PESOS_RELEVANCIA.relevancia_temporal, temporal,
       `Janela ${a.janela}, status ${a.status}.`),
    mk("qualidade_evidencia", PESOS_RELEVANCIA.qualidade_evidencia, evidencia,
       `Verificação ${a.forca}, ${a.dominios} domínio(s) independente(s).`),
    mk("magnitude", PESOS_RELEVANCIA.magnitude, a.magnitude,
       a.marketingApenas
         ? "Magnitude reduzida por linguagem promocional."
         : "Magnitude derivada do tipo de evento."),
    mk("frescor", PESOS_RELEVANCIA.frescor, frescor,
       a.diasDesde === null
         ? "Sem data de publicação; frescor neutro."
         : `Publicado há ${Math.round(a.diasDesde)} dia(s).`),
    mk("relevancia_entidade", PESOS_RELEVANCIA.relevancia_entidade, entidade,
       a.temParte ? "Entidade vinculada a uma Parte da base." : "Entidade externa não vinculada."),
  ];
}
