// Tradução entre o contrato do backend e o tipo de UI `Parte`.
//
// Os contratos divergem por desenho: o backend guarda `nome_exibicao` +
// `especializacao` aninhada por tipo, com papéis e contatos em endpoints
// separados; a UI usa `nome`, `categoria` achatada e listas embutidas.
// Aqui mora essa ponte — nenhuma outra parte do front conhece o formato cru.

import type { AtivoParte, CanalMidia, ContatoParte, PapelParte, Parte } from '../../types';

// --- Formato cru do backend -------------------------------------------------

export interface EspecializacaoOrg {
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  segmento_principal: string | null;
  site: string | null;
}
export interface EspecializacaoPessoa {
  nome_completo: string | null;
  nome_artistico: string | null;
  cpf: string | null;
  nacionalidade: string | null;
}

export interface ParteBackend {
  id: string;
  tipo: 'organizacao' | 'pessoa';
  nome_exibicao: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  versao: string; // xmin — token de concorrência (ETag)
  especializacao: EspecializacaoOrg | EspecializacaoPessoa;
}

/** Item da listagem (mais enxuto que o detalhe). */
export interface ParteListaBackend {
  id: string;
  tipo: 'organizacao' | 'pessoa';
  nome_exibicao: string;
  status: string;
  criado_em: string;
}

export interface PapelBackend {
  id: string;
  papel_codigo: string;
  papel_nome: string;
  vigente_desde: string | null;
  vigente_ate: string | null;
}

export interface ContatoBackend {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
  observacoes: string | null;
  versao: string;
}

// --- Backend → Frontend -----------------------------------------------------

function ehOrg(e: ParteBackend['especializacao']): e is EspecializacaoOrg {
  return 'nome_fantasia' in e;
}

/** Deriva a "categoria" achatada que a UI mostra a partir da especialização. */
function categoriaDe(p: ParteBackend): string {
  if (ehOrg(p.especializacao)) return p.especializacao.segmento_principal ?? 'Organização';
  return p.especializacao.nacionalidade ?? 'Pessoa';
}

/**
 * Converte a Parte detalhada do backend no tipo de UI. Papéis e contatos vêm
 * de chamadas separadas (o backend os mantém em endpoints próprios); passe-os
 * quando já buscados, senão ficam vazios.
 */
export function parteDeBackend(
  p: ParteBackend,
  papeis: PapelBackend[] = [],
  contatos: ContatoBackend[] = [],
): Parte {
  return {
    id: p.id,
    tipo: p.tipo,
    nome: p.nome_exibicao,
    categoria: categoriaDe(p),
    // Campos que o core de Partes não guarda ainda (vivem em cross_intelligence
    // ou serão integrados em blocos futuros). Vazios por ora — não inventamos.
    territorio: '',
    publico: '',
    descricao: '',
    papeis: papeis.map(papelDeBackend),
    pracas: [],
    ativos: [],
    canais: [],
    contatos: contatos.map(contatoDeBackend),
    cadastradaEm: p.criado_em?.slice(0, 10) ?? '',
  };
}

/** Converte o item enxuto da listagem (sem papéis/contatos/especialização). */
export function parteListaDeBackend(p: ParteListaBackend): Parte {
  return {
    id: p.id,
    tipo: p.tipo,
    nome: p.nome_exibicao,
    categoria: p.tipo === 'organizacao' ? 'Organização' : 'Pessoa',
    territorio: '',
    publico: '',
    descricao: '',
    papeis: [],
    pracas: [],
    ativos: [],
    canais: [],
    contatos: [],
    cadastradaEm: p.criado_em?.slice(0, 10) ?? '',
  };
}

export function papelDeBackend(p: PapelBackend): PapelParte {
  // O código do papel no backend casa com o vocabulário do front (cliente,
  // parceiro, patrocinador, artista, atleta, veiculo_midia…). "parceiro" cobre
  // o "parceiro_potencial" da UI (o backend não distingue o estágio).
  return (p.papel_codigo === 'parceiro' ? 'parceiro' : p.papel_codigo) as PapelParte;
}

// Papéis que o front usa mas que no backend têm outro código (ou não existem).
// "parceiro_potencial" é um estágio da UI; no backend é apenas "parceiro".
const PAPEL_FRONT_PARA_BACK: Partial<Record<PapelParte, string>> = {
  parceiro_potencial: 'parceiro',
};

/** Traduz o papel da UI para o código aceito pelo backend. */
export function papelParaBackend(papel: string): string {
  return PAPEL_FRONT_PARA_BACK[papel as PapelParte] ?? papel;
}

export function contatoDeBackend(c: ContatoBackend): ContatoParte {
  return {
    nome: c.nome,
    cargo: c.cargo ?? '',
    email: c.email ?? '',
    principal: c.principal,
  };
}

// --- Frontend → Backend -----------------------------------------------------

/** Corpo de criação de Parte a partir dos dados que a UI coleta. */
export function paraCriarParte(dados: {
  tipo: 'organizacao' | 'pessoa';
  nome: string;
  categoria?: string;
}): Record<string, unknown> {
  if (dados.tipo === 'organizacao') {
    return {
      tipo: 'organizacao',
      nome_exibicao: dados.nome,
      organizacao: {
        nome_fantasia: dados.nome,
        segmento_principal: dados.categoria || undefined,
      },
    };
  }
  return {
    tipo: 'pessoa',
    nome_exibicao: dados.nome,
    pessoa: {
      nome_completo: dados.nome,
      nacionalidade: dados.categoria || undefined,
    },
  };
}

/** Corpo de atualização parcial (PATCH) da Parte. */
export function paraAtualizarParte(mudancas: { nome?: string; categoria?: string }, tipo: 'organizacao' | 'pessoa'): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  if (mudancas.nome !== undefined) corpo.nome_exibicao = mudancas.nome;
  if (mudancas.categoria !== undefined) {
    corpo[tipo === 'organizacao' ? 'organizacao' : 'pessoa'] =
      tipo === 'organizacao'
        ? { segmento_principal: mudancas.categoria }
        : { nacionalidade: mudancas.categoria };
  }
  return corpo;
}

/** Corpo de criação de contato. */
export function paraCriarContato(c: { nome: string; cargo?: string; email?: string; principal?: boolean }): Record<string, unknown> {
  return {
    nome: c.nome,
    cargo: c.cargo || undefined,
    email: c.email || undefined,
    principal: c.principal ?? undefined,
  };
}

// Ativos/canais ainda não têm origem no backend de Partes — exportados como
// no-op para a UI manter a forma até a integração desses sub-recursos.
export function ativoVazio(): AtivoParte {
  return { nome: '', tipo: '' };
}
export function canalVazio(): CanalMidia {
  return { canal: '', alcance: '' };
}
