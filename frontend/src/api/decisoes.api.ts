// API de Decisões de candidatura (RF033) — a camada de persistência do bloco
// de Metodologias (modelo híbrido).
//
// A metodologia rica (Score Card com pesos −10..10, análise triádica) roda
// client-side; o que persiste no backend é a DECISÃO da candidatura — o dado
// de auditoria/histórico que interessa. A decisão é derivada do status terminal
// que a candidatura assume no funil, sem UI nova: mover para "aprovada",
// "recusada_*", "stand_by"… registra a decisão equivalente.

import { requisitar } from './client';
import type { StatusCandidatura } from '../types';

// Requer persona coordenador/administrador no backend.
const decisaoRequer = new Set(['coordenador', 'administrador']);
export function podeDecidir(persona: string | null | undefined): boolean {
  return !!persona && decisaoRequer.has(persona);
}

// Status do funil → código de tipo_decisao do backend. Só os status que
// representam uma DECISÃO efetiva registram; os demais retornam null (no-op).
const STATUS_PARA_DECISAO: Partial<Record<StatusCandidatura, string>> = {
  recomendada: 'priorizada',
  aprovada: 'aprovada',
  recusada_cliente: 'rejeitada_cliente',
  recusada_parceiro: 'recusada_parceiro',
  stand_by: 'stand_by',
  em_negociacao: 'em_negociacao',
  encerrada: 'encerrada',
};

export function decisaoDoStatus(status: StatusCandidatura): string | null {
  return STATUS_PARA_DECISAO[status] ?? null;
}

export interface DecisaoBackend {
  id: string;
  candidatura_parceiro_id: string;
  tipo: string;
  justificativa: string | null;
  responsavel_id: string | null;
  data_decisao: string;
}

/** Registra uma decisão para a candidatura (RF033). */
export async function registrarDecisao(
  candidaturaId: string,
  tipoDecisaoCodigo: string,
  justificativa?: string,
): Promise<DecisaoBackend> {
  return requisitar<DecisaoBackend>(`/candidaturas/${candidaturaId}/decisoes`, {
    metodo: 'POST',
    corpo: { tipo_decisao_codigo: tipoDecisaoCodigo, justificativa: justificativa || undefined },
  });
}

/** Lista o histórico de decisões da candidatura. */
export async function listarDecisoes(candidaturaId: string): Promise<DecisaoBackend[]> {
  const r = await requisitar<{ itens: DecisaoBackend[] }>(`/candidaturas/${candidaturaId}/decisoes`);
  return r.itens;
}

/**
 * Registra a decisão correspondente a um status terminal, se houver e se o
 * usuário tiver permissão. Best-effort: nunca quebra o fluxo do funil — a
 * movimentação de status é o gesto principal; a decisão é o registro paralelo.
 */
export async function registrarDecisaoDoStatus(
  candidaturaId: string,
  status: StatusCandidatura,
  persona: string | null | undefined,
  justificativa?: string,
): Promise<void> {
  const tipo = decisaoDoStatus(status);
  if (!tipo || !podeDecidir(persona)) return;
  try {
    await registrarDecisao(candidaturaId, tipo, justificativa);
  } catch {
    // Silencioso: a decisão é um registro de auditoria paralelo; se falhar
    // (permissão, rede), a movimentação de status já aconteceu e vale.
  }
}
