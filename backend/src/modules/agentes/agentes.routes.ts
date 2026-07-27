import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./agentes.controller";
import {
  avaliarCredibilidadeSchema,
  coletarFontesSchema,
  planejarPesquisaSchema,
  resolverEntidadesSchema,
  verificarFatosSchema,
} from "./agentes.schema";

export const agentesRouter = Router();

// Executar agentes é ação de estrategista/coordenador/admin; leitura da
// auditoria fica aberta a qualquer usuário autenticado.
const executar = autorizar("estrategista", "coordenador", "administrador");
const leitura = autorizar();

// Search Planning Agent
agentesRouter.post("/agentes/search-planning", executar, asyncHandler(c.planejarPesquisa));

// Source Collector
agentesRouter.post("/agentes/source-collector", executar, asyncHandler(c.coletarFontes));

// Source Credibility
agentesRouter.post("/agentes/source-credibility", executar, asyncHandler(c.avaliarCredibilidade));

// Fact Verifier
agentesRouter.post("/agentes/fact-verifier", executar, asyncHandler(c.verificarFatos));

// Entity Resolver
agentesRouter.post("/agentes/entity-resolver", executar, asyncHandler(c.resolverEntidades));

// Auditoria de execuções
agentesRouter.get("/agentes/execucoes", leitura, asyncHandler(c.listarExecucoes));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST",
  path: "/v1/agentes/search-planning",
  tag: "Agentes de IA",
  summary: "Planejar pesquisa — decompõe um objetivo em perguntas, consultas e fontes (não executa buscas)",
  body: planejarPesquisaSchema,
  responses: { "201": "Plano de pesquisa gerado", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/source-collector",
  tag: "Agentes de IA",
  summary: "Coletar fontes — executa as buscas do plano de pesquisa (Firecrawl) e devolve resultados brutos",
  body: coletarFontesSchema,
  responses: { "201": "Fontes coletadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/source-credibility",
  tag: "Agentes de IA",
  summary: "Avaliar credibilidade das fontes coletadas (heurística: a origem é reputável?)",
  body: avaliarCredibilidadeSchema,
  responses: { "201": "Fontes avaliadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/fact-verifier",
  tag: "Agentes de IA",
  summary: "Verificar fatos — uma afirmação é corroborada por 2+ fontes independentes?",
  body: verificarFatosSchema,
  responses: { "201": "Afirmações verificadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/entity-resolver",
  tag: "Agentes de IA",
  summary: "Resolver entidades — dedupe e casa nomes encontrados com as Partes já cadastradas",
  body: resolverEntidadesSchema,
  responses: { "201": "Entidades resolvidas", "422": "Entrada inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/execucoes",
  tag: "Agentes de IA",
  summary: "Listar execuções de agentes (auditoria) — ?agente=&pagina=&por_pagina=",
  responses: { "200": "Lista paginada de execuções" },
});
