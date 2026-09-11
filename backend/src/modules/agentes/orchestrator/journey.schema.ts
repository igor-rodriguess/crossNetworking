import { z } from "zod";

// -----------------------------------------------------------------------------
// Cross Orchestrator — contrato.
//
// Coordena os agentes já existentes para executar as três jornadas canônicas.
// NÃO é uma LLM: é máquina de estados, regras e gestão de dependências em
// TypeScript. O Orchestrator não substitui nenhum agente — ele decide qual
// chamar, quando, e principalmente quando NÃO chamar.
//
// Os Human Gates são pausa real: a jornada para e só continua por ação humana.
// -----------------------------------------------------------------------------

export const journeyType = z.enum([
  "cliente_para_parceiro",
  "parceiro_para_cliente",
  "prospeccao_do_zero",
]);
export type JourneyType = z.infer<typeof journeyType>;

/**
 * Origem da jornada.
 *
 * Registrada sempre. Origem não-humana (alerta de monitoring, sinal de reunião)
 * pode INICIAR a jornada, mas nunca dispensa os Human Gates — nenhum efeito
 * operacional escapa por ter vindo de automação.
 */
export const triggerSource = z.enum([
  "humano",
  "monitoring_alert",
  "meeting_signal",
  "big_moment",
  "system_test",
]);

/**
 * Estados da jornada.
 *
 * `aguardando_*` NÃO são erro: são pausa legítima esperando decisão humana.
 * Confundi-los com falha faria o sistema tentar "recuperar" de algo que está
 * funcionando como deveria.
 */
export const journeyStatus = z.enum([
  "criada",
  "inteligencia_em_progresso",
  "recomendacao_pronta",
  "aguardando_revisao_humana",
  "revisao_aprovada",
  "revisao_rejeitada",
  "aguardando_promocao",
  "oportunidade_criada",
  "aguardando_paper",
  "aguardando_validacao_paper",
  "score_card_disponivel",
  "concluida",
  // Terminais sem sucesso — distintos entre si de propósito.
  "evidencia_insuficiente",
  "requer_enriquecimento",
  "requer_resolucao_de_entidade",
  "falha",
]);
export type JourneyStatus = z.infer<typeof journeyStatus>;

export const stepName = z.enum([
  "research",
  "entity_intelligence",
  "crossability",
  "matching",
  "recommendation",
  "human_review",
  "promotion",
  "paper",
  "score_card",
]);
export type StepName = z.infer<typeof stepName>;

/**
 * Estado de uma etapa.
 *
 * `reutilizada` ≠ `pulada`: a primeira reaproveitou artefato válido existente;
 * a segunda nem precisava rodar nesta jornada. Distingui-las é o que permite
 * medir a economia com honestidade.
 */
export const stepStatus = z.enum([
  "pendente",
  "executando",
  "concluida",
  "falha",
  "pulada",
  "reutilizada",
  "aguardando_humano",
  "bloqueada",
]);
export type StepStatus = z.infer<typeof stepStatus>;

export const stepExecutionSchema = z.object({
  step: stepName,
  ordem: z.number().int(),
  status: stepStatus,
  motivo: z.string().nullable(),
  /** Execução real do agente. Em etapa reutilizada, aponta a ANTERIOR. */
  execucao_agente_id: z.string().nullable(),
  output_ref: z.string().nullable(),
  output_versao: z.number().int().nullable(),
  contexto_caracteres: z.number().int(),
  duracao_ms: z.number().int().nullable(),
  erro: z.string().nullable(),
});
export type StepExecution = z.infer<typeof stepExecutionSchema>;

/** Plano determinístico. Nenhuma LLM decide qual agente roda. */
export const executionPlanSchema = z.object({
  journey_type: journeyType,
  steps: z.array(z.object({
    step: stepName,
    ordem: z.number().int(),
    acao: z.enum(["executar", "reutilizar", "pular", "aguardar_humano"]),
    motivo: z.string(),
  })).default([]),
  /** Condições que impedem a jornada de avançar. */
  bloqueios: z.array(z.string()).default([]),
  /** Chamadas externas que o plano prevê — zero em modo estrutural. */
  chamadas_externas_estimadas: z.number().int(),
});
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

export const journeyResultSchema = z.object({
  journey_id: z.string(),
  correlation_id: z.string(),
  journey_type: journeyType,
  trigger_source: triggerSource,

  origem: z.object({
    parte_id: z.string().nullable(),
    nome: z.string(),
    vinculo: z.enum(["vinculada", "nao_vinculada"]),
  }),
  objetivo: z.string().nullable(),

  status: journeyStatus,
  motivo_parada: z.string().nullable(),

  plano: executionPlanSchema,
  steps: z.array(stepExecutionSchema).default([]),

  /** Artefatos alcançados, por referência — nunca payload duplicado. */
  refs: z.object({
    perfil_origem_hash: z.string().nullable(),
    perfil_candidato_hash: z.string().nullable(),
    crossability_hash: z.string().nullable(),
    matching_direcao: z.string().nullable(),
    candidato_parte_id: z.string().nullable(),
    recomendacao_id: z.string().nullable(),
    revisao_id: z.string().nullable(),
    promocao_id: z.string().nullable(),
    candidatura_id: z.string().nullable(),
  }),

  /** Sinais opcionais consumidos como contexto — nunca reexecutados. */
  contexto_opcional: z.object({
    big_moment_refs: z.array(z.string()).default([]),
    meeting_intelligence_refs: z.array(z.string()).default([]),
    monitoring_alert_ref: z.string().nullable(),
  }),

  nivel_validacao: z.literal("estrutural_e2e"),
  validacao_ia_real: z.literal("pendente"),
  validacao_web_ao_vivo: z.literal("pendente"),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    steps_executados: z.number().int(),
    steps_reutilizados: z.number().int(),
    steps_pulados: z.number().int(),
    contexto_total_caracteres: z.number().int(),
    /** Economia: o que um pipeline ingênuo teria executado a mais. */
    research_evitados: z.number().int(),
    entity_intelligence_evitados: z.number().int(),
    crossability_evitados: z.number().int(),
    big_moment_evitados: z.number().int(),
    meeting_intelligence_evitados: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    web_search_calls: z.number().int(),
    firecrawl_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    /** Confirmam ausência de efeito operacional automático. */
    oportunidades_criadas: z.number().int(),
    avancos_de_funil: z.number().int(),
    projetos_criados: z.number().int(),
    parcerias_criadas: z.number().int(),
    reunioes_criadas: z.number().int(),
    papers_aprovados_por_ia: z.number().int(),
    avisos: z.array(z.string()).default([]),
  }),
});
export type JourneyResult = z.infer<typeof journeyResultSchema>;

/** Erro de jornada — contexto insuficiente para sequer planejar. */
export class JourneyInvalida extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = "JourneyInvalida";
  }
}

/** Conflito de concorrência entre dois resumes da mesma jornada. */
export class JourneyConflito extends Error {
  constructor(public readonly detalhe: string) {
    super(detalhe);
    this.name = "JourneyConflito";
  }
}

/**
 * Idade máxima de um artefato para ser reaproveitado sem reexecução.
 *
 * Centralizado: espalhar esses números pelo orquestrador tornaria a política de
 * reuso impossível de auditar.
 */
export const POLITICA_REUSO = {
  /** Evidence/perfil além disso é considerado obsoleto para nova jornada. */
  maxIdadePerfilDias: 30,
  maxIdadeCrossabilityDias: 30,
  /** Matching é sempre por direção: resultado de outra direção nunca serve. */
  reutilizarMatching: false,
} as const;
