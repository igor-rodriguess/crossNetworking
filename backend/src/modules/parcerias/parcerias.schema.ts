import { z } from "zod";

const texto = z.string().trim().min(1).optional();
const data = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").optional();
const moeda = z.string().trim().regex(/^[A-Z]{3}$/, "use o código ISO de 3 letras (ex.: BRL)").optional();
const valor = z.number().nonnegative().optional();

// --- Parceria (RF034 — RN026) ----------------------------------------------

export const formalizarParceriaSchema = z.object({
  tipo_parceria_codigo: texto,
  status_parceria_codigo: z.string().trim().min(1).default("em_estruturacao"),
  data_inicio: data,
  data_fim: data,
  condicoes_comerciais: texto,
});
export type FormalizarParceriaInput = z.infer<typeof formalizarParceriaSchema>;

export const atualizarParceriaSchema = formalizarParceriaSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarParceriaInput = z.infer<typeof atualizarParceriaSchema>;

// --- Negociação (RF035) -----------------------------------------------------

export const criarNegociacaoSchema = z.object({
  status_negociacao_codigo: z.string().trim().min(1).default("em_andamento"),
  descricao: texto,
  data_inicio: data,
  data_fim: data,
  resultado: texto,
});
export type CriarNegociacaoInput = z.infer<typeof criarNegociacaoSchema>;

export const atualizarNegociacaoSchema = criarNegociacaoSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarNegociacaoInput = z.infer<typeof atualizarNegociacaoSchema>;

// --- Contrapartida (RF036 — RN027) -----------------------------------------

export const criarContrapartidaSchema = z
  .object({
    descricao: z.string().trim().min(1, "descricao é obrigatória"),
    categoria: texto,
    valor_estimado: valor,
    moeda,
    prazo: data,
    cumprida: z.boolean().optional(),
  })
  .refine((o) => o.valor_estimado === undefined || o.moeda !== undefined, {
    message: "Informe a moeda junto com o valor estimado",
    path: ["moeda"],
  });
export type CriarContrapartidaInput = z.infer<typeof criarContrapartidaSchema>;

export const atualizarContrapartidaSchema = z
  .object({
    descricao: texto,
    categoria: texto,
    valor_estimado: valor,
    moeda,
    prazo: data,
    cumprida: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarContrapartidaInput = z.infer<typeof atualizarContrapartidaSchema>;

// --- Contrato de parceria (RF037 — RN028) ----------------------------------

export const criarContratoParceriaSchema = z
  .object({
    descricao: texto,
    data_assinatura: data,
    data_inicio: data,
    data_fim: data,
    valor,
    moeda,
    status_contrato_codigo: z.string().trim().min(1).default("em_negociacao"),
  })
  .refine((o) => o.valor === undefined || o.moeda !== undefined, {
    message: "Informe a moeda junto com o valor",
    path: ["moeda"],
  });
export type CriarContratoParceriaInput = z.infer<typeof criarContratoParceriaSchema>;

export const atualizarContratoParceriaSchema = z
  .object({
    descricao: texto,
    data_assinatura: data,
    data_inicio: data,
    data_fim: data,
    valor,
    moeda,
    status_contrato_codigo: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarContratoParceriaInput = z.infer<typeof atualizarContratoParceriaSchema>;
