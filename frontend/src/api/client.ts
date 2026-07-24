// Camada HTTP base — todo acesso à API passa por aqui.
//
// Responsabilidades:
//   • montar a URL a partir de VITE_API_URL;
//   • injetar `Authorization: Bearer <access_token>` quando há sessão;
//   • em 401, tentar renovar a sessão UMA vez (refresh) e repetir a requisição;
//   • traduzir qualquer falha no ErroApi (envelope PT-BR do backend);
//   • ler o envelope paginado `{itens,…}` das listagens.
//
// Não conhece React nem o store: a lógica de refresh é injetada por auth.ts
// via `configurarRefresh`, evitando dependência circular.

import { ErroApi, erroDaResposta, erroDeRede } from './erros';
import { obterAccessToken, obterSessao } from './sessao';

const BASE = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000/v1').replace(/\/+$/, '');

export interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corpo?: unknown;
  /** Cabeçalhos extras (ex.: If-Match com ETag na edição otimista). */
  cabecalhos?: Record<string, string>;
  /** Query string; valores nulos/indefinidos são omitidos. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Quando true, não injeta o Bearer nem tenta refresh (rotas de auth). */
  publico?: boolean;
}

// --- Refresh injetável (preenchido por auth.ts) -----------------------------

type FnRefresh = () => Promise<boolean>;
let executarRefresh: FnRefresh | null = null;

/** auth.ts registra aqui COMO renovar a sessão; retorna true se renovou. */
export function configurarRefresh(fn: FnRefresh): void {
  executarRefresh = fn;
}

// Deduplica refreshes concorrentes: se várias requisições tomam 401 ao mesmo
// tempo, todas aguardam o MESMO refresh em vez de disparar vários.
let refreshEmAndamento: Promise<boolean> | null = null;

function refreshUnico(): Promise<boolean> {
  if (!executarRefresh) return Promise.resolve(false);
  if (!refreshEmAndamento) {
    refreshEmAndamento = executarRefresh().finally(() => {
      refreshEmAndamento = null;
    });
  }
  return refreshEmAndamento;
}

// --- Requisição -------------------------------------------------------------

function montarUrl(caminho: string, query?: OpcoesRequisicao['query']): string {
  const url = new URL(`${BASE}${caminho.startsWith('/') ? '' : '/'}${caminho}`);
  if (query) {
    for (const [chave, valor] of Object.entries(query)) {
      if (valor !== null && valor !== undefined) url.searchParams.set(chave, String(valor));
    }
  }
  return url.toString();
}

async function disparar(caminho: string, opcoes: OpcoesRequisicao, comAuth: boolean): Promise<Response> {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos };
  const temCorpo = opcoes.corpo !== undefined;
  if (temCorpo && !cabecalhos['Content-Type']) cabecalhos['Content-Type'] = 'application/json';

  if (comAuth && !opcoes.publico) {
    const token = obterAccessToken();
    if (token) cabecalhos['Authorization'] = `Bearer ${token}`;
  }

  try {
    return await fetch(montarUrl(caminho, opcoes.query), {
      method: opcoes.metodo ?? (temCorpo ? 'POST' : 'GET'),
      headers: cabecalhos,
      body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch (causa) {
    throw erroDeRede(causa);
  }
}

/**
 * Requisição bruta: devolve a Response já validada (lança ErroApi se não-ok),
 * com refresh automático em 401. Use `requisitar`/`requisitarVazio` para o JSON.
 */
export async function requisitarResposta(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<Response> {
  let resposta = await disparar(caminho, opcoes, true);

  // 401 numa rota autenticada com sessão → tenta renovar 1x e repete.
  if (resposta.status === 401 && !opcoes.publico && obterSessao()) {
    const renovou = await refreshUnico();
    if (renovou) resposta = await disparar(caminho, opcoes, true);
  }

  if (!resposta.ok) throw await erroDaResposta(resposta);
  return resposta;
}

/** Requisição que retorna JSON tipado. */
export async function requisitar<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
  const resposta = await requisitarResposta(caminho, opcoes);
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

/** Requisição sem corpo de retorno relevante (ex.: logout 204, DELETE). */
export async function requisitarVazio(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<void> {
  await requisitarResposta(caminho, opcoes);
}

// --- Listagens paginadas ----------------------------------------------------

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

/** Busca uma página do envelope paginado do backend. */
export function requisitarPagina<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<Pagina<T>> {
  return requisitar<Pagina<T>>(caminho, opcoes);
}

export { ErroApi };
