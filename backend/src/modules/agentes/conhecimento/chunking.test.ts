import { describe, expect, it } from "vitest";
import { dividirEmChunks } from "./chunking";

// Chunking é função pura: roda sem banco e sem rede.

const DOC = `# Metodologia Crossability

A Crossability avalia o encaixe entre um cliente e um parceiro candidato.

## Compatibilidade de públicos

Os públicos do cliente e do parceiro precisam casar ou se complementar.
Sobreposição total não é requisito: complementaridade costuma gerar mais valor
do que redundância.

## Compatibilidade de territórios

Territórios em comum facilitam a ativação conjunta. Territórios complementares
podem abrir mercado novo para ambas as partes.
`;

describe("Chunking semântico", () => {
  it("divide por seção e preserva o título como contexto do trecho", () => {
    const chunks = dividirEmChunks(DOC);

    expect(chunks.length).toBeGreaterThanOrEqual(3);

    const publicos = chunks.find((c) => c.secao?.includes("públicos"));
    expect(publicos).toBeDefined();
    // A hierarquia entra no rótulo: o trecho não perde o capítulo de origem.
    expect(publicos!.secao).toBe("Metodologia Crossability › Compatibilidade de públicos");
    // E o título é prefixado ao conteúdo, então o embedding carrega o contexto.
    expect(publicos!.conteudo).toContain("Compatibilidade de públicos");
    expect(publicos!.conteudo).toContain("precisam casar");
  });

  it("não mistura conceitos de seções diferentes no mesmo chunk", () => {
    const chunks = dividirEmChunks(DOC);
    const publicos = chunks.find((c) => c.secao?.includes("públicos"))!;
    expect(publicos.conteudo).not.toContain("Territórios em comum");
  });

  it("numera os chunks em sequência contínua", () => {
    const chunks = dividirEmChunks(DOC);
    expect(chunks.map((c) => c.ordem)).toEqual(chunks.map((_, i) => i));
  });

  it("respeita o teto de tamanho quebrando por parágrafo", () => {
    const longo = `# Título\n\n${Array.from({ length: 12 }, (_, i) => `Parágrafo ${i} com conteúdo suficiente para ocupar espaço real no chunk e forçar a divisão.`).join("\n\n")}`;
    const chunks = dividirEmChunks(longo, { tamanhoMaximo: 300 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // Margem para o prefixo da seção, que é adicionado após o corte.
      expect(c.conteudo.length).toBeLessThanOrEqual(400);
    }
  });

  it("nunca corta no meio de uma palavra", () => {
    const frase = "A".repeat(50) + " palavra " + "B".repeat(50);
    const chunks = dividirEmChunks(`# T\n\n${frase}`, { tamanhoMaximo: 60 });
    for (const c of chunks) {
      expect(c.conteudo).not.toMatch(/[A-Z]{51,}/);
    }
  });

  it("aceita texto sem títulos", () => {
    const chunks = dividirEmChunks("Um parágrafo solto, sem estrutura de markdown.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].secao).toBeNull();
  });

  it("devolve lista vazia para texto vazio", () => {
    expect(dividirEmChunks("   \n\n  ")).toEqual([]);
  });
});
