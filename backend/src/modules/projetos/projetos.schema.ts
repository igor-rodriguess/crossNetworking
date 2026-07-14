import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();

// --- Projeto (RF019 — RN012, RN030) ----------------------------------------

export const criarProjetoSchema = z.object({
  cliente_cross_id: uuid,
  contrato_cliente_id: uuid.optional(),
  nome: z.string().trim().min(1, "nome não pode ser vazio"),
  objetivo: z.string().trim().min(1, "objetivo é obrigatório"),
  descricao: texto,
  produto: texto,
  data_inicio: texto,
  data_previsao_fim: texto,
  data_fim_real: texto,
  status_projeto_codigo: z.string().trim().min(1).default("rascunho"),
  prioridade_codigo: texto,
});
export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;

export const atualizarProjetoSchema = z
  .object({
    contrato_cliente_id: uuid.optional(),
    nome: z.string().trim().min(1).optional(),
    objetivo: z.string().trim().min(1).optional(),
    descricao: texto,
    produto: texto,
    data_inicio: texto,
    data_previsao_fim: texto,
    data_fim_real: texto,
    status_projeto_codigo: z.string().trim().min(1).optional(),
    prioridade_codigo: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo para atualizar" });
export type AtualizarProjetoInput = z.infer<typeof atualizarProjetoSchema>;

// --- Origem da demanda (RF020 — RN018) -------------------------------------

export const criarOrigemDemandaSchema = z.object({
  tipo_origem_demanda_codigo: z.string().trim().min(1),
  descricao: texto,
});
export type CriarOrigemDemandaInput = z.infer<typeof criarOrigemDemandaSchema>;

// --- Briefing versionado (RF021 — RN021) -----------------------------------

export const criarBriefingSchema = z.object({
  conteudo: z.string().trim().min(1, "conteudo é obrigatório"),
  objetivos: texto,
});
export type CriarBriefingInput = z.infer<typeof criarBriefingSchema>;

// --- Planejamento estratégico versionado (RF022 — RN021) -------------------

export const criarPlanejamentoSchema = z
  .object({
    consolidacao_materiais: texto,
    estudos_marca: texto,
    diagnosticos: texto,
    objetivos_negocio: texto,
    desafios: texto,
    territorios: texto,
    oportunidades: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo do planejamento" });
export type CriarPlanejamentoInput = z.infer<typeof criarPlanejamentoSchema>;

// --- Responsáveis (RF023 — RN013, RN031) -----------------------------------

export const criarResponsavelSchema = z.object({
  usuario_interno_id: uuid,
  funcao: texto,
  inicio: texto,
  fim: texto,
});
export type CriarResponsavelInput = z.infer<typeof criarResponsavelSchema>;
