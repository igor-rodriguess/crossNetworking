import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();

// --- Análise Crossability (RF027 — RN019) ----------------------------------

export const criarAnaliseSchema = z
  .object({
    compatibilidade_publicos: texto,
    compatibilidade_territorios: texto,
    complementaridade_ativos: texto,
    sinergias: texto,
    fit_estrategico: texto,
    momento_estrategico: texto,
    racional_recomendacao: texto,
    status_crossability_codigo: z.string().trim().min(1).default("em_elaboracao"),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo da análise" });
export type CriarAnaliseInput = z.infer<typeof criarAnaliseSchema>;

// --- Paper e versões (RF028 — RN021) ---------------------------------------

export const criarPaperSchema = z.object({
  titulo: z.string().trim().min(1, "titulo é obrigatório"),
  status_paper_codigo: z.string().trim().min(1).default("em_elaboracao"),
});
export type CriarPaperInput = z.infer<typeof criarPaperSchema>;

export const criarVersaoPaperSchema = z.object({
  estrategia_proposta: z.string().trim().min(1, "estrategia_proposta é obrigatória"),
  beneficios_esperados: texto,
  plano_implementacao: texto,
});
export type CriarVersaoPaperInput = z.infer<typeof criarVersaoPaperSchema>;

// --- Recomendações do Paper (RF029) ----------------------------------------

export const recomendarCandidaturaSchema = z.object({
  candidatura_parceiro_id: uuid,
  ordem_prioridade: z.number().int().min(1).optional(),
  justificativa: texto,
  recomendacao: texto,
  status_recomendacao: texto,
});
export type RecomendarCandidaturaInput = z.infer<typeof recomendarCandidaturaSchema>;

// --- Validação do Paper (RF030 — RN020) ------------------------------------

export const criarValidacaoSchema = z.object({
  tipo_validacao_codigo: z.string().trim().min(1),
  status_validacao_codigo: z.string().trim().min(1),
  observacoes: texto,
});
export type CriarValidacaoInput = z.infer<typeof criarValidacaoSchema>;

// --- Score Card: modelo, versão e critérios (RF031 — RN023) ----------------

export const criarModeloScoreCardSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  descricao: texto,
});
export type CriarModeloScoreCardInput = z.infer<typeof criarModeloScoreCardSchema>;

export const definirCriteriosSchema = z.object({
  criterios: z
    .array(
      z.object({
        nome: z.string().trim().min(1),
        descricao: texto,
        peso_sim: z.number().nonnegative(),
        peso_nao: z.number().nonnegative(),
        ordem: z.number().int().nonnegative(),
        obrigatorio: z.boolean().optional(),
      })
    )
    .min(1, "informe ao menos um critério"),
});
export type DefinirCriteriosInput = z.infer<typeof definirCriteriosSchema>;

// --- Avaliação Score Card (RF032 — RN022, RN023, RN024) --------------------

export const aplicarAvaliacaoSchema = z.object({
  versao_modelo_score_card_id: uuid,
  validacao_paper_id: uuid,
  potencial_disruptivo: z.number().int().min(1, "potencial_disruptivo deve estar entre 1 e 5").max(5),
  respostas: z
    .array(
      z.object({
        criterio_id: uuid,
        valor: z.enum(["sim", "nao", "nao_avaliado"]),
        justificativa: texto,
      })
    )
    .min(1, "informe ao menos uma resposta"),
  status_avaliacao_codigo: z.string().trim().min(1).default("concluida"),
});
export type AplicarAvaliacaoInput = z.infer<typeof aplicarAvaliacaoSchema>;

// --- Decisão da candidatura (RF033 — RN025) --------------------------------

export const registrarDecisaoSchema = z.object({
  tipo_decisao_codigo: z.string().trim().min(1),
  justificativa: texto,
  contexto: z.record(z.string(), z.unknown()).optional(),
});
export type RegistrarDecisaoInput = z.infer<typeof registrarDecisaoSchema>;
