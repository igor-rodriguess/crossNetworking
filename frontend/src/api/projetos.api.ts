// API REST de Projetos e Frentes (RF019/RF024) — devolve os tipos de UI.

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import {
  frenteDeBackend,
  paraCriarFrente,
  paraCriarProjeto,
  projetoDeBackend,
  statusFrenteParaBackend,
  statusProjetoParaBackend,
  type FrenteBackend,
  type ProjetoBackend,
} from './mappers/projetos.mapper';
import type { Frente, Projeto, StatusProjeto } from '../types';

const versaoPorId = new Map<string, string>();
const versaoFrentePorId = new Map<string, string>();
export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

export interface ListaProjetos {
  itens: Projeto[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

/** Lista/busca projetos (RF019). Filtra por cliente quando informado. */
export async function listarProjetos(opcoes: {
  busca?: string;
  clienteId?: string;
  pagina?: number;
  porPagina?: number;
} = {}): Promise<ListaProjetos> {
  const pag: Pagina<ProjetoBackend> = await requisitarPagina('/projetos', {
    query: {
      busca: opcoes.busca || undefined,
      cliente_id: opcoes.clienteId || undefined,
      pagina: opcoes.pagina,
      por_pagina: opcoes.porPagina,
    },
  });
  return {
    itens: pag.itens.map(projetoDeBackend),
    total: pag.total,
    pagina: pag.pagina,
    totalPaginas: pag.total_paginas,
  };
}

export async function obterProjeto(id: string): Promise<Projeto> {
  const p = await requisitar<ProjetoBackend>(`/projetos/${id}`);
  if (p.versao) versaoPorId.set(p.id, p.versao);
  return projetoDeBackend(p);
}

export async function criarProjeto(dados: {
  clienteId: string;
  nome: string;
  objetivo: string;
  descricao?: string;
  produto?: string;
  dataInicio?: string;
  dataPrevisaoFim?: string;
  prioridade?: string;
  status?: StatusProjeto;
}): Promise<Projeto> {
  const criado = await requisitar<ProjetoBackend>('/projetos', {
    metodo: 'POST',
    corpo: paraCriarProjeto(dados),
  });
  if (criado.versao) versaoPorId.set(criado.id, criado.versao);
  return projetoDeBackend(criado);
}

/** Atualiza campos base do projeto (nome, objetivo, produto, status) com If-Match. */
export async function atualizarProjeto(
  id: string,
  mudancas: {
    nome?: string;
    objetivo?: string;
    descricao?: string;
    produto?: string;
    dataInicio?: string;
    dataPrevisaoFim?: string;
    status?: StatusProjeto;
  },
): Promise<Projeto> {
  // A listagem não traz a versão (ETag); se ainda não a conhecemos, obtém o
  // projeto primeiro — o backend exige If-Match no PATCH.
  if (!versaoPorId.has(id)) await obterProjeto(id);
  const versao = versaoPorId.get(id);
  const corpo: Record<string, unknown> = {};
  if (mudancas.nome !== undefined) corpo.nome = mudancas.nome;
  if (mudancas.objetivo !== undefined) corpo.objetivo = mudancas.objetivo;
  if (mudancas.descricao !== undefined) corpo.descricao = mudancas.descricao;
  if (mudancas.produto !== undefined) corpo.produto = mudancas.produto;
  if (mudancas.dataInicio !== undefined) corpo.data_inicio = mudancas.dataInicio || undefined;
  if (mudancas.dataPrevisaoFim !== undefined) corpo.data_previsao_fim = mudancas.dataPrevisaoFim || undefined;
  if (mudancas.status !== undefined) corpo.status_projeto_codigo = statusProjetoParaBackend(mudancas.status);
  const atualizado = await requisitar<ProjetoBackend>(`/projetos/${id}`, {
    metodo: 'PATCH',
    corpo,
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  if (atualizado.versao) versaoPorId.set(atualizado.id, atualizado.versao);
  return projetoDeBackend(atualizado);
}

export async function arquivarProjeto(id: string): Promise<void> {
  await requisitarVazio(`/projetos/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}

// --- Frentes (RF024) — aninhadas em projeto -------------------------------

/** Lista as frentes de um projeto. */
export async function listarFrentes(projetoId: string): Promise<Frente[]> {
  const pag: Pagina<FrenteBackend> = await requisitarPagina(`/projetos/${projetoId}/frentes`, {
    query: { por_pagina: 100 },
  });
  for (const frente of pag.itens) if (frente.versao) versaoFrentePorId.set(frente.id, frente.versao);
  return pag.itens.map(frenteDeBackend);
}

/** Lista as frentes de vários projetos (para telas que agregam). */
export async function listarFrentesDeProjetos(projetoIds: string[]): Promise<Frente[]> {
  const listas = await Promise.all(projetoIds.map((id) => listarFrentes(id)));
  return listas.flat();
}

export async function criarFrente(
  projetoId: string,
  dados: { nome: string; objetivo: string; categoria?: string },
): Promise<Frente> {
  const criada = await requisitar<FrenteBackend>(`/projetos/${projetoId}/frentes`, {
    metodo: 'POST',
    corpo: paraCriarFrente(dados),
  });
  if (criada.versao) versaoFrentePorId.set(criada.id, criada.versao);
  return frenteDeBackend(criada);
}

export async function obterFrente(id: string): Promise<Frente> {
  const frente = await requisitar<FrenteBackend>(`/frentes/${id}`);
  if (frente.versao) versaoFrentePorId.set(frente.id, frente.versao);
  return frenteDeBackend(frente);
}

export async function atualizarFrente(
  id: string,
  mudancas: { nome?: string; objetivo?: string; categoria?: string; status?: Frente['status'] },
): Promise<Frente> {
  if (!versaoFrentePorId.has(id)) await obterFrente(id);
  const versao = versaoFrentePorId.get(id);
  const corpo: Record<string, unknown> = {};
  if (mudancas.nome !== undefined) corpo.nome = mudancas.nome;
  if (mudancas.objetivo !== undefined) corpo.objetivo = mudancas.objetivo;
  if (mudancas.categoria !== undefined) corpo.categoria = mudancas.categoria;
  if (mudancas.status !== undefined) corpo.status_frente_codigo = statusFrenteParaBackend(mudancas.status);
  const atualizada = await requisitar<FrenteBackend>(`/frentes/${id}`, {
    metodo: 'PATCH',
    corpo,
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  if (atualizada.versao) versaoFrentePorId.set(atualizada.id, atualizada.versao);
  return frenteDeBackend(atualizada);
}

export interface BriefingProjetoApi {
  id: string;
  versao: number;
  status: string;
  conteudo: string;
  objetivos: string;
  criadoEm: string;
}

export interface PlanejamentoProjetoApi {
  id: string;
  versao: number;
  status: string;
  diagnosticos: string;
  objetivosNegocio: string;
  desafios: string;
  territorios: string;
  oportunidades: string;
  criadoEm: string;
}

type VersaoProjetoBackend = {
  id: string;
  numero_versao: number;
  status_versao: string;
  criado_em: string;
  conteudo?: string | null;
  objetivos?: string | null;
  diagnosticos?: string | null;
  objetivos_negocio?: string | null;
  desafios?: string | null;
  territorios?: string | null;
  oportunidades?: string | null;
};

export async function listarBriefings(projetoId: string): Promise<BriefingProjetoApi[]> {
  const resposta = await requisitar<{ itens: VersaoProjetoBackend[] }>(`/projetos/${projetoId}/briefings`);
  return resposta.itens.map((item) => ({
    id: item.id, versao: item.numero_versao, status: item.status_versao,
    conteudo: item.conteudo ?? '', objetivos: item.objetivos ?? '', criadoEm: item.criado_em,
  }));
}

export async function criarBriefing(projetoId: string, dados: { conteudo: string; objetivos?: string }): Promise<BriefingProjetoApi> {
  const item = await requisitar<VersaoProjetoBackend>(`/projetos/${projetoId}/briefings`, { metodo: 'POST', corpo: dados });
  return { id: item.id, versao: item.numero_versao, status: item.status_versao, conteudo: item.conteudo ?? '', objetivos: item.objetivos ?? '', criadoEm: item.criado_em };
}

export async function publicarBriefing(id: string): Promise<void> {
  await requisitar(`/briefings/${id}/vigencia`, { metodo: 'POST' });
}

export async function listarPlanejamentos(projetoId: string): Promise<PlanejamentoProjetoApi[]> {
  const resposta = await requisitar<{ itens: VersaoProjetoBackend[] }>(`/projetos/${projetoId}/planejamentos`);
  return resposta.itens.map((item) => ({
    id: item.id, versao: item.numero_versao, status: item.status_versao,
    diagnosticos: item.diagnosticos ?? '', objetivosNegocio: item.objetivos_negocio ?? '', desafios: item.desafios ?? '',
    territorios: item.territorios ?? '', oportunidades: item.oportunidades ?? '', criadoEm: item.criado_em,
  }));
}

export async function criarPlanejamento(
  projetoId: string,
  dados: { diagnosticos?: string; objetivos_negocio?: string; desafios?: string; territorios?: string; oportunidades?: string },
): Promise<PlanejamentoProjetoApi> {
  const item = await requisitar<VersaoProjetoBackend>(`/projetos/${projetoId}/planejamentos`, { metodo: 'POST', corpo: dados });
  return {
    id: item.id, versao: item.numero_versao, status: item.status_versao,
    diagnosticos: item.diagnosticos ?? '', objetivosNegocio: item.objetivos_negocio ?? '', desafios: item.desafios ?? '',
    territorios: item.territorios ?? '', oportunidades: item.oportunidades ?? '', criadoEm: item.criado_em,
  };
}

export async function publicarPlanejamento(id: string): Promise<void> {
  await requisitar(`/planejamentos/${id}/vigencia`, { metodo: 'POST' });
}
