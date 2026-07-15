import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();
const data = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").optional();

// --- RF048 · Fontes e evidências -------------------------------------------

export const criarFonteSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  tipo: texto,
  url: texto,
  descricao: texto,
});
export type CriarFonteInput = z.infer<typeof criarFonteSchema>;

export const criarEvidenciaSchema = z
  .object({
    titulo: z.string().trim().min(1, "titulo é obrigatório"),
    fonte_id: uuid.optional(),
    documento_id: uuid.optional(),
    descricao: texto,
    url: texto,
    validade_inicio: data,
    validade_fim: data,
    nivel_confianca: z.number().min(0).max(1, "nivel_confianca vai de 0 a 1").optional(),
  })
  .refine(
    (o) => !o.validade_inicio || !o.validade_fim || o.validade_fim >= o.validade_inicio,
    { message: "validade_fim não pode ser anterior a validade_inicio", path: ["validade_fim"] }
  );
export type CriarEvidenciaInput = z.infer<typeof criarEvidenciaSchema>;

/** Alvos de vínculo de evidência — FK explícita, sem polimorfismo (RF048). */
export const ALVOS_EVIDENCIA = {
  perfil_estrategico: { tabela: "perfil_estrategico_evidencia", coluna: "perfil_estrategico_id" },
  analise_crossability: { tabela: "analise_crossability_evidencia", coluna: "analise_crossability_id" },
  medicao_midia: { tabela: "medicao_midia_evidencia", coluna: "medicao_midia_id" },
  big_moment: { tabela: "big_moment_evidencia", coluna: "big_moment_id" },
  resultado: { tabela: "resultado_evidencia", coluna: "resultado_id" },
  calculo_roi: { tabela: "calculo_roi_evidencia", coluna: "calculo_roi_id" },
} as const;
export type AlvoEvidencia = keyof typeof ALVOS_EVIDENCIA;

export const vincularEvidenciaSchema = z.object({
  alvo_tipo: z.enum(Object.keys(ALVOS_EVIDENCIA) as [AlvoEvidencia, ...AlvoEvidencia[]]),
  alvo_id: uuid,
  relevancia: texto,
  observacoes: texto,
});
export type VincularEvidenciaInput = z.infer<typeof vincularEvidenciaSchema>;

// --- RF049 · Consulta de auditoria -----------------------------------------

export const filtroAuditoriaSchema = z.object({
  tabela: texto,
  schema: texto,
  registro_id: uuid.optional(),
  usuario_id: uuid.optional(),
  operacao: z.enum(["INSERT", "UPDATE", "DELETE", "ARCHIVE", "RESTORE"]).optional(),
  de: texto,
  ate: texto,
  limite: z.coerce.number().int().min(1).max(200).default(50),
});
export type FiltroAuditoria = z.infer<typeof filtroAuditoriaSchema>;

// --- RF050 · Importação de planilhas ---------------------------------------

export const importarPartesSchema = z.object({
  itens: z.array(z.record(z.string(), z.unknown())).min(1, "envie ao menos uma linha"),
});
export type ImportarPartesInput = z.infer<typeof importarPartesSchema>;
