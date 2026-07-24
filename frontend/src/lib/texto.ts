// Utilitários de texto compartilhados — antes duplicados em 4+ páginas.

/** Normaliza para busca: remove acentos e caixa (aproxima o índice trigram do backend). */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Iniciais para avatares (até 2 letras, maiúsculas). */
export function iniciais(nome: string): string {
  return nome
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
