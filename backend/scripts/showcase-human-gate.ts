/**
 * Showcase do Recommendation Human Gate com execução REAL contra o banco de teste.
 *
 * Demonstra: INTELLIGENCE PROPOSAL → HUMAN DECISION.
 *
 * Zero IA paga. Nenhuma candidatura, Paper ou Score Card é criado.
 *
 * Uso: npx tsx scripts/showcase-human-gate.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { salvarProposta } from "../src/modules/agentes/recomendacao/recomendacao.repository";
import {
  decidir, listarPendentes, historicoDecisoes,
} from "../src/modules/agentes/recomendacao/human-gate.service";
import { ConflitoDeVersao } from "../src/modules/agentes/recomendacao/human-gate.schema";
import type { RecommendationProposal } from "../src/modules/agentes/recomendacao/recomendacao.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "recommendation-human-gate");

async function criarParte(client: PoolClient, nome: string): Promise<string> {
  const st = await client.query<{ id: string }>(`SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const p = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id) VALUES ('organizacao',$1,$2) RETURNING id`,
    [nome, st.rows[0].id]);
  return p.rows[0].id;
}

async function criarUsuario(client: PoolClient, nome: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`,
    [nome, `${nome.toLowerCase().replace(/\s+/g, ".")}@cross.teste`]);
  return rows[0].id;
}

function proposta(candId: string, nome: string, over: Partial<RecommendationProposal> = {}): RecommendationProposal {
  return {
    direcao: "cliente_para_parceiro",
    origem: { parte_id: null, nome: "Cliente Alfa", vinculo: "vinculada" },
    candidato: { parte_id: candId, nome, eh_cliente_cross: false, status_perfil: "completo" },
    objetivo: "ativação cultural conjunta",
    status: "pronta_para_revisao",
    nivel_sustentacao: "sustentacao_forte",
    hipotese_oportunidade:
      "Existe uma hipótese de conexão entre Cliente Alfa e " + nome +
      ", sustentada por convergência em público, território de atuação, segmento. " +
      "A hipótese requer validação humana e não constitui avaliação de encaixe comercial.",
    racional: [
      "Públicos: 2 em comum (Cultura de rua, Jovens urbanos).",
      "Territórios: 2 em comum (Moda, Música).",
      "A análise Crossability sustenta 2 dimensão(ões): publicos, territorios.",
    ],
    evidencias_suporte: [
      { evidence_ref: "fact_pub0", afirmacao: "Jovens urbanos de 18 a 24 anos", origem: "externo", proveniencia: "evidence:fact_pub0 · fontes:src_fact_pub0" },
    ],
    crossability_suporte: [
      { analise_ref: "hash-cross", dimensao: "publicos", assessment: "media", status: "suportado", confianca: 45, evidence_refs: ["fact_pub0"], knowledge_refs: ["K1"], nivel_validacao: "estrutural" },
    ],
    sinais_suporte: [
      { tipo: "publico", forca: "forte", valor: 1, descricao: "Públicos: 2 em comum.", proveniencia: "cross_intelligence.parte_publico(parte_id=…)" },
    ],
    contra_evidencias: [
      { texto: "[publicos] Nenhum dado demográfico verificável; a sobreposição não é mensurável.", tipo: "sinal_contrario", evidence_refs: ["fact_pub0"], proveniencia: "crossability.publicos" },
    ],
    riscos: [{ texto: "Reasoning Crossability com IA real ainda não homologado.", categoria: "validacao_pendente" }],
    questoes_abertas: ["Confirmar interesse atual do candidato."],
    lacunas: [{ origem: "entity_intelligence", descricao: "ativos: Nenhum fato confirmado." }],
    proximo_passo: "preparar_para_human_gate",
    confianca: 75, componentes_confianca: [],
    nivel_validacao: "estrutural",
    limitacoes: ["crossability_real_reasoning_pendente", "semantic_matching_pendente"],
    rejeitados: [],
    proveniencia: {
      matching_direcao: "cliente_para_parceiro", matching_pesos_versao: "retrieval-v1",
      perfil_origem_versao: 1, perfil_candidato_versao: 1,
      crossability_hash: "hash-cross", hash_entrada: "hash-showcase-1",
    },
    telemetria: {
      duracao_ms: 5, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      oportunidades_criadas: 0, projetos_criados: 0, parcerias_criadas: 0,
      reunioes_criadas: 0, mudancas_funil: 0, score_card_executado: false,
    },
    ...over,
  } as RecommendationProposal;
}

async function contarOperacional(client: PoolClient) {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*) FROM cross_projects.candidatura_parceiro)::int   AS candidaturas,
       (SELECT count(*) FROM cross_projects.projeto)::int                AS projetos,
       (SELECT count(*) FROM cross_projects.frente_oportunidade)::int    AS frentes,
       (SELECT count(*) FROM cross_methodologies.paper_candidatura)::int AS papers,
       (SELECT count(*) FROM cross_methodologies.avaliacao_score_card)::int AS score_cards,
       (SELECT count(*) FROM cross_projects.historico_candidatura)::int  AS historico_funil`);
  return rows[0];
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    const antes = await contarOperacional(client);
    const ana = await criarUsuario(client, "Ana Estrategista");
    const bruno = await criarUsuario(client, "Bruno Coordenador");

    // ---- CASO A: APPROVE ---------------------------------------------------
    const candA = await criarParte(client, "Marca Aderente");
    const recA = await salvarProposta(client, { proposta: proposta(candA, "Marca Aderente") });

    const pendentesAntes = await listarPendentes(client);
    console.log(`\nFILA DE PENDÊNCIAS: ${pendentesAntes.length} aguardando decisão`);

    const apr = await decidir(client, {
      recomendacao_id: recA.id,
      decisao: "aprovada_para_revisao_de_oportunidade",
      motivo: "Sinais consistentes de público e território; vale levar adiante.",
    }, { usuarioId: ana, nome: "Ana Estrategista" });

    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO A · APROVAÇÃO");
    console.log("=".repeat(72));
    console.log(`decisão:  ${apr.revisao.decisao}`);
    console.log(`revisor:  ${apr.revisao.revisor_nome}`);
    console.log(`motivo:   ${apr.revisao.motivo}`);
    console.log(`validação: ${apr.revisao.nivel_validacao}`);
    writeFileSync(join(SAIDA, "approve.json"), JSON.stringify(apr.revisao, null, 2));

    // ---- CASO B: EDIT + APPROVE -------------------------------------------
    const candB = await criarParte(client, "Marca Editada");
    const recB = await salvarProposta(client, { proposta: proposta(candB, "Marca Editada") });
    const originalB = proposta(candB, "Marca Editada").hipotese_oportunidade!;

    const edit = await decidir(client, {
      recomendacao_id: recB.id,
      decisao: "aprovada_com_edicoes",
      motivo: "O território prioritário é música, não moda.",
      edicoes: {
        hipotese_oportunidade:
          "Cliente Alfa e Marca Editada devem ser avaliadas prioritariamente no território de música.",
        racional_humano: "A frente de moda já está coberta por outra parceria ativa.",
      },
    }, { usuarioId: bruno, nome: "Bruno Coordenador" });

    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO B · EDIÇÃO + APROVAÇÃO");
    console.log("=".repeat(72));
    console.log(`IA original....: ${originalB.slice(0, 90)}…`);
    console.log(`Humano validou.: ${(edit.revisao.edicoes_humanas as { hipotese_oportunidade: string }).hipotese_oportunidade}`);
    console.log(`Motivo.........: ${edit.revisao.motivo}`);
    console.log(`snapshot IA preservado: ${Boolean((edit.revisao.snapshot_ia as { hipotese_oportunidade: string }).hipotese_oportunidade)}`);
    writeFileSync(join(SAIDA, "edit-before.json"), JSON.stringify(edit.revisao.snapshot_ia, null, 2));
    writeFileSync(join(SAIDA, "edit-after.json"), JSON.stringify(edit.revisao, null, 2));

    // ---- CASO C: REJECT ----------------------------------------------------
    const candC = await criarParte(client, "Marca Rejeitada");
    const recC = await salvarProposta(client, { proposta: proposta(candC, "Marca Rejeitada") });
    const rej = await decidir(client, {
      recomendacao_id: recC.id, decisao: "rejeitada",
      motivo: "A marca já possui acordo de exclusividade incompatível, não registrado na base.",
    }, { usuarioId: ana, nome: "Ana Estrategista" });

    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO C · REJEIÇÃO");
    console.log("=".repeat(72));
    console.log(`decisão: ${rej.revisao.decisao}`);
    console.log(`motivo:  ${rej.revisao.motivo}`);
    const aindaExiste = await client.query(`SELECT id FROM cross_ai.recomendacao WHERE id=$1`, [recC.id]);
    console.log(`recomendação preservada: ${aindaExiste.rows.length === 1}`);
    writeFileSync(join(SAIDA, "reject.json"), JSON.stringify(rej.revisao, null, 2));

    // ---- CASO D: INSUFFICIENT ---------------------------------------------
    const candD = await criarParte(client, "Marca Sem Sustentacao");
    const recD = await salvarProposta(client, {
      proposta: proposta(candD, "Marca Sem Sustentacao", {
        status: "sustentacao_insuficiente", nivel_sustentacao: "sustentacao_insuficiente",
        hipotese_oportunidade: null, confianca: 10,
      }),
    });

    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO D · SUSTENTAÇÃO INSUFICIENTE");
    console.log("=".repeat(72));
    try {
      await decidir(client, {
        recomendacao_id: recD.id, decisao: "aprovada_para_revisao_de_oportunidade",
      }, { usuarioId: ana });
      console.log("  ERRO: deveria ter bloqueado");
    } catch (e) {
      console.log(`  ✓ aprovação simples bloqueada: ${(e as Error).message.slice(0, 90)}…`);
    }
    const override = await decidir(client, {
      recomendacao_id: recD.id, decisao: "aprovada_para_revisao_de_oportunidade",
      override_insuficiente: true, motivo: "Contexto comercial conhecido fora da base.",
    }, { usuarioId: ana, nome: "Ana Estrategista" });
    console.log(`  ✓ com override explícito: override_insuficiente=${override.revisao.override_insuficiente}`);
    writeFileSync(join(SAIDA, "insufficient.json"), JSON.stringify(override.revisao, null, 2));

    // ---- CASO E: IDEMPOTÊNCIA ---------------------------------------------
    const dup = await decidir(client, {
      recomendacao_id: recA.id, decisao: "aprovada_para_revisao_de_oportunidade",
    }, { usuarioId: ana });
    const { rows: nRev } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM cross_ai.recomendacao_revisao WHERE recomendacao_id=$1`, [recA.id]);
    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO E · REQUISIÇÃO DUPLICADA");
    console.log("=".repeat(72));
    console.log(`  já existia: ${dup.jaExistia} | decisões gravadas: ${nRev[0].n}`);

    // ---- CASO F: CONCORRÊNCIA ---------------------------------------------
    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO F · CONCORRÊNCIA");
    console.log("=".repeat(72));
    const b2 = await decidir(client, {
      recomendacao_id: recA.id, decisao: "rejeitada",
      versao_revisao_lida: 1, motivo: "Revisor B discorda.",
    }, { usuarioId: bruno, nome: "Bruno Coordenador" });
    console.log(`  Revisor B escreveu sobre v1 → v${b2.revisao.versao_revisao} (${b2.revisao.decisao})`);
    try {
      await decidir(client, {
        recomendacao_id: recA.id, decisao: "aprovada_para_revisao_de_oportunidade", versao_revisao_lida: 1,
      }, { usuarioId: ana });
      console.log("  ERRO: escrita obsoleta deveria falhar");
    } catch (e) {
      if (e instanceof ConflitoDeVersao) {
        console.log(`  ✓ escrita obsoleta bloqueada: ${e.detalhe.slice(0, 80)}…`);
        writeFileSync(join(SAIDA, "concurrency.json"), JSON.stringify({ bloqueado: true, detalhe: e.detalhe }, null, 2));
      } else throw e;
    }

    // ---- CASO G: VERSIONAMENTO --------------------------------------------
    const candG = await criarParte(client, "Marca Versionada");
    const v1 = await salvarProposta(client, { proposta: proposta(candG, "Marca Versionada") });
    await decidir(client, { recomendacao_id: v1.id, decisao: "rejeitada", motivo: "Evidência fraca." }, { usuarioId: ana });
    const v2 = await salvarProposta(client, {
      proposta: proposta(candG, "Marca Versionada", { confianca: 88 }),
      propostaLogicaId: v1.propostaLogicaId,
    });
    await decidir(client, {
      recomendacao_id: v2.id, decisao: "aprovada_para_revisao_de_oportunidade", motivo: "Nova evidência mudou o quadro.",
    }, { usuarioId: ana });
    const hist = await historicoDecisoes(client, v1.propostaLogicaId);
    console.log(`\n${"=".repeat(72)}`);
    console.log("CASO G · HISTÓRICO DE VERSÕES");
    console.log("=".repeat(72));
    for (const h of hist) console.log(`  v${h.recomendacaoVersao}: ${h.decisao} — ${h.motivo}`);
    writeFileSync(join(SAIDA, "version-history.json"), JSON.stringify(hist, null, 2));

    // ---- AUTO-ACTION -------------------------------------------------------
    const depois = await contarOperacional(client);
    console.log(`\n${"=".repeat(72)}`);
    console.log("VERIFICAÇÃO DE EFEITO OPERACIONAL");
    console.log("=".repeat(72));
    for (const k of Object.keys(antes)) {
      const d = (depois as Record<string, number>)[k] - (antes as Record<string, number>)[k];
      console.log(`  ${k.padEnd(18)} antes=${(antes as Record<string, number>)[k]} depois=${(depois as Record<string, number>)[k]} delta=${d}`);
    }
    writeFileSync(join(SAIDA, "auto-action-check.json"), JSON.stringify({ antes, depois }, null, 2));

    const { rows: audit } = await client.query(
      `SELECT id, recomendacao_id, recomendacao_versao, decisao, revisor_nome,
              motivo, override_insuficiente, versao_revisao, decidido_em
         FROM cross_ai.recomendacao_revisao ORDER BY criado_em`);
    writeFileSync(join(SAIDA, "audit.json"), JSON.stringify(audit, null, 2));
    console.log(`\ntrilha de auditoria: ${audit.length} decisões registradas`);

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
