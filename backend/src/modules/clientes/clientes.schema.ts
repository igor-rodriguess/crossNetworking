import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();

// --- Cliente Cross (RF016 — RN007) ----------------------------------------

export const criarClienteSchema = z.object({
  parte_id: uuid,
  responsavel_conta_id: uuid.optional(),
  status_cliente_codigo: z.string().trim().min(1).default("ativo"),
  inicio_relacionamento: texto,
  observacoes: texto,
});
export type CriarClienteInput = z.infer<typeof criarClienteSchema>;

export const atualizarClienteSchema = z
  .object({
    responsavel_conta_id: uuid.optional(),
    status_cliente_codigo: z.string().trim().min(1).optional(),
    inicio_relacionamento: texto,
    observacoes: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });
export type AtualizarClienteInput = z.infer<typeof atualizarClienteSchema>;

// --- Contrato do cliente (RF017 — RN008, RN011, RN030) ---------------------

export const criarContratoSchema = z.object({
  codigo: texto,
  descricao: texto,
  data_inicio: texto,
  data_fim: texto,
  status_contrato_codigo: z.string().trim().min(1).default("em_negociacao"),
});
export type CriarContratoInput = z.infer<typeof criarContratoSchema>;

export const atualizarContratoSchema = z
  .object({
    codigo: texto,
    descricao: texto,
    data_inicio: texto,
    data_fim: texto,
    status_contrato_codigo: z.string().trim().min(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });
export type AtualizarContratoInput = z.infer<typeof atualizarContratoSchema>;

// --- Modelos de contratação (RF018 — RN009) --------------------------------

export const definirModelosSchema = z.object({
  modelos: z.array(z.string().trim().min(1)).min(1, "informe ao menos um modelo"),
});
export type DefinirModelosInput = z.infer<typeof definirModelosSchema>;

// --- Componentes de remuneração (RF018 — RN010, RN038) ---------------------

export const criarComponenteSchema = z.object({
  tipo_remuneracao_codigo: z.string().trim().min(1),
  descricao: texto,
  valor: z.number().nonnegative().optional(),
  moeda: z.string().trim().regex(/^[A-Z]{3}$/, "moeda deve seguir o padrão ISO 4217 (ex.: BRL)").optional(),
  percentual: z.number().min(0).max(100).optional(),
  vigente_desde: texto,
  vigente_ate: texto,
});
export type CriarComponenteInput = z.infer<typeof criarComponenteSchema>;
