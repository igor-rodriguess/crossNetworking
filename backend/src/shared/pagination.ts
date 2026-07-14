export interface Paginacao {
  pagina: number;
  porPagina: number;
  limit: number;
  offset: number;
}

/** Interpreta `?pagina=&por_pagina=` com limites seguros. */
export function parsePaginacao(query: Record<string, unknown>, maxPorPagina = 100): Paginacao {
  const pagina = Math.max(1, Math.trunc(Number(query.pagina)) || 1);
  const porPagina = Math.min(maxPorPagina, Math.max(1, Math.trunc(Number(query.por_pagina)) || 20));
  return { pagina, porPagina, limit: porPagina, offset: (pagina - 1) * porPagina };
}

/** Envelope padrão de listagem paginada. */
export function envelopePaginado<T>(itens: T[], total: number, p: Paginacao) {
  return {
    itens,
    pagina: p.pagina,
    por_pagina: p.porPagina,
    total,
    total_paginas: Math.max(1, Math.ceil(total / p.porPagina)),
  };
}
