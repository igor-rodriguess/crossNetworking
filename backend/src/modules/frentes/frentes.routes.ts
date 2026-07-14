import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./frentes.controller";
import {
  atualizarFrenteSchema,
  criarCandidaturaSchema,
  criarFrenteSchema,
  movimentarCandidaturaSchema,
} from "./frentes.schema";

export const frentesRouter = Router();

const escrita = autorizar("estrategista", "coordenador", "administrador");
const leitura = autorizar();

// Frentes — RF024
frentesRouter.post("/projetos/:id/frentes", escrita, asyncHandler(c.criarFrente));
frentesRouter.get("/projetos/:id/frentes", leitura, asyncHandler(c.listarFrentes));
frentesRouter.get("/frentes/:id", leitura, asyncHandler(c.obterFrente));
frentesRouter.patch("/frentes/:id", escrita, asyncHandler(c.atualizarFrente));
frentesRouter.post("/frentes/:id/reabertura", escrita, asyncHandler(c.reabrirFrente));

// Candidaturas — RF025
frentesRouter.post("/frentes/:id/candidaturas", escrita, asyncHandler(c.criarCandidatura));
frentesRouter.get("/frentes/:id/candidaturas", leitura, asyncHandler(c.listarCandidaturas));
frentesRouter.get("/candidaturas/:id", leitura, asyncHandler(c.obterCandidatura));
frentesRouter.delete("/candidaturas/:id", escrita, asyncHandler(c.arquivarCandidatura));

// Movimentações com histórico — RF026
frentesRouter.post("/candidaturas/:id/movimentacoes", escrita, asyncHandler(c.movimentar));
frentesRouter.get("/candidaturas/:id/movimentacoes", leitura, asyncHandler(c.listarMovimentacoes));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/projetos/:id/frentes", tag: "Frentes",
  summary: "Criar frente de oportunidade no projeto (RN014)",
  body: criarFrenteSchema,
  responses: { "201": "Frente criada", "404": "Projeto não encontrado", "422": "Datas inválidas (RN030)" },
});
registrarRota({
  method: "GET", path: "/v1/projetos/:id/frentes", tag: "Frentes",
  summary: "Listar frentes do projeto",
  responses: { "200": "Lista", "404": "Projeto não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/frentes/:id", tag: "Frentes",
  summary: "Obter frente por id",
  responses: { "200": "Frente", "404": "Não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/frentes/:id", tag: "Frentes",
  summary: "Atualizar frente (exige If-Match)",
  body: atualizarFrenteSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "POST", path: "/v1/frentes/:id/reabertura", tag: "Frentes",
  summary: "Reabrir frente encerrada, preservando o histórico (RN014)",
  responses: { "200": "Frente reaberta", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/frentes/:id/candidaturas", tag: "Frentes · Candidaturas",
  summary: "Registrar Parte como candidata a parceira na frente",
  body: criarCandidaturaSchema,
  responses: { "201": "Candidatura criada", "409": "A Parte já tem candidatura ativa nesta frente (RN015)", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/frentes/:id/candidaturas", tag: "Frentes · Candidaturas",
  summary: "Listar candidaturas da frente",
  responses: { "200": "Lista", "404": "Frente não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/candidaturas/:id", tag: "Frentes · Candidaturas",
  summary: "Obter candidatura por id",
  responses: { "200": "Candidatura", "404": "Não encontrada" },
});
registrarRota({
  method: "DELETE", path: "/v1/candidaturas/:id", tag: "Frentes · Candidaturas",
  summary: "Arquivar candidatura — permite reentrada futura da Parte (RN015/RN035)",
  responses: { "204": "Arquivada", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/candidaturas/:id/movimentacoes", tag: "Frentes · Movimentações",
  summary: "Movimentar o status da candidatura — grava o histórico na mesma transação (RN017)",
  body: movimentarCandidaturaSchema,
  responses: { "201": "Movimentada", "404": "Não encontrada", "422": "Status inexistente" },
});
registrarRota({
  method: "GET", path: "/v1/candidaturas/:id/movimentacoes", tag: "Frentes · Movimentações",
  summary: "Consultar o histórico de movimentações da candidatura",
  responses: { "200": "Histórico", "404": "Não encontrada" },
});
