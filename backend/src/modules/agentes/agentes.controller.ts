import { Request, Response } from "express";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import * as service from "./agentes.service";
import {
  avaliarCredibilidadeSchema,
  coletarFontesSchema,
  extrairInformacoesSchema,
  planejarPesquisaSchema,
  raciocinarCrossabilitySchema,
  recomendarParceirosSchema,
  resolverEntidadesSchema,
  verificarFatosSchema,
} from "./agentes.schema";

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

// POST /v1/agentes/fact-verifier — verifica corroboração das afirmações.
export async function verificarFatos(req: Request, res: Response): Promise<void> {
  const input = verificarFatosSchema.parse(req.body);
  const resultado = await service.executarVerificacao(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/entity-resolver — dedupe e casa entidades com a base.
export async function resolverEntidades(req: Request, res: Response): Promise<void> {
  const input = resolverEntidadesSchema.parse(req.body);
  const resultado = await service.executarResolucaoEntidades(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/information-extractor — estrutura conteúdo coletado.
export async function extrairInformacoes(req: Request, res: Response): Promise<void> {
  const input = extrairInformacoesSchema.parse(req.body);
  const resultado = await service.executarExtracao(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/crossability-reasoning — análise Crossability (6 dimensões).
export async function raciocinarCrossability(req: Request, res: Response): Promise<void> {
  const input = raciocinarCrossabilitySchema.parse(req.body);
  const resultado = await service.executarReasoning(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/recommendation — ranqueia candidatos pela Crossability.
export async function recomendarParceiros(req: Request, res: Response): Promise<void> {
  const input = recomendarParceirosSchema.parse(req.body);
  const resultado = await service.executarRecomendacao(input, req.usuarioId);
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
