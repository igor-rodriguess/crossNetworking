// Tradução entre a Candidatura do backend e o tipo de UI.
//
// No backend, a candidatura vive dentro de uma frente (candidatura_parceiro);
// o "cliente" não é um campo dela — deriva-se por frente → projeto → cliente.
// Quem chama informa o clienteId já resolvido. A "marca" da UI é a Parte
// candidata (parte_id/parte_nome). Status e níveis de interesse têm o MESMO
// vocabulário nos dois lados (identificada…, alto/medio/baixo/desconhecido).

import type {
  Candidatura,
  Movimentacao,
  Nivel,
  Prioridade,
  StatusCandidatura,
} from '../../types';

export interface CandidaturaBackend {
  id: string;
  frente_oportunidade_id: string;
  parte_id: string;
  parte_nome: string;
  interesse_cliente: string | null;
  interesse_parceiro: string | null;
  prioridade: string | null;
  disponibilidade_confirmada: boolean | null;
  status: string;
  data_entrada: string;
  data_saida: string | null;
  motivo_recusa: string | null;
  observacoes: string | null;
  versao?: string;
}

export interface MovimentacaoBackend {
  id: string;
  status_anterior: string | null;
  status_novo: string;
  data_movimentacao: string;
  responsavel_id: string | null;
  justificativa: string | null;
}

function nivel(codigo: string | null, padrao: Nivel | 'desconhecido'): Nivel | 'desconhecido' {
  if (codigo === 'alto' || codigo === 'medio' || codigo === 'baixo' || codigo === 'desconhecido') return codigo;
  return padrao;
}

function prioridade(codigo: string | null): Prioridade {
  return codigo === 'alta' || codigo === 'media' || codigo === 'baixa' ? codigo : 'media';
}

/** Converte a candidatura do backend no tipo de UI. `clienteId` é resolvido por quem chama. */
export function candidaturaDeBackend(
  c: CandidaturaBackend,
  clienteId: string,
  historico: Movimentacao[] = [],
): Candidatura {
  return {
    id: c.id,
    clienteId,
    frenteId: c.frente_oportunidade_id,
    marcaId: c.parte_id, // a "marca" candidata é a Parte
    status: c.status as StatusCandidatura,
    interesseCliente: nivel(c.interesse_cliente, 'medio') as Nivel,
    interesseParceiro: nivel(c.interesse_parceiro, 'desconhecido'),
    prioridade: prioridade(c.prioridade),
    dataEntrada: c.data_entrada?.slice(0, 10) ?? '',
    observacoes: c.observacoes ?? undefined,
    historico,
  };
}

export function movimentacaoDeBackend(m: MovimentacaoBackend): Movimentacao {
  return {
    data: m.data_movimentacao?.slice(0, 10) ?? '',
    de: (m.status_anterior as StatusCandidatura | null) ?? null,
    para: m.status_novo as StatusCandidatura,
    // O backend guarda só o id do responsável; a UI mostra um rótulo neutro.
    responsavel: m.responsavel_id ? 'Equipe Cross' : 'Sistema',
    justificativa: m.justificativa ?? undefined,
  };
}

/** Corpo de criação de candidatura para o backend. */
export function paraCriarCandidatura(dados: {
  marcaId: string;
  interesseCliente?: Nivel;
  prioridade?: Prioridade;
}): Record<string, unknown> {
  return {
    parte_id: dados.marcaId,
    interesse_cliente_codigo: dados.interesseCliente || undefined,
    prioridade_codigo: dados.prioridade || undefined,
  };
}
