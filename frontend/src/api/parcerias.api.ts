// API REST de Parcerias (RF034) — devolve os tipos de UI via mapper.
//
// A parceria é formalizada a partir de uma candidatura. A listagem filtra por
// projeto, então para carregar as parcerias de um cliente percorremos seus
// projetos (como no funil).

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import {
  paraAtualizarParceria,
  paraFormalizarParceria,
  parceriaDeBackend,
  type ParceriaBackend,
} from './mappers/parcerias.mapper';
import { listarProjetos } from './projetos.api';
import type { Parceria, StatusParceria } from '../types';

const versaoPorId = new Map<string, string>();
export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

/** Lista as parcerias de um projeto. */
export async function listarParceriasDoProjeto(projetoId: string): Promise<Parceria[]> {
  const pag: Pagina<ParceriaBackend> = await requisitarPagina('/parcerias', {
    query: { projeto_id: projetoId, por_pagina: 100 },
  });
  for (const p of pag.itens) if (p.versao) versaoPorId.set(p.id, p.versao);
  return pag.itens.map(parceriaDeBackend);
}

/** Carrega todas as parcerias de um cliente (via seus projetos). */
export async function carregarDoCliente(clienteId: string): Promise<Parceria[]> {
  const { itens: projetos } = await listarProjetos({ clienteId, porPagina: 100 });
  const listas = await Promise.all(projetos.map((p) => listarParceriasDoProjeto(p.id)));
  return listas.flat();
}

export async function obterParceria(id: string): Promise<Parceria> {
  const p = await requisitar<ParceriaBackend>(`/parcerias/${id}`);
  if (p.versao) versaoPorId.set(p.id, p.versao);
  return parceriaDeBackend(p);
}

/** Formaliza uma parceria a partir de uma candidatura (RF034). */
export async function formalizarParceria(
  candidaturaId: string,
  dados: { tipo?: string; status?: StatusParceria; dataInicio?: string; dataFim?: string; condicoes?: string } = {},
): Promise<Parceria> {
  const criada = await requisitar<ParceriaBackend>(`/candidaturas/${candidaturaId}/parceria`, {
    metodo: 'POST',
    corpo: paraFormalizarParceria(dados),
  });
  if (criada.versao) versaoPorId.set(criada.id, criada.versao);
  return parceriaDeBackend(criada);
}

/** Atualiza campos base da parceria com trava otimista (If-Match). */
export async function atualizarParceria(
  id: string,
  mudancas: { status?: StatusParceria; dataInicio?: string; dataFim?: string; nome?: string; tipo?: string },
): Promise<Parceria> {
  const versao = versaoPorId.get(id);
  const atualizada = await requisitar<ParceriaBackend>(`/parcerias/${id}`, {
    metodo: 'PATCH',
    corpo: paraAtualizarParceria(mudancas),
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  if (atualizada.versao) versaoPorId.set(atualizada.id, atualizada.versao);
  return parceriaDeBackend(atualizada);
}

export async function arquivarParceria(id: string): Promise<void> {
  await requisitarVazio(`/parcerias/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}
