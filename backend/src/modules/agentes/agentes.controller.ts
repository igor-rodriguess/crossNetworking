import { Request, Response } from "express";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import * as service from "./agentes.service";
import * as ragService from "./rag.service";
import {
  avaliarCredibilidadeSchema,
  analisarImportacaoCsvSchema,
  analisarFunilHistoricoSchema,
  buscarRagSchema,
  coletarFontesSchema,
  decidirHumanGateSchema,
  executarMarketIntelligenceSchema,
  executarPartnerDiscoverySchema,
  extrairInformacoesSchema,
  gerarOportunidadesSchema,
  ingerirRagSchema,
  planejarPesquisaSchema,
  raciocinarCrossabilitySchema,
  recomendarParceirosSchema,
  persistirOportunidadesSchema,
  confirmarImportacaoCsvSchema,
  confirmarFunilHistoricoSchema,
  enriquecerParteSchema,
  resolverEntidadesSchema,
  verificarFatosSchema,
} from "./agentes.schema";

// POST /v1/agentes/search-planning — executa o Search Planning Agent.
// POST /v1/agentes/partner-discovery — executa o pipeline completo de descoberta.
export async function executarPartnerDiscovery(req: Request, res: Response): Promise<void> {
  const input = executarPartnerDiscoverySchema.parse(req.body);
  const resultado = await service.executarPartnerDiscovery(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/market-intelligence — executa o pipeline completo de inteligência.
export async function executarMarketIntelligence(req: Request, res: Response): Promise<void> {
  const input = executarMarketIntelligenceSchema.parse(req.body);
  const resultado = await service.executarMarketIntelligence(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/partner-discovery/async — agenda o pipeline e responde na
// hora com a tarefa. O pipeline encadeia várias chamadas de LLM e não cabe no
// timeout de uma requisição; o cliente acompanha por GET /agentes/tarefas/:id.
export async function agendarPartnerDiscovery(req: Request, res: Response): Promise<void> {
  const input = executarPartnerDiscoverySchema.parse(req.body);
  const tarefa = await service.agendarPipeline(input, "partner_discovery", req.usuarioId);
  res.status(202).json(tarefa);
}

// POST /v1/agentes/market-intelligence/async — idem, para inteligência de mercado.
export async function agendarMarketIntelligence(req: Request, res: Response): Promise<void> {
  const input = executarMarketIntelligenceSchema.parse(req.body);
  const tarefa = await service.agendarPipeline(input, "market_intelligence", req.usuarioId);
  res.status(202).json(tarefa);
}

// GET /v1/agentes/tarefas/:id — progresso e resultado de uma execução agendada.
export async function consultarTarefa(req: Request, res: Response): Promise<void> {
  const tarefa = await service.consultarTarefa(req.params.id);
  if (!tarefa) {
    res.status(404).json({ erro: "Tarefa não encontrada." });
    return;
  }
  res.json(tarefa);
}

// GET /v1/agentes/tarefas — lista as execuções agendadas (mais recentes antes).
export async function listarTarefas(req: Request, res: Response): Promise<void> {
  const paginacao = parsePaginacao(req.query);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const { itens, total } = await service.listarTarefas({
    status,
    pagina: paginacao.pagina,
    porPagina: paginacao.porPagina,
  });
  res.json(envelopePaginado(itens, total, paginacao));
}

// POST /v1/agentes/oportunidades/gerar — executa Partner Discovery e
// materializa os rascunhos para a central de oportunidades.
export async function gerarOportunidades(req: Request, res: Response): Promise<void> {
  const input = gerarOportunidadesSchema.parse(req.body);
  const resultado = await service.gerarOportunidades(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/oportunidades/persistir — usado pelo worker LangGraph ao
// concluir uma execução. Não promove dados ao funil nem substitui o Human Gate.
export async function persistirOportunidades(req: Request, res: Response): Promise<void> {
  const input = persistirOportunidadesSchema.parse(req.body);
  const itens = await service.persistirOportunidades(input, req.usuarioId);
  res.status(201).json({ itens });
}

// GET /v1/agentes/oportunidades — leitura da central de oportunidades.
export async function listarOportunidades(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const cliente = typeof req.query.cliente === "string" && req.query.cliente.trim() ? req.query.cliente.trim() : undefined;
  const { itens, total } = await service.listarOportunidades({ cliente }, p);
  res.json(envelopePaginado(itens, total, p));
}

// POST /v1/agentes/csv/mapeamento — sugere colunas, sem escrever dados.
export async function analisarImportacaoCsv(req: Request, res: Response): Promise<void> {
  const input = analisarImportacaoCsvSchema.parse(req.body);
  res.status(201).json(await service.analisarImportacaoCsv(input, req.usuarioId));
}

// POST /v1/agentes/csv/confirmar — persiste exclusivamente a prévia confirmada.
export async function confirmarImportacaoCsv(req: Request, res: Response): Promise<void> {
  const input = confirmarImportacaoCsvSchema.parse(req.body);
  res.status(201).json(await service.confirmarImportacaoCsv(input, req.usuarioId));
}

// POST /v1/agentes/csv/funil-historico/analisar — interpreta a hierarquia sem gravar.
export async function analisarFunilHistorico(req: Request, res: Response): Promise<void> {
  const input = analisarFunilHistoricoSchema.parse(req.body);
  res.status(201).json(await service.analisarFunilHistorico(input, req.usuarioId));
}

// POST /v1/agentes/csv/funil-historico/confirmar — cria cliente, projetos,
// frentes, marcas e candidaturas após a revisão explícita da prévia.
export async function confirmarFunilHistorico(req: Request, res: Response): Promise<void> {
  const input = confirmarFunilHistoricoSchema.parse(req.body);
  res.status(201).json(await service.confirmarFunilHistorico(input, req.usuarioId));
}

export async function enriquecerParte(req: Request, res: Response): Promise<void> {
  const input = enriquecerParteSchema.parse(req.body);
  res.status(201).json(await service.enriquecerParte(req.params.id, input, req.usuarioId));
}

export async function planejarPesquisa(req: Request, res: Response): Promise<void> {
  const input = planejarPesquisaSchema.parse(req.body);
  const resultado = await service.executarPlanejamento(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/source-collector — executa o Source Collector.
export async function coletarFontes(req: Request, res: Response): Promise<void> {
  const input = coletarFontesSchema.parse(req.body);
  const resultado = await service.executarColeta(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/source-credibility — avalia a credibilidade das fontes.
export async function avaliarCredibilidade(req: Request, res: Response): Promise<void> {
  const input = avaliarCredibilidadeSchema.parse(req.body);
  const resultado = await service.executarCredibilidade(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/fact-verifier — verifica corroboração das afirmações.
export async function verificarFatos(req: Request, res: Response): Promise<void> {
  const input = verificarFatosSchema.parse(req.body);
  const resultado = await service.executarVerificacao(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/entity-resolver — dedupe e casa entidades com a base.
export async function resolverEntidades(req: Request, res: Response): Promise<void> {
  const input = resolverEntidadesSchema.parse(req.body);
  const resultado = await service.executarResolucaoEntidades(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/information-extractor — estrutura conteúdo coletado.
export async function extrairInformacoes(req: Request, res: Response): Promise<void> {
  const input = extrairInformacoesSchema.parse(req.body);
  const resultado = await service.executarExtracao(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/crossability-reasoning — análise Crossability (6 dimensões).
export async function raciocinarCrossability(req: Request, res: Response): Promise<void> {
  const input = raciocinarCrossabilitySchema.parse(req.body);
  const resultado = await service.executarReasoning(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/recommendation — ranqueia candidatos pela Crossability.
export async function recomendarParceiros(req: Request, res: Response): Promise<void> {
  const input = recomendarParceirosSchema.parse(req.body);
  const resultado = await service.executarRecomendacao(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/human-gate — curadoria: promove/rejeita a saída de um agente.
export async function decidirHumanGate(req: Request, res: Response): Promise<void> {
  const input = decidirHumanGateSchema.parse(req.body);
  const resultado = await service.decidirHumanGate(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/rag/ingerir — indexa trechos na base de conhecimento.
export async function ingerirRag(req: Request, res: Response): Promise<void> {
  const input = ingerirRagSchema.parse(req.body);
  const resultado = await ragService.ingerir(input, req.usuarioId);
  res.status(201).json(resultado);
}

// POST /v1/agentes/rag/buscar — busca semântica na base de conhecimento.
export async function buscarRag(req: Request, res: Response): Promise<void> {
  const input = buscarRagSchema.parse(req.body);
  const resultado = await ragService.buscar(input);
  res.json(resultado);
}

// GET /v1/agentes/execucoes?agente=&pagina=&por_pagina= — auditoria.
export async function listarExecucoes(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const agenteRaw = req.query.agente;
  const agente = typeof agenteRaw === "string" && agenteRaw.trim() ? agenteRaw.trim() : undefined;
  const { itens, total } = await service.listarExecucoes({ agente }, p);
  res.json(envelopePaginado(itens, total, p));
}
