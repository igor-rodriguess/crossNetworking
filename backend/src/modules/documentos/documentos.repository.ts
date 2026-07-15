import { PoolClient } from "pg";
import { ALVOS_DOCUMENTO, AlvoDocumento, CriarDocumentoInput } from "./documentos.schema";

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

// --- Vínculos de documento (RF009 — FK explícita por tabela associativa) -----

export async function existeDocumento(client: PoolClient, id: string): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM cross_core.documento WHERE id = $1", [id]);
  return r.rowCount !== 0;
}

export async function existeAlvoDocumento(
  client: PoolClient,
  entidade: AlvoDocumento,
  id: string
): Promise<boolean> {
  const r = await client.query(`SELECT 1 FROM ${ALVOS_DOCUMENTO[entidade].origem} WHERE id = $1`, [id]);
  return r.rowCount !== 0;
}

export async function vincularDocumento(
  client: PoolClient,
  entidade: AlvoDocumento,
  entidadeId: string,
  documentoId: string
): Promise<void> {
  const { tabela, coluna } = ALVOS_DOCUMENTO[entidade];
  await client.query(
    `INSERT INTO ${tabela} (${coluna}, documento_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [entidadeId, documentoId]
  );
}

export async function desvincularDocumento(
  client: PoolClient,
  entidade: AlvoDocumento,
  entidadeId: string,
  documentoId: string
): Promise<number> {
  const { tabela, coluna } = ALVOS_DOCUMENTO[entidade];
  const r = await client.query(
    `DELETE FROM ${tabela} WHERE ${coluna} = $1 AND documento_id = $2`,
    [entidadeId, documentoId]
  );
  return r.rowCount ?? 0;
}

export async function listarVinculosDocumento(client: PoolClient, documentoId: string) {
  const partes = Object.entries(ALVOS_DOCUMENTO).map(
    ([entidade, { tabela, coluna }]) =>
      `SELECT '${entidade}' AS entidade, ${coluna} AS entidade_id FROM ${tabela} WHERE documento_id = $1`
  );
  const { rows } = await client.query(partes.join(" UNION ALL "), [documentoId]);
  return rows;
}
