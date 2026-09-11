/**
 * Showcase do Internal Matching com execução REAL contra o banco de teste.
 *
 * Monta um cenário controlado (dados fictícios, nada confidencial), executa as
 * três direções e o teste de explosão de 500 candidatos, e grava os raw outputs.
 *
 * Zero LLM, zero embedding pago — o agente é determinístico por construção.
 *
 * Uso: npx tsx scripts/showcase-matching.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { executarMatching } from "../src/modules/agentes/matching/internal-matching.agent";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "internal-matching");

async function criarParte(
  client: PoolClient,
  nome: string,
  o: {
    papeis?: string[]; publicos?: string[]; territorios?: string[];
    ativos?: string[]; segmento?: string; cliente?: boolean;
    arquivada?: boolean; grupoDe?: string;
  } = {}
): Promise<string> {
  const st = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
  );
  const p = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id, arquivado_em)
     VALUES ('organizacao', $1, $2, $3) RETURNING id`,
    [nome, st.rows[0].id, o.arquivada ? new Date() : null]
  );
  const id = p.rows[0].id;

  if (o.segmento) {
    await client.query(
      `INSERT INTO cross_core.organizacao (parte_id, razao_social, nome_fantasia, segmento_principal)
       VALUES ($1,$2,$2,$3)`,
      [id, nome, o.segmento]
    );
  }
  for (const c of o.papeis ?? []) {
    const pa = await client.query<{ id: string }>(`SELECT id FROM cross_core.papel WHERE codigo=$1`, [c]);
    if (pa.rows.length) {
      await client.query(`INSERT INTO cross_core.parte_papel (parte_id, papel_id) VALUES ($1,$2)`, [id, pa.rows[0].id]);
    }
  }
  for (const nome2 of o.publicos ?? []) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.publico (nome) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`, [nome2]
    );
    const pid = r.rows[0]?.id ?? (await client.query<{ id: string }>(
      `SELECT id FROM cross_intelligence.publico WHERE nome=$1 LIMIT 1`, [nome2])).rows[0].id;
    await client.query(`INSERT INTO cross_intelligence.parte_publico (parte_id, publico_id) VALUES ($1,$2)`, [id, pid]);
  }
  for (const nome2 of o.territorios ?? []) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.territorio (codigo, nome) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`,
      [nome2.toLowerCase().replace(/\s+/g, "_").slice(0, 30), nome2]
    );
    const tid = r.rows[0]?.id ?? (await client.query<{ id: string }>(
      `SELECT id FROM cross_intelligence.territorio WHERE nome=$1 LIMIT 1`, [nome2])).rows[0].id;
    await client.query(`INSERT INTO cross_intelligence.parte_territorio (parte_id, territorio_id) VALUES ($1,$2)`, [id, tid]);
  }
  for (const a of o.ativos ?? []) {
    await client.query(`INSERT INTO cross_intelligence.ativo (parte_id, nome) VALUES ($1,$2)`, [id, a]);
  }
  if (o.cliente) {
    const sc = await client.query<{ id: string }>(
      `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
    await client.query(
      `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id) VALUES ($1,$2)`,
      [id, sc.rows[0].id]);
  }
  if (o.grupoDe) {
    await client.query(
      `INSERT INTO cross_core.grupo_marca (grupo_parte_id, marca_parte_id) VALUES ($1,$2)`,
      [o.grupoDe, id]);
  }
  return id;
}

function resumo(titulo: string, r: Awaited<ReturnType<typeof executarMatching>>) {
  console.log(`\n=== ${titulo} ===`);
  console.log(`direção: ${r.direcao} | origem: ${r.origem.nome} (${r.origem.vinculo})`);
  console.log(`universo: pool=${r.universo.total_no_pool_sql} considerados=${r.universo.considerados} pontuados=${r.universo.pontuados} shortlist=${r.universo.shortlist}`);
  console.log("shortlist:");
  for (const c of r.shortlist) {
    const sinais = c.sinais
      .filter((s) => s.forca !== "nenhum" && s.forca !== "desconhecido")
      .map((s) => `${s.tipo}=${s.forca}`)
      .join(" ");
    console.log(
      `  ${String(c.pre_match_score).padStart(6)} ${c.nome.padEnd(28)} perfil=${c.status_perfil.padEnd(8)} enriq=${c.necessita_enriquecimento ? "sim" : "nao"} ${sinais}`
    );
  }
  const porMotivo = new Map<string, number>();
  for (const e of r.excluidos) porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1);
  if (porMotivo.size) {
    console.log("excluídos: " + [...porMotivo].map(([m, n]) => `${m}=${n}`).join(" | "));
  }
  console.log(`llm=${r.telemetria.llm_calls} embeddings=${r.telemetria.embedding_calls} custo=US$ ${r.telemetria.custo_estimado_usd} sql=${r.telemetria.duracao_sql_ms}ms total=${r.telemetria.duracao_ms}ms`);
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    // ---- cenário controlado ------------------------------------------------
    const clienteOrigem = await criarParte(client, "Cliente Alfa", {
      papeis: ["cliente"], cliente: true,
      publicos: ["Jovens urbanos", "Cultura de rua"],
      territorios: ["Moda", "Música"],
      ativos: ["Programa de criadores"],
      segmento: "Vestuário",
    });

    await criarParte(client, "Marca Aderente", {
      papeis: ["parceiro"],
      publicos: ["Jovens urbanos", "Cultura de rua"],
      territorios: ["Moda", "Música"],
      ativos: ["Festival próprio"],
      segmento: "Vestuário",
    });
    await criarParte(client, "Marca Parcial", {
      publicos: ["Jovens urbanos"],
      territorios: ["Moda"],
    });
    await criarParte(client, "Marca Distante", {
      publicos: ["Executivos"],
      territorios: ["Tecnologia"],
      segmento: "Software",
    });
    await criarParte(client, "Marca Sem Perfil", {});
    await criarParte(client, "Marca Arquivada", { arquivada: true, publicos: ["Jovens urbanos"] });

    const grupo = await criarParte(client, "Grupo Beta", { publicos: ["Jovens urbanos"] });
    await criarParte(client, "Beta Marca Um", { publicos: ["Jovens urbanos"], grupoDe: grupo });
    await criarParte(client, "Beta Marca Dois", { publicos: ["Jovens urbanos"], grupoDe: grupo });

    const banida = await criarParte(client, "Marca Bloqueada", {
      publicos: ["Jovens urbanos"], territorios: ["Moda"],
    });

    // ---- 1. cliente → parceiro --------------------------------------------
    const r1 = await executarMatching(client, {
      direcao: "cliente_para_parceiro",
      parteOrigemId: clienteOrigem,
      objetivo: "encontrar marcas para ativação cultural conjunta",
      excluidos: [banida],
    });
    resumo("CLIENTE → PARCEIRO", r1);
    writeFileSync(join(SAIDA, "client-to-partner-result.json"), JSON.stringify(r1, null, 2));

    // ---- 2. parceiro → cliente --------------------------------------------
    const parceiroOrigem = await criarParte(client, "Parceiro Gama", {
      papeis: ["parceiro"],
      publicos: ["Jovens urbanos", "Cultura de rua"],
      territorios: ["Moda"],
    });
    await criarParte(client, "Cliente Delta", {
      cliente: true, publicos: ["Jovens urbanos"], territorios: ["Moda"],
    });

    const r2 = await executarMatching(client, {
      direcao: "parceiro_para_cliente",
      parteOrigemId: parceiroOrigem,
      objetivo: "encontrar Clientes Cross compatíveis",
    });
    resumo("PARCEIRO → CLIENTE", r2);
    writeFileSync(join(SAIDA, "partner-to-client-result.json"), JSON.stringify(r2, null, 2));

    // A verdade é a relação interna `cliente_cross`, não o papel cadastrado:
    // uma Parte pode ser Cliente Cross sem ter o papel `cliente` em parte_papel.
    const naoClientes = r2.shortlist.filter((c) => !c.eh_cliente_cross);
    console.log(`\nverificação: candidatos na shortlist que NÃO são Cliente Cross = ${naoClientes.length}`);

    // ---- 3. prospecção do zero --------------------------------------------
    const antesPartes = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM cross_core.parte`);
    const r3 = await executarMatching(client, {
      direcao: "prospeccao_do_zero",
      nomeOrigem: "Marca Externa Não Cadastrada",
      objetivo: "cruzar entidade externa contra a base",
    });
    const depoisPartes = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM cross_core.parte`);
    resumo("PROSPECÇÃO DO ZERO", r3);
    console.log(`Partes antes=${antesPartes.rows[0].n} depois=${depoisPartes.rows[0].n} (nenhuma criada)`);
    writeFileSync(join(SAIDA, "zero-prospecting.json"), JSON.stringify(r3, null, 2));

    // ---- 4. explosão de candidatos ----------------------------------------
    const st = await client.query<{ id: string }>(
      `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
    await client.query(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       SELECT 'organizacao', 'Sintetica ' || g, $1 FROM generate_series(1, 500) g`,
      [st.rows[0].id]
    );

    const inicio = Date.now();
    const r4 = await executarMatching(client, {
      direcao: "cliente_para_parceiro",
      parteOrigemId: clienteOrigem,
      maxCandidatos: 50,
      tamanhoShortlist: 5,
    });
    const ms = Date.now() - inicio;
    console.log(`\n=== EXPLOSÃO DE CANDIDATOS ===`);
    console.log(`pool total=${r4.universo.total_no_pool_sql} → considerados=${r4.universo.considerados} → shortlist=${r4.universo.shortlist}`);
    console.log(`llm=${r4.telemetria.llm_calls} embeddings=${r4.telemetria.embedding_calls} custo=US$ ${r4.telemetria.custo_estimado_usd} tempo=${ms}ms`);
    writeFileSync(join(SAIDA, "candidate-explosion.json"), JSON.stringify({
      pool: r4.universo, telemetria: r4.telemetria, duracao_medida_ms: ms,
    }, null, 2));

    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify({
      client_to_partner: r1.telemetria,
      partner_to_client: r2.telemetria,
      zero_prospecting: r3.telemetria,
      candidate_explosion: r4.telemetria,
    }, null, 2));

    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__ROLLBACK__") {
      console.log("\n(transação revertida — nada persistido)");
      return;
    }
    throw e;
  });
}

main().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
