import { PoolClient } from "pg";
import { CriarDocumentoInput } from "./documentos.schema";

export async function resolverStatusDocumentoId(
  client: PoolClient,
  codigo: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM cross_core.status_documento WHERE codigo = $1",
    [codigo]
  );
  return rows[0]?.id ?? null;
}

export interface DocumentoRow {
  id: string;
  nome: string;
  tipo_mime: string;
  extensao: string | null;
  tamanho_bytes: string | null;
  arquivo_url: string;
  hash_sha256: string;
  numero_versao: number;
  status: string;
  criado_em: string;
}

export async function inserirDocumento(
  client: PoolClient,
  input: CriarDocumentoInput,
  statusId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.documento
       (nome, tipo_mime, extensao, tamanho_bytes, arquivo_url, hash_sha256,
        status_documento_id, criado_por_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.nome,
      input.tipo_mime,
      input.extensao ?? null,
      input.tamanho_bytes ?? null,
      input.arquivo_url,
      input.hash_sha256,
      statusId,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function buscarPorId(client: PoolClient, id: string): Promise<DocumentoRow | null> {
  const { rows } = await client.query<DocumentoRow>(
    `SELECT d.id, d.nome, d.tipo_mime, d.extensao, d.tamanho_bytes, d.arquivo_url,
            d.hash_sha256, d.numero_versao, sd.codigo AS status, d.criado_em
       FROM cross_core.documento d
       JOIN cross_core.status_documento sd ON sd.id = d.status_documento_id
      WHERE d.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
