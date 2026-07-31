import { describe, expect, it } from 'vitest';
import { podeTransicionar, transicoesValidas } from './funil';
import { RESPONSAVEL_ACAO, STATUS_CANDIDATURA } from './format';
import type { StatusCandidatura } from '../types';

// A máquina de estados do funil governa o que a interface oferece ao usuário.
// Depois da migration 050 ela ganhou os status operacionais da planilha da
// Cross, e um mapa incompleto quebraria a tela de Mapeamento em runtime — daí
// os testes de completude abaixo.

const TODOS: StatusCandidatura[] = [
  'identificada', 'em_analise', 'recomendada', 'apresentada', 'em_negociacao',
  'aprovada', 'stand_by', 'recusada_cliente', 'recusada_parceiro', 'encerrada',
  'abrir_frente', 'frente_aberta', 'aguardando_parceiro', 'validar_com_cliente',
  'aguardando_ok_cliente', 'parceria_andamento',
];

describe('completude dos mapas de status', () => {
  it('todo status tem rótulo e tom', () => {
    for (const s of TODOS) {
      expect(STATUS_CANDIDATURA[s], `status sem rótulo: ${s}`).toBeDefined();
      expect(STATUS_CANDIDATURA[s].rotulo.length).toBeGreaterThan(0);
    }
  });

  it('todo status declara de quem é a próxima ação', () => {
    for (const s of TODOS) {
      expect(RESPONSAVEL_ACAO[s], `status sem responsável: ${s}`).toBeDefined();
    }
  });

  it('todo status tem transições declaradas', () => {
    // Um status ausente do mapa faria transicoesValidas() estourar ao ser
    // aberto na tela — exatamente o tipo de erro que o typecheck não pega.
    for (const s of TODOS) {
      expect(() => transicoesValidas(s), `sem transições: ${s}`).not.toThrow();
      expect(transicoesValidas(s).length).toBeGreaterThan(0);
    }
  });
});

describe('transicoesValidas', () => {
  it('inclui sempre o próprio status, para o seletor renderizar o valor atual', () => {
    for (const s of TODOS) {
      expect(transicoesValidas(s)).toContain(s);
    }
  });

  it('permite pausar ou encerrar a partir de qualquer etapa ativa', () => {
    // A conversa pode morrer a qualquer momento: a marca declina, o cliente
    // desiste. Não oferecer a saída obrigaria o usuário a mentir o status.
    for (const s of ['identificada', 'em_analise', 'frente_aberta', 'aguardando_parceiro'] as StatusCandidatura[]) {
      expect(transicoesValidas(s)).toContain('stand_by');
      expect(transicoesValidas(s)).toContain('encerrada');
    }
  });

  it('permite reabrir uma candidatura encerrada', () => {
    expect(transicoesValidas('encerrada')).toContain('identificada');
  });
});

describe('podeTransicionar', () => {
  it('aceita permanecer no mesmo status', () => {
    expect(podeTransicionar('em_analise', 'em_analise')).toBe(true);
  });

  it('recusa salto que pula a conversa comercial', () => {
    // "Identificada" direto para "aprovada" ignoraria análise e negociação.
    expect(podeTransicionar('identificada', 'aprovada')).toBe(false);
  });

  it('aceita o caminho da planilha: abrir frente e aguardar o parceiro', () => {
    expect(podeTransicionar('abrir_frente', 'frente_aberta')).toBe(true);
    expect(podeTransicionar('frente_aberta', 'aguardando_parceiro')).toBe(true);
  });
});

describe('RESPONSAVEL_ACAO', () => {
  it('classifica de quem é a bola conforme a leitura da planilha', () => {
    expect(RESPONSAVEL_ACAO.aguardando_ok_cliente).toBe('cliente');
    expect(RESPONSAVEL_ACAO.validar_com_cliente).toBe('cliente');
    expect(RESPONSAVEL_ACAO.aguardando_parceiro).toBe('parceiro');
    expect(RESPONSAVEL_ACAO.abrir_frente).toBe('cross');
    // Encerramentos não pedem ação de ninguém.
    expect(RESPONSAVEL_ACAO.encerrada).toBe('nenhum');
    expect(RESPONSAVEL_ACAO.parceria_andamento).toBe('nenhum');
  });
});
