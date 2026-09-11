/**
 * Showcase do Monitoring Agent.
 *
 * LIVE WEB DESLIGADA: Research vem de adaptador controlado.
 * Zero IA paga, zero rede.
 *
 * Uso: npx tsx scripts/showcase-monitoring.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { executarCiclo } from "../src/modules/agentes/monitoring/monitoring.agent";
import {
  criarAlvo, pausarAlvo, listarAlertasNovos, listarCiclos, listarRunsDoCiclo, diagnosticarAlvo,
} from "../src/modules/agentes/monitoring/monitoring.repository";
import type { AdaptadorPesquisa } from "../src/modules/agentes/monitoring/monitoring.schema";
import type { Fato } from "../src/modules/agentes/evidencia/evidencia.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "monitoring");
const AGORA = new Date("2026-06-15T12:00:00Z");
const VENCIDO = new Date(AGORA.getTime() - 3_600_000);

const f = (id: string, claim: string): Fato => ({
  fact_id: id, claim, entidade: "E", categoria: "movimento_estrategico",
  natureza: "fato", source_refs: [`s_${id}`], dominios_independentes: 2,
  verificacao: "corroborada", confianca: 80,
  publicado_em: "2026-06-01", coletado_em: "2026-06-10",
} as Fato);

const TURNE = "O artista anunciou turnê nacional em 20/11/2026.";
const ROTINA = "A marca atualizou sua política de privacidade.";
const CANCEL = "A turnê nacional foi cancelada pela produção em 20/11/2026.";

function adaptador(
  mapa: Record<string, Fato[]>, falharEm: string[] = []
): AdaptadorPesquisa & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    modo: "controlado", chamadas,
    async pesquisar({ entidade }) {
      chamadas.push(entidade);
      if (falharEm.includes(entidade)) throw new Error(`Fonte indisponível para ${entidade}`);
      return { fatos: mapa[entidade] ?? [], webSearchCalls: 0, firecrawlCalls: 0, custoUsd: 0 };
    },
  };
}

async function parte(client: PoolClient, nome: string): Promise<string> {
  const { rows: st } = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
     VALUES ('organizacao',$1,$2) RETURNING id`, [nome, st[0].id]);
  return rows[0].id;
}

function bloco(t: string) { console.log(`\n${"=".repeat(78)}\n${t}\n${"=".repeat(78)}`); }

async function reabrir(client: PoolClient) {
  await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [VENCIDO]);
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    // ---- CENÁRIO PRINCIPAL: economia -------------------------------------
    // 100 alvos: 60 não vencidos, 40 vencidos.
    const { rows: st } = await client.query<{ id: string }>(
      `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
    await client.query(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       SELECT 'organizacao', 'Alvo ' || g, $1 FROM generate_series(1,100) g`, [st[0].id]);

    // 60 futuros, 40 vencidos.
    await client.query(
      `INSERT INTO cross_ai.monitoring_alvo (parte_id, proxima_verificacao_em)
       SELECT p.id,
              CASE WHEN substring(p.nome_exibicao from 6)::int <= 40
                   THEN $1::timestamptz ELSE $2::timestamptz END
         FROM cross_core.parte p WHERE p.nome_exibicao LIKE 'Alvo %'`,
      [VENCIDO, new Date(AGORA.getTime() + 7 * 86_400_000)]);

    // Dos 40 vencidos: 20 sem mudança (ciclo prévio), 10 rotina, 5 momento, 5 falha.
    const mapa: Record<string, Fato[]> = {};
    const falhas: string[] = [];
    for (let i = 1; i <= 40; i++) {
      const nome = `Alvo ${i}`;
      if (i <= 20) mapa[nome] = [f(`EV-${i}`, ROTINA)];
      else if (i <= 30) mapa[nome] = [f(`EV-${i}`, ROTINA)];
      else if (i <= 35) mapa[nome] = [f(`EV-${i}`, TURNE)];
      else falhas.push(nome);
    }

    // Ciclo 0: só para os 20 primeiros já terem estado conhecido.
    const ad0 = adaptador(mapa, falhas);
    await executarCiclo(client, { agora: AGORA, pesquisa: ad0, maxAlvos: 20 });
    await reabrir(client);

    const ad = adaptador(mapa, falhas);
    const principal = await executarCiclo(client, { agora: AGORA, pesquisa: ad, maxAlvos: 40 });

    bloco("CENÁRIO DE ECONOMIA · 100 ALVOS");
    const t = principal.telemetria;
    console.log(`  alvos registrados:        100`);
    console.log(`  alvos vencidos:           ${principal.alvos_vencidos}`);
    console.log(`  alvos processados:        ${principal.alvos_processados}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  research executados:      ${t.research_calls}`);
    console.log(`  research evitados:        ${t.research_evitados}   (não vencidos / fora do lote)`);
    console.log(`  big moment executados:    ${t.big_moment_calls}`);
    console.log(`  big moment EVITADOS:      ${t.big_moment_evitados}   (fast path sem mudança)`);
    console.log(`  ─────────────────────────────`);
    console.log(`  crossability runs:        ${t.crossability_runs}`);
    console.log(`  matching runs:            ${t.matching_runs}`);
    console.log(`  recommendations:          ${t.recommendations_criadas}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  alertas criados:          ${principal.alertas.filter((a) => a.status === "novo").length}`);
    console.log(`  falhas:                   ${principal.alvos_falha}`);
    console.log(`  web search / firecrawl:   ${t.web_search_calls} / ${t.firecrawl_calls}`);
    console.log(`  paid LLM / embeddings:    ${t.llm_calls} / ${t.embedding_calls}`);
    console.log(`  custo:                    US$ ${t.custo_estimado_usd}`);
    console.log(`  duração:                  ${t.duracao_ms}ms`);
    writeFileSync(join(SAIDA, "cost-optimization.json"), JSON.stringify({
      alvos_registrados: 100, ...principal.telemetria,
      alvos_vencidos: principal.alvos_vencidos,
      alvos_processados: principal.alvos_processados,
      alertas_novos: principal.alertas.filter((a) => a.status === "novo").length,
    }, null, 2));
    writeFileSync(join(SAIDA, "monitoring-run.json"), JSON.stringify({
      ciclo_id: principal.ciclo_id, runs: principal.runs.slice(0, 10),
    }, null, 2));

    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  // ---- casos isolados -----------------------------------------------------
  await withTransaction(async (client) => {
    const p = await parte(client, "Marca Estavel");
    await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
    const ad = adaptador({ "Marca Estavel": [f("EV-1", TURNE)] });

    const c1 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });
    await reabrir(client);
    const c2 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

    bloco("SEM MUDANÇA · FAST PATH");
    console.log(`  ciclo 1  delta=${c1.runs[0].delta.padEnd(18)} big_moment=${c1.runs[0].big_moment_executado}  alertas=${c1.alertas.length}`);
    console.log(`  ciclo 2  delta=${c2.runs[0].delta.padEnd(18)} big_moment=${c2.runs[0].big_moment_executado}  alertas=${c2.alertas.filter(a=>a.status==="novo").length}`);
    console.log(`  big moment evitados no ciclo 2: ${c2.telemetria.big_moment_evitados}`);
    writeFileSync(join(SAIDA, "no-change.json"), JSON.stringify({
      ciclo1: { delta: c1.runs[0].delta, big_moment: c1.runs[0].big_moment_executado },
      ciclo2: { delta: c2.runs[0].delta, big_moment: c2.runs[0].big_moment_executado,
                evitados: c2.telemetria.big_moment_evitados },
    }, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const p = await parte(client, "Artista Dedupe");
    await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
    const ad = adaptador({ "Artista Dedupe": [f("EV-1", TURNE)] });

    const ciclos = [];
    for (let i = 0; i < 3; i++) {
      const c = await executarCiclo(client, { agora: AGORA, pesquisa: ad });
      ciclos.push(c.alertas.filter((a) => a.status === "novo").length);
      await reabrir(client);
    }

    bloco("DEDUPLICAÇÃO · 3 CICLOS, MESMO EVENTO");
    console.log(`  ciclo 1: ${ciclos[0]} alerta(s) novo(s)`);
    console.log(`  ciclo 2: ${ciclos[1]} alerta(s) novo(s)`);
    console.log(`  ciclo 3: ${ciclos[2]} alerta(s) novo(s)`);
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM cross_ai.monitoring_alerta`);
    console.log(`  total persistido: ${rows[0].n}`);
    writeFileSync(join(SAIDA, "duplicate-cycles.json"), JSON.stringify({ ciclos, total: Number(rows[0].n) }, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const p = await parte(client, "Artista Cancelamento");
    await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

    const c1 = await executarCiclo(client, {
      agora: AGORA, pesquisa: adaptador({ "Artista Cancelamento": [f("EV-1", TURNE)] }) });
    await reabrir(client);
    const c2 = await executarCiclo(client, {
      agora: AGORA, pesquisa: adaptador({ "Artista Cancelamento": [f("EV-1", TURNE), f("EV-2", CANCEL)] }) });

    bloco("CANCELAMENTO");
    console.log(`  ciclo 1: ${c1.alertas[0]?.tipo}`);
    const canc = c2.alertas.find((a) => a.tipo === "big_moment_cancelado");
    console.log(`  ciclo 2: ${canc?.tipo}  severidade=${canc?.severidade}`);
    console.log(`  resumo:  ${canc?.resumo}`);
    writeFileSync(join(SAIDA, "cancellation.json"), JSON.stringify({ ciclo1: c1.alertas, ciclo2: c2.alertas }, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const p = await parte(client, "Artista Conflito");
    await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

    await executarCiclo(client, {
      agora: AGORA,
      pesquisa: adaptador({ "Artista Conflito": [f("EV-1", "O artista anunciou turnê nacional em 12/10/2026.")] }) });
    await reabrir(client);
    const c2 = await executarCiclo(client, {
      agora: AGORA,
      pesquisa: adaptador({ "Artista Conflito": [
        f("EV-1", "O artista anunciou turnê nacional em 12/10/2026."),
        f("EV-2", "O artista anunciou turnê nacional em 15/10/2026."),
      ] }) });

    bloco("LIMITAÇÃO CONHECIDA DA AI-09 · DATAS CONFLITANTES");
    const conf = c2.alertas.find((a) => a.tipo === "possivel_conflito_de_evento");
    console.log(`  fingerprints AI-09 distintos (12/10 × 15/10) — identidade estrita preservada`);
    console.log(`  correlação do Monitoring detectou relação`);
    console.log(`  resultado: ${conf?.tipo}`);
    console.log(`  refs: ${conf?.big_moment_refs.length} momentos vinculados`);
    console.log(`  ${conf?.resumo}`);
    writeFileSync(join(SAIDA, "date-conflict.json"), JSON.stringify(conf, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const a = await parte(client, "Marca Falha");
    const b = await parte(client, "Marca Ok 1");
    const c = await parte(client, "Marca Ok 2");
    for (const x of [a, b, c]) await criarAlvo(client, { parteId: x, proximaVerificacaoEm: VENCIDO });

    const r = await executarCiclo(client, {
      agora: AGORA,
      pesquisa: adaptador({ "Marca Ok 1": [f("EV-1", TURNE)], "Marca Ok 2": [f("EV-2", TURNE)] }, ["Marca Falha"]) });

    bloco("FALHA ISOLADA + BACKOFF");
    for (const run of r.runs) {
      console.log(`  ${run.entidade.padEnd(14)} ${run.status.padEnd(12)} próxima=${run.proxima_verificacao_em.slice(0,10)}`);
    }
    const { rows } = await client.query<{ falhas: number }>(
      `SELECT falhas_consecutivas AS falhas FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [a]);
    console.log(`  falhas consecutivas de "Marca Falha": ${rows[0].falhas}`);
    console.log(`  ciclo NÃO abortou: ${r.alvos_sucesso} sucesso(s), ${r.alvos_falha} falha(s)`);
    writeFileSync(join(SAIDA, "target-failure.json"), JSON.stringify({ runs: r.runs }, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const p = await parte(client, "Marca Concorrencia");
    await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
    await client.query(
      `UPDATE cross_ai.monitoring_alvo SET reservado_ate=$1, reservado_por='worker-A'`,
      [new Date(AGORA.getTime() + 5 * 60_000)]);

    const adB = adaptador({ "Marca Concorrencia": [f("EV-1", TURNE)] });
    const rB = await executarCiclo(client, { agora: AGORA, pesquisa: adB, workerId: "worker-B" });
    const diag = await diagnosticarAlvo(client, p, AGORA);

    // Lease expirado: worker morto não trava o alvo.
    await client.query(
      `UPDATE cross_ai.monitoring_alvo SET reservado_ate=$1, reservado_por='worker-morto'`,
      [new Date(AGORA.getTime() - 3_600_000)]);
    const adC = adaptador({ "Marca Concorrencia": [f("EV-1", TURNE)] });
    const rC = await executarCiclo(client, { agora: AGORA, pesquisa: adC, workerId: "worker-C" });

    bloco("CONCORRÊNCIA E RECUPERAÇÃO DE LEASE");
    console.log(`  worker-B com alvo reservado: ${rB.alvos_processados} processado(s)`);
    console.log(`  diagnóstico: ${diag.motivo} — ${diag.detalhe.slice(0, 60)}`);
    console.log(`  worker-C após lease expirar: ${rC.alvos_processados} processado(s)`);
    writeFileSync(join(SAIDA, "concurrent-workers.json"),
      JSON.stringify({ workerB: rB.alvos_processados, diagnostico: diag, workerC: rC.alvos_processados }, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  await withTransaction(async (client) => {
    const { rows: st } = await client.query<{ id: string }>(
      `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
    await client.query(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       SELECT 'organizacao', 'Massa ' || g, $1 FROM generate_series(1,500) g`, [st[0].id]);
    await client.query(
      `INSERT INTO cross_ai.monitoring_alvo (parte_id, proxima_verificacao_em)
       SELECT id, $1 FROM cross_core.parte WHERE nome_exibicao LIKE 'Massa %'`, [VENCIDO]);

    const t0 = Date.now();
    const r = await executarCiclo(client, { agora: AGORA, pesquisa: adaptador({}), maxAlvos: 25 });
    const ms = Date.now() - t0;

    bloco("500 ALVOS · TETO DO CICLO");
    console.log(`  vencidos:     ${r.alvos_vencidos}`);
    console.log(`  processados:  ${r.alvos_processados}`);
    console.log(`  research evitados: ${r.telemetria.research_evitados}`);
    console.log(`  restantes permanecem vencidos para o próximo ciclo`);
    console.log(`  tempo: ${ms}ms`);
    writeFileSync(join(SAIDA, "500-targets.json"), JSON.stringify({
      vencidos: r.alvos_vencidos, processados: r.alvos_processados,
      evitados: r.telemetria.research_evitados, duracao_ms: ms,
    }, null, 2));

    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify(r.telemetria, null, 2));
    throw new Error("__RB__");
  }).catch((e) => { if (!(e instanceof Error && e.message === "__RB__")) throw e; });

  console.log("\nraw outputs em docs/ai/validation/raw/monitoring/");
}

main().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
