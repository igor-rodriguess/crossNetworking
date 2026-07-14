import { Request, Response } from "express";
import { parseCriarParte, atualizarParteSchema } from "./partes.schema";
import * as service from "./partes.service";
import { NotFoundError } from "../../shared/errors";
import { parsePaginacao, envelopePaginado } from "../../shared/pagination";
import { exigirIfMatch } from "../../shared/optimistic-lock";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function criar(req: Request, res: Response): Promise<void> {
  const input = parseCriarParte(req.body);
  const parte = await service.criarParte(input, req.usuarioId);
  res.setHeader("ETag", `"${parte.versao}"`);
  res.status(201).json(parte);
}

export async function listar(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const buscaRaw = req.query.busca;
  const busca = typeof buscaRaw === "string" && buscaRaw.trim() ? buscaRaw.trim() : null;
  const tipo = req.query.tipo === "organizacao" || req.query.tipo === "pessoa" ? req.query.tipo : null;

  const { itens, total } = await service.listarPartes({ busca, tipo, limit: p.limit, offset: p.offset });
  res.json(envelopePaginado(itens, total, p));
}

export async function obter(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw new NotFoundError("Parte não encontrada");
  const parte = await service.obterParte(id);
  res.setHeader("ETag", `"${parte.versao}"`);
  res.json(parte);
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw new NotFoundError("Parte não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarParteSchema.parse(req.body);
  const parte = await service.atualizarParte(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${parte.versao}"`);
  res.json(parte);
}
