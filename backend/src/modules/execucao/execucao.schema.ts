import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();
const data = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").optional();

// --- Plano de execução (RF038 — RN029) -------------------------------------

export const criarPlanoSchema = z.object({
  nome: texto,
  descricao: texto,
  status_execucao_codigo: z.string().trim().min(1).default("nao_iniciado"),
});
export type CriarPlanoInput = z.infer<typeof criarPlanoSchema>;

// --- Etapa (RF039 — RN030) --------------------------------------------------

export const criarEtapaSchema = z
  .object({
    nome: z.string().trim().min(1, "nome é obrigatório"),
    descricao: texto,
    ordem: z.number().int().nonnegative(),
    data_inicio_prevista: data,
    data_fim_prevista: data,
    status_execucao_codigo: z.string().trim().min(1).default("nao_iniciado"),
  })
  .refine(
    (o) =>
      !o.data_inicio_prevista ||
      !o.data_fim_prevista ||
      o.data_fim_prevista >= o.data_inicio_prevista,
    { message: "data_fim_prevista não pode ser anterior a data_inicio_prevista", path: ["data_fim_prevista"] }
  );
export type CriarEtapaInput = z.infer<typeof criarEtapaSchema>;

export const atualizarEtapaSchema = z
  .object({
    nome: texto,
    descricao: texto,
    ordem: z.number().int().nonnegative().optional(),
    data_inicio_prevista: data,
    data_fim_prevista: data,
    status_execucao_codigo: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarEtapaInput = z.infer<typeof atualizarEtapaSchema>;

// --- Entrega (RF040 — RN031) ------------------------------------------------

export const criarEntregaSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  descricao: texto,
  data_prevista: data,
  data_entrega: data,
  status_entrega_codigo: z.string().trim().min(1).default("pendente"),
});
export type CriarEntregaInput = z.infer<typeof criarEntregaSchema>;

export const atualizarEntregaSchema = z
  .object({
    nome: texto,
    descricao: texto,
    data_prevista: data,
    data_entrega: data,
    status_entrega_codigo: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarEntregaInput = z.infer<typeof atualizarEntregaSchema>;

/** Responsável é OU um usuário interno OU uma Parte externa — nunca ambos (RN031). */
export const atribuirResponsavelSchema = z
  .object({
    usuario_interno_id: uuid.optional(),
    parte_id: uuid.optional(),
    funcao: texto,
    inicio: data,
    fim: data,
  })
  .refine((o) => (o.usuario_interno_id ? 1 : 0) + (o.parte_id ? 1 : 0) === 1, {
    message: "Informe exatamente um entre usuario_interno_id e parte_id",
    path: ["usuario_interno_id"],
  });
export type AtribuirResponsavelInput = z.infer<typeof atribuirResponsavelSchema>;

// --- Reunião e touchpoint (RF041) ------------------------------------------

export const criarReuniaoSchema = z.object({
  titulo: z.string().trim().min(1, "titulo é obrigatório"),
  data_reuniao: z.string().trim().min(1, "data_reuniao é obrigatória"),
  local: texto,
  resumo: texto,
});
export type CriarReuniaoInput = z.infer<typeof criarReuniaoSchema>;

export const atualizarReuniaoSchema = z
  .object({
    titulo: texto,
    data_reuniao: texto,
    local: texto,
    resumo: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarReuniaoInput = z.infer<typeof atualizarReuniaoSchema>;

export const adicionarParticipanteSchema = z
  .object({
    usuario_interno_id: uuid.optional(),
    parte_id: uuid.optional(),
    papel: texto,
  })
  .refine((o) => (o.usuario_interno_id ? 1 : 0) + (o.parte_id ? 1 : 0) === 1, {
    message: "Informe exatamente um entre usuario_interno_id e parte_id",
    path: ["usuario_interno_id"],
  });
export type AdicionarParticipanteInput = z.infer<typeof adicionarParticipanteSchema>;

export const criarTouchpointSchema = z.object({
  tipo: texto,
  descricao: z.string().trim().min(1, "descricao é obrigatória"),
  data_touchpoint: texto,
});
export type CriarTouchpointInput = z.infer<typeof criarTouchpointSchema>;

// --- Pendência (RF042 — RN032) ----------------------------------------------

export const criarPendenciaSchema = z.object({
  descricao: z.string().trim().min(1, "descricao é obrigatória"),
  status_pendencia_codigo: z.string().trim().min(1).default("aberta"),
  etapa_execucao_id: uuid.optional(),
  entrega_id: uuid.optional(),
  prazo: data,
});
export type CriarPendenciaInput = z.infer<typeof criarPendenciaSchema>;

export const atualizarPendenciaSchema = z
  .object({
    descricao: texto,
    status_pendencia_codigo: texto,
    prazo: data,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarPendenciaInput = z.infer<typeof atualizarPendenciaSchema>;
