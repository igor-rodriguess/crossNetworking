import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import * as service from "./projetos.service";
import {
  atualizarProjetoSchema,
  criarBriefingSchema,
  criarOrigemDemandaSchema,
  criarPlanejamentoSchema,
  criarProjetoSchema,
  criarResponsavelSchema,
} from "./projetos.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

// --- Projeto (RF019) -------------------------------------------------------

export async function criar(req: Request, res: Response): Promise<void> {
  const input = criarProjetoSchema.parse(req.body);
  const projeto = await service.criarProjeto(input, req.usuarioId);
  res.setHeader("ETag", `"${projeto.versao}"`);
  res.status(201).json(projeto);
}

export async function listar(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const buscaRaw = req.query.busca;
  const clienteRaw = req.query.cliente_id;
  const busca = typeof buscaRaw === "string" && buscaRaw.trim() ? buscaRaw.trim() : null;
  const clienteId =
    typeof clienteRaw === "string" && UUID_RE.test(clienteRaw) ? clienteRaw : null;

  const { itens, total } = await service.listarProjetos({
    busca,
    clienteId,
    limit: p.limit,
    offset: p.offset,
  });
  res.json(envelopePaginado(itens, total, p));
}

export async function obter(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Projeto não encontrado");
  const projeto = await service.obterProjeto(id);
  res.setHeader("ETag", `"${projeto.versao}"`);
  res.json(projeto);
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Projeto não encontrado");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarProjetoSchema.parse(req.body);
  const projeto = await service.atualizarProjeto(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${projeto.versao}"`);
  res.json(projeto);
}

export async function arquivar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Projeto não encontrado");
  await service.arquivarProjeto(id, req.usuarioId);
  res.status(204).send();
}

// --- Origem da demanda (RF020) ---------------------------------------------

export async function registrarOrigem(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const input = criarOrigemDemandaSchema.parse(req.body);
  res.status(201).json(await service.registrarOrigem(projetoId, input, req.usuarioId));
}

export async function listarOrigens(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  res.json({ itens: await service.listarOrigens(projetoId) });
}

// --- Briefing (RF021) ------------------------------------------------------

export async function criarBriefing(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const input = criarBriefingSchema.parse(req.body);
  res.status(201).json(await service.criarBriefing(projetoId, input, req.usuarioId));
}

export async function listarBriefings(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  res.json({ itens: await service.listarBriefings(projetoId) });
}

export async function publicarBriefing(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Briefing não encontrado");
  res.json(await service.publicarBriefing(id, req.usuarioId));
}

// --- Planejamento (RF022) --------------------------------------------------

export async function criarPlanejamento(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const input = criarPlanejamentoSchema.parse(req.body);
  res.status(201).json(await service.criarPlanejamento(projetoId, input, req.usuarioId));
}

export async function listarPlanejamentos(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  res.json({ itens: await service.listarPlanejamentos(projetoId) });
}

export async function publicarPlanejamento(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Planejamento não encontrado");
  res.json(await service.publicarPlanejamento(id, req.usuarioId));
}

// --- Responsáveis (RF023) --------------------------------------------------

export async function adicionarResponsavel(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const input = criarResponsavelSchema.parse(req.body);
  res.status(201).json(await service.adicionarResponsavel(projetoId, input, req.usuarioId));
}

export async function listarResponsaveis(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  res.json({ itens: await service.listarResponsaveis(projetoId) });
}

export async function removerResponsavel(req: Request, res: Response): Promise<void> {
  const projetoId = exigirUuid(req.params.id, "Projeto não encontrado");
  const respId = exigirUuid(req.params.respId, "Responsável não encontrado neste projeto");
  await service.removerResponsavel(projetoId, respId, req.usuarioId);
  res.status(204).send();
}
