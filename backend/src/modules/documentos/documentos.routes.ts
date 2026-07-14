import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./documentos.controller";
import { criarDocumentoSchema } from "./documentos.schema";

export const documentosRouter = Router();

// Documentos — RF009
documentosRouter.post("/documentos", autorizar("estrategista", "administrador"), asyncHandler(c.criar));
documentosRouter.get("/documentos/:id", autorizar(), asyncHandler(c.obter));

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
