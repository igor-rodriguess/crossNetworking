import type { StatusCandidatura } from '../types';

// Máquina de estados do funil de candidaturas. A UI só oferece transições
// válidas — evita pular etapas (ex.: "identificada" → "aprovada" sem análise),
// respeitando o fluxo do negócio (Crossability → Paper → validação → decisão).

const TRANSICOES: Record<StatusCandidatura, StatusCandidatura[]> = {
  identificada: ['em_analise', 'stand_by', 'encerrada'],
  em_analise: ['recomendada', 'stand_by', 'recusada_parceiro', 'encerrada'],
  recomendada: ['apresentada', 'em_analise', 'stand_by', 'encerrada'],
  apresentada: ['em_negociacao', 'recusada_cliente', 'stand_by', 'encerrada'],
  em_negociacao: ['aprovada', 'recusada_cliente', 'recusada_parceiro', 'stand_by', 'encerrada'],
  aprovada: ['em_negociacao', 'encerrada'],
  stand_by: ['em_analise', 'em_negociacao', 'encerrada'],
  recusada_cliente: ['em_analise', 'encerrada'],
  recusada_parceiro: ['em_analise', 'encerrada'],
  encerrada: ['identificada'], // reabertura
};

/** Estados para os quais uma candidatura pode ir a partir do estado atual (inclui o próprio). */
export function transicoesValidas(atual: StatusCandidatura): StatusCandidatura[] {
  return [atual, ...TRANSICOES[atual]];
}

export function podeTransicionar(de: StatusCandidatura, para: StatusCandidatura): boolean {
  return de === para || TRANSICOES[de].includes(para);
}
