import { Request, Response } from "express";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import * as service from "./agentes.service";
import { avaliarCredibilidadeSchema, coletarFontesSchema, planejarPesquisaSchema } from "./agentes.schema";

// POST /v1/agentes/search-planning — executa o Search Planning Agent.
export async function planejarPesquisa(req: Request, res: Response): Promise<void> {
  const input = planejarPesquisaSchema.parse(req.body);
  const resultado = await service.executarPlanejamento(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/source-collector — executa o Source Collector.
export async function coletarFontes(req: Request, res: Response): Promise<void> {
  const input = coletarFontesSchema.parse(req.body);
  const resultado = await service.executarColeta(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/source-credibility — avalia a credibilidade das fontes.
export async function avaliarCredibilidade(req: Request, res: Response): Promise<void> {
  const input = avaliarCredibilidadeSchema.parse(req.body);
  const resultado = await service.executarCredibilidade(input, req.usuarioId);
  res.status(201).json(resultado);
}

// GET /v1/agentes/execucoes?agente=&pagina=&por_pagina= — auditoria.
export async function listarExecucoes(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const agenteRaw = req.query.agente;
  const agente = typeof agenteRaw === "string" && agenteRaw.trim() ? agenteRaw.trim() : undefined;
  const { itens, total } = await service.listarExecucoes({ agente }, p);
  res.json(envelopePaginado(itens, total, p));
}
