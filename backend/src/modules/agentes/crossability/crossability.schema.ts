import { z } from "zod";

// -----------------------------------------------------------------------------
// Crossability Reasoning — contrato.
//
// Responde "COMO A CROSS INTERPRETA esta entidade segundo sua metodologia?".
//
// NÃO responde com quem fechar parceria, qual o melhor cliente, que reunião
// marcar nem que etapa do funil mudar. Essas perguntas pertencem a Matching
// (AI-05) e Recommendation.
//
// Três camadas que NUNCA se misturam:
//   · EVIDENCE           — o que sabemos do mundo (fatos, com fonte)
//   · ENTITY INTELLIGENCE— estado factual consolidado da entidade
//   · CROSS KNOWLEDGE    — como a Cross interpreta esse tipo de sinal
//
// A separação é estrutural, não uma convenção de nome: uma conclusão factual
// aponta `evidence_refs`; uma interpretação metodológica aponta
// `knowledge_refs`. Cross Knowledge jamais vira prova de fato (ADR-009).
// -----------------------------------------------------------------------------

/** As seis dimensões do domínio. Terminologia preservada da plataforma. */
export const dimensaoCrossability = z.enum([
  "publicos",
  "territorios",
  "ativos",
  "sinergias",
  "fit_estrategico",
  "momento",
]);
export type DimensaoCrossability = z.infer<typeof dimensaoCrossability>;

export const DIMENSOES: DimensaoCrossability[] = [
  "publicos",
  "territorios",
  "ativos",
  "sinergias",
  "fit_estrategico",
  "momento",
];

/**
 * Avaliação proposta pela LLM. Escala alinhada à que a plataforma já persiste
 * (alta/media/baixa), mais `indeterminado` para quando não há sustentação.
 *
 * `indeterminado` não é uma nota ruim — é a recusa a produzir falsa precisão.
 */
export const assessmentDimensao = z.enum(["alta", "media", "baixa", "indeterminado"]);
export type AssessmentDimensao = z.infer<typeof assessmentDimensao>;

/**
 * Status de sustentação da dimensão.
 *
 * REGRA DA DUPLA SUSTENTAÇÃO: só é `suportado` quem tem AS DUAS pernas —
 * factual (Evidence/Entity Intelligence) E metodológica (Cross Knowledge).
 * Ter só uma é incompleto, e isso é dito explicitamente.
 */
export const statusRaciocinio = z.enum([
  "suportado",
  "evidencia_insuficiente",
  "conhecimento_insuficiente",
  "insuficiente",
]);
export type StatusRaciocinio = z.infer<typeof statusRaciocinio>;

/** Sustentação factual ou metodológica, avaliada de forma independente. */
export const statusSustentacao = z.enum(["suficiente", "insuficiente"]);
export type StatusSustentacao = z.infer<typeof statusSustentacao>;

/** Um ponto do raciocínio, sempre ancorado. */
export const pontoRaciocinio = z.object({
  texto: z.string().trim().min(3).max(600),
  /** fact_ids do Evidence Package / elementos do Profile que sustentam. */
  evidence_refs: z.array(z.string()).default([]),
  /** Refs de Cross Knowledge (K1, K2…) que sustentam a interpretação. */
  knowledge_refs: z.array(z.string()).default([]),
});
export type PontoRaciocinio = z.infer<typeof pontoRaciocinio>;

/** O que a LLM devolve por dimensão, antes da validação do backend. */
export const analiseDimensaoBrutaSchema = z.object({
  dimensao: dimensaoCrossability,
  assessment: assessmentDimensao,
  reasoning: z.string().trim().min(10).max(2000),
  supporting_points: z.array(pontoRaciocinio).max(8).default([]),
  /**
   * Contra-evidência. Campo obrigatório no schema (pode vir vazio, mas o modelo
   * é instruído a procurar) — pedir explicitamente reduz confirmation bias.
   */
  counterpoints: z.array(pontoRaciocinio).max(8).default([]),
  gaps: z.array(z.string().trim().max(400)).max(8).default([]),
  confidence: z.number().int().min(0).max(100),
});
export type AnaliseDimensaoBruta = z.infer<typeof analiseDimensaoBrutaSchema>;

export const respostaReasoningSchema = z.object({
  dimensions: z.array(analiseDimensaoBrutaSchema).max(6),
  overall_synthesis: z.string().trim().max(2000).default(""),
});

/**
 * Formato enviado ao Ollama como gramática JSON.
 *
 * Deliberadamente mais simples que `respostaReasoningSchema`: o compilador de
 * gramática do llama.cpp falha com `failed to parse grammar` quando o schema
 * tem arrays aninhados de objetos com restrições de tamanho. Uma execução real
 * contra o qwen3:4b devolveu HTTP 400 nas seis chamadas por causa disso, e o
 * agente caiu no stub sem produzir raciocínio nenhum.
 *
 * Analisa UMA dimensão por chamada — que é como o agente já opera — e mantém as
 * referências como arrays de string simples. A validação rigorosa continua
 * sendo feita depois, no backend, contra `respostaReasoningSchema`.
 */
export const formatoRespostaOllama = z.object({
  assessment: z.string(),
  reasoning: z.string(),
  supporting_points: z.array(
    z.object({
      texto: z.string(),
      evidence_refs: z.array(z.string()),
      knowledge_refs: z.array(z.string()),
    })
  ),
  counterpoints: z.array(
    z.object({
      texto: z.string(),
      evidence_refs: z.array(z.string()),
      knowledge_refs: z.array(z.string()),
    })
  ),
  gaps: z.array(z.string()),
  confidence: z.number(),
});

/** Referência de conhecimento efetivamente usada, com versão. */
export const refConhecimentoUsada = z.object({
  ref: z.string(),
  chunk_id: z.string(),
  documento_id: z.string(),
  codigo: z.string(),
  documento: z.string(),
  secao: z.string().nullable(),
  /** Versão da metodologia que sustentou — permite auditar decisões antigas. */
  versao: z.number().int(),
  escopo: z.string(),
  relevancia: z.number(),
});
export type RefConhecimentoUsada = z.infer<typeof refConhecimentoUsada>;

/** Análise de uma dimensão, já validada pelo backend. */
export const analiseDimensaoSchema = z.object({
  dimensao: dimensaoCrossability,
  assessment: assessmentDimensao,
  reasoning: z.string(),
  supporting_points: z.array(pontoRaciocinio).default([]),
  counterpoints: z.array(pontoRaciocinio).default([]),
  gaps: z.array(z.string()).default([]),
  /**
   * Confiança na CERTEZA FACTUAL, jamais na força da oportunidade.
   * `assessment: alta` + `confidence: 20` é combinação legítima e esperada
   * quando os sinais são bons mas a evidência é rasa.
   */
  confidence: z.number().int().min(0).max(100),
  status: statusRaciocinio,
  evidence_status: statusSustentacao,
  knowledge_status: statusSustentacao,
  /** Refs de conhecimento oferecidas ao modelo para esta dimensão. */
  knowledge_refs: z.array(refConhecimentoUsada).default([]),
  /** Consulta de retrieval usada nesta dimensão — auditável. */
  retrieval: z.object({
    consulta: z.string(),
    top_k: z.number().int(),
    limiar: z.number(),
    considerados: z.number().int(),
    entregues: z.number().int(),
    descartados: z.number().int(),
  }),
});
export type AnaliseDimensao = z.infer<typeof analiseDimensaoSchema>;

/** Claim removido na validação, com o motivo. */
export const claimRejeitado = z.object({
  dimensao: z.string(),
  tipo: z.enum(["supporting_point", "counterpoint", "dimensao"]),
  texto: z.string(),
  motivo: z.enum([
    "evidence_ref_inexistente",
    "knowledge_ref_inexistente",
    "sem_sustentacao",
    "dimensao_desconhecida",
    "dimensao_duplicada",
  ]),
});
export type ClaimRejeitado = z.infer<typeof claimRejeitado>;

export const crossabilityAnalysisSchema = z.object({
  entidade: z.string(),
  /** Contexto da análise: não existe fit absoluto (§17). */
  contexto: z.object({
    objetivo: z.string().nullable(),
    cliente_cross_id: z.string().nullable(),
    /** True quando não houve objetivo — fit fica limitado, e isso é dito. */
    contexto_ausente: z.boolean(),
  }),
  /** Versões da metodologia que sustentaram esta análise. */
  methodology_version: z.array(
    z.object({
      codigo: z.string(),
      documento: z.string(),
      versao: z.number().int(),
    })
  ).default([]),
  dimensions: z.array(analiseDimensaoSchema).default([]),
  /** Síntese descritiva. NUNCA recomendação de ação. */
  overall_synthesis: z.string(),
  /** Conflitos herdados do Entity Intelligence, preservados sem escolha. */
  conflicts: z.array(z.object({
    claim_a: z.string(),
    claim_b: z.string(),
    observacao: z.string(),
  })).default([]),
  evidence_gaps: z.array(z.string()).default([]),
  knowledge_gaps: z.array(z.string()).default([]),
  /** Confiança global — média das dimensões sustentadas. */
  confidence: z.number().int().min(0).max(100),
  rejeitados: z.array(claimRejeitado).default([]),
  provenance: z.object({
    perfil_versao: z.number().int().nullable(),
    perfil_hash: z.string().nullable(),
    evidence_fact_ids: z.array(z.string()).default([]),
    knowledge_chunk_ids: z.array(z.string()).default([]),
  }),
  telemetria: z.object({
    duracao_ms: z.number().int(),
    provedor: z.string(),
    modelo: z.string().nullable(),
    llm_calls: z.number().int(),
    tokens_entrada: z.number().int(),
    tokens_saida: z.number().int(),
    tokens_cache: z.number().int(),
    custo_estimado_usd: z.number().nullable(),
    contexto_caracteres: z.number().int(),
    retrieval_calls: z.number().int(),
    bloqueios: z.array(z.string()).default([]),
  }),
});
export type CrossabilityAnalysis = z.infer<typeof crossabilityAnalysisSchema>;
