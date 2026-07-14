import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./metodologias.controller";
import {
  aplicarAvaliacaoSchema,
  criarAnaliseSchema,
  criarModeloScoreCardSchema,
  criarPaperSchema,
  criarValidacaoSchema,
  criarVersaoPaperSchema,
  definirCriteriosSchema,
  recomendarCandidaturaSchema,
  registrarDecisaoSchema,
} from "./metodologias.schema";

export const metodologiasRouter = Router();

const escrita = autorizar("estrategista", "coordenador", "administrador");
const decisao = autorizar("coordenador", "administrador");
const leitura = autorizar();

// Análise Crossability — RF027
metodologiasRouter.post("/candidaturas/:id/analises-crossability", escrita, asyncHandler(c.criarAnalise));
metodologiasRouter.get("/candidaturas/:id/analises-crossability", leitura, asyncHandler(c.listarAnalises));
metodologiasRouter.get("/analises-crossability/:id", leitura, asyncHandler(c.obterAnalise));

// Paper e versões — RF028
metodologiasRouter.post("/frentes/:id/papers", escrita, asyncHandler(c.criarPaper));
metodologiasRouter.get("/frentes/:id/papers", leitura, asyncHandler(c.listarPapers));
metodologiasRouter.get("/papers/:id", leitura, asyncHandler(c.obterPaper));
metodologiasRouter.post("/papers/:id/versoes", escrita, asyncHandler(c.criarVersaoPaper));
metodologiasRouter.get("/papers/:id/versoes", leitura, asyncHandler(c.listarVersoesPaper));
metodologiasRouter.post("/versoes-paper/:id/vigencia", escrita, asyncHandler(c.publicarVersaoPaper));

// Recomendações do Paper — RF029
metodologiasRouter.post("/papers/:id/recomendacoes", escrita, asyncHandler(c.recomendarCandidatura));
metodologiasRouter.get("/papers/:id/recomendacoes", leitura, asyncHandler(c.listarRecomendacoes));
metodologiasRouter.delete("/papers/:id/recomendacoes/:candidaturaId", escrita, asyncHandler(c.removerRecomendacao));

// Validação do Paper — RF030
metodologiasRouter.post("/versoes-paper/:id/validacoes", escrita, asyncHandler(c.criarValidacao));
metodologiasRouter.get("/versoes-paper/:id/validacoes", leitura, asyncHandler(c.listarValidacoes));

// Modelo de Score Card — RF031
metodologiasRouter.post("/modelos-score-card", decisao, asyncHandler(c.criarModelo));
metodologiasRouter.get("/modelos-score-card", leitura, asyncHandler(c.listarModelos));
metodologiasRouter.get("/modelos-score-card/:id", leitura, asyncHandler(c.obterModelo));
metodologiasRouter.post("/modelos-score-card/:id/versoes", decisao, asyncHandler(c.criarVersaoModelo));
metodologiasRouter.put("/versoes-modelo-score-card/:id/criterios", decisao, asyncHandler(c.definirCriterios));
metodologiasRouter.get("/versoes-modelo-score-card/:id/criterios", leitura, asyncHandler(c.listarCriterios));
metodologiasRouter.post("/versoes-modelo-score-card/:id/vigencia", decisao, asyncHandler(c.publicarVersaoModelo));

// Avaliação Score Card — RF032
metodologiasRouter.post("/candidaturas/:id/avaliacoes-score-card", escrita, asyncHandler(c.aplicarAvaliacao));
metodologiasRouter.get("/candidaturas/:id/avaliacoes-score-card", leitura, asyncHandler(c.listarAvaliacoes));
metodologiasRouter.get("/avaliacoes-score-card/:id", leitura, asyncHandler(c.obterAvaliacao));

// Decisão da candidatura — RF033
metodologiasRouter.post("/candidaturas/:id/decisoes", decisao, asyncHandler(c.registrarDecisao));
metodologiasRouter.get("/candidaturas/:id/decisoes", leitura, asyncHandler(c.listarDecisoes));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/candidaturas/:id/analises-crossability", tag: "Metodologias · Crossability",
  summary: "Registrar análise Crossability — cada envio cria uma nova versão, nunca sobrescreve (RN019)",
  body: criarAnaliseSchema,
  responses: { "201": "Análise criada", "404": "Candidatura não encontrada", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/candidaturas/:id/analises-crossability", tag: "Metodologias · Crossability",
  summary: "Listar o histórico de análises Crossability da candidatura",
  responses: { "200": "Lista", "404": "Candidatura não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/analises-crossability/:id", tag: "Metodologias · Crossability",
  summary: "Obter análise Crossability por id",
  responses: { "200": "Análise", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/frentes/:id/papers", tag: "Metodologias · Paper",
  summary: "Criar Paper de oportunidade na frente",
  body: criarPaperSchema,
  responses: { "201": "Paper criado", "404": "Frente não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/frentes/:id/papers", tag: "Metodologias · Paper",
  summary: "Listar Papers da frente",
  responses: { "200": "Lista", "404": "Frente não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/papers/:id", tag: "Metodologias · Paper",
  summary: "Obter Paper por id",
  responses: { "200": "Paper", "404": "Não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/papers/:id/versoes", tag: "Metodologias · Paper",
  summary: "Criar nova versão do Paper (rascunho)",
  body: criarVersaoPaperSchema,
  responses: { "201": "Versão criada", "404": "Paper não encontrado" },
});
registrarRota({
  method: "GET", path: "/v1/papers/:id/versoes", tag: "Metodologias · Paper",
  summary: "Listar versões do Paper",
  responses: { "200": "Lista", "404": "Paper não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/versoes-paper/:id/vigencia", tag: "Metodologias · Paper",
  summary: "Promover a versão a vigente — no máximo uma por Paper (RN021)",
  responses: { "200": "Versão vigente", "404": "Versão não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/papers/:id/recomendacoes", tag: "Metodologias · Recomendações",
  summary: "Recomendar candidatura no Paper, com ordem de prioridade",
  body: recomendarCandidaturaSchema,
  responses: { "201": "Recomendações do Paper", "404": "Paper ou candidatura não encontrados" },
});
registrarRota({
  method: "GET", path: "/v1/papers/:id/recomendacoes", tag: "Metodologias · Recomendações",
  summary: "Listar as candidaturas recomendadas no Paper",
  responses: { "200": "Lista", "404": "Paper não encontrado" },
});
registrarRota({
  method: "DELETE", path: "/v1/papers/:id/recomendacoes/:candidaturaId", tag: "Metodologias · Recomendações",
  summary: "Remover recomendação do Paper",
  responses: { "204": "Removida", "404": "Recomendação não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/versoes-paper/:id/validacoes", tag: "Metodologias · Validação",
  summary: "Registrar validação sobre uma versão específica do Paper (RN020)",
  body: criarValidacaoSchema,
  responses: { "201": "Validação registrada", "404": "Versão não encontrada", "422": "Vocabulário inválido" },
});
registrarRota({
  method: "GET", path: "/v1/versoes-paper/:id/validacoes", tag: "Metodologias · Validação",
  summary: "Listar validações da versão do Paper",
  responses: { "200": "Lista", "404": "Versão não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/modelos-score-card", tag: "Metodologias · Score Card",
  summary: "Criar modelo de Cross Score Card",
  body: criarModeloScoreCardSchema,
  responses: { "201": "Modelo criado", "403": "Sem permissão" },
});
registrarRota({
  method: "GET", path: "/v1/modelos-score-card", tag: "Metodologias · Score Card",
  summary: "Listar modelos de Score Card (paginado)",
  responses: { "200": "Lista paginada" },
});
registrarRota({
  method: "GET", path: "/v1/modelos-score-card/:id", tag: "Metodologias · Score Card",
  summary: "Obter modelo com suas versões",
  responses: { "200": "Modelo", "404": "Não encontrado" },
});
registrarRota({
  method: "POST", path: "/v1/modelos-score-card/:id/versoes", tag: "Metodologias · Score Card",
  summary: "Criar nova versão do modelo (rascunho)",
  responses: { "201": "Versão criada", "404": "Modelo não encontrado" },
});
registrarRota({
  method: "PUT", path: "/v1/versoes-modelo-score-card/:id/criterios", tag: "Metodologias · Score Card",
  summary: "Definir os critérios e pesos da versão — só em rascunho (RN023)",
  body: definirCriteriosSchema,
  responses: { "200": "Critérios definidos", "404": "Versão não encontrada", "422": "Versão já publicada ou ordem duplicada" },
});
registrarRota({
  method: "GET", path: "/v1/versoes-modelo-score-card/:id/criterios", tag: "Metodologias · Score Card",
  summary: "Listar os critérios da versão do modelo",
  responses: { "200": "Lista", "404": "Versão não encontrada" },
});
registrarRota({
  method: "POST", path: "/v1/versoes-modelo-score-card/:id/vigencia", tag: "Metodologias · Score Card",
  summary: "Colocar a versão do modelo em vigência — no máximo uma por modelo",
  responses: { "200": "Versão vigente", "404": "Versão não encontrada", "422": "Versão sem critérios" },
});

registrarRota({
  method: "POST", path: "/v1/candidaturas/:id/avaliacoes-score-card", tag: "Metodologias · Avaliação",
  summary: "Aplicar o Cross Score Card — pontuação e score derivados dos pesos versionados (RN023); exige validação de Paper aprovada (RN022)",
  body: aplicarAvaliacaoSchema,
  responses: {
    "201": "Avaliação aplicada",
    "404": "Candidatura, modelo ou validação não encontrados",
    "422": "Validação não aprovada, critério estranho à versão ou obrigatório sem resposta",
  },
});
registrarRota({
  method: "GET", path: "/v1/candidaturas/:id/avaliacoes-score-card", tag: "Metodologias · Avaliação",
  summary: "Listar as avaliações de Score Card da candidatura",
  responses: { "200": "Lista", "404": "Candidatura não encontrada" },
});
registrarRota({
  method: "GET", path: "/v1/avaliacoes-score-card/:id", tag: "Metodologias · Avaliação",
  summary: "Obter avaliação com o detalhamento das respostas por critério",
  responses: { "200": "Avaliação", "404": "Não encontrada" },
});

registrarRota({
  method: "POST", path: "/v1/candidaturas/:id/decisoes", tag: "Metodologias · Decisão",
  summary: "Registrar decisão sobre a candidatura, com justificativa e responsável (RN025)",
  body: registrarDecisaoSchema,
  responses: { "201": "Decisão registrada", "404": "Candidatura não encontrada", "422": "Tipo de decisão inexistente" },
});
registrarRota({
  method: "GET", path: "/v1/candidaturas/:id/decisoes", tag: "Metodologias · Decisão",
  summary: "Listar o histórico de decisões da candidatura",
  responses: { "200": "Histórico", "404": "Candidatura não encontrada" },
});
