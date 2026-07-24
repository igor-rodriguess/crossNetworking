// Tradução entre o Cliente do backend e o tipo de UI `Cliente`.
//
// Descompasso: no backend, um Cliente é uma ESPECIALIZAÇÃO de uma Parte
// (cliente_cross.parte_id). O nome vem do join com a Parte (`parte_nome`);
// `segmento`, `modelo` e o nome do responsável não estão no registro de
// cliente. Derivamos o que dá e deixamos o resto para enriquecimento futuro.

import type { Cliente } from '../../types';

export interface ClienteBackend {
  id: string;
  parte_id: string;
  parte_nome: string;
  responsavel_conta_id: string | null;
  status: string;
  inicio_relacionamento: string | null;
  observacoes: string | null;
  criado_em: string;
  versao?: string; // ausente na listagem
}

/** Deriva uma sigla de até 3 letras a partir do nome (iniciais das palavras). */
export function siglaDe(nome: string): string {
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (iniciais || nome).slice(0, 3);
}

/**
 * Converte o Cliente do backend no tipo de UI. `segmento` e `responsavel`
 * podem ser enriquecidos por quem chama (buscando a Parte / o usuário); por
 * padrão ficam com um rótulo neutro em vez de um id cru.
 */
export function clienteDeBackend(
  c: ClienteBackend,
  extra?: { segmento?: string; responsavel?: string; modeloContratacao?: string },
): Cliente {
  return {
    id: c.id,
    nome: c.parte_nome,
    sigla: siglaDe(c.parte_nome),
    segmento: extra?.segmento ?? '—',
    modeloContratacao: extra?.modeloContratacao ?? 'A definir',
    responsavel: extra?.responsavel ?? '—',
    desde: (c.inicio_relacionamento ?? c.criado_em)?.slice(0, 10) ?? '',
  };
}
