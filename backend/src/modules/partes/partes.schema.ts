import { z } from "zod";

// Espelha os RN de formato (RN002) e obrigatoriedade (RF004/RF005).
const cnpj = z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos");
const cpf = z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos");
const textoOpcional = z.string().trim().min(1).optional();

export const criarOrganizacaoSchema = z.object({
  tipo: z.literal("organizacao"),
  nome_exibicao: z.string().trim().min(1, "nome_exibicao não pode ser vazio"),
  status_parte_codigo: z.string().trim().min(1).default("ativa"),
  organizacao: z.object({
    nome_fantasia: z.string().trim().min(1, "nome_fantasia não pode ser vazio"),
    razao_social: textoOpcional,
    cnpj: cnpj.optional(),
    segmento_principal: textoOpcional,
    site: textoOpcional,
  }),
});

export const criarPessoaSchema = z.object({
  tipo: z.literal("pessoa"),
  nome_exibicao: z.string().trim().min(1, "nome_exibicao não pode ser vazio"),
  status_parte_codigo: z.string().trim().min(1).default("ativa"),
  pessoa: z.object({
    nome_completo: z.string().trim().min(1, "nome_completo não pode ser vazio"),
    nome_artistico: textoOpcional,
    cpf: cpf.optional(),
    nacionalidade: textoOpcional,
  }),
});

export type CriarOrganizacaoInput = z.infer<typeof criarOrganizacaoSchema>;
export type CriarPessoaInput = z.infer<typeof criarPessoaSchema>;
export type CriarParteInput = CriarOrganizacaoInput | CriarPessoaInput;

/** Valida o corpo conforme o tipo da Parte (organização/pessoa). */
export function parseCriarParte(body: unknown): CriarParteInput {
  const tipo = (body as { tipo?: unknown } | null)?.tipo;
  if (tipo === "pessoa") return criarPessoaSchema.parse(body);
  // organização (padrão) — se o tipo for inválido, o z.literal reporta o erro
  return criarOrganizacaoSchema.parse(body);
}

// Atualização parcial dos campos base da Parte (PATCH).
export const atualizarParteSchema = z
  .object({
    nome_exibicao: z.string().trim().min(1, "nome_exibicao não pode ser vazio").optional(),
    status_parte_codigo: z.string().trim().min(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });

export type AtualizarParteInput = z.infer<typeof atualizarParteSchema>;
