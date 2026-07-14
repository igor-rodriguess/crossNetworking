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
