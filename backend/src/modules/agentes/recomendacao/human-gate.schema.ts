import { z } from "zod";

// -----------------------------------------------------------------------------
// Recommendation Human Gate — contrato.
//
// Responde "esta hipótese produzida pela inteligência merece ser promovida para
// uma oportunidade operacional da Cross?".
//
// A IA propõe · o humano decide · o sistema registra.
//
// Aprovar aqui NÃO cria candidatura, Paper nem Score Card. O Score Card oficial
// exige `candidatura_parceiro_id` e `validacao_paper_id` (RN022), e essas
// restrições permanecem intocadas — a promoção é AI-07B.
// -----------------------------------------------------------------------------

/**
 * Decisões possíveis.
 *
 * Note a ausência de `aprovada_oportunidade`: nenhuma oportunidade existe ainda.
 * O nome longo `aprovada_para_revisao_de_oportunidade` é deliberado — encurtar
 * para "aprovada" convidaria a leitura de que algo operacional aconteceu.
 */
export const decisaoRevisao = z.enum([
  "pendente",
  "aprovada_para_revisao_de_oportunidade",
  "aprovada_com_edicoes",
  "rejeitada",
  "requer_mais_informacao",
]);
export type DecisaoRevisao = z.infer<typeof decisaoRevisao>;

/** Campos da recomendação que o humano pode corrigir. */
export const edicoesHumanas = z.object({
  hipotese_oportunidade: z.string().max(2000).optional(),
  observacoes: z.string().max(2000).optional(),
  racional_humano: z.string().max(2000).optional(),
  riscos_adicionais: z.array(z.string().max(400)).max(10).optional(),
  questoes_adicionais: z.array(z.string().max(400)).max(10).optional(),
});
export type EdicoesHumanas = z.infer<typeof edicoesHumanas>;

/**
 * Entrada da decisão.
 *
 * NÃO contém revisor: a identidade vem do contexto autenticado. Aceitar
 * `revisor_id` do corpo permitiria a qualquer cliente assinar decisão em nome
 * de outra pessoa.
 */
export const decidirRevisaoSchema = z.object({
  recomendacao_id: z.string().uuid(),
  decisao: decisaoRevisao.exclude(["pendente"]),
  motivo: z.string().max(2000).optional(),
  edicoes: edicoesHumanas.optional(),
  /**
   * Versão da revisão que o cliente leu. Protege contra escrita obsoleta:
   * sem isso, dois revisores sobre a mesma versão se sobrescreveriam em
   * silêncio.
   */
  versao_revisao_lida: z.number().int().positive().optional(),
  /** Reconhecimento explícito ao decidir sobre hipótese sem sustentação. */
  override_insuficiente: z.boolean().optional(),
});
export type DecidirRevisaoInput = z.infer<typeof decidirRevisaoSchema>;

export const revisaoRecomendacaoSchema = z.object({
  id: z.string(),
  recomendacao_id: z.string(),
  recomendacao_versao: z.number().int(),
  proposta_logica_id: z.string(),
  decisao: decisaoRevisao,
  revisor_id: z.string().nullable(),
  revisor_nome: z.string().nullable(),
  /** O que a IA propôs, congelado no momento da decisão. */
  snapshot_ia: z.record(z.string(), z.unknown()),
  edicoes_humanas: z.record(z.string(), z.unknown()).nullable(),
  motivo: z.string().nullable(),
  override_insuficiente: z.boolean(),
  requer_enriquecimento: z.boolean(),
  nivel_validacao: z.string(),
  versao_revisao: z.number().int(),
  criado_em: z.string(),
  decidido_em: z.string().nullable(),
});
export type RevisaoRecomendacao = z.infer<typeof revisaoRecomendacaoSchema>;

/** Erro de concorrência: alguém decidiu antes com base na mesma versão. */
export class ConflitoDeVersao extends Error {
  constructor(public readonly detalhe: string) {
    super(detalhe);
    this.name = "ConflitoDeVersao";
  }
}

/** Erro de entrada: recomendação inexistente, inválida ou não revisável. */
export class RevisaoInvalida extends Error {
  constructor(public readonly detalhe: string) {
    super(detalhe);
    this.name = "RevisaoInvalida";
  }
}
