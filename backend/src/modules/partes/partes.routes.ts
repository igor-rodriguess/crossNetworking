import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./partes.controller";
import {
  criarOrganizacaoSchema,
  criarPessoaSchema,
  atualizarParteSchema,
  criarPapelSchema,
  criarContatoSchema,
  atualizarContatoSchema,
} from "./partes.schema";

export const partesRouter = Router();

const escrita = autorizar("estrategista", "administrador");
const leitura = autorizar();

// Partes — RF004/RF005/RF008
partesRouter.post("/partes", escrita, asyncHandler(c.criar));
partesRouter.get("/partes", leitura, asyncHandler(c.listar));
partesRouter.get("/partes/:id", leitura, asyncHandler(c.obter));
partesRouter.patch("/partes/:id", escrita, asyncHandler(c.atualizar));
partesRouter.delete("/partes/:id", escrita, asyncHandler(c.arquivar));

// Papéis — RF006
partesRouter.post("/partes/:id/papeis", escrita, asyncHandler(c.adicionarPapel));
partesRouter.get("/partes/:id/papeis", leitura, asyncHandler(c.listarPapeis));
partesRouter.delete("/partes/:id/papeis/:papelId", escrita, asyncHandler(c.removerPapel));

// Contatos — RF007
partesRouter.post("/partes/:id/contatos", escrita, asyncHandler(c.adicionarContato));
partesRouter.get("/partes/:id/contatos", leitura, asyncHandler(c.listarContatos));
partesRouter.patch("/partes/:id/contatos/:contatoId", escrita, asyncHandler(c.atualizarContato));
partesRouter.delete("/partes/:id/contatos/:contatoId", escrita, asyncHandler(c.removerContato));

// -------------------------- Documentação OpenAPI --------------------------

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
  summary: "Listar/buscar Partes (?busca=&tipo=&pagina=&por_pagina=)",
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
registrarRota({
  method: "DELETE",
  path: "/v1/partes/:id",
  tag: "Partes",
  summary: "Arquivar Parte (exclusão lógica — RN035)",
  responses: { "204": "Arquivada", "404": "Não encontrada" },
});

registrarRota({
  method: "POST",
  path: "/v1/partes/:id/papeis",
  tag: "Partes · Papéis",
  summary: "Atribuir papel à Parte",
  body: criarPapelSchema,
  responses: { "201": "Papel atribuído", "409": "Papel já ativo (RN005)", "422": "Papel inexistente ou vigência inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/partes/:id/papeis",
  tag: "Partes · Papéis",
  summary: "Listar papéis ativos da Parte",
  responses: { "200": "Lista de papéis", "404": "Parte não encontrada" },
});
registrarRota({
  method: "DELETE",
  path: "/v1/partes/:id/papeis/:papelId",
  tag: "Partes · Papéis",
  summary: "Remover (arquivar) papel da Parte",
  responses: { "204": "Removido", "404": "Papel não encontrado" },
});

registrarRota({
  method: "POST",
  path: "/v1/partes/:id/contatos",
  tag: "Partes · Contatos",
  summary: "Adicionar contato à Parte",
  body: criarContatoSchema,
  responses: { "201": "Contato criado", "409": "Já existe contato principal ativo (RN004)", "422": "E-mail inválido" },
});
registrarRota({
  method: "GET",
  path: "/v1/partes/:id/contatos",
  tag: "Partes · Contatos",
  summary: "Listar contatos ativos da Parte",
  responses: { "200": "Lista de contatos", "404": "Parte não encontrada" },
});
registrarRota({
  method: "PATCH",
  path: "/v1/partes/:id/contatos/:contatoId",
  tag: "Partes · Contatos",
  summary: "Atualizar contato (exige If-Match)",
  body: atualizarContatoSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE",
  path: "/v1/partes/:id/contatos/:contatoId",
  tag: "Partes · Contatos",
  summary: "Remover (arquivar) contato da Parte",
  responses: { "204": "Removido", "404": "Não encontrado" },
});
