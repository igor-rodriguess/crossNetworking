import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./agentes.controller";
import {
  avaliarCredibilidadeSchema,
  buscarRagSchema,
  coletarFontesSchema,
  decidirHumanGateSchema,
  extrairInformacoesSchema,
  ingerirRagSchema,
  planejarPesquisaSchema,
  raciocinarCrossabilitySchema,
  recomendarParceirosSchema,
  resolverEntidadesSchema,
  verificarFatosSchema,
} from "./agentes.schema";

export const agentesRouter = Router();

// Executar agentes é ação de estrategista/coordenador/admin; leitura da
// auditoria fica aberta a qualquer usuário autenticado. Promover à base
// (Human Gate) exige curadoria — só coordenador/administrador.
const executar = autorizar("estrategista", "coordenador", "administrador");
const decisao = autorizar("coordenador", "administrador");
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

// Information Extractor
agentesRouter.post("/agentes/information-extractor", executar, asyncHandler(c.extrairInformacoes));

// Crossability Reasoning
agentesRouter.post("/agentes/crossability-reasoning", executar, asyncHandler(c.raciocinarCrossability));

// Recommendation
agentesRouter.post("/agentes/recommendation", executar, asyncHandler(c.recomendarParceiros));

// Human Gate — curadoria que promove/rejeita à base (exige decisão)
agentesRouter.post("/agentes/human-gate", decisao, asyncHandler(c.decidirHumanGate));

// RAG — base de conhecimento vetorial (ingerir escreve; buscar é leitura)
agentesRouter.post("/agentes/rag/ingerir", executar, asyncHandler(c.ingerirRag));
agentesRouter.post("/agentes/rag/buscar", leitura, asyncHandler(c.buscarRag));

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
  method: "POST",
  path: "/v1/agentes/information-extractor",
  tag: "Agentes de IA",
  summary: "Extrair informações — estrutura conteúdo bruto em setor/públicos/territórios/ativos/sinais",
  body: extrairInformacoesSchema,
  responses: { "201": "Perfis extraídos", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/crossability-reasoning",
  tag: "Agentes de IA",
  summary: "Raciocínio Crossability — avalia as 6 dimensões e propõe recomendação (rascunho)",
  body: raciocinarCrossabilitySchema,
  responses: { "201": "Análise gerada", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/recommendation",
  tag: "Agentes de IA",
  summary: "Recomendação — ranqueia candidatos a parceiro pela análise Crossability",
  body: recomendarParceirosSchema,
  responses: { "201": "Ranking gerado", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/human-gate",
  tag: "Agentes de IA",
  summary: "Human Gate — curadoria: aprova (promove à base como rascunho) ou rejeita a saída de um agente",
  body: decidirHumanGateSchema,
  responses: { "201": "Decisão registrada", "404": "Execução não encontrada", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/rag/ingerir",
  tag: "Agentes de IA · RAG",
  summary: "Ingerir trechos na base de conhecimento (gera embeddings e indexa)",
  body: ingerirRagSchema,
  responses: { "201": "Trechos indexados", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/rag/buscar",
  tag: "Agentes de IA · RAG",
  summary: "Busca semântica — recupera os trechos mais relevantes para uma consulta",
  body: buscarRagSchema,
  responses: { "200": "Trechos relevantes", "422": "Entrada inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/execucoes",
  tag: "Agentes de IA",
  summary: "Listar execuções de agentes (auditoria) — ?agente=&pagina=&por_pagina=",
  responses: { "200": "Lista paginada de execuções" },
});
