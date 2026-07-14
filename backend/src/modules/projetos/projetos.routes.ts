import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./projetos.controller";
import {
  atualizarProjetoSchema,
  criarBriefingSchema,
  criarOrigemDemandaSchema,
  criarPlanejamentoSchema,
  criarProjetoSchema,
  criarResponsavelSchema,
} from "./projetos.schema";

export const projetosRouter = Router();

const escrita = autorizar("estrategista", "coordenador", "administrador");
const leitura = autorizar();

// Projeto — RF019
projetosRouter.post("/projetos", escrita, asyncHandler(c.criar));
projetosRouter.get("/projetos", leitura, asyncHandler(c.listar));
projetosRouter.get("/projetos/:id", leitura, asyncHandler(c.obter));
projetosRouter.patch("/projetos/:id", escrita, asyncHandler(c.atualizar));
projetosRouter.delete("/projetos/:id", escrita, asyncHandler(c.arquivar));

// Origem da demanda — RF020
projetosRouter.post("/projetos/:id/origens-demanda", escrita, asyncHandler(c.registrarOrigem));
projetosRouter.get("/projetos/:id/origens-demanda", leitura, asyncHandler(c.listarOrigens));

// Briefing versionado — RF021
projetosRouter.post("/projetos/:id/briefings", escrita, asyncHandler(c.criarBriefing));
projetosRouter.get("/projetos/:id/briefings", leitura, asyncHandler(c.listarBriefings));
projetosRouter.post("/briefings/:id/vigencia", escrita, asyncHandler(c.publicarBriefing));

// Planejamento versionado — RF022
projetosRouter.post("/projetos/:id/planejamentos", escrita, asyncHandler(c.criarPlanejamento));
projetosRouter.get("/projetos/:id/planejamentos", leitura, asyncHandler(c.listarPlanejamentos));
projetosRouter.post("/planejamentos/:id/vigencia", escrita, asyncHandler(c.publicarPlanejamento));

// Responsáveis — RF023
projetosRouter.post("/projetos/:id/responsaveis", escrita, asyncHandler(c.adicionarResponsavel));
projetosRouter.get("/projetos/:id/responsaveis", leitura, asyncHandler(c.listarResponsaveis));
projetosRouter.delete("/projetos/:id/responsaveis/:respId", escrita, asyncHandler(c.removerResponsavel));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/projetos", tag: "Projetos",
  summary: "Criar projeto (sempre vinculado a um cliente — RN012)",
  body: criarProjetoSchema,
  responses: { "201": "Projeto criado", "409": "Cliente inexistente", "422": "Datas inválidas (RN030)" },
});
registrarRota({
  method: "GET", path: "/v1/projetos", tag: "Projetos",
  summary: "Listar projetos (?busca=&cliente_id=&pagina=&por_pagina=)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id", tag: "Projetos",
  summary: "Obter projeto por id",
  responses: { "200": "Projeto", "404": "Não encontrado" },
});
registrarRota({
  method: "PATCH", path: "/v1/projetos/:id", tag: "Projetos",
  summary: "Atualizar projeto (exige If-Match)",
  body: atualizarProjetoSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/projetos/:id", tag: "Projetos",
  summary: "Arquivar projeto (RN035)",
  responses: { "204": "Arquivado", "404": "Não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/projetos/:id/origens-demanda", tag: "Projetos · Origem",
  summary: "Registrar origem da demanda (briefing do cliente ou oportunidade da Cross)",
  body: criarOrigemDemandaSchema,
  responses: { "201": "Origem registrada", "422": "Tipo inexistente" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id/origens-demanda", tag: "Projetos · Origem",
  summary: "Listar origens da demanda do projeto",
  responses: { "200": "Lista", "404": "Projeto não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/projetos/:id/briefings", tag: "Projetos · Briefing",
  summary: "Criar nova versão do briefing (nunca sobrescreve — RN021)",
  body: criarBriefingSchema,
  responses: { "201": "Versão criada", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id/briefings", tag: "Projetos · Briefing",
  summary: "Listar versões do briefing",
  responses: { "200": "Lista de versões", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/briefings/:id/vigencia", tag: "Projetos · Briefing",
  summary: "Publicar esta versão como vigente (rebaixa a anterior — RN021)",
  responses: { "200": "Versão vigente", "404": "Briefing não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/projetos/:id/planejamentos", tag: "Projetos · Planejamento",
  summary: "Criar nova versão do planejamento estratégico",
  body: criarPlanejamentoSchema,
  responses: { "201": "Versão criada", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id/planejamentos", tag: "Projetos · Planejamento",
  summary: "Listar versões do planejamento",
  responses: { "200": "Lista de versões", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/planejamentos/:id/vigencia", tag: "Projetos · Planejamento",
  summary: "Publicar esta versão do planejamento como vigente (RN021)",
  responses: { "200": "Versão vigente", "404": "Planejamento não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/projetos/:id/responsaveis", tag: "Projetos · Responsáveis",
  summary: "Designar responsável interno pelo projeto",
  body: criarResponsavelSchema,
  responses: { "201": "Responsável designado", "409": "Usuário inexistente", "422": "Datas inválidas" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id/responsaveis", tag: "Projetos · Responsáveis",
  summary: "Listar responsáveis ativos do projeto",
  responses: { "200": "Lista", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "DELETE", path: "/v1/projetos/:id/responsaveis/:respId", tag: "Projetos · Responsáveis",
  summary: "Remover responsável — recusa remover o último ativo (RN013)",
  responses: { "204": "Removido", "409": "É o último responsável ativo (RN013)", "404": "Não encontrado" },
});
