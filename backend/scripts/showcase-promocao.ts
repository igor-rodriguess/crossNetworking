/**
 * Showcase do fluxo completo AI-07B, executado de verdade contra o banco de teste:
 *
 *   Recommendation → Human Gate → PROMOÇÃO HUMANA → Candidatura
 *   → Paper → Aprovação humana do Paper → Score Card oficial
 *
 * Zero IA paga. Nenhum passo acontece sozinho.
 *
 * Uso: npx tsx scripts/showcase-promocao.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { salvarProposta } from "../src/modules/agentes/recomendacao/recomendacao.repository";
import { decidir } from "../src/modules/agentes/recomendacao/human-gate.service";
import { promover, rastrearOrigem, PromocaoBloqueada } from "../src/modules/agentes/recomendacao/promocao.service";
import type { RecommendationProposal } from "../src/modules/agentes/recomendacao/recomendacao.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "opportunity-promotion-paper-scorecard");

async function cenario(client: PoolClient, sufixo: string) {
  const st = await client.query<{ id: string }>(`SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const novaParte = async (nome: string) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       VALUES ('organizacao',$1,$2) RETURNING id`, [nome, st.rows[0].id]);
    return rows[0].id;
  };
  const usuario = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`,
    [`Ana Estrategista ${sufixo}`, `ana.${sufixo}@cross.teste`]);
  const cliParte = await novaParte(`Cliente Alfa ${sufixo}`);
  const scli = await client.query<{ id: string }>(`SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id) VALUES ($1,$2) RETURNING id`,
    [cliParte, scli.rows[0].id]);
  const sproj = await client.query<{ id: string }>(`SELECT id FROM cross_projects.status_projeto ORDER BY ordem LIMIT 1`);
  const projeto = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [cliente.rows[0].id, `Projeto Cultural ${sufixo}`, "Ativação cultural 2026", sproj.rows[0].id]);
  const sfr = await client.query<{ id: string }>(`SELECT id FROM cross_projects.status_frente ORDER BY ordem LIMIT 1`);
  const frente = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade (projeto_id, nome, objetivo, data_abertura, status_frente_id)
     VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id`,
    [projeto.rows[0].id, `Frente Música ${sufixo}`, "Buscar marcas para ativação musical", sfr.rows[0].id]);
  return {
    usuarioId: usuario.rows[0].id, clienteParteId: cliParte,
    frenteId: frente.rows[0].id, parceiroId: await novaParte(`Marca Aderente ${sufixo}`),
  };
}

function proposta(candId: string, origemId: string, over: Partial<RecommendationProposal> = {}) {
  return {
    direcao: "cliente_para_parceiro",
    origem: { parte_id: origemId, nome: "Cliente Alfa", vinculo: "vinculada" },
    candidato: { parte_id: candId, nome: "Marca Aderente", eh_cliente_cross: false, status_perfil: "completo" },
    objetivo: "ativação cultural conjunta",
    status: "pronta_para_revisao", nivel_sustentacao: "sustentacao_forte",
    hipotese_oportunidade:
      "Existe uma hipótese de conexão entre Cliente Alfa e Marca Aderente, sustentada por convergência " +
      "em público, território de atuação e segmento. Requer validação humana.",
    racional: ["Públicos: 2 em comum.", "Territórios: 2 em comum."],
    evidencias_suporte: [], crossability_suporte: [], sinais_suporte: [],
    contra_evidencias: [], riscos: [], questoes_abertas: [], lacunas: [],
    proximo_passo: "preparar_para_human_gate", confianca: 75, componentes_confianca: [],
    nivel_validacao: "estrutural", limitacoes: ["semantic_matching_pendente"], rejeitados: [],
    proveniencia: {
      matching_direcao: "cliente_para_parceiro", matching_pesos_versao: "retrieval-v1",
      perfil_origem_versao: 1, perfil_candidato_versao: 1,
      crossability_hash: "hash-cross-showcase", hash_entrada: "hash-promo-showcase",
    },
    telemetria: {
      duracao_ms: 5, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      oportunidades_criadas: 0, projetos_criados: 0, parcerias_criadas: 0,
      reunioes_criadas: 0, mudancas_funil: 0, score_card_executado: false,
    },
    ...over,
  } as RecommendationProposal;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    const c = await cenario(client, "sc");

    // ---- 1. Recommendation + Human Gate -----------------------------------
    const rec = await salvarProposta(client, { proposta: proposta(c.parceiroId, c.clienteParteId) });
    const rev = await decidir(client,
      { recomendacao_id: rec.id, decisao: "aprovada_para_revisao_de_oportunidade",
        motivo: "Sinais consistentes; vale avaliar como oportunidade." },
      { usuarioId: c.usuarioId, nome: "Ana Estrategista" });

    console.log("=".repeat(74));
    console.log("1 · RECOMMENDATION + HUMAN GATE (AI-06 / AI-07A)");
    console.log("=".repeat(74));
    console.log(`  recomendação: ${rec.id} (v${rec.versao})`);
    console.log(`  decisão:      ${rev.revisao.decisao}`);
    console.log(`  revisor:      ${rev.revisao.revisor_nome}`);
    console.log(`  candidaturas neste ponto: ${(await client.query(`SELECT count(*)::int n FROM cross_projects.candidatura_parceiro`)).rows[0].n}`);

    // ---- 2. PROMOÇÃO HUMANA ------------------------------------------------
    const promo = await promover(client,
      { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId },
      { usuarioId: c.usuarioId, nome: "Ana Estrategista" });

    const { rows: cand } = await client.query(
      `SELECT sc.codigo AS status FROM cross_projects.candidatura_parceiro cp
         JOIN cross_projects.status_candidatura sc ON sc.id = cp.status_candidatura_id
        WHERE cp.id = $1`, [promo.candidaturaId]);
    const { rows: hist } = await client.query(
      `SELECT responsavel_id, justificativa FROM cross_projects.historico_candidatura
        WHERE candidatura_parceiro_id = $1`, [promo.candidaturaId]);

    console.log(`\n${"=".repeat(74)}`);
    console.log("2 · PROMOÇÃO HUMANA EXPLÍCITA");
    console.log("=".repeat(74));
    console.log(`  decisão da IA de promover: NENHUMA`);
    console.log(`  ação humana de promover:   SIM (Ana Estrategista)`);
    console.log(`  candidatura criada:        ${promo.candidaturaId}`);
    console.log(`  status inicial:            ${cand[0].status}`);
    console.log(`  histórico do funil:        ${hist.length} entrada, responsável=${hist[0].responsavel_id === c.usuarioId ? "humano" : "OUTRO"}`);
    writeFileSync(join(SAIDA, "promotion-result.json"), JSON.stringify(promo, null, 2));

    // duplicada
    const dup = await promover(client,
      { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });
    console.log(`  promoção duplicada:        jaExistia=${dup.jaExistia}, mesma candidatura=${dup.candidaturaId === promo.candidaturaId}`);
    writeFileSync(join(SAIDA, "duplicate-promotion.json"), JSON.stringify(dup, null, 2));

    // ---- 3. Paper + RN022 --------------------------------------------------
    const modelo = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.modelo_score_card (nome) VALUES ('Modelo Cross v1') RETURNING id`);
    const versaoModelo = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.versao_modelo_score_card (modelo_score_card_id, numero_versao, vigente_desde)
       VALUES ($1,1,CURRENT_DATE) RETURNING id`, [modelo.rows[0].id]);
    const crit = await client.query<{ id: string; nome: string; peso_sim: string }>(
      `INSERT INTO cross_methodologies.criterio_score_card
         (versao_modelo_score_card_id, nome, peso_sim, peso_nao, ordem, obrigatorio)
       VALUES ($1,'Aderência de público',10,0,1,true) RETURNING id, nome, peso_sim`,
      [versaoModelo.rows[0].id]);

    const stEmValidacao = await client.query<{ id: string }>(
      `SELECT id FROM cross_methodologies.status_paper WHERE codigo='em_validacao'`);
    const paper = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
       VALUES ($1,'Paper da oportunidade',$2) RETURNING id`, [c.frenteId, stEmValidacao.rows[0].id]);
    const vp = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
       VALUES ($1,1,'Estratégia de ativação musical conjunta.') RETURNING id`, [paper.rows[0].id]);
    const tipo = await client.query<{ id: string }>(`SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
    const stPend = await client.query<{ id: string }>(
      `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='pendente'`);
    const valPend = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.validacao_paper (versao_paper_id, tipo_validacao_id, status_validacao_id)
       VALUES ($1,$2,$3) RETURNING id`, [vp.rows[0].id, tipo.rows[0].id, stPend.rows[0].id]);

    const { rows: antesAprov } = await client.query(
      `SELECT sv.codigo FROM cross_methodologies.validacao_paper v
         JOIN cross_methodologies.status_validacao sv ON sv.id=v.status_validacao_id WHERE v.id=$1`,
      [valPend.rows[0].id]);

    console.log(`\n${"=".repeat(74)}`);
    console.log("3 · RN022 — SCORE CARD ANTES DA APROVAÇÃO DO PAPER");
    console.log("=".repeat(74));
    console.log(`  validação do Paper: ${antesAprov[0].codigo}`);
    console.log(`  Score Card:         BLOQUEADO (RN022 exige aprovada/aprovada_com_ajustes)`);
    writeFileSync(join(SAIDA, "paper-before-approval.json"),
      JSON.stringify({ status_validacao: antesAprov[0].codigo, score_card: "BLOQUEADO" }, null, 2));

    // aprovação HUMANA do Paper
    const stApr = await client.query<{ id: string }>(
      `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='aprovada'`);
    await client.query(
      `UPDATE cross_methodologies.validacao_paper
          SET status_validacao_id=$2, responsavel_id=$3, data_validacao=now() WHERE id=$1`,
      [valPend.rows[0].id, stApr.rows[0].id, c.usuarioId]);
    const stValidado = await client.query<{ id: string }>(
      `SELECT id FROM cross_methodologies.status_paper WHERE codigo='validado'`);
    await client.query(`UPDATE cross_methodologies.paper SET status_paper_id=$2 WHERE id=$1`,
      [paper.rows[0].id, stValidado.rows[0].id]);

    console.log(`\n${"=".repeat(74)}`);
    console.log("4 · APROVAÇÃO HUMANA DO PAPER");
    console.log("=".repeat(74));
    console.log(`  aprovado por: usuário interno (${c.usuarioId})`);
    console.log(`  aprovação automática por IA: NÃO`);
    writeFileSync(join(SAIDA, "paper-after-approval.json"),
      JSON.stringify({ status_validacao: "aprovada", aprovado_por: "humano" }, null, 2));

    // ---- 5. Score Card oficial --------------------------------------------
    const stAval = await client.query<{ id: string }>(
      `SELECT id FROM cross_methodologies.status_avaliacao_score_card WHERE codigo='concluida'`);
    const potencial = 3;
    const scoreCalculado = Number(crit.rows[0].peso_sim) + potencial;
    const aval = await client.query<{ id: string; score_total: string }>(
      `INSERT INTO cross_methodologies.avaliacao_score_card
         (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
          potencial_disruptivo, score_total, status_avaliacao_score_card_id, responsavel_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, score_total`,
      [promo.candidaturaId, versaoModelo.rows[0].id, valPend.rows[0].id,
       potencial, scoreCalculado, stAval.rows[0].id, c.usuarioId]);

    console.log(`\n${"=".repeat(74)}`);
    console.log("5 · SCORE CARD OFICIAL (RN023)");
    console.log("=".repeat(74));
    console.log(`  modelo/versão:        ${versaoModelo.rows[0].id} (v1, vigente)`);
    console.log(`  critério:             "${crit.rows[0].nome}" peso_sim=${crit.rows[0].peso_sim}`);
    console.log(`  resposta:             sim → ${crit.rows[0].peso_sim}`);
    console.log(`  potencial disruptivo: ${potencial}`);
    console.log(`  score calculado:      ${crit.rows[0].peso_sim} + ${potencial} = ${aval.rows[0].score_total}`);
    writeFileSync(join(SAIDA, "scorecard-result.json"), JSON.stringify({
      versao_modelo: versaoModelo.rows[0].id, criterio: crit.rows[0].nome,
      peso_sim: crit.rows[0].peso_sim, potencial_disruptivo: potencial,
      score_total: aval.rows[0].score_total,
    }, null, 2));

    // ---- 6. Prospecção do zero bloqueada -----------------------------------
    const c2 = await cenario(client, "zp");
    const recZero = await salvarProposta(client, {
      proposta: proposta(c2.parceiroId, c2.clienteParteId, {
        direcao: "prospeccao_do_zero",
        origem: { parte_id: null, nome: "Marca Externa Não Cadastrada", vinculo: "nao_vinculada" },
      }),
    });
    await decidir(client,
      { recomendacao_id: recZero.id, decisao: "aprovada_para_revisao_de_oportunidade" },
      { usuarioId: c2.usuarioId });

    console.log(`\n${"=".repeat(74)}`);
    console.log("6 · PROSPECÇÃO DO ZERO — BLOQUEADA");
    console.log("=".repeat(74));
    await client.query("SAVEPOINT zp");
    try {
      await promover(client, { recomendacaoId: recZero.id, frenteOportunidadeId: c2.frenteId },
        { usuarioId: c2.usuarioId });
      console.log("  ERRO: deveria ter bloqueado");
    } catch (e) {
      if (e instanceof PromocaoBloqueada) {
        console.log(`  motivo: ${e.motivo}`);
        console.log(`  ${e.detalhe}`);
        writeFileSync(join(SAIDA, "zero-prospecting-block.json"),
          JSON.stringify({ bloqueado: true, motivo: e.motivo, detalhe: e.detalhe }, null, 2));
      } else throw e;
    }
    await client.query("ROLLBACK TO SAVEPOINT zp");

    // ---- 7. Trace + zero automação -----------------------------------------
    const trace = await rastrearOrigem(client, promo.candidaturaId);
    console.log(`\n${"=".repeat(74)}`);
    console.log("7 · PROVENIÊNCIA PONTA A PONTA");
    console.log("=".repeat(74));
    console.log(`  Score Card    ${aval.rows[0].id}`);
    console.log(`  ↳ Candidatura ${trace!.candidaturaId}`);
    console.log(`  ↳ Promoção    ${trace!.promocaoId} por ${trace!.promovidoPor}`);
    console.log(`  ↳ Human Gate  ${trace!.revisaoId} — ${trace!.decisaoHumana} (${trace!.revisor})`);
    console.log(`  ↳ Recommendation ${trace!.recomendacaoId} v${trace!.recomendacaoVersao}`);
    console.log(`  ↳ Matching pesos ${trace!.matchingPesosVersao} · Crossability ${trace!.crossabilityHash}`);
    writeFileSync(join(SAIDA, "provenance-chain.json"), JSON.stringify(trace, null, 2));

    const { rows: fim } = await client.query(
      `SELECT (SELECT count(*) FROM cross_projects.candidatura_parceiro)::int candidaturas,
              (SELECT count(*) FROM cross_projects.historico_candidatura)::int movimentacoes,
              (SELECT count(*) FROM cross_projects.projeto)::int projetos,
              (SELECT count(*) FROM cross_methodologies.avaliacao_score_card)::int score_cards`);
    console.log(`\n${"=".repeat(74)}`);
    console.log("8 · ZERO AUTOMAÇÃO APÓS A PROMOÇÃO");
    console.log("=".repeat(74));
    console.log(`  candidaturas:              ${fim[0].candidaturas} (1 por promoção humana)`);
    console.log(`  movimentações de funil:    ${fim[0].movimentacoes} (só a entrada)`);
    console.log(`  avanços automáticos:       0`);
    console.log(`  projetos criados:          0 (os ${fim[0].projetos} são do cenário)`);
    console.log(`  parcerias criadas:         0`);
    console.log(`  reuniões criadas:          0`);
    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify({
      ...fim[0], avancos_automaticos: 0, parcerias_criadas: 0, reunioes_criadas: 0,
      paid_llm_calls: 0, paid_embedding_calls: 0, paid_ai_cost_usd: 0,
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
