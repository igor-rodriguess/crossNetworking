import { z } from "zod";

// -----------------------------------------------------------------------------
// Internal Matching — contrato.
//
// Responde "QUAIS ENTIDADES DA BASE merecem ser analisadas como possíveis
// correspondências para esta entidade/contexto?".
//
// NÃO responde "qual parceria fechar" — isso é Recommendation. O produto deste
// agente é uma SHORTLIST RASTREÁVEL, não uma decisão comercial.
//
// Tudo aqui é determinístico. Nenhuma chamada de LLM, nenhum embedding pago.
// O ranking é de RETRIEVAL (priorização técnica), jamais Score Card.
// -----------------------------------------------------------------------------

/**
 * Direção da busca. Controla universo, papéis permitidos e filtros.
 *
 * É parâmetro, não agente: um só Internal Matching atende as três jornadas.
 * Três agentes separados duplicariam filtros e divergiriam com o tempo.
 */
export const direcaoMatching = z.enum([
  /** Cliente Cross procurando parceiros na base. */
  "cliente_para_parceiro",
  /** Entidade/parceiro procurando Clientes Cross compatíveis. */
  "parceiro_para_cliente",
  /** Entidade externa ainda não vinculada, cruzada contra a base. */
  "prospeccao_do_zero",
]);
export type DirecaoMatching = z.infer<typeof direcaoMatching>;

/** Vínculo da entidade de origem com a base. */
export const statusVinculoOrigem = z.enum(["vinculada", "nao_vinculada"]);

/**
 * Nível de validação do que sustentou um sinal.
 *
 * `estrutural` = dado interno determinístico.
 * `crossability_estrutural` = veio de análise Crossability ainda NÃO homologada
 * com IA real (AI-04.1). Marcar isso impede que um resultado estrutural seja
 * lido como raciocínio de produção homologado.
 */
export const nivelValidacao = z.enum([
  "estrutural",
  "crossability_estrutural",
  "semantico_stub",
]);
export type NivelValidacao = z.infer<typeof nivelValidacao>;

/** Situação do Entity Intelligence Profile do candidato. */
export const statusPerfil = z.enum(["completo", "parcial", "ausente"]);
export type StatusPerfil = z.infer<typeof statusPerfil>;

/**
 * Força de um sinal.
 *
 * `desconhecido` é distinto de `nenhum`: ausência de dado NÃO é incompatibilidade.
 * Um candidato sem público cadastrado não tem fit de público igual a zero — tem
 * fit desconhecido, e isso muda como ele deve ser tratado no ranking.
 */
export const forcaSinal = z.enum([
  "forte",
  "moderado",
  "fraco",
  "nenhum",
  "desconhecido",
  /** O perfil traz informação contraditória; não resolver silenciosamente. */
  "conflitante",
]);
export type ForcaSinal = z.infer<typeof forcaSinal>;

export const tipoSinal = z.enum([
  "publico",
  "territorio",
  "ativo",
  "relacionamento",
  "geografico",
  "segmento",
  "momento",
]);
export type TipoSinal = z.infer<typeof tipoSinal>;

/** Um sinal calculado, sempre com origem — sinal sem proveniência não entra. */
export const sinalMatching = z.object({
  tipo: tipoSinal,
  forca: forcaSinal,
  /** Contribuição normalizada (0..1). `null` quando a força é desconhecida. */
  valor: z.number().min(0).max(1).nullable(),
  /** O que foi comparado, em linguagem legível. */
  descricao: z.string(),
  /** Itens da origem que sustentaram. */
  origem_refs: z.array(z.string()).default([]),
  /** Itens do candidato que sustentaram. */
  candidato_refs: z.array(z.string()).default([]),
  /** Registro interno que sustenta (tabela.coluna=id). */
  proveniencia: z.string(),
  nivel_validacao: nivelValidacao,
});
export type SinalMatching = z.infer<typeof sinalMatching>;

/** Situação do relacionamento prévio entre origem e candidato. */
export const situacaoRelacionamento = z.enum([
  "relacionamento_ativo",
  "relacionamento_historico",
  "sem_relacionamento_conhecido",
]);

export const candidatoMatching = z.object({
  parte_id: z.string(),
  nome: z.string(),
  papeis: z.array(z.string()).default([]),
  tipo: z.string().nullable(),
  /**
   * Verdade INTERNA da plataforma, vinda de `cliente_cross` — não do papel.
   * Uma Parte pode ser Cliente Cross sem ter o papel `cliente` cadastrado, e é
   * a relação interna que manda. Exposto aqui para o consumidor conferir a
   * restrição da direção `parceiro_para_cliente` sem reconsultar o banco.
   */
  eh_cliente_cross: z.boolean(),

  elegibilidade: z.enum(["elegivel", "elegivel_com_ressalva"]),

  /**
   * Score de RETRIEVAL. Prioriza tecnicamente quem olhar primeiro.
   *
   * NÃO é Cross Score, NÃO é Score Card, NÃO é probabilidade de fechar
   * parceria. O nome longo é intencional: encurtar viraria "score" e alguém
   * leria como nota comercial.
   */
  pre_match_score: z.number().min(0).max(100),
  /** Contribuição de cada sinal — sustenta "por que A ficou acima de B?". */
  componentes: z.array(z.object({
    tipo: tipoSinal,
    peso: z.number(),
    valor: z.number().nullable(),
    contribuicao: z.number(),
  })).default([]),

  sinais: z.array(sinalMatching).default([]),
  /** Sinais que não puderam ser calculados, e por quê. */
  informacao_faltante: z.array(z.string()).default([]),

  status_perfil: statusPerfil,
  /** True quando pesquisa externa poderia melhorar a avaliação. */
  necessita_enriquecimento: z.boolean(),
  relacionamento: situacaoRelacionamento,
  nivel_validacao: nivelValidacao,
});
export type CandidatoMatching = z.infer<typeof candidatoMatching>;

export const motivoExclusao = z.enum([
  "auto_match",
  "papel_alvo_incorreto",
  "excluido_explicitamente",
  "inativo",
  "duplicado",
  "conflito_de_entidade",
  "fora_de_escopo",
  "excedeu_limite_candidatos",
]);
export type MotivoExclusao = z.infer<typeof motivoExclusao>;

export const candidatoExcluido = z.object({
  parte_id: z.string().nullable(),
  nome: z.string(),
  motivo: motivoExclusao,
  /** Etapa em que caiu: sql, filtro_duro, deduplicacao, ranking. */
  etapa: z.string(),
  detalhe: z.string().optional(),
});

export const internalMatchingResultSchema = z.object({
  direcao: direcaoMatching,
  origem: z.object({
    parte_id: z.string().nullable(),
    nome: z.string(),
    vinculo: statusVinculoOrigem,
    /** True enquanto vincular/criar Parte for decisão humana. */
    requer_resolucao_humana: z.boolean(),
    papeis: z.array(z.string()).default([]),
  }),
  objetivo: z.string().nullable(),

  /** Contagens do funil de seleção — sustentam o teste de explosão. */
  universo: z.object({
    total_no_pool_sql: z.number().int(),
    considerados: z.number().int(),
    pontuados: z.number().int(),
    shortlist: z.number().int(),
  }),

  shortlist: z.array(candidatoMatching).default([]),
  excluidos: z.array(candidatoExcluido).default([]),
  /** Candidatos que exigiriam enriquecimento para serem avaliados. */
  nao_resolvidos: z.array(z.object({
    parte_id: z.string(),
    nome: z.string(),
    motivo: z.string(),
  })).default([]),

  /**
   * Nível global do resultado. Enquanto embeddings e reasoning pagos não forem
   * homologados, isto permanece `estrutural` — e o consumidor precisa saber.
   */
  nivel_validacao: nivelValidacao,
  validacao_semantica: z.literal("pendente_embedding_real"),

  telemetria: z.object({
    duracao_ms: z.number().int(),
    duracao_sql_ms: z.number().int(),
    llm_calls: z.number().int(),
    embedding_calls: z.number().int(),
    custo_estimado_usd: z.number(),
    pesos_versao: z.string(),
  }),
});
export type InternalMatchingResult = z.infer<typeof internalMatchingResultSchema>;

// -----------------------------------------------------------------------------
// Pesos de RETRIEVAL
//
// Ordenam tecnicamente quem olhar primeiro. NÃO são metodologia Cross: a
// metodologia vive no Cross Knowledge, versionada, e sustenta o Crossability.
// Chamar estes pesos de "metodologia" seria inventar autoridade que eles não
// têm.
//
// Centralizados aqui para não virarem números mágicos espalhados.
// -----------------------------------------------------------------------------
export const PESOS_RETRIEVAL = {
  publico: 0.25,
  territorio: 0.25,
  ativo: 0.20,
  relacionamento: 0.10,
  geografico: 0.10,
  segmento: 0.10,
  momento: 0.00,
} as const;

export const PESOS_VERSAO = "retrieval-v1";

export interface EntradaMatching {
  direcao: DirecaoMatching;
  /** Parte de origem. `null` em prospecção do zero. */
  parteOrigemId?: string | null;
  /** Nome da origem quando externa/não vinculada. */
  nomeOrigem?: string;
  objetivo?: string | null;
  /** Partes que não podem aparecer na shortlist. */
  excluidos?: string[];
  /** Teto de candidatos avaliados. Da configuração, nunca fixo no código. */
  maxCandidatos?: number;
  /** Teto da shortlist final. */
  tamanhoShortlist?: number;
}
