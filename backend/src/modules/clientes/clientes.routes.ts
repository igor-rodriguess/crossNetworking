import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./clientes.controller";
import {
  atualizarClienteSchema,
  atualizarContratoSchema,
  criarClienteSchema,
  criarComponenteSchema,
  criarContratoSchema,
  definirModelosSchema,
} from "./clientes.schema";

export const clientesRouter = Router();

const escrita = autorizar("gestor_contas", "administrador");
const leitura = autorizar();

// Clientes — RF016
clientesRouter.post("/clientes", escrita, asyncHandler(c.criar));
clientesRouter.get("/clientes", leitura, asyncHandler(c.listar));
clientesRouter.get("/clientes/:id", leitura, asyncHandler(c.obter));
clientesRouter.patch("/clientes/:id", escrita, asyncHandler(c.atualizar));
clientesRouter.delete("/clientes/:id", escrita, asyncHandler(c.arquivar));

// Contratos — RF017
clientesRouter.post("/clientes/:id/contratos", escrita, asyncHandler(c.criarContrato));
clientesRouter.get("/clientes/:id/contratos", leitura, asyncHandler(c.listarContratos));
clientesRouter.get("/contratos/:id", leitura, asyncHandler(c.obterContrato));
clientesRouter.patch("/contratos/:id", escrita, asyncHandler(c.atualizarContrato));

// Modelos e componentes de remuneração — RF018
clientesRouter.put("/contratos/:id/modelos", escrita, asyncHandler(c.definirModelos));
clientesRouter.post("/contratos/:id/componentes-remuneracao", escrita, asyncHandler(c.adicionarComponente));
clientesRouter.get("/contratos/:id/componentes-remuneracao", leitura, asyncHandler(c.listarComponentes));
clientesRouter.delete("/contratos/:id/componentes-remuneracao/:compId", escrita, asyncHandler(c.removerComponente));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/clientes", tag: "Clientes",
  summary: "Registrar vínculo comercial de uma Parte como cliente Cross",
  body: criarClienteSchema,
  responses: { "201": "Cliente criado", "409": "A Parte já é cliente ativo (RN007)", "422": "Dados inválidos" },
});
registrarRota({
  method: "GET", path: "/v1/clientes", tag: "Clientes",
  summary: "Listar clientes (?busca=&pagina=&por_pagina=)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET", path: "/v1/clientes/:id", tag: "Clientes",
  summary: "Obter cliente por id",
  responses: { "200": "Cliente", "404": "Não encontrado" },
});
registrarRota({
  method: "PATCH", path: "/v1/clientes/:id", tag: "Clientes",
  summary: "Atualizar cliente (exige If-Match)",
  body: atualizarClienteSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/clientes/:id", tag: "Clientes",
  summary: "Encerrar (arquivar) vínculo de cliente — RN035",
  responses: { "204": "Arquivado", "404": "Não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/clientes/:id/contratos", tag: "Clientes · Contratos",
  summary: "Criar contrato do cliente",
  body: criarContratoSchema,
  responses: { "201": "Contrato criado", "409": "Código de contrato ativo duplicado (RN011)", "422": "Datas inválidas (RN030)" },
});
registrarRota({
  method: "GET", path: "/v1/clientes/:id/contratos", tag: "Clientes · Contratos",
  summary: "Listar contratos do cliente",
  responses: { "200": "Lista", "404": "Cliente não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/contratos/:id", tag: "Clientes · Contratos",
  summary: "Obter contrato (com os modelos de contratação)",
  responses: { "200": "Contrato", "404": "Não encontrado" },
});
registrarRota({
  method: "PATCH", path: "/v1/contratos/:id", tag: "Clientes · Contratos",
  summary: "Atualizar contrato (exige If-Match)",
  body: atualizarContratoSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada", "428": "If-Match ausente" },
});

registrarRota({
  method: "PUT", path: "/v1/contratos/:id/modelos", tag: "Clientes · Remuneração",
  summary: "Definir (substituir) os modelos de contratação do contrato — RN009",
  body: definirModelosSchema,
  responses: { "200": "Modelos definidos", "404": "Contrato não encontrado", "422": "Modelo inexistente" },
});
registrarRota({
  method: "POST", path: "/v1/contratos/:id/componentes-remuneracao", tag: "Clientes · Remuneração",
  summary: "Adicionar componente de remuneração",
  body: criarComponenteSchema,
  responses: { "201": "Componente criado", "422": "Sem valor nem percentual, ou valor sem moeda (RN010)" },
});
registrarRota({
  method: "GET", path: "/v1/contratos/:id/componentes-remuneracao", tag: "Clientes · Remuneração",
  summary: "Listar componentes de remuneração do contrato",
  responses: { "200": "Lista", "404": "Contrato não encontrado" },
});
registrarRota({
  method: "DELETE", path: "/v1/contratos/:id/componentes-remuneracao/:compId", tag: "Clientes · Remuneração",
  summary: "Remover (arquivar) componente de remuneração",
  responses: { "204": "Removido", "404": "Não encontrado" },
});
