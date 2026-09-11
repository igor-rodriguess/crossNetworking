import { createHash } from "node:crypto";
import {
  EXTRACTOR_VERSAO,
  LIMITES_REUNIAO,
  meetingIntelligenceResultSchema,
  type ItemExtraido,
  type MeetingIntelligenceResult,
  type Segmento,
  type SpeakerRef,
  type TipoConteudo,
  type TipoItem,
} from "./reuniao.schema";

// -----------------------------------------------------------------------------
// Meeting Intelligence Agent.
//
// Transforma o conteúdo de uma reunião em inteligência estruturada e
// rastreável. Cada item aponta o segmento, o speaker e o trecho literal.
//
// O que este agente NÃO faz, por desenho:
//   · não cria oportunidade, projeto, parceria ou reunião
//   · não altera funil, Paper ou Score Card
//   · não escreve em Cross Knowledge nem promove Cross Memory
//   · não executa Crossability, Matching ou Recommendation
//   · não trata o que foi DITO como o que é VERDADE
//
// Modo estrutural: extração determinística por padrões linguísticos. A
// interface `ExtratorSemantico` existe para trocar por modelo real depois sem
// reescrever proveniência, validação, persistência ou contrato.
// -----------------------------------------------------------------------------

export interface EntradaMeetingIntelligence {
  reuniaoId: string;
  conteudo: string;
  tipoConteudo?: TipoConteudo;
  conteudoVersao?: number;
  /** Mapeamento rótulo → identidade. Sem ele, o speaker fica não resolvido. */
  mapeamentoSpeakers?: Array<{
    rotulo: string;
    parteId?: string | null;
    usuarioInternoId?: string | null;
    nome?: string | null;
  }>;
  contexto?: {
    candidaturaParceiroId?: string | null;
    projetoId?: string | null;
    parceriaId?: string | null;
  };
  /** Ponto de extensão: substitui a extração determinística por outra. */
  extrator?: ExtratorSemantico;
}

/**
 * Contrato do extrator.
 *
 * Separado do pipeline de propósito: trocar determinístico por modelo pago não
 * pode exigir reescrever proveniência, dedupe, validação ou persistência.
 */
export interface ExtratorSemantico {
  modo: "deterministico" | "local" | "pago";
  versao: string;
  extrair(segmentos: Segmento[]): Promise<Array<{
    tipo: TipoItem;
    texto: string;
    segmentId: string;
    quote: string;
    confianca: number;
    primeiraPessoa?: boolean;
    prazoTexto?: string | null;
    responsavelTexto?: string | null;
  }>>;
}

export function hashConteudo(conteudo: string): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

// -----------------------------------------------------------------------------
// Segmentação
// -----------------------------------------------------------------------------

/** Reconhece "Nome:" no início da linha — formato de ata e de transcript. */
const RE_SPEAKER = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{1,40}?)\s*:\s*(.+)$/;
/** Timestamp opcional: [00:12:34] ou (00:12). */
const RE_TIMESTAMP = /^\s*[[(](\d{1,2}:\d{2}(?::\d{2})?)[\])]\s*/;

/**
 * Quebra o conteúdo em segmentos.
 *
 * Linha a linha, preservando ordem — a ordem importa: uma decisão revogada
 * depois só é detectável se soubermos o que veio antes.
 */
export function segmentar(conteudo: string): Segmento[] {
  const segmentos: Segmento[] = [];
  const linhas = conteudo.split(/\r?\n/);

  for (const linha of linhas) {
    const bruta = linha.trim();
    if (!bruta) continue;

    let texto = bruta;
    let inicio: string | null = null;

    const ts = RE_TIMESTAMP.exec(texto);
    if (ts) {
      inicio = ts[1];
      texto = texto.slice(ts[0].length).trim();
    }

    let speaker: string | null = null;
    const m = RE_SPEAKER.exec(texto);
    if (m) {
      speaker = m[1].trim();
      texto = m[2].trim();
    }

    if (!texto) continue;

    segmentos.push({
      segment_id: `SEG-${String(segmentos.length + 1).padStart(3, "0")}`,
      ordem: segmentos.length + 1,
      speaker_rotulo: speaker,
      texto,
      inicio,
      fim: null,
    });
  }

  return segmentos;
}

// -----------------------------------------------------------------------------
// Extração determinística
// -----------------------------------------------------------------------------

/**
 * Padrões por tipo.
 *
 * A distinção mais delicada é decisão × opinião. "Vamos seguir com X" decide;
 * "eu gosto de X" não. Por isso os padrões de decisão exigem verbo de
 * deliberação coletiva, e há uma lista explícita de padrões de opinião que
 * NUNCA viram decisão.
 */
const PADROES: Array<{ tipo: TipoItem; re: RegExp; confianca: number }> = [
  // Decisão: deliberação explícita e AFIRMATIVA.
  //
  // A negação é excluída no próprio padrão: "não vamos conseguir" tem a mesma
  // forma verbal de "vamos seguir", mas é o oposto. Sem isso, uma objeção era
  // classificada como decisão — e o conflito entre as duas falas desaparecia.
  { tipo: "decisao", re: /(?<!n[ãa]o\s)\b(vamos seguir|decidimos|fica (decidido|definido)|est[áa] (decidido|aprovado)|fechado ent[ãa]o|optamos por)\b/i, confianca: 85 },
  // Compromisso: alguém assume uma ação.
  { tipo: "compromisso", re: /\b(vou enviar|vai enviar|eu envio|fico de|me comprometo|assumo|vou preparar|vai preparar|vou mandar|vai mandar)\b/i, confianca: 80 },
  // Próximo passo combinado.
  { tipo: "proximo_passo", re: /\b(pr[óo]ximo passo|pr[óo]ximos passos|na sequ[êe]ncia (vamos|iremos)|ficou combinado|vamos marcar)\b/i, confianca: 75 },
  // Objetivo declarado.
  { tipo: "objetivo", re: /\b(nosso objetivo|queremos (aumentar|crescer|entrar|expandir|chegar|alcan[çc]ar)|a meta [ée]|buscamos)\b/i, confianca: 80 },
  // Interesse.
  { tipo: "interesse", re: /\b(temos interesse|nos interessa|gostar[íi]amos de explorar|estamos abertos a|seria interessante)\b/i, confianca: 70 },
  // Necessidade.
  { tipo: "necessidade", re: /\b(precisamos|necessitamos|precisar[íi]amos|estamos precisando|o que falta [ée])\b/i, confianca: 80 },
  // Dor.
  { tipo: "dor", re: /\b(nosso (problema|desafio)|temos dificuldade|a dor [ée]|sofremos com|o gargalo)\b/i, confianca: 75 },
  // Restrição.
  { tipo: "restricao", re: /\b(n[ãa]o podemos|estamos impedidos|h[áa] (uma )?restri[çc][ãa]o|exclusividade|至|n[ãa]o [ée] poss[íi]vel (at[ée]|antes))\b/i, confianca: 80 },
  // Objeção. Inclui a negação de viabilidade, que é a forma mais comum de
  // discordância numa reunião ("não vamos conseguir", "não dá para").
  //
  // Sem `\b` à esquerda: em JS, a fronteira de palavra não se comporta de forma
  // confiável antes de caractere acentuado, e "é inviável" deixava de casar.
  { tipo: "objecao", re: /(o problema disso|n[ãa]o concordo|vejo um risco|isso n[ãa]o funciona|tenho receio|invi[áa]vel|imposs[íi]vel|n[ãa]o (vamos|vai|d[áa]) (conseguir|dar|ser poss[íi]vel)|n[ãa]o d[áa] para)/i, confianca: 75 },
  // Pergunta em aberto.
  { tipo: "pergunta_aberta", re: /\?\s*$/, confianca: 70 },
  // Ativo mencionado.
  { tipo: "ativo", re: /\b(temos|possu[íi]mos|contamos com)\s+(\d|mais de|cerca de|nossa rede|nosso programa|nossa plataforma)/i, confianca: 70 },
  // Oferta.
  { tipo: "oferta", re: /\b(podemos oferecer|conseguimos disponibilizar|colocamos [àa] disposi[çc][ãa]o|oferecemos)\b/i, confianca: 75 },
];

/** Opinião nunca vira decisão, por mais que pareça. */
const PADROES_OPINIAO = /\b(eu (gosto|acho|prefiro|curti)|na minha opini[ãa]o|me parece|acho que|talvez|pessoalmente)\b/i;

/** Afirmação factual sobre o mundo — vira MEETING_CLAIM, jamais Evidence. */
const RE_CLAIM = /\b(\d[\d.,]*)\s*(mil|milh[õo]es|milh[ãa]o|bilh[õo]es|%|por cento|lojas|clientes|seguidores|unidades|pontos de venda)\b/i;

/** PII incidental que não deve ser promovida. */
const RE_PII = /\b([\w.+-]+@[\w-]+\.[\w.]+|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|\d{3}\.\d{3}\.\d{3}-\d{2})\b/;

/** Datas normalizáveis com segurança. Sem ano inequívoco, não normaliza. */
const RE_PRAZO = /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/;
const RE_PRAZO_VAGO = /\b(sexta|segunda|ter[çc]a|quarta|quinta|s[áa]bado|domingo|semana que vem|pr[óo]xima semana|amanh[ãa]|hoje)\b/i;

/** Extrator determinístico padrão. */
export const extratorDeterministico: ExtratorSemantico = {
  modo: "deterministico",
  versao: EXTRACTOR_VERSAO,
  async extrair(segmentos) {
    const achados: Array<{
      tipo: TipoItem; texto: string; segmentId: string; quote: string;
      confianca: number; primeiraPessoa?: boolean;
      prazoTexto?: string | null; responsavelTexto?: string | null;
    }> = [];

    for (const seg of segmentos) {
      const ehOpiniao = PADROES_OPINIAO.test(seg.texto);

      for (const p of PADROES) {
        if (!p.re.test(seg.texto)) continue;

        // Opinião não vira intenção declarada. "Eu gosto da proposta A, parece
        // alinhada com o que buscamos" contém "buscamos", mas é preferência
        // pessoal — não decisão, não objetivo, não compromisso.
        //
        // Estes são os tipos que exigem intenção deliberada da organização;
        // interesse e objeção continuam válidos vindos de opinião, porque é
        // exatamente isso que eles representam.
        const EXIGE_INTENCAO: TipoItem[] = ["decisao", "objetivo", "compromisso", "proximo_passo"];
        if (ehOpiniao && EXIGE_INTENCAO.includes(p.tipo)) continue;

        const prazo = RE_PRAZO.exec(seg.texto);
        const prazoVago = RE_PRAZO_VAGO.exec(seg.texto);

        achados.push({
          tipo: p.tipo,
          texto: seg.texto,
          segmentId: seg.segment_id,
          quote: seg.texto,
          // Opinião reduz a confiança da extração mesmo quando o tipo é válido.
          confianca: ehOpiniao ? Math.max(30, p.confianca - 30) : p.confianca,
          primeiraPessoa: /\b(nós|nosso|nossa|temos|somos|estamos|vamos)\b/i.test(seg.texto),
          prazoTexto: prazo?.[1] ?? prazoVago?.[1] ?? null,
          // Só normaliza data inequívoca; "sexta" continua como texto original.
          responsavelTexto: seg.speaker_rotulo,
        });
      }

      // Claim factual, independente dos demais padrões.
      if (RE_CLAIM.test(seg.texto)) {
        achados.push({
          tipo: "meeting_claim",
          texto: seg.texto,
          segmentId: seg.segment_id,
          quote: seg.texto,
          confianca: 85,
          primeiraPessoa: /\b(nós|nosso|nossa|temos|somos)\b/i.test(seg.texto),
        });
      }
    }

    return achados;
  },
};

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Similaridade de Jaccard — base do dedupe. */
function similar(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((w) => w.length > 3));
  const pb = new Set(normalizar(b).split(" ").filter((w) => w.length > 3));
  if (!pa.size || !pb.size) return 0;
  let inter = 0;
  for (const w of pa) if (pb.has(w)) inter++;
  return inter / new Set([...pa, ...pb]).size;
}

const CAMPO_POR_TIPO: Record<TipoItem, keyof MeetingIntelligenceResult> = {
  objetivo: "objetivos", interesse: "interesses", necessidade: "necessidades",
  dor: "dores", ativo: "ativos", oferta: "ofertas", restricao: "restricoes",
  objecao: "objecoes", decisao: "decisoes", compromisso: "compromissos",
  proximo_passo: "proximos_passos", pergunta_aberta: "perguntas_abertas",
  meeting_claim: "meeting_claims", sinal_relacionamento: "sinais_relacionamento",
  outro_sinal: "sinais_relacionamento",
};

export async function analisarReuniao(
  entrada: EntradaMeetingIntelligence
): Promise<MeetingIntelligenceResult> {
  const inicio = Date.now();
  const extrator = entrada.extrator ?? extratorDeterministico;
  const avisos: string[] = [];
  const rejeitados: MeetingIntelligenceResult["rejeitados"] = [];

  // Teto de entrada: reunião gigante não pode virar contexto ilimitado.
  let conteudo = entrada.conteudo;
  if (conteudo.length > LIMITES_REUNIAO.maxCaracteresEntrada) {
    conteudo = conteudo.slice(0, LIMITES_REUNIAO.maxCaracteresEntrada);
    avisos.push(
      `Conteúdo truncado em ${LIMITES_REUNIAO.maxCaracteresEntrada} caracteres.`
    );
  }

  const segmentos = segmentar(conteudo);

  // ------------------------------------------------------------- speakers
  const mapa = new Map(
    (entrada.mapeamentoSpeakers ?? []).map((m) => [normalizar(m.rotulo), m])
  );
  const rotulos = [...new Set(segmentos.map((s) => s.speaker_rotulo).filter(Boolean))] as string[];

  const participantes: SpeakerRef[] = [];
  const naoResolvidos: string[] = [];

  for (const rotulo of rotulos) {
    const m = mapa.get(normalizar(rotulo));
    if (m && (m.parteId || m.usuarioInternoId)) {
      participantes.push({
        rotulo,
        status: m.parteId ? "parte" : "usuario_interno",
        parte_id: m.parteId ?? null,
        usuario_interno_id: m.usuarioInternoId ?? null,
        nome: m.nome ?? rotulo,
      });
    } else {
      // Sem mapping seguro, o speaker fica não resolvido. Deduzir identidade a
      // partir do que a pessoa menciona seria inventar vínculo.
      participantes.push({
        rotulo, status: "nao_resolvido",
        parte_id: null, usuario_interno_id: null, nome: null,
      });
      naoResolvidos.push(rotulo);
    }
  }

  // ----------------------------------------------- conteúdo insuficiente
  //
  // Mede SUBSTÂNCIA, não número de linhas. Uma frase só ("Vou enviar o material
  // na sexta") é analisável; três linhas de cumprimento não são.
  //
  // Uma primeira versão exigia dois segmentos e descartava reuniões curtas mas
  // legítimas — contar linhas não diz nada sobre conteúdo.
  const SAUDACOES = /^(oi|ol[áa]|bom dia|boa tarde|boa noite|tudo bem|obrigad[oa]|at[ée] mais|tchau|valeu|perfeito|ok)\b/i;
  const comSubstancia = segmentos.filter(
    (s) => s.texto.split(/\s+/).length >= 4 && !SAUDACOES.test(s.texto)
  );
  const palavrasUteis = comSubstancia.reduce((n, s) => n + s.texto.split(/\s+/).length, 0);

  if (comSubstancia.length === 0 || palavrasUteis < 6) {
    return montarResultado({
      entrada, conteudo, segmentos, participantes, naoResolvidos,
      itens: [], conflitos: [], rejeitados, avisos, extrator,
      status: "conteudo_insuficiente", lotes: 0, deduplicados: 0, inicio,
    });
  }

  // ------------------------------------------------- extração em lotes
  // Lotes existem para que uma reunião de três horas não dependa de caber num
  // único prompt quando o extrator for um modelo real.
  const lotes: Segmento[][] = [];
  for (let i = 0; i < segmentos.length; i += LIMITES_REUNIAO.maxSegmentosPorLote) {
    lotes.push(segmentos.slice(i, i + LIMITES_REUNIAO.maxSegmentosPorLote));
  }

  const brutos: Awaited<ReturnType<ExtratorSemantico["extrair"]>> = [];
  for (const lote of lotes) {
    brutos.push(...(await extrator.extrair(lote)));
  }

  // ------------------------------------------------ validação e dedupe
  const porSegmento = new Map(segmentos.map((s) => [s.segment_id, s]));
  const itens: ItemExtraido[] = [];
  let deduplicados = 0;

  for (const b of brutos) {
    const seg = porSegmento.get(b.segmentId);
    // Proveniência inexistente derruba o item — sem isso, o "trace" seria
    // decorativo.
    if (!seg) {
      rejeitados.push({ texto: b.texto, motivo: "segmento_inexistente" });
      continue;
    }
    if (!seg.texto.includes(b.quote) && !b.quote.includes(seg.texto)) {
      rejeitados.push({ texto: b.texto, motivo: "quote_inexistente" });
      continue;
    }
    if (RE_PII.test(b.texto)) {
      rejeitados.push({ texto: b.texto, motivo: "pii_incidental" });
      continue;
    }

    // Dedupe só dentro do mesmo tipo: "jovens universitários" e "executivos
    // jovens" são públicos diferentes e não podem colapsar.
    const existente = itens.find(
      (i) => i.tipo === b.tipo && similar(i.texto, b.texto) >= 0.75
    );
    if (existente) {
      if (!existente.source_segments.includes(b.segmentId)) {
        existente.source_segments.push(b.segmentId);
      }
      deduplicados++;
      continue;
    }

    const speaker = seg.speaker_rotulo;
    const ref = participantes.find((p) => p.rotulo === speaker);

    itens.push({
      item_id: `ITEM-${String(itens.length + 1).padStart(3, "0")}`,
      tipo: b.tipo,
      texto: b.texto,
      speaker_rotulo: speaker,
      parte_id: ref?.parte_id ?? null,
      source_segments: [b.segmentId],
      supporting_quote: b.quote,
      extraction_confidence: b.confianca,
      // Claim de reunião NUNCA nasce verificada. Verificar o mundo é outro
      // agente, com fonte externa.
      verification_status: "nao_verificado",
      primeira_pessoa: b.primeiraPessoa ?? false,
      prazo_texto: b.prazoTexto ?? null,
      prazo_normalizado: b.prazoTexto && RE_PRAZO.test(b.prazoTexto) ? b.prazoTexto : null,
      responsavel_texto: b.tipo === "compromisso" ? (b.responsavelTexto ?? null) : null,
    });
  }

  // ------------------------------------------------------------ conflitos
  const conflitos = detectarConflitos(itens);

  // Decisão revogada: a posterior não apaga a anterior, marca como superada.
  marcarSuperadas(itens, segmentos);

  return montarResultado({
    entrada, conteudo, segmentos, participantes, naoResolvidos,
    itens, conflitos, rejeitados, avisos, extrator,
    status: "analisada", lotes: lotes.length, deduplicados, inicio,
  });
}

/** Divergências entre falas. Nenhum lado vence. */
function detectarConflitos(itens: ItemExtraido[]): MeetingIntelligenceResult["conflitos"] {
  const conflitos: MeetingIntelligenceResult["conflitos"] = [];
  const NEGACAO = /\b(n[ãa]o|imposs[íi]vel|invi[áa]vel|jamais)\b/i;

  for (let i = 0; i < itens.length; i++) {
    for (let j = i + 1; j < itens.length; j++) {
      const a = itens[i];
      const b = itens[j];
      if (a.speaker_rotulo === b.speaker_rotulo) continue;

      // Mesmo assunto, polaridade oposta.
      const mesmoAssunto = similar(a.texto, b.texto) >= 0.35;
      const polaridadeOposta = NEGACAO.test(a.texto) !== NEGACAO.test(b.texto);
      if (!mesmoAssunto || !polaridadeOposta) continue;

      conflitos.push({
        item_a: a.item_id, item_b: b.item_id,
        texto_a: a.texto, texto_b: b.texto,
        segmentos_a: a.source_segments, segmentos_b: b.source_segments,
        observacao: "Participantes divergem. Nenhuma versão foi escolhida.",
      });
    }
  }
  return conflitos;
}

/**
 * Marca decisões revogadas depois.
 *
 * A decisão anterior NÃO é apagada: fica registrada com `superseded_by`. O
 * histórico da deliberação importa tanto quanto o resultado.
 */
function marcarSuperadas(itens: ItemExtraido[], segmentos: Segmento[]): void {
  const ordemDe = new Map(segmentos.map((s) => [s.segment_id, s.ordem]));
  const decisoes = itens
    .filter((i) => i.tipo === "decisao")
    .sort((a, b) => (ordemDe.get(a.source_segments[0]) ?? 0) - (ordemDe.get(b.source_segments[0]) ?? 0));

  const REVOGACAO = /\b(na verdade|voltando atr[áa]s|mudamos de ideia|cancelando|n[ãa]o faremos|desconsidere)\b/i;

  for (let i = 0; i < decisoes.length; i++) {
    if (!REVOGACAO.test(decisoes[i].texto)) continue;
    for (let j = 0; j < i; j++) {
      if (similar(decisoes[j].texto, decisoes[i].texto) >= 0.3) {
        decisoes[j].superseded_by = decisoes[i].item_id;
      }
    }
  }
}

function montarResultado(a: {
  entrada: EntradaMeetingIntelligence;
  conteudo: string;
  segmentos: Segmento[];
  participantes: SpeakerRef[];
  naoResolvidos: string[];
  itens: ItemExtraido[];
  conflitos: MeetingIntelligenceResult["conflitos"];
  rejeitados: MeetingIntelligenceResult["rejeitados"];
  avisos: string[];
  extrator: ExtratorSemantico;
  status: "analisada" | "conteudo_insuficiente";
  lotes: number;
  deduplicados: number;
  inicio: number;
}): MeetingIntelligenceResult {
  const porCampo: Record<string, ItemExtraido[]> = {};
  for (const item of a.itens) {
    const campo = CAMPO_POR_TIPO[item.tipo];
    (porCampo[campo] ??= []).push(item);
  }

  const lacunas: string[] = [];
  if (a.status === "conteudo_insuficiente") {
    lacunas.push("Conteúdo sem substância suficiente para análise.");
  } else {
    if (!porCampo.decisoes?.length) lacunas.push("Nenhuma decisão explícita registrada.");
    if (!porCampo.proximos_passos?.length) lacunas.push("Nenhum próximo passo combinado.");
    if (a.naoResolvidos.length) {
      lacunas.push(`${a.naoResolvidos.length} speaker(s) sem identidade resolvida.`);
    }
  }

  // Candidatos a memória: PROPOSTA. Nada é promovido automaticamente.
  const memoryCandidates = a.itens
    .filter((i) => ["objetivo", "interesse", "restricao", "ativo"].includes(i.tipo))
    .slice(0, 20)
    .map((i) => ({
      texto: i.texto, origem_item: i.item_id,
      parte_id: i.parte_id, promotion_status: "nao_promovido" as const,
    }));

  return meetingIntelligenceResultSchema.parse({
    reuniao_id: a.entrada.reuniaoId,
    conteudo_hash: hashConteudo(a.entrada.conteudo),
    conteudo_versao: a.entrada.conteudoVersao ?? 1,
    tipo_conteudo: a.entrada.tipoConteudo ?? "notas",
    status: a.status,
    contexto: {
      candidatura_parceiro_id: a.entrada.contexto?.candidaturaParceiroId ?? null,
      projeto_id: a.entrada.contexto?.projetoId ?? null,
      parceria_id: a.entrada.contexto?.parceriaId ?? null,
    },
    participantes: a.participantes,
    speakers_nao_resolvidos: a.naoResolvidos,
    segmentos: a.segmentos,
    objetivos: porCampo.objetivos ?? [],
    interesses: porCampo.interesses ?? [],
    necessidades: porCampo.necessidades ?? [],
    dores: porCampo.dores ?? [],
    ativos: porCampo.ativos ?? [],
    ofertas: porCampo.ofertas ?? [],
    restricoes: porCampo.restricoes ?? [],
    objecoes: porCampo.objecoes ?? [],
    decisoes: porCampo.decisoes ?? [],
    compromissos: porCampo.compromissos ?? [],
    proximos_passos: porCampo.proximos_passos ?? [],
    perguntas_abertas: porCampo.perguntas_abertas ?? [],
    meeting_claims: porCampo.meeting_claims ?? [],
    sinais_relacionamento: porCampo.sinais_relacionamento ?? [],
    conflitos: a.conflitos,
    lacunas,
    resumo_executivo: sintetizar(porCampo, a.conflitos.length, a.naoResolvidos.length, a.status),
    memory_candidates: memoryCandidates,
    rejeitados: a.rejeitados,
    nivel_validacao: "estrutural",
    validacao_semantica_real: "pendente",
    extractor_mode: a.extrator.modo,
    extractor_versao: a.extrator.versao,
    telemetria: {
      duracao_ms: Date.now() - a.inicio,
      caracteres_entrada: a.conteudo.length,
      total_segmentos: a.segmentos.length,
      total_lotes: a.lotes,
      total_itens: a.itens.length,
      itens_deduplicados: a.deduplicados,
      llm_calls: 0,
      embedding_calls: 0,
      custo_estimado_usd: 0,
      // O agente não escreve nada operacional; os zeros são estruturais.
      oportunidades_criadas: 0,
      projetos_alterados: 0,
      parcerias_alteradas: 0,
      reunioes_criadas: 0,
      score_cards_alterados: 0,
      cross_knowledge_escrito: 0,
      cross_memory_promovido: 0,
      avisos: a.avisos,
    },
  });
}

/**
 * Resumo executivo derivado dos itens.
 *
 * Determinístico de propósito: descreve o que foi extraído, sem interpretação
 * que ninguém sustentou.
 */
function sintetizar(
  porCampo: Record<string, ItemExtraido[]>,
  conflitos: number,
  naoResolvidos: number,
  status: string
): string {
  if (status === "conteudo_insuficiente") {
    return "Conteúdo insuficiente para análise. Nenhuma inteligência foi extraída.";
  }

  const partes: string[] = [];
  const contar = (campo: string, sing: string, plur: string) => {
    const n = porCampo[campo]?.length ?? 0;
    if (n) partes.push(`${n} ${n === 1 ? sing : plur}`);
  };

  contar("objetivos", "objetivo", "objetivos");
  contar("interesses", "interesse", "interesses");
  contar("necessidades", "necessidade", "necessidades");
  contar("restricoes", "restrição", "restrições");
  contar("decisoes", "decisão", "decisões");
  contar("compromissos", "compromisso", "compromissos");
  contar("proximos_passos", "próximo passo", "próximos passos");
  contar("perguntas_abertas", "pergunta em aberto", "perguntas em aberto");

  const linhas = [
    partes.length
      ? `A reunião produziu ${partes.join(", ")}.`
      : "Nenhum item estruturado foi extraído.",
  ];

  if (!porCampo.decisoes?.length) {
    linhas.push("Nenhuma decisão explícita foi tomada.");
  }
  if (conflitos) {
    linhas.push(`${conflitos} divergência(s) entre participantes ficaram registradas sem resolução.`);
  }
  if (naoResolvidos) {
    linhas.push(`${naoResolvidos} participante(s) não puderam ser identificados.`);
  }
  const claims = porCampo.meeting_claims?.length ?? 0;
  if (claims) {
    linhas.push(`${claims} afirmação(ões) factual(is) foram registradas como não verificadas.`);
  }

  return linhas.join(" ");
}
