import type { Candidatura, Paper, StatusCandidatura } from '../types';

// ─── Etapa da metodologia por candidatura ────────────────────────────────────
//
// A tela da candidatura tem duas etapas metodológicas — Análise Crossability e
// Cross Score Card — que seguem o fluxo oficial:
//
//     Crossability → Paper → Validação do Paper → Score Card
//
// Esta lib é a ÚNICA fonte de verdade sobre qual etapa está liberada e por quê.
// Ela deriva a etapa do estado real da candidatura (status no funil + Paper
// validado), em vez de deixar isso como um estado de UI solto. Assim a aba
// abre sozinha na etapa certa e a etapa ainda não alcançada fica travada com
// um motivo — sem regra duplicada espalhada pelas telas.

export type EtapaCandidatura = 'crossability' | 'scorecard';

// Ordem oficial do funil (espelha lib/funil.ts e STATUS_CANDIDATURA).
// Usada só para responder "a candidatura já passou da análise?".
const ORDEM_STATUS: StatusCandidatura[] = [
  'identificada',
  'em_analise',
  'recomendada',
  'apresentada',
  'em_negociacao',
  'aprovada',
];

/** A candidatura já saiu da fase de análise (chegou a "recomendada" ou além)? */
function passouDaAnalise(status: StatusCandidatura): boolean {
  const i = ORDEM_STATUS.indexOf(status);
  const iRecomendada = ORDEM_STATUS.indexOf('recomendada');
  // Status fora do fluxo linear (stand_by, recusadas, encerrada) não são "avanço".
  return i >= 0 && i >= iRecomendada;
}

/** O Paper da frente foi validado pelo cliente? (RN022) */
export function paperValidadoPeloCliente(paper: Paper | undefined): boolean {
  return paper?.validacoes.some((v) => v.tipo === 'cliente' && v.status === 'aprovada') ?? false;
}

export interface EtapaLiberada {
  /** A etapa está acessível? */
  liberada: boolean;
  /** Se bloqueada, o motivo em linguagem de negócio (para tooltip/aviso). */
  motivo?: string;
}

export interface StatusEtapas {
  crossability: EtapaLiberada;
  scorecard: EtapaLiberada;
  /** Etapa mais avançada que está liberada — é onde a tela deve abrir. */
  etapaInicial: EtapaCandidatura;
}

/**
 * Decide, a partir do estado real da candidatura, quais etapas estão liberadas.
 *
 * - Crossability: sempre liberada (é a primeira etapa do fluxo).
 * - Score Card: só libera quando o Paper da frente foi validado pelo cliente
 *   (RN022) E a candidatura já passou da análise (recomendada em diante).
 */
// TEMPORÁRIO (apresentação): Score Card sempre liberado, sem o gate da metodologia.
// Voltar para `false` reativa a regra completa (Paper validado + funil ≥ Recomendada).
const DESTRAVAR_SCORE_CARD = true;

export function etapasDaCandidatura(candidatura: Candidatura, paper: Paper | undefined): StatusEtapas {
  const paperOk = paperValidadoPeloCliente(paper);
  const avancou = passouDaAnalise(candidatura.status);

  let scorecard: EtapaLiberada;
  if (DESTRAVAR_SCORE_CARD || (paperOk && avancou)) {
    scorecard = { liberada: true };
  } else if (!paper) {
    scorecard = { liberada: false, motivo: 'A frente ainda não tem Plano tático — crie e valide o Plano tático antes do Score Card.' };
  } else if (!paperOk) {
    scorecard = { liberada: false, motivo: 'O Plano tático ainda não foi validado pelo cliente (RN022).' };
  } else {
    // Paper validado, mas a candidatura ainda não avançou no funil.
    scorecard = { liberada: false, motivo: 'A candidatura precisa avançar no funil até "Recomendada" para liberar o Score Card.' };
  }

  return {
    crossability: { liberada: true },
    scorecard,
    // Abre na etapa mais avançada que estiver liberada.
    etapaInicial: scorecard.liberada ? 'scorecard' : 'crossability',
  };
}
