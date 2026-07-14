import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();

// --- Frente de oportunidade (RF024 — RN014, RN030) -------------------------

export const criarFrenteSchema = z.object({
  nome: z.string().trim().min(1, "nome não pode ser vazio"),
  objetivo: z.string().trim().min(1, "objetivo é obrigatório"),
  territorio_id: uuid.optional(),
  descricao: texto,
  categoria: texto,
  data_abertura: texto,
  data_encerramento: texto,
  status_frente_codigo: z.string().trim().min(1).default("aberta"),
});
export type CriarFrenteInput = z.infer<typeof criarFrenteSchema>;

export const atualizarFrenteSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    objetivo: z.string().trim().min(1).optional(),
    territorio_id: uuid.optional(),
    descricao: texto,
    categoria: texto,
    data_encerramento: texto,
    status_frente_codigo: z.string().trim().min(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });
export type AtualizarFrenteInput = z.infer<typeof atualizarFrenteSchema>;

// --- Candidatura de parceiro (RF025 — RN015, RN016, RN018) -----------------

export const criarCandidaturaSchema = z.object({
  parte_id: uuid,
  interesse_cliente_codigo: texto,
  interesse_parceiro_codigo: texto,
  prioridade_codigo: texto,
  disponibilidade_confirmada: z.boolean().optional(),
  observacoes: texto,
  status_candidatura_codigo: z.string().trim().min(1).default("identificada"),
});
export type CriarCandidaturaInput = z.infer<typeof criarCandidaturaSchema>;

// --- Movimentação de status (RF026 — RN017) --------------------------------

export const movimentarCandidaturaSchema = z.object({
  status_codigo: z.string().trim().min(1, "status_codigo é obrigatório"),
  justificativa: texto,
  motivo_recusa: texto,
  contexto: z.record(z.string(), z.unknown()).optional(),
});
export type MovimentarCandidaturaInput = z.infer<typeof movimentarCandidaturaSchema>;
