import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import { atualizarUsuarioSchema, criarUsuarioSchema, definirSenhaSchema } from "./admin.schema";
import * as service from "./admin.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

export async function criarUsuario(req: Request, res: Response): Promise<void> {
  const input = criarUsuarioSchema.parse(req.body);
  const usuario = await service.criarUsuario(input, req.usuarioId);
  res.setHeader("ETag", `"${usuario.versao}"`);
  res.status(201).json(usuario);
}

export async function listarUsuarios(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const buscaRaw = req.query.busca;
  const busca = typeof buscaRaw === "string" && buscaRaw.trim() ? buscaRaw.trim() : null;
  const { itens, total } = await service.listarUsuarios({ busca, limit: p.limit, offset: p.offset });
  res.json(envelopePaginado(itens, total, p));
}

export async function obterUsuario(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Usuário não encontrado");
  const usuario = await service.obterUsuario(id);
  res.setHeader("ETag", `"${usuario.versao}"`);
  res.json(usuario);
}

export async function atualizarUsuario(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Usuário não encontrado");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarUsuarioSchema.parse(req.body);
  const usuario = await service.atualizarUsuario(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${usuario.versao}"`);
  res.json(usuario);
}

export async function inativarUsuario(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Usuário não encontrado");
  await service.inativarUsuario(id, req.usuarioId);
  res.status(204).send();
}

export async function definirSenha(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Usuário não encontrado");
  const { senha } = definirSenhaSchema.parse(req.body);
  await service.definirSenha(id, senha, req.usuarioId);
  res.status(204).send();
}

export async function listarCatalogo(req: Request, res: Response): Promise<void> {
  res.json({ itens: await service.listarCatalogo(req.params.nome) });
}
