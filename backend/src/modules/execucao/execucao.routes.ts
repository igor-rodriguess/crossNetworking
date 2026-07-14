import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./execucao.controller";
import {
  adicionarParticipanteSchema,
  atribuirResponsavelSchema,
  atualizarEntregaSchema,
  atualizarEtapaSchema,
  atualizarPendenciaSchema,
  atualizarReuniaoSchema,
  criarEntregaSchema,
  criarEtapaSchema,
  criarPendenciaSchema,
  criarPlanoSchema,
  criarReuniaoSchema,
  criarTouchpointSchema,
} from "./execucao.schema";

export const execucaoRouter = Router();

const escrita = autorizar("gestor_contas", "coordenador", "administrador");
const leitura = autorizar();

// Plano de execução — RF038
execucaoRouter.post("/parcerias/:id/planos-execucao", escrita, asyncHandler(c.criarPlano));
execucaoRouter.get("/parcerias/:id/planos-execucao", leitura, asyncHandler(c.listarPlanos));
execucaoRouter.get("/planos-execucao/:id", leitura, asyncHandler(c.obterPlano));
execucaoRouter.post("/planos-execucao/:id/vigencia", escrita, asyncHandler(c.publicarPlano));

// Etapas — RF039
execucaoRouter.post("/planos-execucao/:id/etapas", escrita, asyncHandler(c.criarEtapa));
execucaoRouter.get("/planos-execucao/:id/etapas", leitura, asyncHandler(c.listarEtapas));
execucaoRouter.patch("/etapas/:id", escrita, asyncHandler(c.atualizarEtapa));
execucaoRouter.delete("/etapas/:id", escrita, asyncHandler(c.arquivarEtapa));

// Entregas e responsáveis — RF040
execucaoRouter.post("/etapas/:id/entregas", escrita, asyncHandler(c.criarEntrega));
execucaoRouter.get("/etapas/:id/entregas", leitura, asyncHandler(c.listarEntregas));
execucaoRouter.get("/entregas/:id", leitura, asyncHandler(c.obterEntrega));
execucaoRouter.patch("/entregas/:id", escrita, asyncHandler(c.atualizarEntrega));
execucaoRouter.post("/entregas/:id/responsaveis", escrita, asyncHandler(c.atribuirResponsavel));
execucaoRouter.get("/entregas/:id/responsaveis", leitura, asyncHandler(c.listarResponsaveis));
execucaoRouter.delete("/entregas/:id/responsaveis/:responsavelId", escrita, asyncHandler(c.removerResponsavel));

// Reuniões, participantes e touchpoints — RF041
execucaoRouter.post("/parcerias/:id/reunioes", escrita, asyncHandler(c.criarReuniao));
execucaoRouter.get("/parcerias/:id/reunioes", leitura, asyncHandler(c.listarReunioes));
execucaoRouter.get("/reunioes/:id", leitura, asyncHandler(c.obterReuniao));
execucaoRouter.patch("/reunioes/:id", escrita, asyncHandler(c.atualizarReuniao));
execucaoRouter.post("/reunioes/:id/participantes", escrita, asyncHandler(c.adicionarParticipante));
execucaoRouter.delete("/reunioes/:id/participantes/:participanteId", escrita, asyncHandler(c.removerParticipante));
execucaoRouter.post("/parcerias/:id/touchpoints", escrita, asyncHandler(c.criarTouchpoint));
execucaoRouter.get("/parcerias/:id/touchpoints", leitura, asyncHandler(c.listarTouchpoints));

// Pendências — RF042
execucaoRouter.post("/parcerias/:id/pendencias", escrita, asyncHandler(c.criarPendencia));
execucaoRouter.get("/parcerias/:id/pendencias", leitura, asyncHandler(c.listarPendencias));
execucaoRouter.patch("/pendencias/:id", escrita, asyncHandler(c.atualizarPendencia));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/planos-execucao", tag: "Execução · Plano",
  summary: "Criar versão do plano de execução da parceria (rascunho)",
  body: criarPlanoSchema,
  responses: { "201": "Plano criado", "404": "Parceria não encontrada", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/planos-execucao", tag: "Execução · Plano",
  summary: "Listar as versões do plano de execução",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/planos-execucao/:id", tag: "Execução · Plano",
  summary: "Obter plano de execução com suas etapas",
  responses: { "200": "Plano", "404": "Não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/planos-execucao/:id/vigencia", tag: "Execução · Plano",
  summary: "Promover o plano a vigente — no máximo um por parceria (RN029)",
  responses: { "200": "Plano vigente", "404": "Não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/planos-execucao/:id/etapas", tag: "Execução · Etapas",
  summary: "Criar etapa no plano de execução",
  body: criarEtapaSchema,
  responses: { "201": "Etapa criada", "404": "Plano não encontrado", "422": "Datas inválidas (RN030) ou ordem duplicada" },
});
registrarRota({
  method: "GET", path: "/v1/planos-execucao/:id/etapas", tag: "Execução · Etapas",
  summary: "Listar as etapas do plano, em ordem",
  responses: { "200": "Lista", "404": "Plano não encontrado" },
});
registrarRota({
  method: "PATCH", path: "/v1/etapas/:id", tag: "Execução · Etapas",
  summary: "Atualizar etapa e seu status (exige If-Match)",
  body: atualizarEtapaSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "DELETE", path: "/v1/etapas/:id", tag: "Execução · Etapas",
  summary: "Arquivar etapa (soft delete)",
  responses: { "204": "Arquivada", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/etapas/:id/entregas", tag: "Execução · Entregas",
  summary: "Criar entrega na etapa",
  body: criarEntregaSchema,
  responses: { "201": "Entrega criada", "404": "Etapa não encontrada", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/etapas/:id/entregas", tag: "Execução · Entregas",
  summary: "Listar as entregas da etapa",
  responses: { "200": "Lista", "404": "Etapa não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/entregas/:id", tag: "Execução · Entregas",
  summary: "Obter entrega com seus responsáveis",
  responses: { "200": "Entrega", "404": "Não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/entregas/:id", tag: "Execução · Entregas",
  summary: "Atualizar entrega, inclusive registrar a data de entrega (exige If-Match)",
  body: atualizarEntregaSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "POST", path: "/v1/entregas/:id/responsaveis", tag: "Execução · Entregas",
  summary: "Atribuir responsável — usuário interno OU Parte externa, nunca ambos (RN031)",
  body: atribuirResponsavelSchema,
  responses: { "201": "Responsáveis da entrega", "404": "Entrega não encontrada", "422": "Interno e externo ao mesmo tempo" },
});
registrarRota({
  method: "GET", path: "/v1/entregas/:id/responsaveis", tag: "Execução · Entregas",
  summary: "Listar os responsáveis da entrega",
  responses: { "200": "Lista", "404": "Entrega não encontrada" },
});
registrarRota({
  method: "DELETE", path: "/v1/entregas/:id/responsaveis/:responsavelId", tag: "Execução · Entregas",
  summary: "Remover responsável da entrega",
  responses: { "204": "Removido", "404": "Não encontrado" },
});

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/reunioes", tag: "Execução · Reuniões",
  summary: "Registrar reunião da parceria",
  body: criarReuniaoSchema,
  responses: { "201": "Reunião criada", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/reunioes", tag: "Execução · Reuniões",
  summary: "Listar as reuniões da parceria",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/reunioes/:id", tag: "Execução · Reuniões",
  summary: "Obter reunião com seus participantes",
  responses: { "200": "Reunião", "404": "Não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/reunioes/:id", tag: "Execução · Reuniões",
  summary: "Atualizar reunião e seu resumo (exige If-Match)",
  body: atualizarReuniaoSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
registrarRota({
  method: "POST", path: "/v1/reunioes/:id/participantes", tag: "Execução · Reuniões",
  summary: "Adicionar participante — usuário interno OU Parte externa (RN031)",
  body: adicionarParticipanteSchema,
  responses: { "201": "Participantes da reunião", "404": "Reunião não encontrada", "422": "Interno e externo ao mesmo tempo" },
});
registrarRota({
  method: "DELETE", path: "/v1/reunioes/:id/participantes/:participanteId", tag: "Execução · Reuniões",
  summary: "Remover participante da reunião",
  responses: { "204": "Removido", "404": "Não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/parcerias/:id/touchpoints", tag: "Execução · Touchpoints",
  summary: "Registrar touchpoint (interação) da parceria",
  body: criarTouchpointSchema,
  responses: { "201": "Touchpoint criado", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/touchpoints", tag: "Execução · Touchpoints",
  summary: "Listar a linha do tempo de touchpoints da parceria",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/parcerias/:id/pendencias", tag: "Execução · Pendências",
  summary: "Abrir pendência, opcionalmente vinculada a uma etapa ou entrega (RN032)",
  body: criarPendenciaSchema,
  responses: { "201": "Pendência criada", "404": "Parceria, etapa ou entrega não encontradas", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/parcerias/:id/pendencias", tag: "Execução · Pendências",
  summary: "Listar as pendências da parceria (filtro ?status=)",
  responses: { "200": "Lista", "404": "Parceria não encontrada" },
});
registrarRota({
  method: "PATCH", path: "/v1/pendencias/:id", tag: "Execução · Pendências",
  summary: "Atualizar pendência e resolvê-la (exige If-Match)",
  body: atualizarPendenciaSchema,
  responses: { "200": "Atualizada", "404": "Não encontrada", "409": "Versão desatualizada", "428": "If-Match ausente" },
});
