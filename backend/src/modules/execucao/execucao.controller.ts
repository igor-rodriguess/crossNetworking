import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import * as service from "./execucao.service";
import {
  adicionarParticipanteSchema,
  atribuirResponsavelSchema,
  atualizarEntregaSchema,
  atualizarEtapaSchema,
  atualizarPendenciaSchema,
  atualizarReuniaoSchema,
  criarEntregaSchema,
  criarEtapaSchema,
  criarPendenciaSchema,
  criarPlanoSchema,
  criarReuniaoSchema,
  criarTouchpointSchema,
} from "./execucao.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

function comEtag(res: Response, corpo: { versao?: string }) {
  if (corpo?.versao) res.setHeader("ETag", `"${corpo.versao}"`);
  return corpo;
}

// --- Plano (RF038) ----------------------------------------------------------

export async function criarPlano(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarPlanoSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarPlano(parceriaId, input, req.usuarioId)));
}

export async function listarPlanos(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarPlanos(parceriaId) });
}

export async function obterPlano(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Plano de execução não encontrado");
  res.json(comEtag(res, await service.obterPlano(id)));
}

export async function publicarPlano(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Plano de execução não encontrado");
  res.json(await service.publicarPlano(id, req.usuarioId));
}

// --- Etapa (RF039) ----------------------------------------------------------

export async function criarEtapa(req: Request, res: Response): Promise<void> {
  const planoId = exigirUuid(req.params.id, "Plano de execução não encontrado");
  const input = criarEtapaSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarEtapa(planoId, input, req.usuarioId)));
}

export async function listarEtapas(req: Request, res: Response): Promise<void> {
  const planoId = exigirUuid(req.params.id, "Plano de execução não encontrado");
  res.json({ itens: await service.listarEtapas(planoId) });
}

export async function atualizarEtapa(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Etapa não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarEtapaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarEtapa(id, patch, versao, req.usuarioId)));
}

export async function arquivarEtapa(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Etapa não encontrada");
  await service.arquivarEtapa(id, req.usuarioId);
  res.status(204).send();
}

// --- Entrega (RF040) --------------------------------------------------------

export async function criarEntrega(req: Request, res: Response): Promise<void> {
  const etapaId = exigirUuid(req.params.id, "Etapa não encontrada");
  const input = criarEntregaSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarEntrega(etapaId, input, req.usuarioId)));
}

export async function listarEntregas(req: Request, res: Response): Promise<void> {
  const etapaId = exigirUuid(req.params.id, "Etapa não encontrada");
  res.json({ itens: await service.listarEntregas(etapaId) });
}

export async function obterEntrega(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Entrega não encontrada");
  res.json(comEtag(res, await service.obterEntrega(id)));
}

export async function atualizarEntrega(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Entrega não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarEntregaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarEntrega(id, patch, versao, req.usuarioId)));
}

export async function atribuirResponsavel(req: Request, res: Response): Promise<void> {
  const entregaId = exigirUuid(req.params.id, "Entrega não encontrada");
  const input = atribuirResponsavelSchema.parse(req.body);
  res.status(201).json({ itens: await service.atribuirResponsavel(entregaId, input, req.usuarioId) });
}

export async function listarResponsaveis(req: Request, res: Response): Promise<void> {
  const entregaId = exigirUuid(req.params.id, "Entrega não encontrada");
  res.json({ itens: await service.listarResponsaveis(entregaId) });
}

export async function removerResponsavel(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.responsavelId, "Responsável não encontrado");
  await service.removerResponsavel(id, req.usuarioId);
  res.status(204).send();
}

// --- Reunião e touchpoint (RF041) ------------------------------------------

export async function criarReuniao(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarReuniaoSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarReuniao(parceriaId, input, req.usuarioId)));
}

export async function listarReunioes(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarReunioes(parceriaId) });
}

export async function obterReuniao(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Reunião não encontrada");
  res.json(comEtag(res, await service.obterReuniao(id)));
}

export async function atualizarReuniao(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Reunião não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarReuniaoSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarReuniao(id, patch, versao, req.usuarioId)));
}

export async function adicionarParticipante(req: Request, res: Response): Promise<void> {
  const reuniaoId = exigirUuid(req.params.id, "Reunião não encontrada");
  const input = adicionarParticipanteSchema.parse(req.body);
  res.status(201).json({ itens: await service.adicionarParticipante(reuniaoId, input, req.usuarioId) });
}

export async function removerParticipante(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.participanteId, "Participante não encontrado");
  await service.removerParticipante(id, req.usuarioId);
  res.status(204).send();
}

export async function criarTouchpoint(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarTouchpointSchema.parse(req.body);
  res.status(201).json(await service.criarTouchpoint(parceriaId, input, req.usuarioId));
}

export async function listarTouchpoints(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  res.json({ itens: await service.listarTouchpoints(parceriaId) });
}

// --- Pendência (RF042) ------------------------------------------------------

export async function criarPendencia(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const input = criarPendenciaSchema.parse(req.body);
  res.status(201).json(comEtag(res, await service.criarPendencia(parceriaId, input, req.usuarioId)));
}

export async function listarPendencias(req: Request, res: Response): Promise<void> {
  const parceriaId = exigirUuid(req.params.id, "Parceria não encontrada");
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ itens: await service.listarPendencias(parceriaId, status) });
}

export async function atualizarPendencia(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Pendência não encontrada");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarPendenciaSchema.parse(req.body);
  res.json(comEtag(res, await service.atualizarPendencia(id, patch, versao, req.usuarioId)));
}
