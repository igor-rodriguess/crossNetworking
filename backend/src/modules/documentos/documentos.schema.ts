import { z } from "zod";

/**
 * Documentos (RF009). O binário vive em serviço de armazenamento externo;
 * o banco guarda apenas metadados, localização e hash (WAD 7.4.16).
 */
export const criarDocumentoSchema = z.object({
  nome: z.string().trim().min(1, "nome não pode ser vazio"),
  tipo_mime: z.string().trim().min(1, "tipo_mime é obrigatório"),
  arquivo_url: z.string().trim().min(1, "arquivo_url é obrigatório"),
  hash_sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "hash_sha256 deve ter 64 caracteres hexadecimais"),
  extensao: z.string().trim().min(1).optional(),
  tamanho_bytes: z.number().int().nonnegative().optional(),
  status_documento_codigo: z.string().trim().min(1).default("ativo"),
});

export type CriarDocumentoInput = z.infer<typeof criarDocumentoSchema>;

/**
 * Alvos de vínculo de documento — FK explícita por tabela associativa, sem
 * polimorfismo (WAD 7.4.16). O nome da tabela vem deste mapa fechado, nunca do
 * usuário.
 */
export const ALVOS_DOCUMENTO = {
  projeto: { tabela: "cross_projects.projeto_documento", coluna: "projeto_id", origem: "cross_projects.projeto" },
  briefing: { tabela: "cross_projects.briefing_documento", coluna: "briefing_id", origem: "cross_projects.briefing" },
  planejamento: { tabela: "cross_projects.planejamento_documento", coluna: "planejamento_estrategico_id", origem: "cross_projects.planejamento_estrategico" },
  paper: { tabela: "cross_methodologies.paper_documento", coluna: "paper_id", origem: "cross_methodologies.paper" },
  contrato_cliente: { tabela: "cross_commercial.contrato_cliente_documento", coluna: "contrato_cliente_id", origem: "cross_commercial.contrato_cliente" },
  parceria: { tabela: "cross_partnerships.parceria_documento", coluna: "parceria_id", origem: "cross_partnerships.parceria" },
  plano_execucao: { tabela: "cross_execution.plano_execucao_documento", coluna: "plano_execucao_id", origem: "cross_execution.plano_execucao" },
} as const;
export type AlvoDocumento = keyof typeof ALVOS_DOCUMENTO;

export const vincularDocumentoSchema = z.object({
  entidade: z.enum(Object.keys(ALVOS_DOCUMENTO) as [AlvoDocumento, ...AlvoDocumento[]]),
  entidade_id: z.string().trim().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "entidade_id deve ser um UUID"
  ),
});
export type VincularDocumentoInput = z.infer<typeof vincularDocumentoSchema>;
