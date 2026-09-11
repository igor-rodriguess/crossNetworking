import { z } from "zod";

// -----------------------------------------------------------------------------
// Big Moment Intelligence — contrato.
//
// Responde "existe algum acontecimento temporal relevante envolvendo esta Parte
// que possa representar uma janela de atenção para a Cross?".
//
// Separação de responsabilidades que este agente NÃO pode borrar:
//
//   Research & Evidence  →  "o que aconteceu?"        (autoridade factual)
//   Big Moment           →  "isso é um momento?"      (relevância temporal)
//   Crossability         →  "como a Cross interpreta?" (metodologia)
//   Recommendation       →  "há hipótese de negócio?"  (proposta)
//
// Consome Evidence já produzida. Não rasteja a web, não reexecuta Crossability,
// não cria Recommendation, Opportunity nem altera funil.
// -----------------------------------------------------------------------------

/** Taxonomia de eventos. Controlada e enxuta. */
export const tipoEvento = z.enum([
  "product_launch",
  "collection_launch",
  "campaign",
  "tour",
  "concert",
  "festival",
  "media_release",
  "sport_event",
  "geographic_expansion",
  "store_opening",
  "market_entry",
  "milestone",
  "anniversary",
  "sponsorship",
  "partnership_announcement",
  "ambassadorship",
  "acquisition",
  "leadership_change",
  "cultural_moment",
  "corporate_move",
  "other",
]);
export type TipoEvento = z.infer<typeof tipoEvento>;

/**
 * Estado temporal do evento.
 *
 * A distinção que mais importa: `announced` ≠ `completed`. "Turnê anunciada
 * para novembro" não significa que a turnê aconteceu.
 */
export const statusTemporal = z.enum([
  "announced",
  "scheduled",
  "ongoing",
  "completed",
  "cancelled",
  "unknown",
]);
export type StatusTemporal = z.infer<typeof statusTemporal>;

/** Janela de atenção, derivada das datas + relógio da execução. */
export const janelaOportunidade = z.enum([
  "pre_event",
  "active",
  "post_event",
  "expired",
  "unknown",
]);
export type JanelaOportunidade = z.infer<typeof janelaOportunidade>;

/** Força da verificação, herdada do Evidence — não recalculada aqui. */
export const forcaVerificacao = z.enum(["corroborada", "fonte_unica", "conflitante"]);

/** Situação do momento numa execução. Base do Monitoring. */
export const situacaoMomento = z.enum([
  "novo",
  "atualizado",
  "inalterado",
]);

/** Data com proveniência. Data sem origem não entra. */
export const dataComOrigem = z.object({
  valor: z.string().nullable(),
  /** Expressão original quando não normalizável ("segundo semestre"). */
  expressao_bruta: z.string().nullable(),
  evidence_ref: z.string().nullable(),
});

/** Componente do score de triagem, explicável. */
export const componenteRelevancia = z.object({
  componente: z.string(),
  peso: z.number(),
  valor: z.number(),
  contribuicao: z.number(),
  justificativa: z.string(),
});

export const bigMomentSignalSchema = z.object({
  id: z.string(),
  entidade: z.string(),
  parte_id: z.string().nullable(),

  event_type: tipoEvento,
  titulo: z.string(),
  resumo_factual: z.string(),

  temporal_status: statusTemporal,
  expressao_temporal: z.string().nullable(),

  anunciado_em: z.string().nullable(),
  inicia_em: z.string().nullable(),
  termina_em: z.string().nullable(),
  ocorreu_em: z.string().nullable(),

  primeiro_visto_em: z.string(),
  ultimo_visto_em: z.string(),
  janela_oportunidade: janelaOportunidade,

  /** fact_ids que sustentam. NUNCA vazio — momento sem Evidence não existe. */
  evidence_refs: z.array(z.string()).min(1),
  forca_verificacao: forcaVerificacao,
  dominios_independentes: z.number().int(),

  /**
   * Score de TRIAGEM para ordenar o que olhar primeiro.
   * Não é Cross Score. Não é probabilidade de parceria.
   */
  prioridade_score: z.number(),
  componentes_relevancia: z.array(componenteRelevancia).default([]),

  /** Dimensões da Crossability que este momento PODERIA ativar. Não recalcula. */
  crossability_activation_candidates: z.array(z.string()).default([]),

  riscos: z.array(z.string()).default([]),
  conflitos: z.array(z.object({
    campo: z.string(),
    valor_a: z.string(),
    valor_b: z.string(),
    evidence_a: z.string(),
    evidence_b: z.string(),
    observacao: z.string(),
  })).default([]),
  lacunas: z.array(z.string()).default([]),

  situacao: situacaoMomento,
  event_fingerprint: z.string(),
  versao: z.number().int(),
  nivel_validacao: z.literal("estrutural"),
});
export type BigMomentSignal = z.infer<typeof bigMomentSignalSchema>;

/** Evidence avaliada e recusada como momento — com o motivo. */
export const naoMomento = z.object({
  evidence_ref: z.string(),
  claim: z.string(),
  motivo: z.enum([
    "baixa_relevancia_temporal",
    "conteudo_rotineiro",
    "magnitude_insuficiente",
    "marketing_sem_evento",
    "nao_e_fato",
    "pii_incidental",
  ]),
  detalhe: z.string(),
});

/**
 * Sinal interno vindo de reunião, sem Evidence externa.
 *
 * "Vamos abrir 20 lojas" dito numa reunião é informação relevante — e NÃO é um
 * Big Moment factual. Fica separado, aguardando verificação externa.
 */
export const sinalNaoResolvido = z.object({
  origem: z.enum(["meeting_claim", "sem_evidencia"]),
  texto: z.string(),
  status: z.literal("unverified_internal_signal"),
  referencia: z.string().nullable(),
});

export const bigMomentAnalysisResultSchema = z.object({
  entidade: z.string(),
  parte_id: z.string().nullable(),
  analisado_em: z.string(),

  moments: z.array(bigMomentSignalSchema).default([]),
  non_moments: z.array(naoMomento).default([]),
  duplicate_evidence: z.array(z.object({
    evidence_ref: z.string(),
    agrupado_em: z.string(),
  })).default([]),
  unresolved_signals: z.array(sinalNaoResolvido).default([]),

  /** Proposta de atualização do perfil. NUNCA promovida automaticamente. */
  entity_intelligence_update_candidates: z.array(z.object({
    campo: z.string(),
    valor: z.string(),
    origem_momento: z.string(),
    promotion_status: z.literal("nao_promovido"),
  })).default([]),

  classifier_mode: z.enum(["deterministico", "local", "pago"]),
  classifier_versao: z.string(),
  nivel_validacao: z.literal("estrutural"),
  validacao_semantica_real: z.literal("pendente"),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    evidence_recebida: z.number().int(),
    evidence_considerada: z.number().int(),
    evidence_descartada: z.number().int(),
    grupos_de_evento: z.number().int(),
    momentos_novos: z.number().int(),
    momentos_atualizados: z.number().int(),
    nao_momentos: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    /** Confirma ausência de efeito operacional. */
    oportunidades_criadas: z.number().int(),
    recomendacoes_criadas: z.number().int(),
    matching_disparado: z.number().int(),
    perfis_alterados: z.number().int(),
    score_cards_alterados: z.number().int(),
    cross_knowledge_escrito: z.number().int(),
    cross_memory_promovido: z.number().int(),
    avisos: z.array(z.string()).default([]),
  }),
});
export type BigMomentAnalysisResult = z.infer<typeof bigMomentAnalysisResultSchema>;

/**
 * Pesos de TRIAGEM.
 *
 * Ordenam o que olhar primeiro. Não são metodologia Cross — a metodologia vive
 * no Cross Knowledge e sustenta o Crossability.
 */
export const PESOS_RELEVANCIA = {
  relevancia_temporal: 0.30,
  qualidade_evidencia: 0.25,
  magnitude: 0.20,
  frescor: 0.15,
  relevancia_entidade: 0.10,
} as const;

/**
 * Limites de processamento. Centralizados para não virarem números mágicos.
 */
export const LIMITES_MOMENTO = {
  maxEvidencePorAnalise: 500,
  maxMomentosPorEntidade: 50,
  maxEvidencePorGrupo: 20,
  /** Dias após o fim do evento em que a janela ainda é considerada relevante. */
  diasPosEvento: 30,
  /** Dias sem nova Evidence após os quais um momento anunciado fica obsoleto. */
  diasParaObsoleto: 180,
} as const;

export const CLASSIFIER_VERSAO = "deterministico-v1";
