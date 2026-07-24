import type { FaseProjeto, Nivel, Prioridade, StatusCandidatura, StatusParceria } from '../types';

// A demo é "congelada" em 15/07/2026 para que prazos e cronograma
// façam sentido em qualquer data de apresentação.
export const HOJE = new Date('2026-07-15T12:00:00');

export function formatarData(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarDataCurta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatarMoedaCompacta(valor: number): string {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (valor >= 1_000) return `R$ ${Math.round(valor / 1_000)}k`;
  return formatarMoeda(valor);
}

// Ciclo do projeto — ordem oficial das fases (README / fluxo operacional do WAD)
export const FASES_PROJETO: { id: FaseProjeto; rotulo: string }[] = [
  { id: 'briefing', rotulo: 'Briefing' },
  { id: 'planejamento', rotulo: 'Planejamento' },
  { id: 'crossability', rotulo: 'Crossability' },
  { id: 'paper', rotulo: 'Plano tático' },
  { id: 'score_card', rotulo: 'Score Card' },
  { id: 'implementacao', rotulo: 'Implementação' },
  { id: 'acompanhamento', rotulo: 'Acompanhamento' },
];

export function indiceFase(fase: FaseProjeto): number {
  return FASES_PROJETO.findIndex((f) => f.id === fase);
}

export function diasDesde(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  return Math.max(0, Math.round((HOJE.getTime() - d.getTime()) / 86_400_000));
}

export const STATUS_CANDIDATURA: Record<StatusCandidatura, { rotulo: string; tom: 'neutro' | 'info' | 'pos' | 'warn' | 'neg' }> = {
  identificada: { rotulo: 'Identificada', tom: 'neutro' },
  em_analise: { rotulo: 'Em análise', tom: 'info' },
  recomendada: { rotulo: 'Recomendada', tom: 'info' },
  apresentada: { rotulo: 'Apresentada', tom: 'info' },
  em_negociacao: { rotulo: 'Em negociação', tom: 'warn' },
  aprovada: { rotulo: 'Aprovada', tom: 'pos' },
  stand_by: { rotulo: 'Stand-by', tom: 'neutro' },
  recusada_cliente: { rotulo: 'Recusada pelo cliente', tom: 'neg' },
  recusada_parceiro: { rotulo: 'Recusada pelo parceiro', tom: 'neg' },
  encerrada: { rotulo: 'Encerrada', tom: 'neutro' },
};

export const STATUS_PARCERIA: Record<StatusParceria, string> = {
  planejada: 'Planejada',
  ativa: 'Ativa',
  concluida: 'Concluída',
};

export const NIVEL: Record<Nivel | 'desconhecido', string> = {
  alto: 'Alto',
  medio: 'Médio',
  baixo: 'Baixo',
  desconhecido: 'Não sondado',
};

export const PRIORIDADE: Record<Prioridade, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};
