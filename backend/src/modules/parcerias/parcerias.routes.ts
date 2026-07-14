import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./parcerias.controller";
import {
  atualizarContrapartidaSchema,
  atualizarContratoParceriaSchema,
  atualizarNegociacaoSchema,
  atualizarParceriaSchema,
  criarContrapartidaSchema,
  criarContratoParceriaSchema,
  criarNegociacaoSchema,
  formalizarParceriaSchema,
} from "./parcerias.schema";

export const parceriasRouter = Router();

const escrita = autorizar("gestor_contas", "coordenador", "administrador");
const leitura = autorizar();

// Parceria — RF034
parceriasRouter.post("/candidaturas/:id/parceria", escrita, asyncHandler(c.formalizarParceria));
parceriasRouter.get("/parcerias", leitura, asyncHandler(c.listarParcerias));
parceriasRouter.get("/parcerias/:id", leitura, asyncHandler(c.obterParceria));
parceriasRouter.patch("/parcerias/:id", escrita, asyncHandler(c.atualizarParceria));
parceriasRouter.delete("/parcerias/:id", escrita, asyncHandler(c.arquivarParceria));

// Negociação — RF035
parceriasRouter.post("/parcerias/:id/negociacoes", escrita, asyncHandler(c.criarNegociacao));
parceriasRouter.get("/parcerias/:id/negociacoes", leitura, asyncHandler(c.listarNegociacoes));
parceriasRouter.patch("/negociacoes/:id", escrita, asyncHandler(c.atualizarNegociacao));

// Contrapartidas — RF036
parceriasRouter.post("/parcerias/:id/contrapartidas", escrita, asyncHandler(c.criarContrapartida));
parceriasRouter.get("/parcerias/:id/contrapartidas", leitura, asyncHandler(c.listarContrapartidas));
parceriasRouter.patch("/contrapartidas/:id", escrita, asyncHandler(c.atualizarContrapartida));
parceriasRouter.delete("/contrapartidas/:id", escrita, asyncHandler(c.arquivarContrapartida));

// Contrato de parceria — RF037
parceriasRouter.post("/parcerias/:id/contratos", escrita, asyncHandler(c.criarContrato));
parceriasRouter.get("/parcerias/:id/contratos", leitura, asyncHandler(c.listarContratos));
parceriasRouter.patch("/contratos-parceria/:id", escrita, asyncHandler(c.atualizarContrato));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/candidaturas/:id/parceria", tag: "Parcerias",
  summary: "Formalizar parceria a partir da candidatura — exige decisão aprovada e Paper validado (RN026)",
  body: formalizarParceriaSchema,
  responses: {
    "201": "Parceria formalizada",
    "404": "Candidatura não encontrada",
    "409": "A candidatura já tem parceria formalizada",
    "422": "Sem decisão aprovada ou Paper validado (RN026)",
  },
});
registrarRota({
  method: "GET", path: "/v1/parcerias", tag: "Parcerias",
  summary: "Listar parcerias (paginado; filtros ?projeto_id= e ?status=)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id", tag: "Parcerias",
  summary: "Obter parceria por id",
  responses: { "200": "Parceria", "404": "Não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/parcerias/:id", tag: "Parcerias",
  summary: "Atualizar parceria (exige If-Match)",
  body: atualizarParceriaSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/parcerias/:id", tag: "Parcerias",
  summary: "Arquivar parceria (soft delete — RN035)",
  responses: { "204": "Arquivada", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/negociacoes", tag: "Parcerias · Negociação",
  summary: "Abrir rodada de negociação da parceria",
  body: criarNegociacaoSchema,
  responses: { "201": "Negociação criada", "404": "Parceria não encontrada", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/negociacoes", tag: "Parcerias · Negociação",
  summary: "Listar as negociações da parceria",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/negociacoes/:id", tag: "Parcerias · Negociação",
  summary: "Atualizar negociação e registrar o resultado (exige If-Match)",
  body: atualizarNegociacaoSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/contrapartidas", tag: "Parcerias · Contrapartidas",
  summary: "Registrar contrapartida acordada na parceria (RN027)",
  body: criarContrapartidaSchema,
  responses: { "201": "Contrapartida criada", "404": "Parceria não encontrada", "422": "Valor sem moeda" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/contrapartidas", tag: "Parcerias · Contrapartidas",
  summary: "Listar as contrapartidas da parceria",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/contrapartidas/:id", tag: "Parcerias · Contrapartidas",
  summary: "Atualizar contrapartida, inclusive marcá-la como cumprida (exige If-Match)",
  body: atualizarContrapartidaSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/contrapartidas/:id", tag: "Parcerias · Contrapartidas",
  summary: "Arquivar contrapartida",
  responses: { "204": "Arquivada", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/contratos", tag: "Parcerias · Contrato",
  summary: "Registrar contrato da parceria",
  body: criarContratoParceriaSchema,
  responses: { "201": "Contrato criado", "404": "Parceria não encontrada", "422": "Datas ou moeda inválidas" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/contratos", tag: "Parcerias · Contrato",
  summary: "Listar os contratos da parceria",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/contratos-parceria/:id", tag: "Parcerias · Contrato",
  summary: "Atualizar contrato da parceria (exige If-Match)",
  body: atualizarContratoParceriaSchema,
  responses: { "200": "Atualizado", "404": "Não encontrado", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
