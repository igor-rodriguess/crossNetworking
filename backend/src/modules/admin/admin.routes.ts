import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./admin.controller";
import { atualizarUsuarioSchema, criarUsuarioSchema } from "./admin.schema";

export const adminRouter = Router();

const admin = autorizar("administrador");
const leitura = autorizar();

// Usuários internos — RF002
adminRouter.post("/usuarios", admin, asyncHandler(c.criarUsuario));
adminRouter.get("/usuarios", leitura, asyncHandler(c.listarUsuarios));
adminRouter.get("/usuarios/:id", leitura, asyncHandler(c.obterUsuario));
adminRouter.patch("/usuarios/:id", admin, asyncHandler(c.atualizarUsuario));
adminRouter.delete("/usuarios/:id", admin, asyncHandler(c.inativarUsuario));

// Catálogos de vocabulário controlado — RN018
adminRouter.get("/catalogos/:nome", leitura, asyncHandler(c.listarCatalogo));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/usuarios", tag: "Administração",
  summary: "Criar usuário interno",
  body: criarUsuarioSchema,
  responses: { "201": "Usuário criado", "409": "E-mail já cadastrado (RN006)", "422": "E-mail inválido" },
});
registrarRota({
  method: "GET", path: "/v1/usuarios", tag: "Administração",
  summary: "Listar usuários (?busca=&pagina=&por_pagina=)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET", path: "/v1/usuarios/:id", tag: "Administração",
  summary: "Obter usuário por id",
  responses: { "200": "Usuário", "404": "Não encontrado" },
});
registrarRota({
  method: "PATCH", path: "/v1/usuarios/:id", tag: "Administração",
  summary: "Atualizar usuário (exige If-Match)",
  body: atualizarUsuarioSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada ou e-mail duplicado", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/usuarios/:id", tag: "Administração",
  summary: "Inativar usuário (arquivamento lógico)",
  responses: { "204": "Inativado", "404": "Não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/catalogos/:nome", tag: "Administração",
  summary: "Listar um catálogo de vocabulário controlado (ex.: status-projeto, papeis, territorios)",
  responses: { "200": "Itens do catálogo", "422": "Catálogo desconhecido" },
});
