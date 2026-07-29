import { requisitar } from './client';

export type OrigemRag = 'paper' | 'perfil_parte' | 'decisao' | 'coleta_web' | 'manual' | 'relatorio';

export interface IngestaoRag {
  inseridos: number;
  embedding_origem: 'openai' | 'mock';
}

export interface TrechoRag {
  id: string;
  origem: OrigemRag;
  conteudo: string;
  similaridade: number;
  metadados: unknown;
}

export interface BuscaRag {
  total: number;
  embedding_origem: 'openai' | 'mock';
  trechos: TrechoRag[];
}

export function ingerirRag(dados: {
  origem: OrigemRag;
  trechos: string[];
  metadados?: Record<string, unknown>;
}): Promise<IngestaoRag> {
  return requisitar('/agentes/rag/ingerir', { metodo: 'POST', corpo: dados });
}

export function buscarRag(consulta: string): Promise<BuscaRag> {
  return requisitar('/agentes/rag/buscar', { metodo: 'POST', corpo: { consulta, limite: 8 } });
}
