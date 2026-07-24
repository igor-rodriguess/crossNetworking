// Tradução entre Projeto/Frente do backend e os tipos de UI.
//
// O Projeto do backend guarda os campos base; briefings, planejamento,
// responsáveis e a "fase atual" derivada vivem em sub-endpoints ou não existem
// no core. O mapper preenche a forma da UI com o que há e defaults honestos
// para o resto (não inventamos conteúdo).

import type { FaseProjeto, Frente, OrigemDemanda, Projeto, StatusFrente, StatusProjeto } from '../../types';

export interface ProjetoBackend {
  id: string;
  cliente_cross_id: string;
  contrato_cliente_id: string | null;
  nome: string;
  descricao: string | null;
  objetivo: string;
  produto: string | null;
  data_inicio: string | null;
  data_previsao_fim: string | null;
  data_fim_real: string | null;
  status: string;
  prioridade: string | null;
  criado_em: string;
  versao?: string;
}

export interface FrenteBackend {
  id: string;
  projeto_id: string;
  territorio_id: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  objetivo: string;
  data_abertura: string;
  data_encerramento: string | null;
  status: string;
  criado_em: string;
  versao?: string;
}

// O backend tem mais estados que a UI; colapsamos para os 3 que a UI conhece.
const STATUS_PROJETO_BACK_PARA_FRONT: Record<string, StatusProjeto> = {
  rascunho: 'planejamento',
  planejamento: 'planejamento',
  em_andamento: 'em_andamento',
  em_validacao: 'em_andamento',
  suspenso: 'em_andamento',
  concluido: 'concluido',
  cancelado: 'concluido',
  arquivado: 'concluido',
};

// Estado da UI → código do backend (para criação/edição).
const STATUS_PROJETO_FRONT_PARA_BACK: Record<StatusProjeto, string> = {
  planejamento: 'planejamento',
  em_andamento: 'em_andamento',
  concluido: 'concluido',
};

const STATUS_FRENTE_BACK_PARA_FRONT: Record<string, StatusFrente> = {
  aberta: 'aberta',
  reaberta: 'aberta',
  em_andamento: 'em_andamento',
  suspensa: 'em_andamento',
  encerrada: 'encerrada',
};

export function statusProjetoParaBackend(s: StatusProjeto): string {
  return STATUS_PROJETO_FRONT_PARA_BACK[s] ?? 'planejamento';
}

export function projetoDeBackend(p: ProjetoBackend): Projeto {
  return {
    id: p.id,
    clienteId: p.cliente_cross_id,
    nome: p.nome,
    objetivo: p.objetivo,
    produto: p.produto ?? '',
    // "origem" não existe como campo simples (vive em origens-demanda); a UI só
    // distingue dois valores — assumimos o mais comum como padrão.
    origem: 'briefing_cliente' as OrigemDemanda,
    status: STATUS_PROJETO_BACK_PARA_FRONT[p.status] ?? 'planejamento',
    // A "fase atual" do ciclo é derivada de metodologias/execução — módulos que
    // ainda serão integrados. Começa em briefing até termos o sinal real.
    faseAtual: 'briefing' as FaseProjeto,
    dataInicio: (p.data_inicio ?? p.criado_em)?.slice(0, 10) ?? '',
    atualizadoEm: (p.criado_em ?? '')?.slice(0, 10),
    prazoEstimado: p.data_previsao_fim?.slice(0, 10) ?? 'A definir',
    responsaveis: [], // vêm de /responsaveis (sub-endpoint) — vazio por ora
    briefings: [],
    planejamento: { diagnostico: p.descricao ?? '', territorios: [], oportunidades: '' },
  };
}

/** Corpo de criação de projeto para o backend. */
export function paraCriarProjeto(dados: {
  clienteId: string;
  nome: string;
  objetivo: string;
  produto?: string;
  status?: StatusProjeto;
}): Record<string, unknown> {
  return {
    cliente_cross_id: dados.clienteId,
    nome: dados.nome,
    objetivo: dados.objetivo,
    produto: dados.produto || undefined,
    status_projeto_codigo: dados.status ? statusProjetoParaBackend(dados.status) : 'planejamento',
  };
}

export function frenteDeBackend(f: FrenteBackend): Frente {
  return {
    id: f.id,
    projetoId: f.projeto_id,
    nome: f.nome,
    // territorio_id é um UUID; sem o nome resolvido, usamos a categoria como
    // rótulo aproximado (é o que a UI mostra na coluna "território").
    territorio: f.categoria ?? '',
    objetivo: f.objetivo,
    status: STATUS_FRENTE_BACK_PARA_FRONT[f.status] ?? 'aberta',
  };
}

/** Corpo de criação de frente. */
export function paraCriarFrente(dados: { nome: string; objetivo: string; categoria?: string }): Record<string, unknown> {
  return {
    nome: dados.nome,
    objetivo: dados.objetivo,
    categoria: dados.categoria || undefined,
  };
}
