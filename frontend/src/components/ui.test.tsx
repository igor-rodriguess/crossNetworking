import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip, EstadoVazio, MedidorScore, RotuloMono } from './ui';

// Primeiros testes de componente da plataforma. Começam pelos primitivos de UI
// porque são usados em quase toda tela: uma regressão aqui aparece em todo
// lugar, e o typecheck não pega nada disso (renderização e acessibilidade).

describe('Chip', () => {
  it('renderiza o conteúdo', () => {
    render(<Chip>em análise</Chip>);
    expect(screen.getByText('em análise')).toBeInTheDocument();
  });

  it('aplica estilo distinto por tom', () => {
    const { container: pos } = render(<Chip tom="pos">ok</Chip>);
    const { container: neg } = render(<Chip tom="neg">falhou</Chip>);
    expect(pos.firstChild).not.toHaveClass(neg.firstChild instanceof Element ? neg.firstChild.className : '');
  });
});

describe('MedidorScore', () => {
  it('reflete o percentual na largura da barra', () => {
    const { container } = render(<MedidorScore percentual={72} />);
    const barra = container.querySelector('[style*="width"]');
    expect(barra).toBeTruthy();
    expect(barra?.getAttribute('style')).toContain('72');
  });

  it('trata 0% sem quebrar', () => {
    const { container } = render(<MedidorScore percentual={0} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('EstadoVazio', () => {
  it('mostra título e descrição — a tela nunca fica muda', () => {
    render(<EstadoVazio titulo="Nada mapeado" descricao="Verifique a conta selecionada." />);
    expect(screen.getByText('Nada mapeado')).toBeInTheDocument();
    expect(screen.getByText('Verifique a conta selecionada.')).toBeInTheDocument();
  });
});

describe('RotuloMono', () => {
  it('renderiza o texto do rótulo', () => {
    render(<RotuloMono>Score total</RotuloMono>);
    expect(screen.getByText('Score total')).toBeInTheDocument();
  });
});
