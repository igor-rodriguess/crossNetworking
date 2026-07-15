import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./documentos.controller";
import { criarDocumentoSchema, vincularDocumentoSchema } from "./documentos.schema";

export const documentosRouter = Router();

const escrita = autorizar("estrategista", "gestor_contas", "coordenador", "administrador");

// Documentos — RF009
documentosRouter.post("/documentos", autorizar("estrategista", "administrador"), asyncHandler(c.criar));
documentosRouter.get("/documentos/:id", autorizar(), asyncHandler(c.obter));

// Vínculos de documento — RF009
documentosRouter.post("/documentos/:id/vinculos", escrita, asyncHandler(c.vincular));
documentosRouter.get("/documentos/:id/vinculos", autorizar(), asyncHandler(c.listarVinculos));
documentosRouter.delete("/documentos/:id/vinculos/:entidade/:entidadeId", escrita, asyncHandler(c.desvincular));

registrarRota({
  method: "POST",
  path: "/v1/documentos",
  tag: "Documentos",
  summary: "Registrar documento (metadados; o arquivo fica em armazenamento externo)",
  body: criarDocumentoSchema,
  responses: { "201": "Documento criado", "422": "Hash/nome inválido" },
});
registrarRota({
  method: "GET",
  path: "/v1/documentos/:id",
  tag: "Documentos",
  summary: "Obter documento por id",
  responses: { "200": "Documento", "404": "Não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/documentos/:id/vinculos", tag: "Documentos",
  summary: "Vincular documento a uma entidade (projeto, briefing, paper, contrato, parceria, plano) por FK explícita (RF009)",
  body: vincularDocumentoSchema,
  responses: { "201": "Vínculos do documento", "404": "Documento ou entidade não encontrados" },
});
registrarRota({
  method: "GET", path: "/v1/documentos/:id/vinculos", tag: "Documentos",
  summary: "Listar as entidades vinculadas ao documento",
  responses: { "200": "Lista", "404": "Documento não encontrado" },
});
registrarRota({
  method: "DELETE", path: "/v1/documentos/:id/vinculos/:entidade/:entidadeId", tag: "Documentos",
  summary: "Remover vínculo do documento com uma entidade",
  responses: { "204": "Removido", "404": "Vínculo não encontrado" },
});
