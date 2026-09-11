import { z } from "zod";
import { direcaoMatching } from "../matching/matching.schema";

// -----------------------------------------------------------------------------
// Recommendation — contrato.
//
// Responde "dado este contexto e este candidato, qual é a HIPÓTESE de conexão
// que merece avaliação humana, e por quê?".
//
// O agente PROPÕE. Não decide, não cria oportunidade, não move funil, não marca
// reunião, não gera Score Card. O produto é uma proposta rastreável para o
// Human Gate.
//
// Diferença essencial em relação ao Matching (AI-05):
//   Matching        → "quais candidatos merecem análise?"
//   Recommendation  → "que hipótese existe para ESTE candidato, e o que a sustenta?"
//
// Determinístico nesta fase: nenhuma LLM, nenhum embedding pago. O valor está
// na qualidade do contrato e na honestidade da decisão estruturada.
// -----------------------------------------------------------------------------

/**
 * Estado da proposta perante o Human Gate.
 *
 * Não existe `aprovada`: aprovar é ato humano, e um agente que pudesse
 * produzir esse estado tornaria o gate decorativo.
 */
export const statusRecomendacao = z.enum([
  /** Sustentação suficiente para uma pessoa revisar. */
  "pronta_para_revisao",
  /** Falta informação sobre o candidato; pesquisar é decisão de outro componente. */
  "requer_enriquecimento",
  /** Não há base para propor conexão. Melhor não recomendar do que fabricar. */
  "sustentacao_insuficiente",
  /** Proposta ainda em composição. */
  "rascunho",
]);
export type StatusRecomendacao = z.infer<typeof statusRecomendacao>;

/** Grau de sustentação da hipótese. */
export const nivelSustentacao = z.enum([
  /** Matching + Evidence + Crossability sustentados. */
  "sustentacao_forte",
  /** Matching estrutural válido; Crossability ou semântica ainda pendentes. */
  "sustentacao_parcial",
  /** Base insuficiente para qualquer hipótese. */
  "sustentacao_insuficiente",
]);
export type NivelSustentacao = z.infer<typeof nivelSustentacao>;

/**
 * Nível de validação do que sustenta a proposta.
 *
 * `producao_homologada` existe no enum apenas para ser inalcançável hoje: sem
 * embeddings reais e sem Crossability com IA real, nenhuma Recommendation pode
 * reivindicar esse nível. Declará-lo agora seria mentir sobre a maturidade.
 */
export const nivelValidacaoRecomendacao = z.enum([
  "estrutural",
  "producao_homologada",
]);

/** Próximo passo HUMANO sugerido. O agente sugere; não executa. */
export const proximoPasso = z.enum([
  "validar_com_time_cross",
  "solicitar_enriquecimento",
  "revisar_candidato",
  "comparar_com_outros_candidatos",
  "preparar_para_human_gate",
  "considerar_reuniao",
  "nenhum",
]);
export type ProximoPasso = z.infer<typeof proximoPasso>;

/** Evidência utilizada, sempre com referência verificável. */
export const evidenciaSuporte = z.object({
  evidence_ref: z.string(),
  afirmacao: z.string(),
  origem: z.enum(["interno", "externo"]),
  /** Registro interno ou fontes externas que sustentam. */
  proveniencia: z.string(),
});

/** Dimensão do Crossability aproveitada, com seu nível de validação. */
export const crossabilitySuporte = z.object({
  analise_ref: z.string().nullable(),
  dimensao: z.string(),
  assessment: z.string(),
  status: z.string(),
  confianca: z.number().int().nullable(),
  evidence_refs: z.array(z.string()).default([]),
  knowledge_refs: z.array(z.string()).default([]),
  /** Metodologia ainda não homologada com IA real — precisa aparecer. */
  nivel_validacao: z.string(),
});

/** Sinal do Matching que contribuiu, com proveniência preservada. */
export const sinalSuporte = z.object({
  tipo: z.string(),
  forca: z.string(),
  valor: z.number().nullable(),
  descricao: z.string(),
  proveniencia: z.string(),
});

/** Ponto contrário à hipótese. Obrigatório considerar. */
export const contraEvidencia = z.object({
  texto: z.string(),
  tipo: z.enum(["conflito_factual", "sinal_contrario", "restricao", "ausencia_relevante"]),
  evidence_refs: z.array(z.string()).default([]),
  proveniencia: z.string().nullable(),
});

export const risco = z.object({
  texto: z.string(),
  categoria: z.enum([
    "perfil_incompleto",
    "informacao_desatualizada",
    "validacao_pendente",
    "conflito_factual",
    "restricao_conhecida",
    "necessita_enriquecimento",
  ]),
});

export const recommendationProposalSchema = z.object({
  direcao: direcaoMatching,

  origem: z.object({
    parte_id: z.string().nullable(),
    nome: z.string(),
    vinculo: z.string(),
  }),
  candidato: z.object({
    parte_id: z.string(),
    nome: z.string(),
    eh_cliente_cross: z.boolean(),
    status_perfil: z.string(),
  }),
  objetivo: z.string().nullable(),

  status: statusRecomendacao,
  nivel_sustentacao: nivelSustentacao,

  /**
   * A hipótese de conexão. `null` quando não há sustentação — e isso é uma
   * resposta legítima, não uma falha.
   */
  hipotese_oportunidade: z.string().nullable(),

  /** Racional composto deterministicamente a partir do que sustenta. */
  racional: z.array(z.string()).default([]),

  evidencias_suporte: z.array(evidenciaSuporte).default([]),
  crossability_suporte: z.array(crossabilitySuporte).default([]),
  sinais_suporte: z.array(sinalSuporte).default([]),

  contra_evidencias: z.array(contraEvidencia).default([]),
  riscos: z.array(risco).default([]),
  /** O que ainda precisa ser descoberto. São perguntas, não fatos. */
  questoes_abertas: z.array(z.string()).default([]),
  /** Lacunas herdadas, preservadas com origem. Nunca preenchidas aqui. */
  lacunas: z.array(z.object({
    origem: z.enum(["entity_intelligence", "evidence", "crossability", "perfil_candidato"]),
    descricao: z.string(),
  })).default([]),

  proximo_passo: proximoPasso,

  /**
   * Confiança na SUSTENTAÇÃO da hipótese — não é chance de fechar parceria.
   * Calculada por regra determinística e explicada em `componentes_confianca`.
   */
  confianca: z.number().int().min(0).max(100),
  componentes_confianca: z.array(z.object({
    fator: z.string(),
    peso: z.number(),
    valor: z.number(),
    contribuicao: z.number(),
  })).default([]),

  nivel_validacao: nivelValidacaoRecomendacao,
  /** Limitações que a proposta carrega e não pode esconder. */
  limitacoes: z.array(z.string()).default([]),

  /** Referências recusadas na validação, com motivo. */
  rejeitados: z.array(z.object({
    tipo: z.enum(["evidence_ref", "crossability_ref", "matching_ref"]),
    referencia: z.string(),
    motivo: z.string(),
  })).default([]),

  proveniencia: z.object({
    matching_direcao: z.string(),
    matching_pesos_versao: z.string(),
    perfil_origem_versao: z.number().int().nullable(),
    perfil_candidato_versao: z.number().int().nullable(),
    crossability_hash: z.string().nullable(),
    /** Hash dos inputs — base da idempotência (§38). */
    hash_entrada: z.string(),
  }),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    /** Confirma que nenhuma operação foi executada (§52). */
    oportunidades_criadas: z.number().int(),
    projetos_criados: z.number().int(),
    parcerias_criadas: z.number().int(),
    reunioes_criadas: z.number().int(),
    mudancas_funil: z.number().int(),
    score_card_executado: z.boolean(),
  }),
});
export type RecommendationProposal = z.infer<typeof recommendationProposalSchema>;

/**
 * Pesos da confiança estrutural.
 *
 * Medem SUSTENTAÇÃO da hipótese, não atratividade comercial. Centralizados
 * para não virarem números mágicos, e versionados para que uma proposta antiga
 * continue interpretável quando os pesos mudarem.
 */
export const PESOS_CONFIANCA = {
  cobertura_sinais: 0.30,
  qualidade_evidencia: 0.25,
  completude_perfil: 0.20,
  crossability: 0.15,
  ausencia_conflito: 0.10,
} as const;

export const PESOS_CONFIANCA_VERSAO = "confianca-v1";
