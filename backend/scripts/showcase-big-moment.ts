/**
 * Showcase do Big Moment Intelligence Agent.
 *
 * Executa análises reais sobre Evidence controlada. Zero IA paga.
 *
 * Uso: npx tsx scripts/showcase-big-moment.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTransaction } from "../src/shared/db";
import { analisarBigMoments } from "../src/modules/agentes/momento/big-moment.agent";
import {
  salvarMomento, carregarConhecidos, listarAtivos, listarRecentes, listarVersoes,
} from "../src/modules/agentes/momento/momento.repository";
import { CLASSIFIER_VERSAO } from "../src/modules/agentes/momento/momento.schema";
import type { Fato } from "../src/modules/agentes/evidencia/evidencia.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "big-moment-intelligence");
const AGORA = new Date("2026-06-15T12:00:00Z");

function fato(id: string, claim: string, over: Partial<Fato> = {}): Fato {
  return {
    fact_id: id, claim, entidade: "E", categoria: "movimento_estrategico",
    natureza: "fato", source_refs: [`src_${id}`], dominios_independentes: 1,
    verificacao: "fonte_unica", confianca: 80,
    publicado_em: "2026-06-01", coletado_em: "2026-06-10", ...over,
  } as Fato;
}

function bloco(t: string) { console.log(`\n${"=".repeat(76)}\n${t}\n${"=".repeat(76)}`); }

function mostrar(m: Awaited<ReturnType<typeof analisarBigMoments>>["moments"][0]) {
  console.log(`  [${m.event_type}] ${m.titulo.slice(0, 66)}`);
  console.log(`     status=${m.temporal_status}  janela=${m.janela_oportunidade}  score=${m.prioridade_score}`);
  console.log(`     evidence=${m.evidence_refs.join(",")}  verificação=${m.forca_verificacao}`);
  if (m.inicia_em) console.log(`     data=${m.inicia_em}`);
  if (m.expressao_temporal && !m.inicia_em) console.log(`     expressão bruta="${m.expressao_temporal}"`);
  for (const l of m.lacunas) console.log(`     lacuna: ${l}`);
  for (const r of m.riscos) console.log(`     risco:  ${r}`);
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  // ---- artista / turnê ----------------------------------------------------
  const artista = await analisarBigMoments({
    entidade: "Artista Exemplo", parteId: "parte-artista", agora: AGORA,
    evidencias: [fato("EV-01", "O artista anunciou turnê nacional com show em 20/11/2026.", { dominios_independentes: 3, verificacao: "corroborada" })],
    crossabilityDimensoes: ["territorios", "publicos"],
  });
  bloco("CASO A · ARTISTA / TURNÊ");
  artista.moments.forEach(mostrar);
  console.log(`  crossability_activation: ${artista.moments[0].crossability_activation_candidates.join(", ")}`);
  writeFileSync(join(SAIDA, "artist-tour.json"), JSON.stringify(artista, null, 2));

  // ---- marca / lançamento -------------------------------------------------
  const marca = await analisarBigMoments({
    entidade: "Marca Exemplo", parteId: "parte-marca", agora: AGORA,
    evidencias: [fato("EV-02", "A marca lançou nova coleção de inverno para o público jovem.")],
  });
  bloco("CASO B · MARCA / LANÇAMENTO");
  marca.moments.forEach(mostrar);
  writeFileSync(join(SAIDA, "brand-launch.json"), JSON.stringify(marca, null, 2));

  // ---- expansão -----------------------------------------------------------
  const exp = await analisarBigMoments({
    entidade: "Empresa Exemplo", agora: AGORA,
    evidencias: [fato("EV-03", "A empresa anunciou expansão para o mercado argentino.")],
  });
  bloco("CASO C · EXPANSÃO GEOGRÁFICA");
  exp.moments.forEach(mostrar);
  console.log(`  update candidates (NÃO promovidos): ${exp.entity_intelligence_update_candidates.length}`);
  writeFileSync(join(SAIDA, "expansion.json"), JSON.stringify(exp, null, 2));

  // ---- big moment vs notícia comum ---------------------------------------
  const comparacao = await analisarBigMoments({
    entidade: "Marca Exemplo", agora: AGORA,
    evidencias: [
      fato("EV-10", "A marca anunciou turnê patrocinada com início em 20/11/2026.", { dominios_independentes: 3 }),
      fato("EV-11", "A marca atualizou sua política de privacidade."),
      fato("EV-12", "A marca tem termos de uso publicados no site."),
      fato("EV-13", "A marca é simplesmente revolucionária e incrível."),
    ],
  });
  bloco("BIG MOMENT × NOTÍCIA COMUM");
  console.log("  ENTROU:");
  comparacao.moments.forEach(mostrar);
  console.log("\n  NÃO ENTROU:");
  for (const n of comparacao.non_moments) {
    console.log(`  [${n.motivo}] ${n.claim.slice(0, 60)}`);
    console.log(`     ${n.detalhe}`);
  }
  writeFileSync(join(SAIDA, "routine-news.json"), JSON.stringify(comparacao.non_moments, null, 2));
  writeFileSync(join(SAIDA, "marketing-hype.json"),
    JSON.stringify(comparacao.non_moments.filter((n) => n.motivo === "marketing_sem_evento"), null, 2));

  // ---- 3 fontes → 1 momento ----------------------------------------------
  const claim = "O artista anunciou turnê nacional em 20/11/2026.";
  const multi = await analisarBigMoments({
    entidade: "Artista Exemplo", agora: AGORA,
    evidencias: [
      fato("EV-21", claim, { dominios_independentes: 3 }),
      fato("EV-22", claim, { dominios_independentes: 3 }),
      fato("EV-23", claim, { dominios_independentes: 3 }),
    ],
  });
  bloco("3 FONTES → 1 BIG MOMENT");
  console.log(`  EV-21 + EV-22 + EV-23`);
  console.log(`     ↓`);
  console.log(`  ${multi.moments[0].id}  evidence_refs=${multi.moments[0].evidence_refs.length}  ${multi.moments[0].forca_verificacao}`);
  console.log(`  grupos de evento: ${multi.telemetria.grupos_de_evento}`);
  writeFileSync(join(SAIDA, "multi-source-event.json"), JSON.stringify(multi, null, 2));

  // ---- temporalidade ------------------------------------------------------
  bloco("TEMPORALIDADE");
  const casos: Array<[string, string]> = [
    ["FUTURO / PRE_EVENT", "O artista anunciou turnê em 20/12/2026."],
    ["ANTIGO / EXPIRED", "A marca lançou a coleção em 10/01/2024."],
    ["CANCELADO", "A turnê nacional foi cancelada pela produção."],
    ["DATA DESCONHECIDA", "A marca anunciou expansão para o segundo semestre."],
  ];
  for (const [nome, texto] of casos) {
    const pub = nome.includes("ANTIGO") ? "2024-01-10" : "2026-06-01";
    const x = await analisarBigMoments({
      entidade: "Entidade Exemplo", agora: AGORA,
      evidencias: [fato(`EV-T`, texto, { publicado_em: pub })],
    });
    const m = x.moments[0];
    console.log(`  ${nome.padEnd(20)} status=${(m?.temporal_status ?? "-").padEnd(10)} janela=${(m?.janela_oportunidade ?? "-").padEnd(10)} data=${m?.inicia_em ?? "null"} bruta="${m?.expressao_temporal ?? ""}"`);
  }
  writeFileSync(join(SAIDA, "unknown-date.json"), JSON.stringify(
    (await analisarBigMoments({
      entidade: "E", agora: AGORA,
      evidencias: [fato("EV-U", "A marca anunciou expansão para o segundo semestre.")],
    })).moments, null, 2));

  // ---- meeting claim ------------------------------------------------------
  const mc = await analisarBigMoments({
    entidade: "Marca Exemplo", agora: AGORA, evidencias: [],
    meetingClaims: [{ texto: "Vamos abrir 20 lojas no próximo semestre.", referencia: "ITEM-004" }],
  });
  bloco("MEETING CLAIM × EVIDENCE");
  console.log(`  claim: "${mc.unresolved_signals[0].texto}"`);
  console.log(`  status: ${mc.unresolved_signals[0].status}`);
  console.log(`  Big Moment factual criado: ${mc.moments.length}`);
  writeFileSync(join(SAIDA, "meeting-claim.json"), JSON.stringify(mc, null, 2));

  // ---- update / versionamento --------------------------------------------
  await withTransaction(async (client) => {
    const c1 = "O artista anunciou turnê em 20/11/2026.";
    const run1 = await analisarBigMoments({
      entidade: "Artista Versao", agora: AGORA, evidencias: [fato("EV-V1", c1)],
    });
    const s1 = await salvarMomento(client, run1.moments[0], { classifierVersao: CLASSIFIER_VERSAO });

    const conhecidos = await carregarConhecidos(client, "Artista Versao");
    const run2 = await analisarBigMoments({
      entidade: "Artista Versao", agora: AGORA,
      evidencias: [fato("EV-V1", c1), fato("EV-V2", c1)],
      momentosConhecidos: conhecidos,
    });
    const s2 = await salvarMomento(client, run2.moments[0], { classifierVersao: CLASSIFIER_VERSAO });

    const cancelado = { ...run2.moments[0], temporal_status: "cancelled" as const };
    const s3 = await salvarMomento(client, cancelado, { classifierVersao: CLASSIFIER_VERSAO });

    bloco("NOVIDADE × ATUALIZAÇÃO × TRAJETÓRIA");
    console.log(`  run 1: ${run1.moments[0].situacao.padEnd(12)} → v${s1.versao}`);
    console.log(`  run 2: ${run2.moments[0].situacao.padEnd(12)} → v${s2.versao}  (nova evidência)`);
    console.log(`  run 3: cancelado     → v${s3.versao}`);
    console.log(`  mesma linha? ${s1.id === s2.id && s2.id === s3.id}`);

    const versoes = await listarVersoes(client, s1.id);
    console.log(`\n  trajetória:`);
    for (const v of versoes.reverse()) {
      console.log(`    v${v.versao}  ${String(v.temporal_status).padEnd(12)} ${v.motivo_mudanca}`);
    }
    writeFileSync(join(SAIDA, "moment-update-v1.json"), JSON.stringify(run1.moments[0], null, 2));
    writeFileSync(join(SAIDA, "moment-update-v2.json"), JSON.stringify({ versoes }, null, 2));

    const ativos = await listarAtivos(client);
    const recentes = await listarRecentes(client, new Date(Date.now() - 86_400_000));
    bloco("CONSULTAS PARA O MONITORING");
    console.log(`  momentos ativos:   ${ativos.length}`);
    console.log(`  momentos recentes: ${recentes.length}`);

    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__ROLLBACK__") return;
    throw e;
  });

  // ---- 500 evidências -----------------------------------------------------
  const muitas: Fato[] = [];
  for (let i = 1; i <= 500; i++) {
    muitas.push(fato(`EV-${i}`, i % 5 === 0
      ? `A marca lançou o produto número ${i} da linha nova.`
      : `A marca atualizou sua política de privacidade versão ${i}.`));
  }
  const t0 = Date.now();
  const massa = await analisarBigMoments({ entidade: "Marca Massa", agora: AGORA, evidencias: muitas });
  const ms = Date.now() - t0;

  bloco("500 EVIDÊNCIAS · GUARDRAIL");
  console.log(`  recebidas:    ${massa.telemetria.evidence_recebida}`);
  console.log(`  descartadas:  ${massa.telemetria.evidence_descartada}`);
  console.log(`  consideradas: ${massa.telemetria.evidence_considerada}`);
  console.log(`  grupos:       ${massa.telemetria.grupos_de_evento}`);
  console.log(`  momentos:     ${massa.moments.length}`);
  console.log(`  tempo:        ${ms}ms   llm_calls: ${massa.telemetria.llm_calls}   custo: US$ ${massa.telemetria.custo_estimado_usd}`);
  writeFileSync(join(SAIDA, "500-evidence.json"), JSON.stringify(massa.telemetria, null, 2));

  // ---- efeitos colaterais -------------------------------------------------
  bloco("EFEITOS OPERACIONAIS E MODO");
  const t = artista.telemetria;
  for (const [k, v] of Object.entries({
    oportunidades_criadas: t.oportunidades_criadas,
    recomendacoes_criadas: t.recomendacoes_criadas,
    matching_disparado: t.matching_disparado,
    perfis_alterados: t.perfis_alterados,
    score_cards_alterados: t.score_cards_alterados,
    cross_knowledge_escrito: t.cross_knowledge_escrito,
    cross_memory_promovido: t.cross_memory_promovido,
  })) console.log(`  ${k.padEnd(28)} = ${v}`);
  console.log(`\n  classifier_mode           = ${artista.classifier_mode}`);
  console.log(`  nivel_validacao           = ${artista.nivel_validacao}`);
  console.log(`  validacao_semantica_real  = ${artista.validacao_semantica_real}`);
  console.log(`  paid LLM / embeddings     = ${t.llm_calls} / ${t.embedding_calls}`);
  console.log(`  custo                     = US$ ${t.custo_estimado_usd}`);

  writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify({
    artista: artista.telemetria, massa: massa.telemetria,
    classifier_mode: artista.classifier_mode,
    nivel_validacao: artista.nivel_validacao,
    validacao_semantica_real: artista.validacao_semantica_real,
  }, null, 2));

  console.log("\nraw outputs em docs/ai/validation/raw/big-moment-intelligence/");
}

main().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
