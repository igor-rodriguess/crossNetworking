import { withTransaction } from "../../shared/db";
import { NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./documentos.repository";
import { CriarDocumentoInput } from "./documentos.schema";

function formatar(row: repo.DocumentoRow) {
  return {
    ...row,
    tamanho_bytes: row.tamanho_bytes === null ? null : Number(row.tamanho_bytes),
  };
}

/** Registra os metadados do documento (RF009). O arquivo em si fica externo. */
export async function criarDocumento(input: CriarDocumentoInput, usuarioId: string | null) {
  const row = await withTransaction(async (client) => {
    const statusId = await repo.resolverStatusDocumentoId(client, input.status_documento_codigo);
    if (!statusId) {
      throw new ValidationError(`status_documento inexistente: ${input.status_documento_codigo}`);
    }

    const id = await repo.inserirDocumento(client, input, statusId, usuarioId);
    const criado = await repo.buscarPorId(client, id);
    if (!criado) throw new NotFoundError("Falha ao carregar o documento recém-criado");
    return criado;
  }, { usuarioId });

  return formatar(row);
}

export async function obterDocumento(id: string) {
  const row = await withTransaction((client) => repo.buscarPorId(client, id));
  if (!row) throw new NotFoundError("Documento não encontrado");
  return formatar(row);
}
