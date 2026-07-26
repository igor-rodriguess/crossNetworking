import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./agentes.controller";
import { planejarPesquisaSchema } from "./agentes.schema";

export const agentesRouter = Router();

// Executar agentes é ação de estrategista/coordenador/admin; leitura da
// auditoria fica aberta a qualquer usuário autenticado.
const executar = autorizar("estrategista", "coordenador", "administrador");
const leitura = autorizar();

// Search Planning Agent
agentesRouter.post("/agentes/search-planning", executar, asyncHandler(c.planejarPesquisa));

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
  method: "GET",
  path: "/v1/agentes/execucoes",
  tag: "Agentes de IA",
  summary: "Listar execuções de agentes (auditoria) — ?agente=&pagina=&por_pagina=",
  responses: { "200": "Lista paginada de execuções" },
});
