import { Request, Response } from "express";
import {
  parseCriarParte,
  atualizarParteSchema,
  criarPapelSchema,
  criarContatoSchema,
  atualizarContatoSchema,
} from "./partes.schema";
import * as service from "./partes.service";
import { NotFoundError } from "../../shared/errors";
import { parsePaginacao, envelopePaginado } from "../../shared/pagination";
import { exigirIfMatch } from "../../shared/optimistic-lock";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id malformado é tratado como recurso inexistente (404), não como erro de validação. */
function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

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

/** DELETE = arquivamento lógico (RN035). */
export async function arquivar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Parte não encontrada");
  await service.arquivarParte(id, req.usuarioId);
  res.status(204).send();
}

// --- Papéis (RF006) -------------------------------------------------------

export async function adicionarPapel(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  const input = criarPapelSchema.parse(req.body);
  const papel = await service.adicionarPapel(parteId, input, req.usuarioId);
  res.status(201).json(papel);
}

export async function listarPapeis(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  res.json({ itens: await service.listarPapeis(parteId) });
}

export async function removerPapel(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  const papelId = exigirUuid(req.params.papelId, "Papel não encontrado nesta Parte");
  await service.removerPapel(parteId, papelId, req.usuarioId);
  res.status(204).send();
}

// --- Contatos (RF007) -----------------------------------------------------

export async function adicionarContato(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  const input = criarContatoSchema.parse(req.body);
  const contato = await service.adicionarContato(parteId, input, req.usuarioId);
  res.status(201).json(contato);
}

export async function listarContatos(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  res.json({ itens: await service.listarContatos(parteId) });
}

export async function atualizarContato(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  const contatoId = exigirUuid(req.params.contatoId, "Contato não encontrado nesta Parte");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarContatoSchema.parse(req.body);
  const contato = await service.atualizarContato(parteId, contatoId, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${contato.versao}"`);
  res.json(contato);
}

export async function removerContato(req: Request, res: Response): Promise<void> {
  const parteId = exigirUuid(req.params.id, "Parte não encontrada");
  const contatoId = exigirUuid(req.params.contatoId, "Contato não encontrado nesta Parte");
  await service.removerContato(parteId, contatoId, req.usuarioId);
  res.status(204).send();
}
