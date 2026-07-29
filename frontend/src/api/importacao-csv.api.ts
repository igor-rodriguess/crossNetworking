import { requisitar } from './client';

export type EntidadeCsv =
  | 'partes'
  | 'clientes'
  | 'projetos'
  | 'frentes'
  | 'candidaturas'
  | 'ativos'
  | 'canais'
  | 'perfis_estrategicos';
export type ConfiancaMapeamento = 'alta' | 'media' | 'baixa';

export interface CampoMapeadoCsv {
  campo_destino: string;
  coluna_origem: string;
  confianca: ConfiancaMapeamento;
}

export interface MapeamentoCsv {
  campos: CampoMapeadoCsv[];
  observacoes: string[];
}

export interface AnaliseCsv {
  execucao_id: string;
  origem: 'ollama' | 'openai' | 'deepseek' | 'mock';
  mapeamento: MapeamentoCsv;
}

export function analisarCsv(dados: {
  entidade: EntidadeCsv;
  cabecalhos: string[];
  amostra: Record<string, string>[];
}): Promise<AnaliseCsv> {
  return requisitar('/agentes/csv/mapeamento', { metodo: 'POST', corpo: dados });
}

export interface ResultadoImportacaoCsv {
  entidade: EntidadeCsv;
  total: number;
  criadas: { linha: number; id?: string }[];
  erros: { linha: number; mensagem?: string }[];
}

export interface PreviaFunilHistorico {
  execucao_id: string;
  cliente: string;
  projetos: number;
  frentes: number;
  marcas: number;
  candidaturas: number;
  avisos: string[];
  amostra: {
    linha: number;
    projeto: string;
    frente: string;
    marca: string;
    status_origem: string;
    status_plataforma: string;
  }[];
}

export interface ContagemFunilHistorico {
  criados: number;
  existentes: number;
}

export interface ResultadoFunilHistorico {
  cliente: { nome: string; criado: boolean };
  projetos: ContagemFunilHistorico;
  frentes: ContagemFunilHistorico;
  partes: ContagemFunilHistorico;
  candidaturas: ContagemFunilHistorico;
  total_linhas: number;
  erros: { linha: number; mensagem?: string }[];
  avisos: string[];
}

export function analisarFunilHistorico(dados: { conteudo: string }): Promise<PreviaFunilHistorico> {
  return requisitar('/agentes/csv/funil-historico/analisar', { metodo: 'POST', corpo: dados });
}

export function confirmarFunilHistorico(dados: { conteudo: string }): Promise<ResultadoFunilHistorico> {
  return requisitar('/agentes/csv/funil-historico/confirmar', { metodo: 'POST', corpo: dados });
}

export function confirmarImportacaoCsv(dados: {
  entidade: EntidadeCsv;
  cabecalhos: string[];
  linhas: Record<string, string>[];
  mapeamento: MapeamentoCsv;
}): Promise<ResultadoImportacaoCsv> {
  return requisitar('/agentes/csv/confirmar', { metodo: 'POST', corpo: dados });
}
