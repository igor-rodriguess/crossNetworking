// API REST de Partes (RF004–RF008) — devolve os tipos de UI via mapper.
//
// A edição usa concorrência otimista: o backend exige If-Match com a `versao`
// (xmin) obtida no GET. A UI não carrega a versão no seu tipo `Parte`, então
// guardamos aqui um cache id→versao, preenchido a cada leitura e consumido no
// PATCH. É o suficiente para o fluxo "abrir → editar → salvar".

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import {
  contatoDeBackend,
  paraAtualizarParte,
  paraCriarContato,
  paraCriarParte,
  papelDeBackend,
  papelParaBackend,
  parteDeBackend,
  parteListaDeBackend,
  ativoDeBackend,
  type AssociacoesBackend,
  type AtivoBackend,
  type CanalBackend,
  type ContatoBackend,
  type PapelBackend,
  type ParteBackend,
  type ParteListaBackend,
  type PerfilEstrategicoBackend,
} from './mappers/partes.mapper';
import type { AtivoParte, ContatoParte, Parte } from '../types';

// Cache de versões (ETag) por Parte, para o PATCH otimista.
const versaoPorId = new Map<string, string>();

export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

export interface ListaPartes {
  itens: Parte[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

/** Lista/busca Partes paginadas (RF004/RF008). */
export async function listarPartes(opcoes: {
  busca?: string;
  tipo?: 'organizacao' | 'pessoa';
  pagina?: number;
  porPagina?: number;
} = {}): Promise<ListaPartes> {
  const pag: Pagina<ParteListaBackend> = await requisitarPagina('/partes', {
    query: {
      busca: opcoes.busca || undefined,
      tipo: opcoes.tipo,
      pagina: opcoes.pagina,
      por_pagina: opcoes.porPagina,
    },
  });
  return {
    itens: pag.itens.map(parteListaDeBackend),
    total: pag.total,
    pagina: pag.pagina,
    totalPaginas: pag.total_paginas,
  };
}

/** Obtém uma Parte completa, incluindo inteligência, ativos e canais. */
export async function obterParte(id: string): Promise<Parte> {
  const [detalhe, papeis, contatos, ativos, canais, perfis, associacoes] = await Promise.all([
    requisitar<ParteBackend>(`/partes/${id}`),
    requisitar<{ itens: PapelBackend[] }>(`/partes/${id}/papeis`).then((r) => r.itens),
    requisitar<{ itens: ContatoBackend[] }>(`/partes/${id}/contatos`).then((r) => r.itens),
    requisitar<{ itens: AtivoBackend[] }>(`/partes/${id}/ativos`).then((r) => r.itens),
    requisitar<{ itens: CanalBackend[] }>(`/partes/${id}/canais-midia`).then((r) => r.itens),
    requisitar<{ itens: PerfilEstrategicoBackend[] }>(`/partes/${id}/perfis-estrategicos`).then((r) => r.itens),
    requisitar<AssociacoesBackend>(`/partes/${id}/associacoes`),
  ]);
  versaoPorId.set(detalhe.id, detalhe.versao);
  return parteDeBackend(detalhe, papeis, contatos, { ativos, canais, perfis, associacoes });
}

/** Cria uma Parte (organização ou pessoa). */
export async function criarParte(dados: {
  tipo: 'organizacao' | 'pessoa';
  nome: string;
  categoria?: string;
}): Promise<Parte> {
  const criada = await requisitar<ParteBackend>('/partes', {
    metodo: 'POST',
    corpo: paraCriarParte(dados),
  });
  versaoPorId.set(criada.id, criada.versao);
  return parteDeBackend(criada);
}

/** Atualiza campos base da Parte com trava otimista (If-Match). */
export async function atualizarParte(
  id: string,
  tipo: 'organizacao' | 'pessoa',
  mudancas: { nome?: string; categoria?: string },
): Promise<Parte> {
  const versao = versaoPorId.get(id);
  const atualizada = await requisitar<ParteBackend>(`/partes/${id}`, {
    metodo: 'PATCH',
    corpo: paraAtualizarParte(mudancas, tipo),
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  versaoPorId.set(atualizada.id, atualizada.versao);
  return obterParte(id);
}

/** Arquiva (exclusão lógica) uma Parte. */
export async function arquivarParte(id: string): Promise<void> {
  await requisitarVazio(`/partes/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}

export interface DadosInteligenciaParte {
  resumo?: string;
  posicionamento?: string;
  objetivos?: string;
  desafios?: string;
  territorios: string[];
  publicos: string[];
  pracas: string[];
}

export interface SugestaoEnriquecimentoParte {
  execucao_id: string;
  origem_busca: 'duckduckgo' | 'mock';
  origem_extracao: 'firecrawl' | 'mock';
  origem_analise: 'ollama' | 'mock';
  sugestao: {
    categoria: string;
    resumo: string;
    posicionamento: string;
    objetivos: string;
    desafios: string;
    publicos: string[];
    territorios: string[];
    pracas: string[];
    ativos: string[];
    confianca: number;
  };
  fontes: Array<{ titulo: string; url: string; fonte: string; trecho: string }>;
}

/** Pesquisa fontes públicas e devolve uma sugestão; nunca altera a Parte sozinha. */
export function enriquecerParte(id: string): Promise<SugestaoEnriquecimentoParte> {
  return requisitar(`/agentes/partes/${id}/enriquecer`, { metodo: 'POST', corpo: { limite_fontes: 3 } });
}

function chave(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function codigoTerritorio(nome: string): string {
  return chave(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44) || `territorio-${Date.now()}`;
}

async function catalogo<T>(caminho: string): Promise<T[]> {
  return requisitar<{ itens: T[] }>(caminho).then((r) => r.itens);
}

/** Salva uma nova versão do perfil e substitui as associações estratégicas da Parte. */
export async function salvarInteligenciaParte(id: string, dados: DadosInteligenciaParte): Promise<Parte> {
  const perfil = await requisitar<{ id: string }>(`/partes/${id}/perfis-estrategicos`, {
    metodo: 'POST',
    corpo: {
      resumo: dados.resumo?.trim() || undefined,
      posicionamento: dados.posicionamento?.trim() || undefined,
      objetivos: dados.objetivos?.trim() || undefined,
      desafios: dados.desafios?.trim() || undefined,
    },
  });
  await requisitar(`/perfis-estrategicos/${perfil.id}/vigencia`, { metodo: 'POST' });

  const [atuais, territorios, publicos, pracas] = await Promise.all([
    requisitar<AssociacoesBackend>(`/partes/${id}/associacoes`),
    catalogo<{ id: string; nome: string }>('/territorios'),
    catalogo<{ id: string; nome: string }>('/publicos'),
    catalogo<{ id: string; nome: string; uf: string | null }>('/pracas'),
  ]);
  const desejados = {
    territorios: Array.from(new Set(dados.territorios.map((valor) => valor.trim()).filter(Boolean))),
    publicos: Array.from(new Set(dados.publicos.map((valor) => valor.trim()).filter(Boolean))),
    pracas: Array.from(new Set(dados.pracas.map((valor) => valor.trim()).filter(Boolean))),
  };

  const sincronizar = async <T extends { id: string; nome: string }>(
    atuaisDaParte: T[],
    itensCatalogo: T[],
    nomes: string[],
    criar: (nome: string) => Promise<T>,
    vincular: (item: T) => Promise<unknown>,
    desvincular: (item: T) => Promise<unknown>,
  ) => {
    const nomesDesejados = new Set(nomes.map(chave));
    await Promise.all(atuaisDaParte.filter((item) => !nomesDesejados.has(chave(item.nome))).map(desvincular));
    const ativosPorNome = new Set(atuaisDaParte.map((item) => chave(item.nome)));
    for (const nome of nomes) {
      if (ativosPorNome.has(chave(nome))) continue;
      let item = itensCatalogo.find((c) => chave(c.nome) === chave(nome));
      if (!item) item = await criar(nome);
      await vincular(item);
    }
  };

  await sincronizar(
    atuais.territorios,
    territorios,
    desejados.territorios,
    (nome) => requisitar('/territorios', { metodo: 'POST', corpo: { codigo: codigoTerritorio(nome), nome } }),
    (item) => requisitar(`/partes/${id}/territorios`, { metodo: 'POST', corpo: { territorio_id: item.id } }),
    (item) => requisitarVazio(`/partes/${id}/territorios/${(item as AssociacoesBackend['territorios'][number]).territorio_id}`, { metodo: 'DELETE' }),
  );
  await sincronizar(
    atuais.publicos,
    publicos,
    desejados.publicos,
    (nome) => requisitar('/publicos', { metodo: 'POST', corpo: { nome } }),
    (item) => requisitar(`/partes/${id}/publicos`, { metodo: 'POST', corpo: { publico_id: item.id } }),
    (item) => requisitarVazio(`/partes/${id}/publicos/${(item as AssociacoesBackend['publicos'][number]).publico_id}`, { metodo: 'DELETE' }),
  );
  await sincronizar(
    atuais.pracas,
    pracas,
    desejados.pracas,
    (nome) => {
      const [cidade, uf] = nome.split(/\s*[·-]\s*/).map((valor) => valor.trim());
      return requisitar('/pracas', { metodo: 'POST', corpo: { nome: cidade, uf: /^[A-Za-z]{2}$/.test(uf ?? '') ? uf.toUpperCase() : undefined } });
    },
    (item) => requisitar(`/partes/${id}/pracas`, { metodo: 'POST', corpo: { praca_id: item.id } }),
    (item) => requisitarVazio(`/partes/${id}/pracas/${(item as AssociacoesBackend['pracas'][number]).praca_id}`, { metodo: 'DELETE' }),
  );

  return obterParte(id);
}

// --- Contatos (RF007) -------------------------------------------------------

export async function adicionarContato(
  parteId: string,
  contato: { nome: string; cargo?: string; email?: string; principal?: boolean },
): Promise<ContatoParte> {
  const criado = await requisitar<ContatoBackend>(`/partes/${parteId}/contatos`, {
    metodo: 'POST',
    corpo: paraCriarContato(contato),
  });
  return contatoDeBackend(criado);
}

// --- Ativos (RF012) ---------------------------------------------------------

export async function adicionarAtivo(
  parteId: string,
  ativo: { nome: string; categoria?: string },
): Promise<AtivoParte> {
  const criado = await requisitar<AtivoBackend>(`/partes/${parteId}/ativos`, {
    metodo: 'POST',
    corpo: {
      nome: ativo.nome,
      categoria: ativo.categoria || undefined,
    },
  });
  return ativoDeBackend(criado);
}

// --- Papéis (RF006) ---------------------------------------------------------

export async function adicionarPapel(parteId: string, papelCodigo: string): Promise<void> {
  await requisitar(`/partes/${parteId}/papeis`, {
    metodo: 'POST',
    corpo: { papel_codigo: papelParaBackend(papelCodigo) },
  });
}

export { papelDeBackend, papelParaBackend };
