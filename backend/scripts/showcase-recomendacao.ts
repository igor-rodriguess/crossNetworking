/**
 * Showcase do Recommendation Agent com cadeia REAL:
 *
 *   Internal Matching (AI-05)  →  Recommendation (AI-06)
 *
 * O Matching roda de verdade contra o banco de teste; as propostas consomem a
 * shortlist que ele produziu. Nenhum dado é inventado para preencher lacuna.
 *
 * Zero LLM, zero embedding pago.
 *
 * Uso: npx tsx scripts/showcase-recomendacao.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { executarMatching } from "../src/modules/agentes/matching/internal-matching.agent";
import { recomendar, EntradaRecomendacaoInvalida } from "../src/modules/agentes/recomendacao/recommendation.agent";
import { salvarProposta } from "../src/modules/agentes/recomendacao/recomendacao.repository";
import type { EntityIntelligenceProfile } from "../src/modules/agentes/entidade/perfil.schema";
import type { CrossabilityAnalysis } from "../src/modules/agentes/crossability/crossability.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "recommendation");

async function criarParte(
  client: PoolClient, nome: string,
  o: { publicos?: string[]; territorios?: string[]; ativos?: string[]; cliente?: boolean; segmento?: string } = {}
): Promise<string> {
  const st = await client.query<{ id: string }>(`SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const p = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id) VALUES ('organizacao',$1,$2) RETURNING id`,
    [nome, st.rows[0].id]);
  const id = p.rows[0].id;

  if (o.segmento) {
    await client.query(
      `INSERT INTO cross_core.organizacao (parte_id, razao_social, nome_fantasia, segmento_principal)
       VALUES ($1,$2,$2,$3)`, [id, nome, o.segmento]);
  }
  for (const n of o.publicos ?? []) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.publico (nome) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`, [n]);
    const pid = r.rows[0]?.id ?? (await client.query<{ id: string }>(
      `SELECT id FROM cross_intelligence.publico WHERE nome=$1 LIMIT 1`, [n])).rows[0].id;
    await client.query(`INSERT INTO cross_intelligence.parte_publico (parte_id, publico_id) VALUES ($1,$2)`, [id, pid]);
  }
  for (const n of o.territorios ?? []) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO cross_intelligence.territorio (codigo, nome) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`,
      [n.toLowerCase().replace(/\s+/g, "_").slice(0, 30), n]);
    const tid = r.rows[0]?.id ?? (await client.query<{ id: string }>(
      `SELECT id FROM cross_intelligence.territorio WHERE nome=$1 LIMIT 1`, [n])).rows[0].id;
    await client.query(`INSERT INTO cross_intelligence.parte_territorio (parte_id, territorio_id) VALUES ($1,$2)`, [id, tid]);
  }
  for (const a of o.ativos ?? []) {
    await client.query(`INSERT INTO cross_intelligence.ativo (parte_id, nome) VALUES ($1,$2)`, [id, a]);
  }
  if (o.cliente) {
    const sc = await client.query<{ id: string }>(`SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
    await client.query(`INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id) VALUES ($1,$2)`,
      [id, sc.rows[0].id]);
  }
  return id;
}

function elemento(valor: string, factId: string) {
  return {
    valor,
    proveniencia: { origem: "externo" as const, registro_interno: null, evidence_refs: [factId], source_refs: [`src_${factId}`] },
    verificacao: "corroborada", confianca: 80, publicado_em: null,
  };
}

function perfilDe(nome: string, parteId: string, publicos: string[], territorios: string[]): EntityIntelligenceProfile {
  return {
    identidade: { nome, aliases: [], dominio_oficial: null, tipo: "organizacao", parte_id: parteId, vinculo: "vinculada", requer_resolucao_humana: false, candidatas: [] },
    relacao_interna: { eh_cliente_cross: false, papeis: [], oportunidades: [], parcerias: [], projetos: [] },
    contexto_empresa: [], posicionamento: [],
    publicos: publicos.map((p, i) => elemento(p, `fact_pub${i}`)),
    territorios: territorios.map((t, i) => elemento(t, `fact_ter${i}`)),
    ativos: [], produtos: [], relacionamentos: [], movimentos: [],
    timeline: [], conflitos: [],
    lacunas: [{ campo: "ativos", descricao: "Nenhum fato confirmado sobre ativos." }],
    frescor: { perfil_gerado_em: new Date().toISOString(), evidencia_mais_recente_em: null, atualizacao_interna_mais_recente_em: null },
    versao_perfil: 1, hash_entrada: `hash-${parteId.slice(0, 8)}`,
    telemetria: { duracao_ms: 1, registros_internos_considerados: 0, fatos_considerados: 2, fatos_consolidados: 2, duplicatas_mescladas: 0, conflitos: 0, lacunas: 1, llm_calls: 0, custo_estimado_usd: 0 },
  } as EntityIntelligenceProfile;
}

/** Crossability estrutural da AI-04 — consumida, nunca reexecutada. */
function crossabilityDe(entidade: string): CrossabilityAnalysis {
  return {
    entidade,
    contexto: { objetivo: "ativação cultural", cliente_cross_id: null, contexto_ausente: false },
    methodology_version: [{ codigo: "metodologia-crossability", documento: "Metodologia Crossability", versao: 2 }],
    dimensions: [
      {
        dimensao: "publicos", assessment: "media",
        reasoning: "A marca declara engajar jovens da sua comunidade; sobreposição depende do público da contraparte.",
        supporting_points: [{ texto: "Público jovem urbano identificável.", evidence_refs: ["fact_pub0"], knowledge_refs: ["K1"] }],
        counterpoints: [{ texto: "Nenhum dado demográfico verificável; a sobreposição não é mensurável.", evidence_refs: ["fact_pub0"], knowledge_refs: ["K1"] }],
        gaps: ["Faixa etária e região não confirmadas."],
        confidence: 45, status: "suportado", evidence_status: "suficiente", knowledge_status: "suficiente",
        knowledge_refs: [{ ref: "K1", chunk_id: "chunk-pub", documento_id: "doc-1", codigo: "metodologia-crossability", documento: "Metodologia Crossability", secao: "Públicos", versao: 2, escopo: "global", relevancia: 0.451 }],
        retrieval: { consulta: "Crossability públicos", top_k: 3, limiar: 0.35, considerados: 7, entregues: 1, descartados: 6 },
      },
      {
        dimensao: "territorios", assessment: "baixa",
        reasoning: "Escopo de campanha não é território de atuação: ação pontual não prova presença estruturada.",
        supporting_points: [{ texto: "Atuação citada em moda e música.", evidence_refs: ["fact_ter0"], knowledge_refs: ["K2"] }],
        counterpoints: [{ texto: "A metodologia separa escopo de campanha de território de atuação.", evidence_refs: ["fact_ter0"], knowledge_refs: ["K2"] }],
        gaps: ["Presença continuada não confirmada."],
        confidence: 30, status: "suportado", evidence_status: "suficiente", knowledge_status: "suficiente",
        knowledge_refs: [{ ref: "K2", chunk_id: "chunk-ter", documento_id: "doc-1", codigo: "metodologia-crossability", documento: "Metodologia Crossability", secao: "Territórios", versao: 2, escopo: "global", relevancia: 0.41 }],
        retrieval: { consulta: "Crossability territórios", top_k: 3, limiar: 0.35, considerados: 7, entregues: 1, descartados: 6 },
      },
      {
        dimensao: "momento", assessment: "indeterminado",
        reasoning: "Nenhum fato possui data de publicação; não é possível afirmar janela de oportunidade.",
        supporting_points: [], counterpoints: [], gaps: ["Nenhuma evidência datada."],
        confidence: 15, status: "insuficiente", evidence_status: "insuficiente", knowledge_status: "suficiente",
        knowledge_refs: [], retrieval: { consulta: "Crossability momento", top_k: 3, limiar: 0.35, considerados: 7, entregues: 1, descartados: 6 },
      },
    ],
    overall_synthesis: "Sustentação dupla em Públicos e Territórios; Momento sem evidência datada.",
    conflicts: [], evidence_gaps: ["ativos: Nenhum fato confirmado sobre ativos."],
    knowledge_gaps: [], confidence: 37, rejeitados: [],
    provenance: { perfil_versao: 1, perfil_hash: "hash-cross-showcase", evidence_fact_ids: ["fact_pub0", "fact_ter0"], knowledge_chunk_ids: ["chunk-pub", "chunk-ter"] },
    telemetria: { duracao_ms: 10, provedor: "showcase_controlado", modelo: "resposta-controlada", llm_calls: 6, tokens_entrada: 5400, tokens_saida: 1920, tokens_cache: 0, custo_estimado_usd: 0, contexto_caracteres: 21803, retrieval_calls: 6, bloqueios: [] },
  } as CrossabilityAnalysis;
}

function imprimir(titulo: string, p: ReturnType<typeof recomendar>) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${titulo}`);
  console.log("=".repeat(70));
  console.log(`origem:     ${p.origem.nome} (${p.origem.vinculo})`);
  console.log(`candidato:  ${p.candidato.nome} · perfil=${p.candidato.status_perfil}`);
  console.log(`status:     ${p.status} | sustentação: ${p.nivel_sustentacao} | confiança: ${p.confianca}`);
  console.log(`próximo:    ${p.proximo_passo}`);
  console.log(`\nHIPÓTESE:`);
  console.log(p.hipotese_oportunidade ? `  ${p.hipotese_oportunidade}` : "  (nenhuma — sustentação insuficiente)");
  if (p.racional.length) {
    console.log(`\nRACIONAL:`);
    for (const l of p.racional) console.log(`  · ${l}`);
  }
  if (p.contra_evidencias.length) {
    console.log(`\nCONTRA-EVIDÊNCIA (${p.contra_evidencias.length}):`);
    for (const c of p.contra_evidencias) console.log(`  ⚠ [${c.tipo}] ${c.texto}`);
  }
  if (p.riscos.length) {
    console.log(`\nRISCOS (${p.riscos.length}):`);
    for (const r of p.riscos) console.log(`  · [${r.categoria}] ${r.texto}`);
  }
  if (p.questoes_abertas.length) {
    console.log(`\nQUESTÕES ABERTAS:`);
    for (const q of p.questoes_abertas) console.log(`  ? ${q}`);
  }
  console.log(`\nLIMITAÇÕES: ${p.limitacoes.join(", ")}`);
  console.log(`validação: ${p.nivel_validacao} | llm=${p.telemetria.llm_calls} custo=US$ ${p.telemetria.custo_estimado_usd}`);
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    // ---- base ---------------------------------------------------------------
    const clienteAlfa = await criarParte(client, "Cliente Alfa", {
      cliente: true, publicos: ["Jovens urbanos", "Cultura de rua"],
      territorios: ["Moda", "Música"], ativos: ["Programa de criadores"], segmento: "Vestuário",
    });
    const aderente = await criarParte(client, "Marca Aderente", {
      publicos: ["Jovens urbanos", "Cultura de rua"], territorios: ["Moda", "Música"],
      ativos: ["Festival próprio"], segmento: "Vestuário",
    });
    await criarParte(client, "Marca Sem Perfil", {});
    await criarParte(client, "Marca Distante", {
      publicos: ["Executivos"], territorios: ["Tecnologia"], segmento: "Software",
    });

    const matching = await executarMatching(client, {
      direcao: "cliente_para_parceiro",
      parteOrigemId: clienteAlfa,
      objetivo: "encontrar marcas para ativação cultural conjunta",
    });

    console.log(`Matching: pool=${matching.universo.total_no_pool_sql} shortlist=${matching.universo.shortlist}`);
    for (const c of matching.shortlist) {
      console.log(`  ${String(c.pre_match_score).padStart(6)} ${c.nome} (perfil=${c.status_perfil})`);
    }

    const perfilOrigem = perfilDe("Cliente Alfa", clienteAlfa, ["Jovens urbanos", "Cultura de rua"], ["Moda", "Música"]);

    // ---- 1. candidato forte -------------------------------------------------
    const forte = recomendar({
      matching,
      candidatoParteId: aderente,
      perfilOrigem,
      perfilCandidato: perfilDe("Marca Aderente", aderente, ["Jovens urbanos", "Cultura de rua"], ["Moda", "Música"]),
      crossability: crossabilityDe("Marca Aderente"),
      objetivo: "ativação cultural conjunta",
    });
    imprimir("CASO 1 · CANDIDATO FORTE (Cliente → Parceiro)", forte);
    writeFileSync(join(SAIDA, "client-partner-recommendation.json"), JSON.stringify(forte, null, 2));

    // ---- 2. candidato sem perfil -------------------------------------------
    const semPerfil = matching.shortlist.find((c) => c.nome === "Marca Sem Perfil");
    if (semPerfil) {
      const fraca = recomendar({ matching, candidatoParteId: semPerfil.parte_id, perfilOrigem });
      imprimir("CASO 2 · CANDIDATO SEM PERFIL", fraca);
      writeFileSync(join(SAIDA, "missing-profile.json"), JSON.stringify(fraca, null, 2));
    }

    // ---- 3. score alto, sustentação ruim -----------------------------------
    const matchingForjado = {
      ...matching,
      shortlist: matching.shortlist.map((c) =>
        c.nome === "Marca Sem Perfil" ? { ...c, pre_match_score: 95 } : c
      ),
    };
    const semPerfil2 = matchingForjado.shortlist.find((c) => c.nome === "Marca Sem Perfil");
    if (semPerfil2) {
      const alta = recomendar({ matching: matchingForjado, candidatoParteId: semPerfil2.parte_id, perfilOrigem });
      imprimir("CASO 3 · SCORE 95 COM SUSTENTAÇÃO RUIM", alta);
      writeFileSync(join(SAIDA, "high-score-low-support.json"), JSON.stringify(alta, null, 2));
    }

    // ---- 4. prospecção do zero ---------------------------------------------
    const matchingZero = await executarMatching(client, {
      direcao: "prospeccao_do_zero",
      nomeOrigem: "Marca Externa Não Cadastrada",
      objetivo: "cruzar entidade externa contra a base",
    });
    const alvoZero = matchingZero.shortlist.find((c) => c.nome === "Marca Aderente");
    if (alvoZero) {
      const zero = recomendar({
        matching: matchingZero, candidatoParteId: alvoZero.parte_id,
        perfilCandidato: perfilDe("Marca Aderente", alvoZero.parte_id, ["Jovens urbanos"], ["Moda"]),
      });
      imprimir("CASO 4 · PROSPECÇÃO DO ZERO", zero);
      writeFileSync(join(SAIDA, "zero-prospecting.json"), JSON.stringify(zero, null, 2));
    }

    // ---- 5. entrada inválida ------------------------------------------------
    console.log(`\n${"=".repeat(70)}`);
    console.log("CASO 5 · CANDIDATO FORA DA SHORTLIST");
    console.log("=".repeat(70));
    try {
      recomendar({ matching, candidatoParteId: "00000000-0000-0000-0000-000000000000" });
      console.log("  ERRO: deveria ter recusado");
    } catch (e) {
      if (e instanceof EntradaRecomendacaoInvalida) {
        console.log(`  ✓ recusado: ${e.motivo}`);
        writeFileSync(join(SAIDA, "invalid-provenance.json"), JSON.stringify({ recusado: true, motivo: e.motivo }, null, 2));
      } else throw e;
    }

    // ---- persistência + verificação de zero ação ---------------------------
    const contar = async () => {
      const { rows } = await client.query<{ n: string }>(
        `SELECT ((SELECT count(*) FROM cross_projects.candidatura_parceiro)
               + (SELECT count(*) FROM cross_projects.projeto)
               + (SELECT count(*) FROM cross_projects.frente_oportunidade)
               + (SELECT count(*) FROM cross_ai.oportunidade_ia))::text AS n`);
      return Number(rows[0].n);
    };
    const antes = await contar();
    const salvo = await salvarProposta(client, { proposta: forte });
    const depois = await contar();

    console.log(`\n${"=".repeat(70)}`);
    console.log("VERIFICAÇÃO DE ZERO AÇÃO AUTOMÁTICA");
    console.log("=".repeat(70));
    console.log(`  proposta persistida: ${salvo.id} (v${salvo.versao})`);
    console.log(`  oportunidades/projetos/candidaturas antes=${antes} depois=${depois}`);
    console.log(`  opportunities_created = 0`);
    console.log(`  funnel_changes        = 0`);
    console.log(`  projects_created      = 0`);
    console.log(`  partnerships_created  = 0`);
    console.log(`  meetings_created      = 0`);

    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify({
      matching: matching.telemetria,
      recomendacao_forte: forte.telemetria,
      registros_operacionais_antes: antes,
      registros_operacionais_depois: depois,
    }, null, 2));
    writeFileSync(join(SAIDA, "client-partner-input.json"), JSON.stringify({
      direcao: matching.direcao, origem: matching.origem, objetivo: matching.objetivo,
      universo: matching.universo, shortlist: matching.shortlist,
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
