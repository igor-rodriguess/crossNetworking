import { z } from "zod";

const email = z
  .string()
  .trim()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "E-mail inválido");

// --- Usuários internos (RF002 — RN006) -------------------------------------

export const persona = z.enum(["estrategista", "gestor_contas", "coordenador", "administrador"]);

/** Política mínima de senha. */
const senha = z
  .string()
  .min(10, "a senha deve ter ao menos 10 caracteres")
  .max(200, "senha longa demais")
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), {
    message: "a senha deve conter letras e números",
  });

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(1, "nome não pode ser vazio"),
  email,
  cargo: z.string().trim().min(1).optional(),
  persona: persona.optional(),
  senha: senha.optional(),
});
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

export const atualizarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    email: email.optional(),
    cargo: z.string().trim().min(1).optional(),
    persona: persona.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;

export const definirSenhaSchema = z.object({ senha });
export type DefinirSenhaInput = z.infer<typeof definirSenhaSchema>;

// --- Catálogos de vocabulário controlado (RN018) ---------------------------

/** Nome público do catálogo → tabela de referência. */
export const CATALOGOS: Record<string, string> = {
  "status-parte": "cross_core.status_parte",
  papeis: "cross_core.papel",
  "tipos-organizacao": "cross_core.tipo_organizacao",
  "status-documento": "cross_core.status_documento",
  "tipos-disponibilidade": "cross_intelligence.tipo_disponibilidade",
  territorios: "cross_intelligence.territorio",
  "status-cliente": "cross_commercial.status_cliente",
  "status-contrato": "cross_commercial.status_contrato",
  "modelos-contratacao": "cross_commercial.modelo_contratacao",
  "tipos-remuneracao": "cross_commercial.tipo_remuneracao",
  "status-projeto": "cross_projects.status_projeto",
  "status-frente": "cross_projects.status_frente",
  "status-candidatura": "cross_projects.status_candidatura",
  prioridades: "cross_projects.prioridade",
  "tipos-origem-demanda": "cross_projects.tipo_origem_demanda",
  "niveis-interesse": "cross_projects.nivel_interesse",
  "status-crossability": "cross_methodologies.status_crossability",
  "status-paper": "cross_methodologies.status_paper",
  "status-validacao": "cross_methodologies.status_validacao",
  "tipos-validacao": "cross_methodologies.tipo_validacao",
  "status-avaliacao-score-card": "cross_methodologies.status_avaliacao_score_card",
  "tipos-decisao": "cross_methodologies.tipo_decisao",
  "status-parceria": "cross_partnerships.status_parceria",
  "status-negociacao": "cross_partnerships.status_negociacao",
  "tipos-parceria": "cross_partnerships.tipo_parceria",
  "status-execucao": "cross_execution.status_execucao",
  "status-entrega": "cross_execution.status_entrega",
  "status-pendencia": "cross_execution.status_pendencia",
  "tipos-metrica": "cross_analytics.tipo_metrica",
};
