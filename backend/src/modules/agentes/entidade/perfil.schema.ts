import { z } from "zod";

// -----------------------------------------------------------------------------
// Entity Intelligence Profile.
//
// Responde "o que sabemos atualmente sobre esta entidade?" — memória factual
// consolidada. NÃO responde se ela combina com algum cliente (Crossability),
// com quem deveria fazer parceria (Matching) nem o que a Cross deveria fazer
// (Recommendation).
//
// Duas origens, jamais misturadas:
//   · INTERNO  — banco da Cross. Autoridade sobre relação e histórico.
//   · EXTERNO  — Evidence Package. Autoridade sobre o que a empresa fez no mundo.
//
// Cada elemento carrega sua proveniência. Um campo sem origem não entra.
// -----------------------------------------------------------------------------

/** De onde veio a informação. Nunca ambíguo. */
export const origemInformacao = z.enum(["interno", "externo"]);
export type OrigemInformacao = z.infer<typeof origemInformacao>;

/** Proveniência: o caminho de volta até a fonte. */
export const proveniencia = z.object({
  origem: origemInformacao,
  /** Registro interno que sustenta (ex.: "cliente_cross.id=uuid"). */
  registro_interno: z.string().nullable().optional(),
  /** fact_ids do Evidence Package que sustentam. */
  evidence_refs: z.array(z.string()).default([]),
  /** source_ids das fontes externas. */
  source_refs: z.array(z.string()).default([]),
});
export type Proveniencia = z.infer<typeof proveniencia>;

/** Um elemento factual do perfil, sempre com proveniência. */
export const elementoPerfil = z.object({
  valor: z.string(),
  proveniencia,
  /** Verificação herdada do Evidence Package; null para dado interno. */
  verificacao: z.string().nullable().optional(),
  confianca: z.number().int().min(0).max(100).nullable().optional(),
  publicado_em: z.string().nullable().optional(),
});
export type ElementoPerfil = z.infer<typeof elementoPerfil>;

/** Status do vínculo com uma Parte da base. */
export const vinculoEntidade = z.enum(["vinculada", "nao_vinculada", "ambigua"]);
export type VinculoEntidade = z.infer<typeof vinculoEntidade>;

export const identidadePerfil = z.object({
  nome: z.string(),
  aliases: z.array(z.string()).default([]),
  dominio_oficial: z.string().nullable(),
  tipo: z.string().nullable(),
  /** Parte correspondente; null quando ainda não vinculada. */
  parte_id: z.string().nullable(),
  vinculo: vinculoEntidade,
  /**
   * True enquanto a decisão de vincular ou criar Parte não for humana.
   * O agente NUNCA cria Parte automaticamente.
   */
  requer_resolucao_humana: z.boolean(),
  /** Candidatas quando a resolução ficou ambígua. */
  candidatas: z.array(z.object({ nome: z.string(), parte_id: z.string().nullable() })).default([]),
});

/** Relação com a Cross — SEMPRE do banco interno, nunca inferida da internet. */
export const relacaoInterna = z.object({
  eh_cliente_cross: z.boolean(),
  papeis: z.array(elementoPerfil).default([]),
  oportunidades: z.array(elementoPerfil).default([]),
  parcerias: z.array(elementoPerfil).default([]),
  projetos: z.array(elementoPerfil).default([]),
});

/** Um conflito preservado — nenhuma versão é escolhida. */
export const conflitoPerfil = z.object({
  claim_a: z.string(),
  fontes_a: z.array(z.string()),
  claim_b: z.string(),
  fontes_b: z.array(z.string()),
  observacao: z.string(),
});

/** O que ainda NÃO sabemos. Lacuna declarada, nunca preenchida. */
export const lacunaPerfil = z.object({
  campo: z.string(),
  descricao: z.string(),
});

export const itemTimeline = z.object({
  data: z.string(),
  descricao: z.string(),
  proveniencia,
});

export const entityIntelligenceProfileSchema = z.object({
  identidade: identidadePerfil,
  relacao_interna: relacaoInterna,
  contexto_empresa: z.array(elementoPerfil).default([]),
  posicionamento: z.array(elementoPerfil).default([]),
  publicos: z.array(elementoPerfil).default([]),
  territorios: z.array(elementoPerfil).default([]),
  ativos: z.array(elementoPerfil).default([]),
  produtos: z.array(elementoPerfil).default([]),
  relacionamentos: z.array(elementoPerfil).default([]),
  movimentos: z.array(elementoPerfil).default([]),
  /** Só itens com data. Sem data, fica fora — não se inventa sequência. */
  timeline: z.array(itemTimeline).default([]),
  conflitos: z.array(conflitoPerfil).default([]),
  lacunas: z.array(lacunaPerfil).default([]),
  frescor: z.object({
    perfil_gerado_em: z.string(),
    evidencia_mais_recente_em: z.string().nullable(),
    atualizacao_interna_mais_recente_em: z.string().nullable(),
  }),
  versao_perfil: z.number().int().min(1),
  /** Hash dos inputs — base da idempotência. */
  hash_entrada: z.string(),
  telemetria: z.object({
    duracao_ms: z.number().int(),
    registros_internos_considerados: z.number().int(),
    fatos_considerados: z.number().int(),
    fatos_consolidados: z.number().int(),
    duplicatas_mescladas: z.number().int(),
    conflitos: z.number().int(),
    lacunas: z.number().int(),
    llm_calls: z.number().int(),
    custo_estimado_usd: z.number(),
  }),
});
export type EntityIntelligenceProfile = z.infer<typeof entityIntelligenceProfileSchema>;

/** Diferença entre duas versões do perfil. */
export const diffPerfil = z.object({
  adicionados: z.array(z.string()).default([]),
  atualizados: z.array(z.string()).default([]),
  inalterados: z.number().int().default(0),
  conflitantes: z.array(z.string()).default([]),
  /**
   * Itens presentes na versão anterior e ausentes na nova. Registrados como
   * AUSENTES, não removidos: não aparecer numa pesquisa não prova que deixou
   * de existir.
   */
  ausentes_nao_removidos: z.array(z.string()).default([]),
});
export type DiffPerfil = z.infer<typeof diffPerfil>;
