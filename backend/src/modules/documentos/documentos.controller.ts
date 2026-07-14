import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { criarDocumentoSchema } from "./documentos.schema";
import * as service from "./documentos.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function criar(req: Request, res: Response): Promise<void> {
  const input = criarDocumentoSchema.parse(req.body);
  const documento = await service.criarDocumento(input, req.usuarioId);
  res.status(201).json(documento);
}

export async function obter(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw new NotFoundError("Documento não encontrado");
  res.json(await service.obterDocumento(id));
}
