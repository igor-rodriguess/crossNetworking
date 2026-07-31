import type { StatusCandidatura } from '../types';

// Máquina de estados do funil de candidaturas. A UI só oferece transições
// válidas — evita pular etapas (ex.: "identificada" → "aprovada" sem análise),
// respeitando o fluxo do negócio (Crossability → Paper → validação → decisão).

// Encerramentos e pausa são alcançáveis de qualquer ponto da conversa: uma
// marca pode declinar ou entrar em stand-by a qualquer momento.
const SAIDAS: StatusCandidatura[] = ['stand_by', 'recusada_cliente', 'recusada_parceiro', 'encerrada'];

const TRANSICOES: Record<StatusCandidatura, StatusCandidatura[]> = {
  identificada: ['em_analise', 'abrir_frente', ...SAIDAS],
  em_analise: ['recomendada', 'validar_com_cliente', 'abrir_frente', ...SAIDAS],
  recomendada: ['apresentada', 'validar_com_cliente', 'em_analise', ...SAIDAS],
  apresentada: ['em_negociacao', 'aguardando_ok_cliente', ...SAIDAS],
  em_negociacao: ['aprovada', 'aguardando_parceiro', 'parceria_andamento', ...SAIDAS],
  aprovada: ['parceria_andamento', 'em_negociacao', 'encerrada'],

  // Fluxo operacional da planilha: abrir a frente, conduzir a conversa e
  // registrar de quem se está esperando resposta.
  abrir_frente: ['frente_aberta', 'validar_com_cliente', ...SAIDAS],
  frente_aberta: ['aguardando_parceiro', 'em_negociacao', 'validar_com_cliente', ...SAIDAS],
  aguardando_parceiro: ['em_negociacao', 'frente_aberta', 'aprovada', ...SAIDAS],
  validar_com_cliente: ['aguardando_ok_cliente', 'abrir_frente', 'frente_aberta', ...SAIDAS],
  aguardando_ok_cliente: ['abrir_frente', 'frente_aberta', 'em_negociacao', 'aprovada', ...SAIDAS],
  parceria_andamento: ['encerrada'],

  stand_by: ['em_analise', 'abrir_frente', 'frente_aberta', 'em_negociacao', 'encerrada'],
  recusada_cliente: ['em_analise', 'stand_by', 'encerrada'],
  recusada_parceiro: ['em_analise', 'stand_by', 'encerrada'],
  encerrada: ['identificada'], // reabertura
};

/** Estados para os quais uma candidatura pode ir a partir do estado atual (inclui o próprio). */
export function transicoesValidas(atual: StatusCandidatura): StatusCandidatura[] {
  return [atual, ...TRANSICOES[atual]];
}

export function podeTransicionar(de: StatusCandidatura, para: StatusCandidatura): boolean {
  return de === para || TRANSICOES[de].includes(para);
}
