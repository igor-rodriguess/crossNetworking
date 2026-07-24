import type { AnaliseCrossability, AnaliseTriade, DimensaoCross, ItemCross, NivelCompat, PerfilDimensoes } from '../types';

// ─── Complementaridade Crossability ──────────────────────────────────────────
//
// Leitura central do negócio: uma empresa busca parceria para PREENCHER UMA
// LACUNA. Ex.: o cliente quer atingir um público jovem que hoje não alcança —
// o parceiro ideal é forte justamente onde o cliente é fraco.
//
// Por dimensão comparamos a FORÇA DO CLIENTE (o que ele já tem) com a FORÇA DO
// PARCEIRO (o que ele oferece). Onde o parceiro supera o cliente, a parceria
// preenche uma lacuna — e é aí que está o valor.

export const DIMENSOES_COMPLEMENTO: (keyof PerfilDimensoes)[] = [
  'publicos',
  'territorios',
  'ativos',
  'sinergias',
  'fit',
  'momento',
];

export const NIVEL_NUM: Record<NivelCompat, number> = { alta: 3, media: 2, baixa: 1 };

/** Diferença parceiro − cliente numa dimensão (>0 = o parceiro preenche uma lacuna). */
export function lacunaDimensao(cliente: NivelCompat, parceiro: NivelCompat): number {
  return NIVEL_NUM[parceiro] - NIVEL_NUM[cliente];
}

/**
 * Deriva um ponto de partida para as forças quando a análise ainda não tem.
 * - Parceiro: usa a própria compatibilidade da análise (alta compat. no eixo →
 *   o parceiro é forte ali). É o melhor sinal que já temos.
 * - Cliente: parte de "média" — a lacuna real quem sabe é o estrategista, que
 *   ajusta pelos seletores. Ponto de partida neutro evita sugerir lacuna falsa.
 */
export function derivarForcas(analise: AnaliseCrossability): {
  cliente: PerfilDimensoes;
  parceiro: PerfilDimensoes;
} {
  const parceiro = {} as PerfilDimensoes;
  const cliente = {} as PerfilDimensoes;
  for (const dim of DIMENSOES_COMPLEMENTO) {
    parceiro[dim] = analise[dim];
    cliente[dim] = 'media';
  }
  return { cliente, parceiro };
}

/** Retorna as forças da análise, derivando o padrão quando ainda não existem. */
export function forcasDaAnalise(analise: AnaliseCrossability): {
  cliente: PerfilDimensoes;
  parceiro: PerfilDimensoes;
} {
  const padrao = derivarForcas(analise);
  return {
    cliente: analise.forcaCliente ?? padrao.cliente,
    parceiro: analise.forcaParceiro ?? padrao.parceiro,
  };
}

/** Lista das dimensões em que o parceiro preenche uma lacuna do cliente. */
export function lacunasPreenchidas(
  cliente: PerfilDimensoes,
  parceiro: PerfilDimensoes,
): (keyof PerfilDimensoes)[] {
  return DIMENSOES_COMPLEMENTO.filter((dim) => lacunaDimensao(cliente[dim], parceiro[dim]) > 0);
}

// ─── Ponte com a análise triádica (Objetivos · Ativos · Consumidores) ────────
// Deriva, das análises item a item, a "força" de cada lado por dimensão — para
// que o gráfico reflita a metodologia fiel, não as 6 dimensões genéricas.

export const DIMENSOES_TRIADE: DimensaoCross[] = ['objetivos', 'ativos', 'consumidores'];

export const ROTULO_TRIADE: Record<DimensaoCross, string> = {
  objetivos: 'Objetivos',
  ativos: 'Ativos',
  consumidores: 'Consumidores',
};

// Força de um lado numa dimensão = proporção dos seus itens que contribuem
// (veredito casa/complementa) → mapeada em alta/media/baixa.
function forcaLado(itens: ItemCross[], origem: 'cliente' | 'parceiro'): NivelCompat {
  const doLado = itens.filter((it) => it.origem === origem);
  if (doLado.length === 0) return 'baixa';
  const favoraveis = doLado.filter((it) => it.veredito === 'casa' || it.veredito === 'complementa').length;
  const razao = favoraveis / doLado.length;
  if (razao >= 0.66) return 'alta';
  if (razao >= 0.33) return 'media';
  return 'baixa';
}

/** Força de cliente e parceiro nas 3 dimensões, derivada da análise triádica. */
export function forcasDaTriade(analise: AnaliseTriade): {
  cliente: Record<DimensaoCross, NivelCompat>;
  parceiro: Record<DimensaoCross, NivelCompat>;
} {
  const cliente = {} as Record<DimensaoCross, NivelCompat>;
  const parceiro = {} as Record<DimensaoCross, NivelCompat>;
  for (const dim of DIMENSOES_TRIADE) {
    cliente[dim] = forcaLado(analise[dim], 'cliente');
    parceiro[dim] = forcaLado(analise[dim], 'parceiro');
  }
  return { cliente, parceiro };
}
