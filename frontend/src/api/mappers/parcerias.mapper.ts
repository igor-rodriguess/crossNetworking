// Tradução entre a Parceria do backend e o tipo de UI.
//
// A parceria no backend é formalizada a partir de uma candidatura e carrega o
// vínculo cliente/parte. Fases, entregas, pendências e indicadores da UI não
// têm equivalente direto (o backend tem negociações/contrapartidas/contratos
// em endpoints próprios) — ficam vazios por ora, preenchidos client-side.

import type { Parceria, StatusParceria } from '../../types';

export interface ParceriaBackend {
  id: string;
  candidatura_parceiro_id: string | null;
  projeto_id: string;
  frente_oportunidade_id: string;
  cliente_cross_id: string;
  parte_parceira_id: string;
  parceiro: string; // nome_exibicao da parte parceira
  tipo: string | null;
  status: string;
  data_inicio: string | null;
  data_fim: string | null;
  condicoes_comerciais: string | null;
  criado_em: string;
  versao?: string;
}

const STATUS_BACK_PARA_FRONT: Record<string, StatusParceria> = {
  em_estruturacao: 'planejada',
  ativa: 'ativa',
  suspensa: 'ativa',
  encerrada: 'concluida',
  cancelada: 'concluida',
};

const STATUS_FRONT_PARA_BACK: Record<StatusParceria, string> = {
  planejada: 'em_estruturacao',
  ativa: 'ativa',
  concluida: 'encerrada',
};

export function statusParceriaParaBackend(s: StatusParceria): string {
  return STATUS_FRONT_PARA_BACK[s] ?? 'em_estruturacao';
}

export function parceriaDeBackend(p: ParceriaBackend): Parceria {
  return {
    id: p.id,
    clienteId: p.cliente_cross_id,
    marcaId: p.parte_parceira_id,
    candidaturaId: p.candidatura_parceiro_id ?? undefined,
    nome: p.condicoes_comerciais?.slice(0, 60) || `Parceria com ${p.parceiro}`,
    tipo: p.tipo ?? 'outro',
    status: STATUS_BACK_PARA_FRONT[p.status] ?? 'planejada',
    dataInicio: p.data_inicio?.slice(0, 10) ?? '',
    dataFim: p.data_fim?.slice(0, 10) ?? '',
    // Detalhes de execução vivem em outros endpoints / client-side.
    fases: [],
    entregas: [],
    reunioes: [],
    pendencias: [],
    indicadores: [],
    roi: [],
  };
}

/** Corpo para formalizar uma parceria a partir de uma candidatura (RF034). */
export function paraFormalizarParceria(dados: {
  tipo?: string;
  status?: StatusParceria;
  dataInicio?: string;
  dataFim?: string;
  condicoes?: string;
}): Record<string, unknown> {
  return {
    tipo_parceria_codigo: dados.tipo || undefined,
    status_parceria_codigo: dados.status ? statusParceriaParaBackend(dados.status) : undefined,
    data_inicio: dados.dataInicio || undefined,
    data_fim: dados.dataFim || undefined,
    condicoes_comerciais: dados.condicoes || undefined,
  };
}

/** Corpo de atualização parcial da parceria. */
export function paraAtualizarParceria(mudancas: {
  status?: StatusParceria;
  dataInicio?: string;
  dataFim?: string;
  nome?: string;
  tipo?: string;
}): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  if (mudancas.status) corpo.status_parceria_codigo = statusParceriaParaBackend(mudancas.status);
  if (mudancas.dataInicio) corpo.data_inicio = mudancas.dataInicio;
  if (mudancas.dataFim) corpo.data_fim = mudancas.dataFim;
  if (mudancas.tipo) corpo.tipo_parceria_codigo = mudancas.tipo;
  if (mudancas.nome) corpo.condicoes_comerciais = mudancas.nome;
  return corpo;
}
