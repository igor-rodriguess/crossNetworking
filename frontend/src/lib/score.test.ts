import { describe, expect, it } from 'vitest';
import { calcularScore, classificarScore, pontuacaoResposta } from './score';
import type { Avaliacao, Criterio } from '../types';

// O Cross Score Card (RN023) é a regra de negócio mais sensível da plataforma:
// é o número que sustenta a recomendação levada ao cliente. O cálculo nunca é
// digitado à mão — vem daqui, do backend e da trigger do banco. Estes testes
// fixam o contrato dessa primeira camada.

function criterio(over: Partial<Criterio> = {}): Criterio {
  return {
    id: 'c1',
    clienteId: 'cli',
    nome: 'Critério',
    descricao: '',
    pesoSim: 10,
    pesoNao: 0,
    ordem: 1,
    obrigatorio: false,
    ativo: true,
    ...over,
  };
}

function avaliacao(respostas: Avaliacao['respostas'], potencial = 1): Avaliacao {
  return {
    candidaturaId: 'cand',
    respostas,
    potencialDisruptivo: potencial,
    responsavel: 'teste',
    atualizadoEm: '2026-07-31T00:00:00.000Z',
  };
}

describe('pontuacaoResposta', () => {
  it('usa peso_sim no SIM e peso_nao no NAO', () => {
    const c = criterio({ pesoSim: 15, pesoNao: 4 });
    expect(pontuacaoResposta(c, 'sim')).toBe(15);
    expect(pontuacaoResposta(c, 'nao')).toBe(4);
  });

  it('zera quando não avaliado', () => {
    expect(pontuacaoResposta(criterio({ pesoSim: 15 }), 'nao_avaliado')).toBe(0);
  });

  it('preserva peso negativo — a penalidade é intencional', () => {
    // "Concorrente do cliente" com peso negativo precisa derrubar o score.
    expect(pontuacaoResposta(criterio({ pesoSim: -10 }), 'sim')).toBe(-10);
  });
});

describe('calcularScore', () => {
  it('devolve null sem avaliação — ausência não é zero', () => {
    expect(calcularScore([criterio()], undefined)).toBeNull();
  });

  it('soma pontuações e acrescenta o potencial disruptivo', () => {
    const criterios = [
      criterio({ id: 'a', pesoSim: 10 }),
      criterio({ id: 'b', pesoSim: 20 }),
    ];
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' }, b: { valor: 'sim' } }, 3));
    expect(r?.pontos).toBe(30);
    expect(r?.potencial).toBe(3);
    expect(r?.total).toBe(33);
  });

  it('ignora critérios inativos no cálculo e no máximo', () => {
    const criterios = [
      criterio({ id: 'a', pesoSim: 10 }),
      criterio({ id: 'b', pesoSim: 90, ativo: false }),
    ];
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' }, b: { valor: 'sim' } }));
    expect(r?.pontos).toBe(10);
    expect(r?.totalCriterios).toBe(1);
  });

  it('não conta "não avaliado" como respondido', () => {
    const criterios = [criterio({ id: 'a' }), criterio({ id: 'b' })];
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' }, b: { valor: 'nao_avaliado' } }));
    expect(r?.respondidos).toBe(1);
    expect(r?.completa).toBe(false);
  });

  it('exclui do máximo o critério cujo melhor caso é negativo', () => {
    // Um critério que só penaliza não pode inflar o teto e diluir o percentual.
    const criterios = [
      criterio({ id: 'a', pesoSim: 10, pesoNao: 0 }),
      criterio({ id: 'b', pesoSim: -10, pesoNao: -5 }),
    ];
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' } }));
    expect(r?.maximo).toBe(15); // 10 do primeiro + 5 do potencial; o segundo não soma
  });

  it('limita o percentual a 0 quando o total fica negativo', () => {
    const criterios = [criterio({ id: 'a', pesoSim: -50 })];
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' } }, 1));
    expect(r?.total).toBe(-49);
    expect(r?.percentual).toBe(0);
  });

  it('limita o percentual a 100', () => {
    const criterios = [criterio({ id: 'a', pesoSim: 10, pesoNao: 0 })];
    // Potencial máximo com todos os pontos: não pode passar de 100%.
    const r = calcularScore(criterios, avaliacao({ a: { valor: 'sim' } }, 5));
    expect(r?.percentual).toBeLessThanOrEqual(100);
  });
});

describe('classificarScore', () => {
  it('aplica as faixas de fit', () => {
    expect(classificarScore(70).rotulo).toBe('Fit alto');
    expect(classificarScore(69).rotulo).toBe('Fit moderado');
    expect(classificarScore(45).rotulo).toBe('Fit moderado');
    expect(classificarScore(44).rotulo).toBe('Fit baixo');
  });
});
