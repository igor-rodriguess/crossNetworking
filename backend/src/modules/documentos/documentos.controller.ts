import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { criarDocumentoSchema, vincularDocumentoSchema } from "./documentos.schema";
import * as service from "./documentos.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

export async function criar(req: Request, res: Response): Promise<void> {
  const input = criarDocumentoSchema.parse(req.body);
  const documento = await service.criarDocumento(input, req.usuarioId);
  res.status(201).json(documento);
}

export async function obter(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Documento não encontrado");
  res.json(await service.obterDocumento(id));
}

export async function vincular(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Documento não encontrado");
  const { entidade, entidade_id } = vincularDocumentoSchema.parse(req.body);
  res.status(201).json({ vinculos: await service.vincularDocumento(id, entidade, entidade_id, req.usuarioId) });
}

export async function listarVinculos(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Documento não encontrado");
  res.json({ itens: await service.listarVinculos(id) });
}

export async function desvincular(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Documento não encontrado");
  const entidade = vincularDocumentoSchema.shape.entidade.parse(req.params.entidade);
  const entidadeId = exigirUuid(req.params.entidadeId, "Vínculo não encontrado");
  await service.desvincularDocumento(id, entidade, entidadeId, req.usuarioId);
  res.status(204).send();
}
