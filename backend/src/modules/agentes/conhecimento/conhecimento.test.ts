import { describe, expect, it } from "vitest";
import { withTransaction } from "../../../shared/db";
import * as conhecimento from "./conhecimento.service";
import * as repo from "./conhecimento.repository";

// -----------------------------------------------------------------------------
// Cross Knowledge — cenários A a L da Sprint AI-01.
//
// Rodam contra o banco de teste, dentro da transação com ROLLBACK do harness.
// Nenhum provider pago é acionado: com AI_PAID_PROVIDERS_ENABLED=false os
// embeddings usam o stub determinístico, o que valida ARQUITETURA (filtros,
// proveniência, isolamento) — não qualidade semântica.
// -----------------------------------------------------------------------------

const METODOLOGIA = `# Metodologia Crossability

A Crossability avalia o encaixe entre um cliente e um parceiro candidato em
seis dimensões. Nenhuma dimensão isolada sustenta uma recomendação.

## Compatibilidade de públicos

Os públicos do cliente e do parceiro precisam casar ou se complementar. A
complementaridade costuma gerar mais valor do que a sobreposição total.

## Compatibilidade de territórios

Territórios em comum facilitam a ativação conjunta. Territórios complementares
abrem mercado novo para ambas as partes.
`;

/** Cria um cliente Cross mínimo para os testes de isolamento. */
async function criarClienteDeTeste(client: Parameters<typeof repo.upsertDocumento>[0], nome: string) {
  const statusParte = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
  );
  const parte = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
     VALUES ('organizacao', $1, $2) RETURNING id`,
    [nome, statusParte.rows[0].id]
  );
  const statusCliente = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`
  );
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
     VALUES ($1, $2) RETURNING id`,
    [parte.rows[0].id, statusCliente.rows[0].id]
  );
  return cliente.rows[0].id;
}

describe("A · documento validado é indexável e recuperável", () => {
  it("indexa, gera chunks e devolve referências com proveniência", async () => {
    await withTransaction(async (client) => {
      const r = await conhecimento.indexar(
        {
          codigo: "test-crossability",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: METODOLOGIA,
          versao: 1,
          status: "validado",
          documentoOrigem: "docs/WAD.md",
        },
        null,
        client
      );

      expect(r.chunks).toBeGreaterThan(0);
      expect(r.status).toBe("validado");

      const ctx = await conhecimento.buscar(
        { consulta: "compatibilidade de públicos entre cliente e parceiro" },
        client
      );

      expect(ctx.conhecimentoInsuficiente).toBe(false);
      expect(ctx.referencias.length).toBeGreaterThan(0);
      // K · provenance completa
      const k1 = ctx.referencias[0];
      expect(k1.ref).toBe("K1");
      expect(k1.codigo).toBe("test-crossability");
      expect(k1.documento).toBe("Metodologia Crossability");
      expect(k1.versao).toBe(1);
      expect(k1.status).toBe("validado");
      expect(k1.categoria).toBe("metodologia_crossability");
      expect(k1.chunkId).toBeTruthy();
      expect(k1.aprovadoEm).toBeTruthy();
      expect(k1.relevancia).toBeGreaterThan(0);
    });
  });
});

describe("B · rascunho não alimenta o agente", () => {
  it("encontra no banco mas não entrega, com motivo nao_validado", async () => {
    await withTransaction(async (client) => {
      await conhecimento.indexar(
        {
          codigo: "test-rascunho",
          titulo: "Playbook em elaboração",
          categoria: "playbook",
          conteudo: "# Playbook\n\nCritério de abordagem de marcas de moda masculina.",
          status: "rascunho",
        },
        null,
        client
      );

      const producao = await conhecimento.buscar(
        { consulta: "critério de abordagem de marcas de moda masculina" },
        client
      );
      expect(producao.referencias.find((r) => r.codigo === "test-rascunho")).toBeUndefined();

      // Com diagnóstico ligado, aparece — como DESCARTADO, com o motivo.
      const diag = await conhecimento.buscar(
        { consulta: "critério de abordagem de marcas de moda masculina", incluirNaoValidados: true },
        client
      );
      const descartado = diag.descartados.find((d) => d.documento === "Playbook em elaboração");
      expect(descartado).toBeDefined();
      expect(descartado!.motivo).toBe("nao_validado");
    });
  });
});

describe("C · obsoleto não entra no retrieval normal", () => {
  it("mantém o histórico mas não entrega ao agente", async () => {
    await withTransaction(async (client) => {
      await conhecimento.indexar(
        {
          codigo: "test-obsoleto",
          titulo: "Critério aposentado",
          categoria: "criterio",
          conteudo: "# Critério\n\nRegra antiga de priorização por território.",
          status: "obsoleto",
        },
        null,
        client
      );

      const ctx = await conhecimento.buscar(
        { consulta: "regra antiga de priorização por território" },
        client
      );
      expect(ctx.referencias.find((r) => r.codigo === "test-obsoleto")).toBeUndefined();
    });
  });
});

describe("D · chunking preserva metadados", () => {
  it("cada chunk carrega seção, versão e documento de origem", async () => {
    await withTransaction(async (client) => {
      const r = await conhecimento.indexar(
        {
          codigo: "test-metadados",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: METODOLOGIA,
          status: "validado",
        },
        null,
        client
      );

      const { rows } = await client.query<{ secao: string | null; metadados: { codigo: string } }>(
        `SELECT secao, metadados FROM cross_ai.conhecimento_chunk WHERE versao_id = $1 ORDER BY ordem`,
        [r.versaoId]
      );

      expect(rows.length).toBe(r.chunks);
      expect(rows.some((x) => x.secao?.includes("públicos"))).toBe(true);
      expect(rows.every((x) => x.metadados.codigo === "test-metadados")).toBe(true);
    });
  });
});

describe("E · indexação é idempotente", () => {
  it("reindexar a mesma versão não duplica chunks", async () => {
    await withTransaction(async (client) => {
      const entrada = {
        codigo: "test-idempotente",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability" as const,
        conteudo: METODOLOGIA,
        versao: 1,
        status: "validado" as const,
      };

      const primeira = await conhecimento.indexar(entrada, null, client);
      const segunda = await conhecimento.indexar(entrada, null, client);

      expect(segunda.documentoId).toBe(primeira.documentoId);
      expect(segunda.versaoId).toBe(primeira.versaoId);
      expect(segunda.chunks).toBe(primeira.chunks);

      const { rows } = await client.query<{ total: string }>(
        `SELECT count(*) AS total FROM cross_ai.conhecimento_chunk WHERE versao_id = $1`,
        [primeira.versaoId]
      );
      expect(Number(rows[0].total)).toBe(primeira.chunks);
    });
  });
});

describe("F · top-k respeitado", () => {
  it("não devolve mais referências que o pedido", async () => {
    await withTransaction(async (client) => {
      for (let i = 1; i <= 5; i++) {
        await conhecimento.indexar(
          {
            codigo: `test-topk-${i}`,
            titulo: `Documento ${i}`,
            categoria: "criterio",
            conteudo: `# Critério ${i}\n\nPúblicos e territórios do cliente e do parceiro na dimensão ${i}.`,
            status: "validado",
          },
          null,
          client
        );
      }

      const ctx = await conhecimento.buscar(
        { consulta: "públicos e territórios", topK: 2, limiarRelevancia: 0 },
        client
      );
      expect(ctx.referencias.length).toBeLessThanOrEqual(2);
      expect(ctx.descartados.some((d) => d.motivo === "excedeu_top_k")).toBe(true);
    });
  });
});

describe("G · threshold respeitado", () => {
  it("limiar alto descarta tudo e declara conhecimento insuficiente", async () => {
    await withTransaction(async (client) => {
      await conhecimento.indexar(
        {
          codigo: "test-threshold",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: METODOLOGIA,
          status: "validado",
        },
        null,
        client
      );

      const ctx = await conhecimento.buscar(
        { consulta: "assunto totalmente alheio à metodologia", limiarRelevancia: 0.99 },
        client
      );

      expect(ctx.referencias).toHaveLength(0);
      expect(ctx.conhecimentoInsuficiente).toBe(true);
      expect(ctx.descartados.every((d) => d.motivo === "baixa_relevancia")).toBe(true);
    });
  });
});

describe("H · filtros por categoria", () => {
  it("recupera apenas a categoria pedida", async () => {
    await withTransaction(async (client) => {
      await conhecimento.indexar(
        {
          codigo: "test-filtro-metodologia",
          titulo: "Metodologia",
          categoria: "metodologia_crossability",
          conteudo: "# Metodologia\n\nPúblicos e territórios na avaliação de fit.",
          status: "validado",
        },
        null,
        client
      );
      await conhecimento.indexar(
        {
          codigo: "test-filtro-playbook",
          titulo: "Playbook comercial",
          categoria: "playbook",
          conteudo: "# Playbook\n\nPúblicos e territórios na abordagem comercial.",
          status: "validado",
        },
        null,
        client
      );

      const ctx = await conhecimento.buscar(
        { consulta: "públicos e territórios", categorias: ["metodologia_crossability"], limiarRelevancia: 0 },
        client
      );

      expect(ctx.referencias.length).toBeGreaterThan(0);
      expect(ctx.referencias.every((r) => r.categoria === "metodologia_crossability")).toBe(true);
      expect(ctx.referencias.find((r) => r.codigo === "test-filtro-playbook")).toBeUndefined();
    });
  });
});

describe("I · sem resultado relevante", () => {
  it("declara conhecimentoInsuficiente em vez de inventar", async () => {
    await withTransaction(async (client) => {
      const ctx = await conhecimento.buscar(
        { consulta: "qualquer coisa numa base vazia", limiarRelevancia: 0.9 },
        client
      );
      expect(ctx.conhecimentoInsuficiente).toBe(true);
      expect(ctx.referencias).toHaveLength(0);
    });
  });
});

describe("J · isolamento por cliente", () => {
  it("conhecimento do cliente B não vaza numa análise do cliente A", async () => {
    await withTransaction(async (client) => {
      const clienteA = await criarClienteDeTeste(client, "Cliente A Teste");
      const clienteB = await criarClienteDeTeste(client, "Cliente B Teste");

      await conhecimento.indexar(
        {
          codigo: "test-global",
          titulo: "Critério global",
          categoria: "criterio",
          conteudo: "# Global\n\nCritério de fit válido para todas as contas.",
          status: "validado",
          escopo: "global",
        },
        null,
        client
      );
      await conhecimento.indexar(
        {
          codigo: "test-cliente-a",
          titulo: "Critério do cliente A",
          categoria: "criterio_cliente",
          conteudo: "# Cliente A\n\nCritério de fit específico da conta A.",
          status: "validado",
          escopo: "cliente",
          clienteCrossId: clienteA,
        },
        null,
        client
      );
      await conhecimento.indexar(
        {
          codigo: "test-cliente-b",
          titulo: "Critério do cliente B",
          categoria: "criterio_cliente",
          conteudo: "# Cliente B\n\nCritério de fit específico da conta B.",
          status: "validado",
          escopo: "cliente",
          clienteCrossId: clienteB,
        },
        null,
        client
      );

      const ctx = await conhecimento.buscar(
        { consulta: "critério de fit", clienteCrossId: clienteA, limiarRelevancia: 0, topK: 10 },
        client
      );

      const codigos = ctx.referencias.map((r) => r.codigo);
      expect(codigos).toContain("test-global");
      expect(codigos).toContain("test-cliente-a");
      // O que mais importa neste teste:
      expect(codigos).not.toContain("test-cliente-b");
    });
  });

  it("sem cliente em contexto, nenhum conhecimento de cliente é entregue", async () => {
    await withTransaction(async (client) => {
      const clienteA = await criarClienteDeTeste(client, "Cliente A Sem Contexto");
      await conhecimento.indexar(
        {
          codigo: "test-cliente-sem-contexto",
          titulo: "Critério do cliente A",
          categoria: "criterio_cliente",
          conteudo: "# Cliente A\n\nCritério específico da conta A.",
          status: "validado",
          escopo: "cliente",
          clienteCrossId: clienteA,
        },
        null,
        client
      );

      const ctx = await conhecimento.buscar(
        { consulta: "critério específico", limiarRelevancia: 0, topK: 10 },
        client
      );
      expect(ctx.referencias.map((r) => r.codigo)).not.toContain("test-cliente-sem-contexto");
    });
  });
});

describe("K · versionamento", () => {
  it("v2 validada substitui v1, que fica no histórico sem ser recuperada", async () => {
    await withTransaction(async (client) => {
      const v1 = await conhecimento.indexar(
        {
          codigo: "test-versao",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: "# Crossability v1\n\nAvaliação por quatro dimensões.",
          versao: 1,
          status: "validado",
        },
        null,
        client
      );

      const v2 = await conhecimento.indexar(
        {
          codigo: "test-versao",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: "# Crossability v2\n\nAvaliação por seis dimensões, com momento estratégico.",
          versao: 2,
          status: "validado",
          obsoletarAnteriores: true,
        },
        null,
        client
      );

      expect(v2.documentoId).toBe(v1.documentoId);
      expect(v2.versoesObsoletadas).toBe(1);

      const ctx = await conhecimento.buscar(
        { consulta: "quantas dimensões a Crossability avalia", limiarRelevancia: 0, topK: 10 },
        client
      );

      const doVersionado = ctx.referencias.filter((r) => r.codigo === "test-versao");
      expect(doVersionado.length).toBeGreaterThan(0);
      // Só a v2 é entregue; a v1 permanece no banco como histórico.
      expect(doVersionado.every((r) => r.versao === 2)).toBe(true);

      const { rows } = await client.query<{ versao: number; status: string }>(
        `SELECT versao, status::text AS status FROM cross_ai.conhecimento_versao
          WHERE documento_id = $1 ORDER BY versao`,
        [v1.documentoId]
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ versao: 1, status: "obsoleto" });
      expect(rows[1]).toMatchObject({ versao: 2, status: "validado" });
    });
  });
});

describe("L · embeddings stub funcionam sem provider pago", () => {
  it("indexa e recupera com embedding determinístico, marcando a origem", async () => {
    await withTransaction(async (client) => {
      const r = await conhecimento.indexar(
        {
          codigo: "test-stub",
          titulo: "Metodologia Crossability",
          categoria: "metodologia_crossability",
          conteudo: METODOLOGIA,
          status: "validado",
        },
        null,
        client
      );

      // Sem chave e com o kill switch desligado, a origem tem de ser "mock".
      expect(r.embeddingOrigem).toBe("mock");

      const ctx = await conhecimento.buscar({ consulta: "compatibilidade de públicos" }, client);
      expect(ctx.embeddingOrigem).toBe("mock");
      expect(ctx.referencias.length).toBeGreaterThan(0);
    });
  });
});

describe("Integridade do modelo", () => {
  // Um erro de constraint aborta a transação em curso. Cada violação esperada
  // roda dentro do próprio SAVEPOINT, para o rollback não derrubar o teste.
  it("recusa conhecimento de escopo cliente sem cliente informado", async () => {
    await withTransaction(async (client) => {
      await client.query("SAVEPOINT tentativa");
      await expect(
        repo.upsertDocumento(client, {
          codigo: "test-escopo-invalido",
          titulo: "Sem cliente",
          categoria: "criterio_cliente",
          escopo: "cliente",
          clienteCrossId: null,
        })
      ).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT tentativa");
    });
  });

  it("recusa duas versões validadas do mesmo documento", async () => {
    await withTransaction(async (client) => {
      const doc = await repo.upsertDocumento(client, {
        codigo: "test-duas-validadas",
        titulo: "Documento",
        categoria: "criterio",
      });
      await repo.upsertVersao(client, {
        documentoId: doc.id,
        versao: 1,
        conteudo: "conteúdo v1",
        status: "validado",
      });

      await client.query("SAVEPOINT tentativa");
      await expect(
        repo.upsertVersao(client, {
          documentoId: doc.id,
          versao: 2,
          conteudo: "conteúdo v2",
          status: "validado",
        })
      ).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT tentativa");
    });
  });
});
