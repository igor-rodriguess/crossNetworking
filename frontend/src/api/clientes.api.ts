// API REST de Clientes (RF016) — devolve os tipos de UI via mapper.
//
// No backend, Cliente é uma especialização de Parte. Criar um cliente é um
// processo de 2 etapas — criar a Parte (organização) e promovê-la a cliente
// (parte_id). Essa orquestração fica AQUI, escondida da UI: a tela chama um
// único `criarCliente` e recebe um Cliente pronto.

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import { criarParte } from './partes.api';
import { clienteDeBackend, siglaDe, type ClienteBackend } from './mappers/clientes.mapper';
import type { Cliente } from '../types';

// Cache de versões (ETag) por cliente, para o PATCH otimista.
const versaoPorId = new Map<string, string>();

export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

export interface ListaClientes {
  itens: Cliente[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

/** Lista/busca Clientes paginados (RF016). */
export async function listarClientes(opcoes: { busca?: string; pagina?: number; porPagina?: number } = {}): Promise<ListaClientes> {
  const pag: Pagina<ClienteBackend> = await requisitarPagina('/clientes', {
    query: { busca: opcoes.busca || undefined, pagina: opcoes.pagina, por_pagina: opcoes.porPagina },
  });
  return {
    itens: pag.itens.map((c) => clienteDeBackend(c)),
    total: pag.total,
    pagina: pag.pagina,
    totalPaginas: pag.total_paginas,
  };
}

/** Obtém um Cliente por id. */
export async function obterCliente(id: string): Promise<Cliente> {
  const c = await requisitar<ClienteBackend>(`/clientes/${id}`);
  if (c.versao) versaoPorId.set(c.id, c.versao);
  return clienteDeBackend(c);
}

/**
 * Cria um Cliente em um passo do ponto de vista da UI: cria a Parte
 * (organização, guardando o segmento) e a promove a cliente. Devolve o
 * Cliente já com nome/segmento/responsável preenchidos para a UI.
 */
export async function criarCliente(dados: {
  nome: string;
  segmento?: string;
  responsavel?: string;
}): Promise<Cliente> {
  // 1) cria a Parte organização (o segmento vive na especialização da Parte)
  const parte = await criarParte({ tipo: 'organizacao', nome: dados.nome, categoria: dados.segmento });
  // 2) promove a Parte a Cliente
  const criado = await requisitar<ClienteBackend>('/clientes', {
    metodo: 'POST',
    corpo: { parte_id: parte.id, status_cliente_codigo: 'ativo' },
  });
  if (criado.versao) versaoPorId.set(criado.id, criado.versao);
  return clienteDeBackend(criado, {
    segmento: dados.segmento || '—',
    responsavel: dados.responsavel || '—',
  });
}

/** Arquiva (exclusão lógica) um Cliente. */
export async function arquivarCliente(id: string): Promise<void> {
  await requisitarVazio(`/clientes/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}

export { siglaDe };
