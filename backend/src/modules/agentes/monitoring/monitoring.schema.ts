import { z } from "zod";
import type { Fato } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Monitoring — contrato.
//
// Responde "quais entidades precisam ser verificadas agora, e o que mudou desde
// a última verificação?".
//
// NÃO é Research (não rasteja) nem Big Moment (não classifica evento). É
// ORQUESTRAÇÃO DE MUDANÇA: decide quando vale a pena chamar os outros, e
// principalmente quando NÃO vale.
//
// A economia é o produto: um alvo sem mudança não dispara Big Moment, e nenhum
// ciclo dispara Crossability, Matching ou Recommendation.
// -----------------------------------------------------------------------------

export const statusAlvo = z.enum(["ativo", "pausado", "arquivado"]);
export const prioridadeAlvo = z.enum(["baixa", "normal", "alta"]);

/** Classificação do que mudou desde o último ciclo. */
export const tipoDelta = z.enum([
  "sem_mudanca",
  "evidencia_nova",
  "evidencia_atualizada",
  "evidencia_indisponivel",
  "big_moment_novo",
  "big_moment_atualizado",
  "big_moment_cancelado",
  "possivel_conflito_de_evento",
  "evidencia_insuficiente",
  "falha_de_pesquisa",
]);
export type TipoDelta = z.infer<typeof tipoDelta>;

/** Resultado do processamento de um alvo. */
export const statusAlvoRun = z.enum([
  "sucesso",
  "sem_mudanca",
  "falha",
  "pulado",
  "bloqueado_orcamento",
]);

/**
 * Por que um alvo NÃO foi verificado.
 *
 * Existe para responder "por que esta Parte não foi checada?" sem adivinhação —
 * requisito de observabilidade da Sprint.
 */
export const motivoPulo = z.enum([
  "nao_vencido",
  "pausado",
  "arquivado",
  "reservado_por_outro_worker",
  "limite_do_ciclo",
  "alvo_invalido",
  "orcamento_bloqueado",
]);
export type MotivoPulo = z.infer<typeof motivoPulo>;

export const tipoAlerta = z.enum([
  "big_moment_novo",
  "big_moment_atualizado",
  "big_moment_cancelado",
  "possivel_conflito_de_evento",
  "evidencia_nova_informativa",
  "falha_recorrente",
]);
export type TipoAlerta = z.infer<typeof tipoAlerta>;

/** Severidade = prioridade de REVISÃO. Não é valor comercial. */
export const severidadeAlerta = z.enum(["info", "baixa", "media", "alta"]);

export const alertaSchema = z.object({
  id: z.string(),
  alvo_id: z.string(),
  parte_id: z.string(),
  tipo: tipoAlerta,
  severidade: severidadeAlerta,
  titulo: z.string(),
  resumo: z.string(),
  evidence_refs: z.array(z.string()).default([]),
  big_moment_refs: z.array(z.string()).default([]),
  deduplication_key: z.string(),
  /** Correlação secundária; não substitui o fingerprint da AI-09. */
  correlation_key: z.string().nullable(),
  status: z.enum(["novo", "visto", "descartado", "resolvido"]),
  detectado_em: z.string(),
});
export type MonitoringAlerta = z.infer<typeof alertaSchema>;

/**
 * Checkpoint do alvo.
 *
 * Guarda REFERÊNCIAS, nunca conteúdo. Sem HTML, sem scrape, sem prompt — é o
 * que mantém o estado barato de carregar a cada ciclo.
 */
export const checkpointSchema = z.object({
  evidence_fingerprints: z.array(z.string()).default([]),
  big_moment_fingerprints: z.array(z.string()).default([]),
  big_moment_status: z.record(z.string(), z.string()).default({}),
  ultima_verificacao_em: z.string().nullable().default(null),
});
export type CheckpointAlvo = z.infer<typeof checkpointSchema>;

export const alvoRunSchema = z.object({
  alvo_id: z.string(),
  parte_id: z.string(),
  entidade: z.string(),
  status: statusAlvoRun,
  delta: tipoDelta,
  motivo_pulo: motivoPulo.nullable(),
  evidencias_antes: z.number().int(),
  evidencias_depois: z.number().int(),
  evidencias_novas: z.number().int(),
  /** False quando o fast path evitou a execução. */
  big_moment_executado: z.boolean(),
  alertas: z.array(alertaSchema).default([]),
  proxima_verificacao_em: z.string(),
  erro: z.string().nullable(),
});
export type AlvoRun = z.infer<typeof alvoRunSchema>;

export const monitoringCycleResultSchema = z.object({
  ciclo_id: z.string(),
  iniciado_em: z.string(),
  finalizado_em: z.string(),
  worker_id: z.string(),

  alvos_vencidos: z.number().int(),
  alvos_processados: z.number().int(),
  alvos_sucesso: z.number().int(),
  alvos_falha: z.number().int(),
  alvos_pulados: z.array(z.object({
    alvo_id: z.string(),
    motivo: motivoPulo,
  })).default([]),

  runs: z.array(alvoRunSchema).default([]),
  alertas: z.array(alertaSchema).default([]),

  /** Sugestões para um Orchestrator futuro. NADA é executado. */
  follow_ups: z.array(z.object({
    alvo_id: z.string(),
    sugestao: z.enum([
      "nenhuma",
      "revisar_alerta",
      "considerar_refresh_de_entidade",
      "considerar_refresh_de_crossability",
      "considerar_matching",
    ]),
  })).default([]),

  nivel_validacao: z.literal("estrutural"),
  validacao_live_monitoring: z.literal("pendente"),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    research_calls: z.number().int(),
    /** Alvos não vencidos: pesquisa que não precisou acontecer. */
    research_evitados: z.number().int(),
    big_moment_calls: z.number().int(),
    /** Fast path: mudança nenhuma ⇒ classificação desnecessária. */
    big_moment_evitados: z.number().int(),
    web_search_calls: z.number().int(),
    firecrawl_calls: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    /** Confirmam ausência de efeito operacional. */
    crossability_runs: z.number().int(),
    matching_runs: z.number().int(),
    recommendations_criadas: z.number().int(),
    entity_intelligence_writes: z.number().int(),
    oportunidades_criadas: z.number().int(),
    score_cards_alterados: z.number().int(),
    cross_knowledge_writes: z.number().int(),
    cross_memory_promocoes: z.number().int(),
    avisos: z.array(z.string()).default([]),
  }),
});
export type MonitoringCycleResult = z.infer<typeof monitoringCycleResultSchema>;

/**
 * Adaptador de pesquisa.
 *
 * Existe para que a validação estrutural rode com LIVE WEB DESLIGADA e, depois,
 * o mesmo Monitoring passe a usar Research real trocando apenas o adaptador —
 * sem reescrever seleção, delta, alertas ou persistência.
 */
export interface AdaptadorPesquisa {
  modo: "controlado" | "live";
  pesquisar(entrada: {
    entidade: string;
    parteId: string | null;
  }): Promise<{
    fatos: Fato[];
    webSearchCalls: number;
    firecrawlCalls: number;
    custoUsd: number;
  }>;
}

/**
 * Limites do ciclo. Centralizados para não virarem números mágicos.
 */
export const LIMITES_MONITORING = {
  maxAlvosPorCiclo: 25,
  maxAlertasPorCiclo: 100,
  /** Duração da reserva do alvo; expira sozinha se o worker morrer. */
  leaseMinutos: 10,
  /** Backoff: cadência × multiplicador^falhas, com teto. */
  backoffMultiplicador: 2,
  backoffMaxHoras: 720,
} as const;
