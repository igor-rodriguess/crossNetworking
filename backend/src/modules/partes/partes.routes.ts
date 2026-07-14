import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import { criar, listar, obter, atualizar } from "./partes.controller";
import { criarOrganizacaoSchema, criarPessoaSchema, atualizarParteSchema } from "./partes.schema";

export const partesRouter = Router();

// Base de Relacionamentos — RF004–RF009
partesRouter.post("/partes", autorizar("estrategista", "administrador"), asyncHandler(criar));
partesRouter.get("/partes", autorizar(), asyncHandler(listar));
partesRouter.get("/partes/:id", autorizar(), asyncHandler(obter));
partesRouter.patch("/partes/:id", autorizar("estrategista", "administrador"), asyncHandler(atualizar));

// Documentação OpenAPI
registrarRota({
  method: "POST",
  path: "/v1/partes",
  tag: "Partes",
  summary: "Criar Parte (organização ou pessoa)",
  body: z.union([criarOrganizacaoSchema, criarPessoaSchema]),
  responses: { "201": "Parte criada", "422": "Erro de validação", "409": "CPF/CNPJ duplicado" },
});
registrarRota({
  method: "GET",
  path: "/v1/partes",
  tag: "Partes",
  summary: "Listar/buscar Partes (paginado: ?busca=&tipo=&pagina=&por_pagina=)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET",
  path: "/v1/partes/:id",
  tag: "Partes",
  summary: "Obter Parte por id (retorna ETag para concorrência)",
  responses: { "200": "Parte", "404": "Não encontrada" },
});
registrarRota({
  method: "PATCH",
  path: "/v1/partes/:id",
  tag: "Partes",
  summary: "Atualizar Parte (exige If-Match com a versão obtida no GET)",
  body: atualizarParteSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
