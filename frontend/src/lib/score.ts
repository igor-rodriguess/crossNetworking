import type { Avaliacao, Criterio, RespostaValor } from '../types';

// Regra determinística do Cross Score Card (RN023):
//   SIM          -> peso_sim
//   NAO          -> peso_nao
//   NAO_AVALIADO -> 0
// score_total = soma das pontuações + potencial disruptivo (1 a 5)
// Pesos vão de -10 a 10: negativos PENALIZAM o score (ex.: "concorrente do
// cliente" com peso -10 derruba a pontuação).

export function pontuacaoResposta(criterio: Criterio, valor: RespostaValor): number {
  if (valor === 'sim') return criterio.pesoSim;
  if (valor === 'nao') return criterio.pesoNao;
  return 0;
}

export interface ResumoScore {
  pontos: number;
  potencial: number;
  total: number;
  maximo: number;
  percentual: number; // 0..100
  respondidos: number;
  totalCriterios: number;
  completa: boolean;
}

export function calcularScore(criterios: Criterio[], avaliacao: Avaliacao | undefined): ResumoScore | null {
  if (!avaliacao) return null;
  const ativos = criterios.filter((c) => c.ativo);
  let pontos = 0;
  let respondidos = 0;
  for (const criterio of ativos) {
    const resposta = avaliacao.respostas[criterio.id];
    if (!resposta) continue;
    if (resposta.valor !== 'nao_avaliado') respondidos += 1;
    pontos += pontuacaoResposta(criterio, resposta.valor);
  }
  // Máximo possível: o melhor caso de cada critério (maior peso), sem contar
  // critérios cujo melhor caso é negativo — eles só podem penalizar. + potencial (máx 5).
  const maximo = ativos.reduce((soma, c) => soma + Math.max(0, c.pesoSim, c.pesoNao), 0) + 5;
  const total = pontos + avaliacao.potencialDisruptivo;
  // Percentual limitado a 0..100: com pesos negativos o total pode ficar abaixo de 0.
  const percentual = maximo > 0 ? Math.min(100, Math.max(0, Math.round((total / maximo) * 100))) : 0;
  return {
    pontos,
    potencial: avaliacao.potencialDisruptivo,
    total,
    maximo,
    percentual,
    respondidos,
    totalCriterios: ativos.length,
    completa: respondidos === ativos.length,
  };
}

export function classificarScore(percentual: number): { rotulo: string; tom: 'pos' | 'warn' | 'neutro' } {
  if (percentual >= 70) return { rotulo: 'Fit alto', tom: 'pos' };
  if (percentual >= 45) return { rotulo: 'Fit moderado', tom: 'warn' };
  return { rotulo: 'Fit baixo', tom: 'neutro' };
}
