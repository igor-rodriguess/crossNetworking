// API REST de Candidaturas e movimentações (RF025/RF026).
//
// Candidaturas vivem dentro de frentes. A UI trabalha por CLIENTE, então
// `carregarDoCliente` percorre projetos → frentes → candidaturas e resolve o
// clienteId em cada uma. Movimentar status usa o endpoint de histórico.

import { requisitar, requisitarVazio, type Pagina } from './client';
import {
  candidaturaDeBackend,
  movimentacaoDeBackend,
  paraCriarCandidatura,
  type CandidaturaBackend,
  type MovimentacaoBackend,
} from './mappers/candidaturas.mapper';
import { listarFrentes, listarProjetos } from './projetos.api';
import type { Candidatura, Nivel, Prioridade, StatusCandidatura } from '../types';

const versaoPorId = new Map<string, string>();
export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

/** Lista as candidaturas de uma frente. */
export async function listarCandidaturasDaFrente(frenteId: string, clienteId: string): Promise<Candidatura[]> {
  const r = await requisitar<{ itens: CandidaturaBackend[] }>(`/frentes/${frenteId}/candidaturas`);
  for (const c of r.itens) if (c.versao) versaoPorId.set(c.id, c.versao);
  return r.itens.map((c) => candidaturaDeBackend(c, clienteId));
}

/**
 * Carrega todas as candidaturas de um cliente: projetos do cliente → frentes →
 * candidaturas. Resolve o clienteId em cada uma. É o que o funil consome.
 */
export async function carregarDoCliente(clienteId: string): Promise<Candidatura[]> {
  const { itens: projetos } = await listarProjetos({ clienteId, porPagina: 100 });
  const frentesPorProjeto = await Promise.all(projetos.map((p) => listarFrentes(p.id)));
  const frentes = frentesPorProjeto.flat();
  const candidaturasPorFrente = await Promise.all(
    frentes.map((f) => listarCandidaturasDaFrente(f.id, clienteId)),
  );
  return candidaturasPorFrente.flat();
}

/** Carrega o histórico (movimentações) de uma candidatura. */
export async function carregarHistorico(candidaturaId: string): Promise<Candidatura['historico']> {
  const r = await requisitar<{ itens: MovimentacaoBackend[] }>(`/candidaturas/${candidaturaId}/movimentacoes`);
  // O backend devolve mais recente primeiro; a UI espera ordem cronológica.
  return r.itens.map(movimentacaoDeBackend).reverse();
}

/** Cria uma candidatura numa frente (RF025). Nasce "identificada". */
export async function criarCandidatura(
  frenteId: string,
  dados: { marcaId: string; interesseCliente?: Nivel; prioridade?: Prioridade },
  clienteId: string,
): Promise<Candidatura> {
  const criada = await requisitar<CandidaturaBackend>(`/frentes/${frenteId}/candidaturas`, {
    metodo: 'POST',
    corpo: paraCriarCandidatura(dados),
  });
  if (criada.versao) versaoPorId.set(criada.id, criada.versao);
  return candidaturaDeBackend(criada, clienteId);
}

/** Arquiva (exclusão lógica) uma candidatura. */
export async function arquivarCandidatura(candidaturaId: string): Promise<void> {
  await requisitarVazio(`/candidaturas/${candidaturaId}`, { metodo: 'DELETE' });
  versaoPorId.delete(candidaturaId);
}

/** Move a candidatura para um novo status, registrando o histórico (RF026). */
export async function movimentar(
  candidaturaId: string,
  novoStatus: StatusCandidatura,
  clienteId: string,
  justificativa?: string,
): Promise<Candidatura> {
  const atualizada = await requisitar<CandidaturaBackend>(`/candidaturas/${candidaturaId}/movimentacoes`, {
    metodo: 'POST',
    corpo: { status_codigo: novoStatus, justificativa: justificativa || undefined },
  });
  if (atualizada.versao) versaoPorId.set(atualizada.id, atualizada.versao);
  const historico = await carregarHistorico(candidaturaId);
  return candidaturaDeBackend(atualizada, clienteId, historico);
}

export type { Pagina };
