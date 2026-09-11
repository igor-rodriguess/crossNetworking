import { z } from "zod";

// -----------------------------------------------------------------------------
// Meeting Intelligence — contrato.
//
// Responde "o que de relevante para inteligência de negócio foi realmente dito,
// decidido, solicitado, oferecido ou deixado em aberto nesta reunião?".
//
// NÃO é um summarizer. Cada item extraído aponta o segmento de origem, o
// speaker e o trecho literal — é possível voltar da interpretação até a fala.
//
// A distinção central deste agente:
//
//   O QUE FOI DITO   ≠   O QUE É VERDADE
//
// Uma afirmação em reunião é MEETING_CLAIM com verificação pendente. Ela nunca
// vira Evidence verificada automaticamente. Quem verifica o mundo é o Research
// & Evidence, com fonte externa.
// -----------------------------------------------------------------------------

/** Como o conteúdo chegou. Áudio/vídeo NÃO é escopo: o agente recebe texto. */
export const tipoConteudo = z.enum([
  "notas",
  "ata",
  "transcript",
  "transcript_timestamped",
  "texto_importado",
]);
export type TipoConteudo = z.infer<typeof tipoConteudo>;

/**
 * Taxonomia de extração.
 *
 * Deliberadamente enxuta. Categorias demais produzem classificação arbitrária —
 * e a distinção que realmente importa (decisão × opinião, claim × fato) está
 * garantida por regra, não por vocabulário.
 */
export const tipoItem = z.enum([
  "objetivo",
  "interesse",
  "necessidade",
  "dor",
  "ativo",
  "oferta",
  "restricao",
  "objecao",
  "decisao",
  "compromisso",
  "proximo_passo",
  "pergunta_aberta",
  "meeting_claim",
  "sinal_relacionamento",
  "outro_sinal",
]);
export type TipoItem = z.infer<typeof tipoItem>;

/**
 * Identidade de quem falou.
 *
 * `nao_resolvido` é resposta legítima e frequente: "Speaker 2" sem mapping não
 * pode virar uma Parte. Inventar identidade seria pior do que admitir que não
 * se sabe.
 */
export const statusSpeaker = z.enum(["parte", "usuario_interno", "nao_resolvido"]);

export const speakerRef = z.object({
  rotulo: z.string(),
  status: statusSpeaker,
  parte_id: z.string().nullable(),
  usuario_interno_id: z.string().nullable(),
  nome: z.string().nullable(),
});
export type SpeakerRef = z.infer<typeof speakerRef>;

/** Segmento do conteúdo. Toda extração aponta para pelo menos um. */
export const segmento = z.object({
  segment_id: z.string(),
  ordem: z.number().int(),
  speaker_rotulo: z.string().nullable(),
  texto: z.string(),
  inicio: z.string().nullable(),
  fim: z.string().nullable(),
});
export type Segmento = z.infer<typeof segmento>;

/**
 * Verificação de uma afirmação.
 *
 * `nao_verificado` é o default e permanece assim: esta Sprint não promove nada
 * a Evidence. Só existe outro valor quando o Research & Evidence agir depois.
 */
export const statusVerificacao = z.enum(["nao_verificado", "verificado_externamente"]);

/** Um item extraído, sempre rastreável. */
export const itemExtraido = z.object({
  item_id: z.string(),
  tipo: tipoItem,
  texto: z.string(),

  /** Quem disse. `null` quando o speaker não pôde ser resolvido. */
  speaker_rotulo: z.string().nullable(),
  parte_id: z.string().nullable(),

  /** Segmentos que sustentam. NUNCA vazio — item sem origem não entra. */
  source_segments: z.array(z.string()).min(1),
  /** Trecho literal, conferido contra o conteúdo. */
  supporting_quote: z.string(),

  /**
   * Confiança na EXTRAÇÃO, não na veracidade nem na chance de acontecer.
   * "Está claro que foi dito" é diferente de "é verdade".
   */
  extraction_confidence: z.number().int().min(0).max(100),

  /** Só relevante para afirmações sobre o mundo. */
  verification_status: statusVerificacao.default("nao_verificado"),
  /** Declaração sobre a própria entidade de quem fala. */
  primeira_pessoa: z.boolean().default(false),

  /** Datas mencionadas: texto original preservado, normalização só se inequívoca. */
  prazo_texto: z.string().nullable().optional(),
  prazo_normalizado: z.string().nullable().optional(),
  responsavel_texto: z.string().nullable().optional(),

  /** Decisão posteriormente revogada continua registrada, marcada como superada. */
  superseded_by: z.string().nullable().optional(),
});
export type ItemExtraido = z.infer<typeof itemExtraido>;

/** Divergência entre participantes. Nenhum lado é escolhido. */
export const conflitoReuniao = z.object({
  item_a: z.string(),
  item_b: z.string(),
  texto_a: z.string(),
  texto_b: z.string(),
  segmentos_a: z.array(z.string()),
  segmentos_b: z.array(z.string()),
  observacao: z.string(),
});

/** Candidato a Cross Memory. PROPOSTA — nada é promovido automaticamente. */
export const memoryCandidate = z.object({
  texto: z.string(),
  origem_item: z.string(),
  parte_id: z.string().nullable(),
  promotion_status: z.literal("nao_promovido"),
});

export const statusAnalise = z.enum(["analisada", "conteudo_insuficiente"]);

export const meetingIntelligenceResultSchema = z.object({
  reuniao_id: z.string(),
  conteudo_hash: z.string(),
  conteudo_versao: z.number().int(),
  tipo_conteudo: tipoConteudo,

  status: statusAnalise,

  /** Contexto da reunião — todos opcionais, herdado do DOMAIN-01. */
  contexto: z.object({
    candidatura_parceiro_id: z.string().nullable(),
    projeto_id: z.string().nullable(),
    parceria_id: z.string().nullable(),
  }),

  participantes: z.array(speakerRef).default([]),
  speakers_nao_resolvidos: z.array(z.string()).default([]),

  segmentos: z.array(segmento).default([]),

  objetivos: z.array(itemExtraido).default([]),
  interesses: z.array(itemExtraido).default([]),
  necessidades: z.array(itemExtraido).default([]),
  dores: z.array(itemExtraido).default([]),
  ativos: z.array(itemExtraido).default([]),
  ofertas: z.array(itemExtraido).default([]),
  restricoes: z.array(itemExtraido).default([]),
  objecoes: z.array(itemExtraido).default([]),

  decisoes: z.array(itemExtraido).default([]),
  compromissos: z.array(itemExtraido).default([]),
  proximos_passos: z.array(itemExtraido).default([]),
  perguntas_abertas: z.array(itemExtraido).default([]),

  meeting_claims: z.array(itemExtraido).default([]),
  sinais_relacionamento: z.array(itemExtraido).default([]),

  conflitos: z.array(conflitoReuniao).default([]),
  lacunas: z.array(z.string()).default([]),

  /** Derivado dos itens estruturados, não de interpretação livre. */
  resumo_executivo: z.string(),

  memory_candidates: z.array(memoryCandidate).default([]),

  /** Itens recusados na validação, com motivo. */
  rejeitados: z.array(z.object({
    texto: z.string(),
    motivo: z.enum(["segmento_inexistente", "quote_inexistente", "sem_origem", "pii_incidental"]),
  })).default([]),

  nivel_validacao: z.literal("estrutural"),
  validacao_semantica_real: z.literal("pendente"),
  extractor_mode: z.enum(["deterministico", "local", "pago"]),
  extractor_versao: z.string(),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    caracteres_entrada: z.number().int(),
    total_segmentos: z.number().int(),
    total_lotes: z.number().int(),
    total_itens: z.number().int(),
    itens_deduplicados: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    /** Confirma ausência de efeito operacional. */
    oportunidades_criadas: z.number().int(),
    projetos_alterados: z.number().int(),
    parcerias_alteradas: z.number().int(),
    reunioes_criadas: z.number().int(),
    score_cards_alterados: z.number().int(),
    cross_knowledge_escrito: z.number().int(),
    cross_memory_promovido: z.number().int(),
    avisos: z.array(z.string()).default([]),
  }),
});
export type MeetingIntelligenceResult = z.infer<typeof meetingIntelligenceResultSchema>;

/**
 * Limites de contexto.
 *
 * Centralizados para não virarem números mágicos. Uma reunião de três horas não
 * pode depender de caber num único prompt — a arquitetura precisa segmentar,
 * processar em lotes e mesclar deterministicamente.
 */
export const LIMITES_REUNIAO = {
  maxCaracteresEntrada: 200_000,
  maxSegmentosPorLote: 40,
  maxItensPorTipo: 50,
} as const;

export const EXTRACTOR_VERSAO = "deterministico-v1";
