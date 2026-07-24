// API REST de Partes (RF004–RF008) — devolve os tipos de UI via mapper.
//
// A edição usa concorrência otimista: o backend exige If-Match com a `versao`
// (xmin) obtida no GET. A UI não carrega a versão no seu tipo `Parte`, então
// guardamos aqui um cache id→versao, preenchido a cada leitura e consumido no
// PATCH. É o suficiente para o fluxo "abrir → editar → salvar".

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import {
  contatoDeBackend,
  paraAtualizarParte,
  paraCriarContato,
  paraCriarParte,
  papelDeBackend,
  papelParaBackend,
  parteDeBackend,
  parteListaDeBackend,
  type ContatoBackend,
  type PapelBackend,
  type ParteBackend,
  type ParteListaBackend,
} from './mappers/partes.mapper';
import type { ContatoParte, Parte } from '../types';

// Cache de versões (ETag) por Parte, para o PATCH otimista.
const versaoPorId = new Map<string, string>();

export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

export interface ListaPartes {
  itens: Parte[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

/** Lista/busca Partes paginadas (RF004/RF008). */
export async function listarPartes(opcoes: {
  busca?: string;
  tipo?: 'organizacao' | 'pessoa';
  pagina?: number;
  porPagina?: number;
} = {}): Promise<ListaPartes> {
  const pag: Pagina<ParteListaBackend> = await requisitarPagina('/partes', {
    query: {
      busca: opcoes.busca || undefined,
      tipo: opcoes.tipo,
      pagina: opcoes.pagina,
      por_pagina: opcoes.porPagina,
    },
  });
  return {
    itens: pag.itens.map(parteListaDeBackend),
    total: pag.total,
    pagina: pag.pagina,
    totalPaginas: pag.total_paginas,
  };
}

/** Obtém uma Parte completa: detalhe + papéis + contatos (3 chamadas). */
export async function obterParte(id: string): Promise<Parte> {
  const [detalhe, papeis, contatos] = await Promise.all([
    requisitar<ParteBackend>(`/partes/${id}`),
    requisitar<{ itens: PapelBackend[] }>(`/partes/${id}/papeis`).then((r) => r.itens),
    requisitar<{ itens: ContatoBackend[] }>(`/partes/${id}/contatos`).then((r) => r.itens),
  ]);
  versaoPorId.set(detalhe.id, detalhe.versao);
  return parteDeBackend(detalhe, papeis, contatos);
}

/** Cria uma Parte (organização ou pessoa). */
export async function criarParte(dados: {
  tipo: 'organizacao' | 'pessoa';
  nome: string;
  categoria?: string;
}): Promise<Parte> {
  const criada = await requisitar<ParteBackend>('/partes', {
    metodo: 'POST',
    corpo: paraCriarParte(dados),
  });
  versaoPorId.set(criada.id, criada.versao);
  return parteDeBackend(criada);
}

/** Atualiza campos base da Parte com trava otimista (If-Match). */
export async function atualizarParte(
  id: string,
  tipo: 'organizacao' | 'pessoa',
  mudancas: { nome?: string; categoria?: string },
): Promise<Parte> {
  const versao = versaoPorId.get(id);
  const atualizada = await requisitar<ParteBackend>(`/partes/${id}`, {
    metodo: 'PATCH',
    corpo: paraAtualizarParte(mudancas, tipo),
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  versaoPorId.set(atualizada.id, atualizada.versao);
  // Recarrega papéis/contatos para devolver a Parte completa.
  const [papeis, contatos] = await Promise.all([
    requisitar<{ itens: PapelBackend[] }>(`/partes/${id}/papeis`).then((r) => r.itens),
    requisitar<{ itens: ContatoBackend[] }>(`/partes/${id}/contatos`).then((r) => r.itens),
  ]);
  return parteDeBackend(atualizada, papeis, contatos);
}

/** Arquiva (exclusão lógica) uma Parte. */
export async function arquivarParte(id: string): Promise<void> {
  await requisitarVazio(`/partes/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}

// --- Contatos (RF007) -------------------------------------------------------

export async function adicionarContato(
  parteId: string,
  contato: { nome: string; cargo?: string; email?: string; principal?: boolean },
): Promise<ContatoParte> {
  const criado = await requisitar<ContatoBackend>(`/partes/${parteId}/contatos`, {
    metodo: 'POST',
    corpo: paraCriarContato(contato),
  });
  return contatoDeBackend(criado);
}

// --- Papéis (RF006) ---------------------------------------------------------

export async function adicionarPapel(parteId: string, papelCodigo: string): Promise<void> {
  await requisitar(`/partes/${parteId}/papeis`, {
    metodo: 'POST',
    corpo: { papel_codigo: papelParaBackend(papelCodigo) },
  });
}

export { papelDeBackend, papelParaBackend };
