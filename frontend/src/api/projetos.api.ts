// API REST de Projetos e Frentes (RF019/RF024) — devolve os tipos de UI.

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import {
  frenteDeBackend,
  paraCriarFrente,
  paraCriarProjeto,
  projetoDeBackend,
  statusProjetoParaBackend,
  type FrenteBackend,
  type ProjetoBackend,
} from './mappers/projetos.mapper';
import type { Frente, Projeto, StatusProjeto } from '../types';

const versaoPorId = new Map<string, string>();
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
  produto?: string;
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
  mudancas: { nome?: string; objetivo?: string; produto?: string; status?: StatusProjeto },
): Promise<Projeto> {
  // A listagem não traz a versão (ETag); se ainda não a conhecemos, obtém o
  // projeto primeiro — o backend exige If-Match no PATCH.
  if (!versaoPorId.has(id)) await obterProjeto(id);
  const versao = versaoPorId.get(id);
  const corpo: Record<string, unknown> = {};
  if (mudancas.nome !== undefined) corpo.nome = mudancas.nome;
  if (mudancas.objetivo !== undefined) corpo.objetivo = mudancas.objetivo;
  if (mudancas.produto !== undefined) corpo.produto = mudancas.produto;
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
  return frenteDeBackend(criada);
}
