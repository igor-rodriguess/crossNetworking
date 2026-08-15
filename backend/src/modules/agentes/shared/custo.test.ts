import { describe, expect, it } from "vitest";
import { estimarCusto } from "./custo";

// Custo é dinheiro: os casos abaixo travam as decisões que, se mudarem em
// silêncio, subestimam a conta. Aritmética pura — roda sem banco e sem rede.

describe("estimarCusto", () => {
  it("distingue 'não medido' (null) de 'gratuito' (0)", () => {
    // Modelo desconhecido não pode virar 0: isso esconderia gasto real.
    expect(estimarCusto("modelo-que-nao-existe", { entrada: 1000, saida: 500 })).toBeNull();
    expect(estimarCusto(null, { entrada: 1000, saida: 500 })).toBeNull();
    expect(estimarCusto("gpt-4o-mini", null)).toBeNull();

    // Modelo local consome tokens, mas não gera fatura.
    expect(estimarCusto("qwen3:4b", { entrada: 10_000, saida: 5_000 })).toBe(0);
  });

  it("calcula entrada e saída pelo preço do modelo", () => {
    // gpt-4o-mini: 0.15 USD/1M entrada, 0.60 USD/1M saída.
    // 1M entrada + 1M saída = 0.15 + 0.60 = 0.75
    expect(estimarCusto("gpt-4o-mini", { entrada: 1_000_000, saida: 1_000_000 })).toBeCloseTo(0.75, 6);
  });

  it("cobra tokens de cache mais barato sem contá-los duas vezes", () => {
    // Provedores reportam cache DENTRO de entrada. Somar os dois cobraria a
    // mesma entrada duas vezes.
    const semCache = estimarCusto("gpt-4o-mini", { entrada: 1_000_000, saida: 0 });
    const comCache = estimarCusto("gpt-4o-mini", { entrada: 1_000_000, saida: 0, cache: 1_000_000 });

    expect(semCache).toBeCloseTo(0.15, 6);
    // 1M inteiramente de cache a 0.075/1M.
    expect(comCache).toBeCloseTo(0.075, 6);
    expect(comCache!).toBeLessThan(semCache!);
  });

  it("não deixa cache maior que entrada produzir crédito negativo", () => {
    const custo = estimarCusto("gpt-4o-mini", { entrada: 1000, saida: 0, cache: 999_999 });
    expect(custo).not.toBeNull();
    expect(custo!).toBeGreaterThanOrEqual(0);
  });

  it("é insensível a maiúsculas e espaços no nome do modelo", () => {
    expect(estimarCusto("  GPT-4o-Mini ", { entrada: 1_000_000, saida: 0 })).toBeCloseTo(0.15, 6);
  });
});
