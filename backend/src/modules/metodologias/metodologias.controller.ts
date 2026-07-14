import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { parsePaginacao } from "../../shared/pagination";
import * as service from "./metodologias.service";
import {
  aplicarAvaliacaoSchema,
  criarAnaliseSchema,
  criarModeloScoreCardSchema,
  criarPaperSchema,
  criarValidacaoSchema,
  criarVersaoPaperSchema,
  definirCriteriosSchema,
  recomendarCandidaturaSchema,
  registrarDecisaoSchema,
} from "./metodologias.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

// --- Análise Crossability (RF027) ------------------------------------------

export async function criarAnalise(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  const input = criarAnaliseSchema.parse(req.body);
  res.status(201).json(await service.criarAnalise(candidaturaId, input, req.usuarioId));
}

export async function listarAnalises(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  res.json({ itens: await service.listarAnalises(candidaturaId) });
}

export async function obterAnalise(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Análise Crossability não encontrada");
  res.json(await service.obterAnalise(id));
}

// --- Paper (RF028) ---------------------------------------------------------

export async function criarPaper(req: Request, res: Response): Promise<void> {
  const frenteId = exigirUuid(req.params.id, "Frente não encontrada");
  const input = criarPaperSchema.parse(req.body);
  res.status(201).json(await service.criarPaper(frenteId, input, req.usuarioId));
}

export async function listarPapers(req: Request, res: Response): Promise<void> {
  const frenteId = exigirUuid(req.params.id, "Frente não encontrada");
  res.json({ itens: await service.listarPapers(frenteId) });
}

export async function obterPaper(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Paper não encontrado");
  const paper = await service.obterPaper(id);
  res.setHeader("ETag", `"${paper.versao}"`);
  res.json(paper);
}

export async function criarVersaoPaper(req: Request, res: Response): Promise<void> {
  const paperId = exigirUuid(req.params.id, "Paper não encontrado");
  const input = criarVersaoPaperSchema.parse(req.body);
  res.status(201).json(await service.criarVersaoPaper(paperId, input, req.usuarioId));
}

export async function listarVersoesPaper(req: Request, res: Response): Promise<void> {
  const paperId = exigirUuid(req.params.id, "Paper não encontrado");
  res.json({ itens: await service.listarVersoesPaper(paperId) });
}

export async function publicarVersaoPaper(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Versão de Paper não encontrada");
  res.json(await service.publicarVersaoPaper(id, req.usuarioId));
}

// --- Recomendações (RF029) -------------------------------------------------

export async function recomendarCandidatura(req: Request, res: Response): Promise<void> {
  const paperId = exigirUuid(req.params.id, "Paper não encontrado");
  const input = recomendarCandidaturaSchema.parse(req.body);
  res.status(201).json({ itens: await service.recomendarCandidatura(paperId, input, req.usuarioId) });
}

export async function listarRecomendacoes(req: Request, res: Response): Promise<void> {
  const paperId = exigirUuid(req.params.id, "Paper não encontrado");
  res.json({ itens: await service.listarRecomendacoes(paperId) });
}

export async function removerRecomendacao(req: Request, res: Response): Promise<void> {
  const paperId = exigirUuid(req.params.id, "Paper não encontrado");
  const candidaturaId = exigirUuid(req.params.candidaturaId, "Recomendação não encontrada");
  await service.removerRecomendacao(paperId, candidaturaId, req.usuarioId);
  res.status(204).send();
}

// --- Validação (RF030) -----------------------------------------------------

export async function criarValidacao(req: Request, res: Response): Promise<void> {
  const versaoId = exigirUuid(req.params.id, "Versão de Paper não encontrada");
  const input = criarValidacaoSchema.parse(req.body);
  res.status(201).json(await service.criarValidacao(versaoId, input, req.usuarioId));
}

export async function listarValidacoes(req: Request, res: Response): Promise<void> {
  const versaoId = exigirUuid(req.params.id, "Versão de Paper não encontrada");
  res.json({ itens: await service.listarValidacoes(versaoId) });
}

// --- Modelo de Score Card (RF031) ------------------------------------------

export async function criarModelo(req: Request, res: Response): Promise<void> {
  const input = criarModeloScoreCardSchema.parse(req.body);
  res.status(201).json(await service.criarModelo(input, req.usuarioId));
}

export async function listarModelos(req: Request, res: Response): Promise<void> {
  res.json(await service.listarModelos(parsePaginacao(req.query)));
}

export async function obterModelo(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Modelo de Score Card não encontrado");
  res.json(await service.obterModelo(id));
}

export async function criarVersaoModelo(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Modelo de Score Card não encontrado");
  res.status(201).json(await service.criarVersaoModelo(id, req.usuarioId));
}

export async function definirCriterios(req: Request, res: Response): Promise<void> {
  const versaoId = exigirUuid(req.params.id, "Versão de modelo não encontrada");
  const input = definirCriteriosSchema.parse(req.body);
  res.json({ itens: await service.definirCriterios(versaoId, input, req.usuarioId) });
}

export async function listarCriterios(req: Request, res: Response): Promise<void> {
  const versaoId = exigirUuid(req.params.id, "Versão de modelo não encontrada");
  res.json({ itens: await service.listarCriterios(versaoId) });
}

export async function publicarVersaoModelo(req: Request, res: Response): Promise<void> {
  const versaoId = exigirUuid(req.params.id, "Versão de modelo não encontrada");
  res.json(await service.publicarVersaoModelo(versaoId, req.usuarioId));
}

// --- Avaliação Score Card (RF032) ------------------------------------------

export async function aplicarAvaliacao(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  const input = aplicarAvaliacaoSchema.parse(req.body);
  res.status(201).json(await service.aplicarAvaliacao(candidaturaId, input, req.usuarioId));
}

export async function listarAvaliacoes(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  res.json({ itens: await service.listarAvaliacoes(candidaturaId) });
}

export async function obterAvaliacao(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Avaliação de Score Card não encontrada");
  res.json(await service.obterAvaliacao(id));
}

// --- Decisão (RF033) -------------------------------------------------------

export async function registrarDecisao(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  const input = registrarDecisaoSchema.parse(req.body);
  res.status(201).json(await service.registrarDecisao(candidaturaId, input, req.usuarioId));
}

export async function listarDecisoes(req: Request, res: Response): Promise<void> {
  const candidaturaId = exigirUuid(req.params.id, "Candidatura não encontrada");
  res.json({ itens: await service.listarDecisoes(candidaturaId) });
}
