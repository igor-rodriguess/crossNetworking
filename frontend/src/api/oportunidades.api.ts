import { requisitar, requisitarPagina, type Pagina } from './client';

export type NivelCompatApi = 'alta' | 'media' | 'baixa';

export interface AnaliseOportunidadeApi {
  compatibilidade_publicos: { nivel: NivelCompatApi; texto: string };
  compatibilidade_territorios: { nivel: NivelCompatApi; texto: string };
  complementaridade_ativos: { nivel: NivelCompatApi; texto: string };
  sinergias: { nivel: NivelCompatApi; texto: string };
  fit_estrategico: { nivel: NivelCompatApi; texto: string };
  momento_estrategico: { nivel: NivelCompatApi; texto: string };
  recomendacao: 'recomendada' | 'em_estudo' | 'nao_recomendada';
  racional_recomendacao: string;
  confianca: number;
}

export interface FonteOportunidadeApi {
  nome: string;
  tipo: string;
  detalhe: string;
  url?: string;
  similaridade?: number;
}

export interface BriefingOportunidadeApi {
  objetivo: string;
  ideia: string;
  publico: string;
  ativacoes: string[];
  proxima_validacao: string;
}

export interface OportunidadeApi {
  id: string;
  execucao_pipeline_id: string | null;
  pipeline: 'partner_discovery' | 'market_intelligence';
  cliente_nome: string;
  objetivo: string;
  parceiro_nome: string;
  perfil_parceiro: unknown | null;
  analise: AnaliseOportunidadeApi;
  score_fit: number;
  confianca: number;
  fontes: FonteOportunidadeApi[];
  briefing: BriefingOportunidadeApi;
  status: 'rascunho' | 'em_curadoria' | 'aprovada' | 'descartada';
  projeto_id: string | null;
  frente_id: string | null;
  criado_em: string;
}

export interface GerarOportunidadesInput {
  cliente: string;
  objetivo: string;
  contexto?: string;
  projeto_id?: string;
  frente_id?: string;
  limite_consultas?: number;
  limite_resultados_por_consulta?: number;
  limite_urls?: number;
  limite_candidatos?: number;
}

export async function listarOportunidades(opcoes: { cliente?: string; pagina?: number; porPagina?: number } = {}) {
  return requisitarPagina<OportunidadeApi>('/agentes/oportunidades', {
    query: { cliente: opcoes.cliente, pagina: opcoes.pagina, por_pagina: opcoes.porPagina },
  });
}

export async function gerarOportunidades(dados: GerarOportunidadesInput): Promise<{
  pipeline: { status: string; execucao_id: string; observacoes: string[] };
  oportunidades: OportunidadeApi[];
}> {
  return requisitar('/agentes/oportunidades/gerar', { metodo: 'POST', corpo: dados });
}

// --- Execução assíncrona com progresso ---------------------------------------
// O pipeline encadeia várias chamadas de LLM e não cabe no timeout de uma
// requisição. Agendamos, recebemos a tarefa e acompanhamos por polling.

export type StatusTarefa = 'pendente' | 'executando' | 'concluida' | 'erro';

export interface EtapaTarefaApi {
  nome: string;
  status: 'sucesso' | 'parcial' | 'ignorada' | 'erro';
  origem?: string;
  observacao?: string;
}

export interface TarefaPipelineApi {
  id: string;
  pipeline: 'partner_discovery' | 'market_intelligence';
  status: StatusTarefa;
  etapa_atual: string | null;
  etapas: EtapaTarefaApi[];
  progresso: number;
  resultado: { status: string; observacoes: string[] } | null;
  erro: string | null;
  execucao_pipeline_id: string | null;
  criado_em: string;
  concluido_em: string | null;
}

/** Agenda a descoberta e devolve a tarefa já criada (HTTP 202). */
export async function agendarPartnerDiscovery(dados: GerarOportunidadesInput): Promise<TarefaPipelineApi> {
  return requisitar('/agentes/partner-discovery/async', { metodo: 'POST', corpo: dados });
}

export async function consultarTarefa(id: string): Promise<TarefaPipelineApi> {
  return requisitar(`/agentes/tarefas/${id}`);
}

export type { Pagina };
