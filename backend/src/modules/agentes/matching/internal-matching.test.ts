import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { executarMatching } from "./internal-matching.agent";

// -----------------------------------------------------------------------------
// Internal Matching — cenários A a W da Sprint AI-05.
//
// Tudo determinístico e contra o banco de teste, com ROLLBACK. Nenhuma chamada
// de LLM, nenhum embedding pago: o agente não os usa, e os testes provam isso.
// -----------------------------------------------------------------------------

interface Fixture {
  parteId: string;
  clienteId?: string;
}

async function criarParte(
  client: PoolClient,
  nome: string,
  opcoes: {
    papeis?: string[];
    publicos?: string[];
    territorios?: string[];
    ativos?: string[];
    pracas?: string[];
    segmento?: string;
    cliente?: boolean;
    arquivada?: boolean;
    grupoDe?: string;
  } = {}
): Promise<Fixture> {
  const statusParte = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
  );
  const parte = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id, arquivado_em)
     VALUES ('organizacao', $1, $2, $3) RETURNING id`,
    [nome, statusParte.rows[0].id, opcoes.arquivada ? new Date() : null]
  );
  const parteId = parte.rows[0].id;

  if (opcoes.segmento) {
    await client.query(
      `INSERT INTO cross_core.organizacao (parte_id, razao_social, nome_fantasia, segmento_principal)
       VALUES ($1, $2, $2, $3)`,
      [parteId, nome, opcoes.segmento]
    );
  }

  for (const codigo of opcoes.papeis ?? []) {
    const papel = await client.query<{ id: string }>(
      `SELECT id FROM cross_core.papel WHERE codigo = $1`,
      [codigo]
    );
    if (papel.rows.length) {
      await client.query(
        `INSERT INTO cross_core.parte_papel (parte_id, papel_id) VALUES ($1, $2)`,
        [parteId, papel.rows[0].id]
      );
    }
  }

  for (const nomePublico of opcoes.publicos ?? []) {
    const pub = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.publico (nome) VALUES ($1)
       ON CONFLICT DO NOTHING RETURNING id`,
      [nomePublico]
    );
    const id =
      pub.rows[0]?.id ??
      (await client.query<{ id: string }>(
        `SELECT id FROM cross_intelligence.publico WHERE nome = $1 LIMIT 1`,
        [nomePublico]
      )).rows[0].id;
    await client.query(
      `INSERT INTO cross_intelligence.parte_publico (parte_id, publico_id) VALUES ($1, $2)`,
      [parteId, id]
    );
  }

  for (const nomeTer of opcoes.territorios ?? []) {
    const ter = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.territorio (codigo, nome) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [nomeTer.toLowerCase().replace(/\s+/g, "_").slice(0, 30), nomeTer]
    );
    const id =
      ter.rows[0]?.id ??
      (await client.query<{ id: string }>(
        `SELECT id FROM cross_intelligence.territorio WHERE nome = $1 LIMIT 1`,
        [nomeTer]
      )).rows[0].id;
    await client.query(
      `INSERT INTO cross_intelligence.parte_territorio (parte_id, territorio_id) VALUES ($1, $2)`,
      [parteId, id]
    );
  }

  for (const nomeAtivo of opcoes.ativos ?? []) {
    await client.query(
      `INSERT INTO cross_intelligence.ativo (parte_id, nome) VALUES ($1, $2)`,
      [parteId, nomeAtivo]
    );
  }

  let clienteId: string | undefined;
  if (opcoes.cliente) {
    const st = await client.query<{ id: string }>(
      `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`
    );
    const cc = await client.query<{ id: string }>(
      `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
       VALUES ($1, $2) RETURNING id`,
      [parteId, st.rows[0].id]
    );
    clienteId = cc.rows[0].id;
  }

  if (opcoes.grupoDe) {
    await client.query(
      `INSERT INTO cross_core.grupo_marca (grupo_parte_id, marca_parte_id) VALUES ($1, $2)`,
      [opcoes.grupoDe, parteId]
    );
  }

  return { parteId, clienteId };
}

/** Origem padrão: cliente com público, território e ativos preenchidos. */
async function origemPadrao(client: PoolClient) {
  return criarParte(client, "Cliente Origem AI05", {
    papeis: ["cliente"],
    cliente: true,
    publicos: ["Jovens urbanos", "Cultura de rua"],
    territorios: ["Moda", "Música"],
    ativos: ["Programa de criadores"],
    segmento: "Vestuário",
  });
}

// -----------------------------------------------------------------------------

describe("A · Cliente → Parceiro", () => {
  it("monta pool de candidatos sem exigir papel histórico de parceiro", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      // Empresa sem papel de parceiro ainda é candidata legítima.
      await criarParte(client, "Empresa Sem Papel AI05", {
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
        objetivo: "ativação cultural",
      });

      expect(r.direcao).toBe("cliente_para_parceiro");
      expect(r.shortlist.some((c) => c.nome === "Empresa Sem Papel AI05")).toBe(true);
    });
  });
});

describe("B · Parceiro → Cliente restringe a Clientes Cross", () => {
  it("não-clientes não entram no pool alvo", async () => {
    await withTransaction(async (client) => {
      const origem = await criarParte(client, "Parceiro Origem AI05", {
        papeis: ["parceiro"],
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });
      await criarParte(client, "Cliente Real AI05", {
        cliente: true,
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });
      await criarParte(client, "Nao Cliente AI05", {
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });

      const r = await executarMatching(client, {
        direcao: "parceiro_para_cliente",
        parteOrigemId: origem.parteId,
      });

      const nomes = r.shortlist.map((c) => c.nome);
      expect(nomes).toContain("Cliente Real AI05");
      expect(nomes).not.toContain("Nao Cliente AI05");
      // A restrição vem da relação interna `cliente_cross`, não do papel:
      // Cliente Cross é verdade da plataforma e não se descobre pela internet.
      expect(r.shortlist.every((c) => c.eh_cliente_cross)).toBe(true);
    });
  });
});

describe("C · Prospecção do zero não cria Parte", () => {
  it("origem permanece não vinculada e exige resolução humana", async () => {
    await withTransaction(async (client) => {
      const antes = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_core.parte`
      );
      await criarParte(client, "Candidato Prospec AI05", {
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });

      const r = await executarMatching(client, {
        direcao: "prospeccao_do_zero",
        nomeOrigem: "Marca Externa Não Cadastrada",
      });

      expect(r.origem.vinculo).toBe("nao_vinculada");
      expect(r.origem.requer_resolucao_humana).toBe(true);
      expect(r.origem.parte_id).toBeNull();

      // Nenhuma Parte além da que o próprio teste criou.
      const depois = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_core.parte`
      );
      expect(Number(depois.rows[0].n)).toBe(Number(antes.rows[0].n) + 1);
    });
  });
});

describe("D/E/F · Filtros duros", () => {
  it("exclui auto-match", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      expect(r.shortlist.some((c) => c.parte_id === origem.parteId)).toBe(false);
      expect(r.excluidos.some((e) => e.motivo === "auto_match")).toBe(true);
    });
  });

  it("exclui entidade inativa (arquivada)", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Arquivada AI05", {
        arquivada: true,
        publicos: ["Jovens urbanos"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });
      expect(r.shortlist.some((c) => c.nome === "Arquivada AI05")).toBe(false);
    });
  });

  it("exclui explicitamente quem o chamador pediu", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const banida = await criarParte(client, "Banida AI05", {
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
        excluidos: [banida.parteId],
      });

      expect(r.shortlist.some((c) => c.parte_id === banida.parteId)).toBe(false);
      expect(r.excluidos.some((e) => e.motivo === "excluido_explicitamente")).toBe(true);
    });
  });
});

describe("G/H/I · Perfil ausente, parcial e sinal desconhecido", () => {
  it("candidato sem perfil é marcado, não inventado nem eliminado", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Sem Perfil AI05", {});

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const c = r.shortlist.find((x) => x.nome === "Sem Perfil AI05");
      expect(c).toBeDefined();
      expect(c!.status_perfil).toBe("ausente");
      expect(c!.necessita_enriquecimento).toBe(true);
      // Nenhum sinal inventado: todos desconhecidos.
      expect(c!.sinais.every((s) => s.forca !== "forte")).toBe(true);
      expect(r.nao_resolvidos.some((n) => n.nome === "Sem Perfil AI05")).toBe(true);
    });
  });

  it("perfil parcial é marcado como parcial", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Parcial AI05", { publicos: ["Jovens urbanos"] });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const c = r.shortlist.find((x) => x.nome === "Parcial AI05");
      expect(c!.status_perfil).toBe("parcial");
      expect(c!.necessita_enriquecimento).toBe(true);
    });
  });

  it("ausência de dado NÃO vira incompatibilidade zero", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      // Sem território cadastrado, mas com público idêntico ao da origem.
      await criarParte(client, "So Publico AI05", {
        publicos: ["Jovens urbanos", "Cultura de rua"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const c = r.shortlist.find((x) => x.nome === "So Publico AI05")!;
      const territorio = c.sinais.find((s) => s.tipo === "territorio")!;
      expect(territorio.forca).toBe("desconhecido");
      expect(territorio.valor).toBeNull();
      // O público forte não é diluído pelo território desconhecido.
      expect(c.pre_match_score).toBeGreaterThan(0);
      expect(c.informacao_faltante.length).toBeGreaterThan(0);
    });
  });
});

describe("J/K/W · Determinismo", () => {
  it("mesma entrada produz o mesmo ranking", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Cand A AI05", { publicos: ["Jovens urbanos"], territorios: ["Moda"] });
      await criarParte(client, "Cand B AI05", { publicos: ["Cultura de rua"], territorios: ["Música"] });

      const r1 = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });
      const r2 = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      expect(r1.shortlist.map((c) => c.parte_id)).toEqual(r2.shortlist.map((c) => c.parte_id));
      expect(r1.shortlist.map((c) => c.pre_match_score)).toEqual(
        r2.shortlist.map((c) => c.pre_match_score)
      );
    });
  });

  it("empate é desfeito de forma estável", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      // Dois candidatos idênticos: mesmo score garantido.
      await criarParte(client, "Zzz Empate AI05", {
        publicos: ["Jovens urbanos"], territorios: ["Moda"],
      });
      await criarParte(client, "Aaa Empate AI05", {
        publicos: ["Jovens urbanos"], territorios: ["Moda"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const empatados = r.shortlist.filter((c) => c.nome.includes("Empate AI05"));
      expect(empatados).toHaveLength(2);
      expect(empatados[0].pre_match_score).toBe(empatados[1].pre_match_score);
      // Desempate por nome: "Aaa" antes de "Zzz".
      expect(empatados[0].nome).toBe("Aaa Empate AI05");
    });
  });
});

describe("L/M/N · Limites e explosão de candidatos", () => {
  it("500 candidatos são contidos sem nenhuma chamada de LLM", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);

      const statusParte = await client.query<{ id: string }>(
        `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
      );
      // Inserção em massa: 500 Partes sintéticas.
      await client.query(
        `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
         SELECT 'organizacao', 'Sintetica AI05 ' || g, $1
           FROM generate_series(1, 500) g`,
        [statusParte.rows[0].id]
      );

      const inicio = Date.now();
      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
        maxCandidatos: 50,
        tamanhoShortlist: 5,
      });
      const duracao = Date.now() - inicio;

      expect(r.universo.total_no_pool_sql).toBeGreaterThanOrEqual(500);
      expect(r.universo.considerados).toBeLessThanOrEqual(50);
      expect(r.shortlist).toHaveLength(5);
      expect(r.telemetria.llm_calls).toBe(0);
      expect(r.telemetria.embedding_calls).toBe(0);
      expect(r.telemetria.custo_estimado_usd).toBe(0);
      // Não deve haver O(N²): meio segundo é folgado para 500 linhas.
      expect(duracao).toBeLessThan(15000);
      // O corte por limite fica registrado, não é silencioso.
      expect(r.excluidos.some((e) => e.motivo === "excedeu_limite_candidatos")).toBe(true);
    });
  });
});

describe("O/P/Q/R/S · O que o Matching NÃO faz", () => {
  it("não cria oportunidade, candidatura nem projeto", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Candidato AI05", { publicos: ["Jovens urbanos"] });

      const contar = async () => {
        const { rows } = await client.query<{ n: string }>(
          `SELECT (
             (SELECT count(*) FROM cross_projects.candidatura_parceiro) +
             (SELECT count(*) FROM cross_projects.projeto) +
             (SELECT count(*) FROM cross_projects.frente_oportunidade) +
             (SELECT count(*) FROM cross_ai.oportunidade_ia)
           )::text AS n`
        );
        return rows[0].n;
      };

      const antes = await contar();
      await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });
      expect(await contar()).toBe(antes);
    });
  });

  it("a saída é shortlist, não recomendação nem Score Card", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      expect(r).not.toHaveProperty("recomendacao");
      expect(r).not.toHaveProperty("recommendation");
      expect(r).not.toHaveProperty("score_card");
      expect(r).toHaveProperty("shortlist");
      // O score é de retrieval, e o nome do campo diz isso.
      for (const c of r.shortlist) {
        expect(c).toHaveProperty("pre_match_score");
        expect(c).not.toHaveProperty("score_cross");
      }
    });
  });

  it("não altera status de candidatura existente", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const { rows: antes } = await client.query(
        `SELECT id, status_candidatura_id FROM cross_projects.candidatura_parceiro`
      );
      await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });
      const { rows: depois } = await client.query(
        `SELECT id, status_candidatura_id FROM cross_projects.candidatura_parceiro`
      );
      expect(depois).toEqual(antes);
    });
  });
});

describe("T · Proveniência dos sinais", () => {
  it("todo sinal aponta o registro que o sustenta", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Com Sinais AI05", {
        publicos: ["Jovens urbanos"],
        territorios: ["Moda"],
        ativos: ["Festival próprio"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const c = r.shortlist.find((x) => x.nome === "Com Sinais AI05")!;
      expect(c.sinais.length).toBeGreaterThan(0);
      for (const s of c.sinais) {
        expect(s.proveniencia).toBeTruthy();
        expect(s.proveniencia).toMatch(/cross_(intelligence|core|projects)\./);
        expect(s.nivel_validacao).toBe("estrutural");
      }
    });
  });
});

describe("U · Deduplicação de entidade", () => {
  it("marcas do mesmo grupo não entram como candidatos separados", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const grupo = await criarParte(client, "Grupo Marca AI05", {
        publicos: ["Jovens urbanos"],
      });
      await criarParte(client, "Marca Filha 1 AI05", {
        publicos: ["Jovens urbanos"],
        grupoDe: grupo.parteId,
      });
      await criarParte(client, "Marca Filha 2 AI05", {
        publicos: ["Jovens urbanos"],
        grupoDe: grupo.parteId,
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const filhas = r.shortlist.filter((c) => c.nome.startsWith("Marca Filha"));
      expect(filhas.length).toBeLessThanOrEqual(1);
      expect(r.excluidos.some((e) => e.motivo === "duplicado")).toBe(true);
    });
  });
});

describe("Explicabilidade do score", () => {
  it("permite responder por que A ficou acima de B", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      await criarParte(client, "Forte AI05", {
        publicos: ["Jovens urbanos", "Cultura de rua"],
        territorios: ["Moda", "Música"],
      });
      await criarParte(client, "Fraco AI05", {
        publicos: ["Executivos"],
        territorios: ["Tecnologia"],
      });

      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      const forte = r.shortlist.find((c) => c.nome === "Forte AI05")!;
      const fraco = r.shortlist.find((c) => c.nome === "Fraco AI05")!;

      expect(forte.pre_match_score).toBeGreaterThan(fraco.pre_match_score);
      // A diferença é explicável pelos componentes, não por opinião.
      expect(forte.componentes.length).toBeGreaterThan(0);
      const pubForte = forte.componentes.find((c) => c.tipo === "publico")!;
      const pubFraco = fraco.componentes.find((c) => c.tipo === "publico")!;
      expect(pubForte.contribuicao).toBeGreaterThan(pubFraco.contribuicao);
    });
  });
});

describe("Nível de validação declarado", () => {
  it("resultado é estrutural e a validação semântica fica pendente", async () => {
    await withTransaction(async (client) => {
      const origem = await origemPadrao(client);
      const r = await executarMatching(client, {
        direcao: "cliente_para_parceiro",
        parteOrigemId: origem.parteId,
      });

      expect(r.nivel_validacao).toBe("estrutural");
      expect(r.validacao_semantica).toBe("pendente_embedding_real");
    });
  });
});
