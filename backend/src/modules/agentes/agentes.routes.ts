import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./agentes.controller";
import {
  avaliarCredibilidadeSchema,
  analisarImportacaoCsvSchema,
  analisarFunilHistoricoSchema,
  buscarRagSchema,
  coletarFontesSchema,
  confirmarImportacaoCsvSchema,
  confirmarFunilHistoricoSchema,
  enriquecerParteSchema,
  decidirHumanGateSchema,
  executarMarketIntelligenceSchema,
  executarPartnerDiscoverySchema,
  extrairInformacoesSchema,
  gerarOportunidadesSchema,
  ingerirRagSchema,
  planejarPesquisaSchema,
  raciocinarCrossabilitySchema,
  recomendarParceirosSchema,
  resolverEntidadesSchema,
  verificarFatosSchema,
} from "./agentes.schema";

export const agentesRouter = Router();

// Executar agentes é ação de estrategista/coordenador/admin; leitura da
// auditoria fica aberta a qualquer usuário autenticado. Promover à base
// (Human Gate) exige curadoria — só coordenador/administrador.
// Geração produz apenas rascunhos curáveis, portanto gestores de conta podem
// iniciar pesquisas para seus clientes. A promoção continua restrita ao Human Gate.
const executar = autorizar("estrategista", "gestor_contas", "coordenador", "administrador");
const enriquecer = autorizar("estrategista", "gestor_contas", "coordenador", "administrador");
const decisao = autorizar("coordenador", "administrador");
const leitura = autorizar();

// Agentes de tarefa — consolidam os componentes compartilhados.
agentesRouter.post("/agentes/partner-discovery", executar, asyncHandler(c.executarPartnerDiscovery));
agentesRouter.post("/agentes/market-intelligence", executar, asyncHandler(c.executarMarketIntelligence));

// Execução assíncrona: o pipeline não cabe no timeout de uma requisição, então
// estas rotas respondem 202 na hora e o cliente acompanha o progresso por
// GET /agentes/tarefas/:id. A leitura é aberta a qualquer usuário autenticado.
agentesRouter.post("/agentes/partner-discovery/async", executar, asyncHandler(c.agendarPartnerDiscovery));
agentesRouter.post("/agentes/market-intelligence/async", executar, asyncHandler(c.agendarMarketIntelligence));
agentesRouter.get("/agentes/tarefas", leitura, asyncHandler(c.listarTarefas));
agentesRouter.get("/agentes/tarefas/:id", leitura, asyncHandler(c.consultarTarefa));

// Central de oportunidades: gera via pipeline e persiste apenas rascunhos
// auditáveis. A leitura é aberta a qualquer pessoa autenticada.
agentesRouter.post("/agentes/oportunidades/gerar", executar, asyncHandler(c.gerarOportunidades));
agentesRouter.post("/agentes/oportunidades/persistir", executar, asyncHandler(c.persistirOportunidades));
agentesRouter.get("/agentes/oportunidades", leitura, asyncHandler(c.listarOportunidades));

// Importação de planilha: IA sugere o mapeamento; escrita exige confirmação.
agentesRouter.post("/agentes/csv/mapeamento", executar, asyncHandler(c.analisarImportacaoCsv));
agentesRouter.post("/agentes/csv/confirmar", executar, asyncHandler(c.confirmarImportacaoCsv));
agentesRouter.post("/agentes/csv/funil-historico/analisar", executar, asyncHandler(c.analisarFunilHistorico));
agentesRouter.post("/agentes/csv/funil-historico/confirmar", executar, asyncHandler(c.confirmarFunilHistorico));
agentesRouter.post("/agentes/partes/:id/enriquecer", enriquecer, asyncHandler(c.enriquecerParte));

// Search Planning Agent
agentesRouter.post("/agentes/search-planning", executar, asyncHandler(c.planejarPesquisa));

// Source Collector
agentesRouter.post("/agentes/source-collector", executar, asyncHandler(c.coletarFontes));

// Source Credibility
agentesRouter.post("/agentes/source-credibility", executar, asyncHandler(c.avaliarCredibilidade));

// Fact Verifier
agentesRouter.post("/agentes/fact-verifier", executar, asyncHandler(c.verificarFatos));

// Entity Resolver
agentesRouter.post("/agentes/entity-resolver", executar, asyncHandler(c.resolverEntidades));

// Information Extractor
agentesRouter.post("/agentes/information-extractor", executar, asyncHandler(c.extrairInformacoes));

// Crossability Reasoning
agentesRouter.post("/agentes/crossability-reasoning", executar, asyncHandler(c.raciocinarCrossability));

// Recommendation
agentesRouter.post("/agentes/recommendation", executar, asyncHandler(c.recomendarParceiros));

// Human Gate — curadoria que promove/rejeita à base (exige decisão)
agentesRouter.post("/agentes/human-gate", decisao, asyncHandler(c.decidirHumanGate));

// RAG — base de conhecimento vetorial (ingerir escreve; buscar é leitura)
agentesRouter.post("/agentes/rag/ingerir", executar, asyncHandler(c.ingerirRag));
agentesRouter.post("/agentes/rag/buscar", leitura, asyncHandler(c.buscarRag));

// Auditoria de execuções
agentesRouter.get("/agentes/execucoes", leitura, asyncHandler(c.listarExecucoes));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST",
  path: "/v1/agentes/partner-discovery",
  tag: "Agentes de tarefa",
  summary: "Executar Partner Discovery completo — pesquisa, coleta, validação, extração, Crossability e recomendação",
  body: executarPartnerDiscoverySchema,
  responses: { "201": "Pipeline executado", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/partner-discovery/async",
  tag: "Agentes de tarefa",
  summary: "Agendar Partner Discovery — responde 202 na hora; acompanhe por GET /agentes/tarefas/:id",
  body: executarPartnerDiscoverySchema,
  responses: { "202": "Tarefa criada e em execução", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/market-intelligence/async",
  tag: "Agentes de tarefa",
  summary: "Agendar Market Intelligence — responde 202 na hora; acompanhe por GET /agentes/tarefas/:id",
  body: executarMarketIntelligenceSchema,
  responses: { "202": "Tarefa criada e em execução", "422": "Entrada inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/tarefas/:id",
  tag: "Agentes de tarefa",
  summary: "Consultar progresso de um pipeline agendado (etapa atual, progresso 0-100 e resultado)",
  responses: { "200": "Estado da tarefa", "404": "Tarefa não encontrada" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/tarefas",
  tag: "Agentes de tarefa",
  summary: "Listar pipelines agendados — ?status=&pagina=&por_pagina=",
  responses: { "200": "Lista paginada de tarefas" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/csv/mapeamento",
  tag: "Agentes de IA · Importação",
  summary: "Ler cabeçalhos e sugerir o mapeamento de uma planilha CSV (não grava dados)",
  body: analisarImportacaoCsvSchema,
  responses: { "201": "Mapeamento sugerido e auditado", "422": "CSV ou entidade inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/csv/confirmar",
  tag: "Agentes de IA · Importação",
  summary: "Confirmar a prévia CSV e criar Partes, Clientes ou Projetos válidos",
  body: confirmarImportacaoCsvSchema,
  responses: { "201": "Importação concluída com resultado por linha", "422": "Mapeamento ou dados inválidos" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/csv/funil-historico/analisar",
  tag: "Agentes de IA · Importação",
  summary: "Interpretar a hierarquia de uma planilha histórica de parcerias sem gravar dados",
  body: analisarFunilHistoricoSchema,
  responses: { "201": "Prévia estruturada do funil", "422": "Planilha inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/csv/funil-historico/confirmar",
  tag: "Agentes de IA · Importação",
  summary: "Criar o funil completo de uma planilha histórica após confirmação",
  body: confirmarFunilHistoricoSchema,
  responses: { "201": "Cliente, projetos, frentes e candidaturas importados", "422": "Planilha inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/partes/:id/enriquecer",
  tag: "Agentes de IA · Inteligência de Parte",
  summary: "Pesquisar uma marca/talento e sugerir perfil estratégico com fontes, sem gravar na base",
  body: enriquecerParteSchema,
  responses: { "201": "Sugestão de enriquecimento", "404": "Parte não encontrada", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/oportunidades/gerar",
  tag: "Agentes de tarefa",
  summary: "Executar descoberta e salvar rascunhos para a central de oportunidades",
  body: gerarOportunidadesSchema,
  responses: { "201": "Oportunidades geradas", "422": "Entrada inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/oportunidades",
  tag: "Agentes de IA",
  summary: "Listar rascunhos de oportunidades de parceria gerados pela IA",
  responses: { "200": "Lista paginada de oportunidades" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/market-intelligence",
  tag: "Agentes de tarefa",
  summary: "Executar Market Intelligence completo — pesquisa de mercado, sinais, Crossability e recomendação",
  body: executarMarketIntelligenceSchema,
  responses: { "201": "Pipeline executado", "422": "Entrada inválida" },
});

registrarRota({
  method: "POST",
  path: "/v1/agentes/search-planning",
  tag: "Agentes de IA",
  summary: "Planejar pesquisa — decompõe um objetivo em perguntas, consultas e fontes (não executa buscas)",
  body: planejarPesquisaSchema,
  responses: { "201": "Plano de pesquisa gerado", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/source-collector",
  tag: "Agentes de IA",
  summary: "Coletar fontes — executa as buscas do plano de pesquisa (DuckDuckGo) e devolve resultados brutos",
  body: coletarFontesSchema,
  responses: { "201": "Fontes coletadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/source-credibility",
  tag: "Agentes de IA",
  summary: "Avaliar credibilidade das fontes coletadas (heurística: a origem é reputável?)",
  body: avaliarCredibilidadeSchema,
  responses: { "201": "Fontes avaliadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/fact-verifier",
  tag: "Agentes de IA",
  summary: "Verificar fatos — uma afirmação é corroborada por 2+ fontes independentes?",
  body: verificarFatosSchema,
  responses: { "201": "Afirmações verificadas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/entity-resolver",
  tag: "Agentes de IA",
  summary: "Resolver entidades — dedupe e casa nomes encontrados com as Partes já cadastradas",
  body: resolverEntidadesSchema,
  responses: { "201": "Entidades resolvidas", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/information-extractor",
  tag: "Agentes de IA",
  summary: "Extrair informações — estrutura conteúdo bruto em setor/públicos/territórios/ativos/sinais",
  body: extrairInformacoesSchema,
  responses: { "201": "Perfis extraídos", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/crossability-reasoning",
  tag: "Agentes de IA",
  summary: "Raciocínio Crossability — avalia as 6 dimensões e propõe recomendação (rascunho)",
  body: raciocinarCrossabilitySchema,
  responses: { "201": "Análise gerada", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/recommendation",
  tag: "Agentes de IA",
  summary: "Recomendação — ranqueia candidatos a parceiro pela análise Crossability",
  body: recomendarParceirosSchema,
  responses: { "201": "Ranking gerado", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/human-gate",
  tag: "Agentes de IA",
  summary: "Human Gate — curadoria: aprova (promove à base como rascunho) ou rejeita a saída de um agente",
  body: decidirHumanGateSchema,
  responses: { "201": "Decisão registrada", "404": "Execução não encontrada", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/rag/ingerir",
  tag: "Agentes de IA · RAG",
  summary: "Ingerir trechos na base de conhecimento (gera embeddings e indexa)",
  body: ingerirRagSchema,
  responses: { "201": "Trechos indexados", "422": "Entrada inválida" },
});
registrarRota({
  method: "POST",
  path: "/v1/agentes/rag/buscar",
  tag: "Agentes de IA · RAG",
  summary: "Busca semântica — recupera os trechos mais relevantes para uma consulta",
  body: buscarRagSchema,
  responses: { "200": "Trechos relevantes", "422": "Entrada inválida" },
});
registrarRota({
  method: "GET",
  path: "/v1/agentes/execucoes",
  tag: "Agentes de IA",
  summary: "Listar execuções de agentes (auditoria) — ?agente=&pagina=&por_pagina=",
  responses: { "200": "Lista paginada de execuções" },
});
