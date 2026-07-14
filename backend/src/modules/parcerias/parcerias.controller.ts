import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import { parsePaginacao } from "../../shared/pagination";
import * as service from "./parcerias.service";
import {
  atualizarContrapartidaSchema,
  atualizarContratoParceriaSchema,
  atualizarNegociacaoSchema,
  atualizarParceriaSchema,
  criarContrapartidaSchema,
  criarContratoParceriaSchema,
  criarNegociacaoSchema,
  formalizarParceriaSchema,
} from "./parcerias.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

function comEtag(res: Response, corpo: { versao?: string }) {
  if (corpo?.versao) res.setHeader("ETag", `"${corpo.versao}"`);
  return corpo;
}

// --- Parceria (RF034) -------------------------------------------------------

export async function formalizarParceria(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  const input = formalizarParceriaSchema.parse(req.body);
  const parceria = await service.formalizarParceria(candidaturaId, input, req.usuarioId);
  res.status(201).json(comEtag(res, parceria));
}

export async function listarParcerias(req: Request, res: Response): Promise<void> {
  const filtros = {
    projetoId: typeof req.query.projeto_id === "string" ? req.query.projeto_id : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
  };
  res.json(await service.listarParcerias(filtros, parsePaginacao(req.query)));
}

export async function obterParceria(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json(comEtag(res, await service.obterParceria(id)));
}

export async function atualizarParceria(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Parceria não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarParceriaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarParceria(id, patch, versao, req.usuarioId)));
}

export async function arquivarParceria(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Parceria não encontrada");
  await service.arquivarParceria(id, req.usuarioId);
  res.status(204).send();
}

// --- Negociação (RF035) -----------------------------------------------------

export async function criarNegociacao(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarNegociacaoSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarNegociacao(parceriaId, input, req.usuarioId)));
}

export async function listarNegociacoes(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarNegociacoes(parceriaId) });
}

export async function atualizarNegociacao(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Negociação não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarNegociacaoSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarNegociacao(id, patch, versao, req.usuarioId)));
}

// --- Contrapartida (RF036) --------------------------------------------------

export async function criarContrapartida(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarContrapartidaSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarContrapartida(parceriaId, input, req.usuarioId)));
}

export async function listarContrapartidas(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarContrapartidas(parceriaId) });
}

export async function atualizarContrapartida(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Contrapartida não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarContrapartidaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarContrapartida(id, patch, versao, req.usuarioId)));
}

export async function arquivarContrapartida(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Contrapartida não encontrada");
  await service.arquivarContrapartida(id, req.usuarioId);
  res.status(204).send();
}

// --- Contrato de parceria (RF037) ------------------------------------------

export async function criarContrato(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarContratoParceriaSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarContrato(parceriaId, input, req.usuarioId)));
}

export async function listarContratos(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarContratos(parceriaId) });
}

export async function atualizarContrato(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Contrato de parceria não encontrado");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarContratoParceriaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarContrato(id, patch, versao, req.usuarioId)));
}
