import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import * as service from "./frentes.service";
import {
  atualizarFrenteSchema,
  criarCandidaturaSchema,
  criarFrenteSchema,
  movimentarCandidaturaSchema,
} from "./frentes.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

// --- Frente (RF024) --------------------------------------------------------

export async function criarFrente(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const input = criarFrenteSchema.parse(req.body);
  const frente = await service.criarFrente(projetoId, input, req.usuarioId);
  res.setHeader("ETag", `"${frente.versao}"`);
  res.status(201).json(frente);
}

export async function listarFrentes(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  res.json({ itens: await service.listarFrentes(projetoId) });
}

export async function obterFrente(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Frente não encontrada");
  const frente = await service.obterFrente(id);
  res.setHeader("ETag", `"${frente.versao}"`);
  res.json(frente);
}

export async function atualizarFrente(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Frente não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarFrenteSchema.parse(req.body);
  const frente = await service.atualizarFrente(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${frente.versao}"`);
  res.json(frente);
}

export async function reabrirFrente(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Frente não encontrada");
  res.json(await service.reabrirFrente(id, req.usuarioId));
}

// --- Candidatura (RF025) ---------------------------------------------------

export async function criarCandidatura(req: Request, res: Response): Promise<void> {
  const frenteId = exigirUuid(req.params.id, "Frente não encontrada");
  const input = criarCandidaturaSchema.parse(req.body);
  const cand = await service.criarCandidatura(frenteId, input, req.usuarioId);
  res.setHeader("ETag", `"${cand.versao}"`);
  res.status(201).json(cand);
}

export async function listarCandidaturas(req: Request, res: Response): Promise<void> {
  const frenteId = exigirUuid(req.params.id, "Frente não encontrada");
  res.json({ itens: await service.listarCandidaturas(frenteId) });
}

export async function obterCandidatura(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Candidatura não encontrada");
  const cand = await service.obterCandidatura(id);
  res.setHeader("ETag", `"${cand.versao}"`);
  res.json(cand);
}

export async function arquivarCandidatura(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Candidatura não encontrada");
  await service.arquivarCandidatura(id, req.usuarioId);
  res.status(204).send();
}

// --- Movimentação com histórico (RF026 — RN017) ----------------------------

export async function movimentar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Candidatura não encontrada");
  const input = movimentarCandidaturaSchema.parse(req.body);
  res.status(201).json(await service.movimentarCandidatura(id, input, req.usuarioId));
}

export async function listarMovimentacoes(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Candidatura não encontrada");
  res.json({ itens: await service.listarMovimentacoes(id) });
}
