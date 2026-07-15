import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./governanca.controller";
import {
  criarEvidenciaSchema,
  criarFonteSchema,
  importarPartesSchema,
  vincularEvidenciaSchema,
} from "./governanca.schema";

export const governancaRouter = Router();
const escrita = autorizar("estrategista", "coordenador", "administrador");
const admin = autorizar("administrador");
const leitura = autorizar();

// RF048 · Fontes e evidências
governancaRouter.post("/fontes", escrita, asyncHandler(c.criarFonte));
governancaRouter.get("/fontes", leitura, asyncHandler(c.listarFontes));
governancaRouter.post("/evidencias", escrita, asyncHandler(c.criarEvidencia));
governancaRouter.get("/evidencias/:id", leitura, asyncHandler(c.obterEvidencia));
governancaRouter.post("/evidencias/:id/vinculos", escrita, asyncHandler(c.vincularEvidencia));

// RF049 · Auditoria (somente leitura)
governancaRouter.get("/auditoria", leitura, asyncHandler(c.consultarAuditoria));
governancaRouter.get("/registros/:tabela/:id/auditoria", leitura, asyncHandler(c.auditoriaDeRegistro));

// RF050 · Importação de planilhas
governancaRouter.post("/importacoes/partes", admin, asyncHandler(c.importarPartes));

// RF051 · Base de conhecimento para IA
governancaRouter.get("/ia/base-conhecimento/partes/:id", leitura, asyncHandler(c.baseConhecimentoParte));

// -------------------------- Documentação OpenAPI --------------------------

const docs: Array<["GET" | "POST", string, string, string, unknown?]> = [
  ["POST", "/v1/fontes", "Governança · Evidências", "Registrar fonte de dados", criarFonteSchema],
  ["GET", "/v1/fontes", "Governança · Evidências", "Listar fontes"],
  ["POST", "/v1/evidencias", "Governança · Evidências", "Registrar evidência com fonte, validade e nível de confiança (RF048)", criarEvidenciaSchema],
  ["GET", "/v1/evidencias/:id", "Governança · Evidências", "Obter evidência com seus vínculos"],
  ["POST", "/v1/evidencias/:id/vinculos", "Governança · Evidências", "Vincular evidência a um registro por FK explícita, sem polimorfismo (RF048)", vincularEvidenciaSchema],
  ["GET", "/v1/auditoria", "Governança · Auditoria", "Consultar a trilha de auditoria (filtros: tabela, registro_id, usuario_id, operacao, de, ate) — somente leitura (RF049)"],
  ["GET", "/v1/registros/:tabela/:id/auditoria", "Governança · Auditoria", "Consultar a auditoria de um registro específico (RF049)"],
  ["POST", "/v1/importacoes/partes", "Governança · Importação", "Importar Partes de planilha, validando linha a linha e reportando as rejeitadas (RF050)", importarPartesSchema],
  ["GET", "/v1/ia/base-conhecimento/partes/:id", "Governança · IA", "Snapshot estruturado e rastreável de uma Parte para consultas assistidas por IA (RF051)"],
];
for (const [method, path, tag, summary, body] of docs)
  registrarRota({
    method,
    path,
    tag,
    summary,
    body: body as never,
    responses: { "200": "Sucesso", "201": "Criado", "207": "Resultado por linha (importação)", "404": "Não encontrado", "422": "Dados inválidos" },
  });
