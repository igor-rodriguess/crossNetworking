/**
 * Showcase do Cross Orchestrator (E2E-01).
 *
 * Executa as três jornadas canônicas contra o banco de TESTE e imprime os
 * números reais. Nenhum número deste showcase é digitado à mão: tudo sai da
 * execução.
 *
 * Modo estrutural: zero IA paga, zero web ao vivo.
 *
 *   npx tsx scripts/showcase-cross-orchestrator.ts
 */
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { construirPerfil } from "../src/modules/agentes/entidade/entity-intelligence.agent";
import { decidir } from "../src/modules/agentes/recomendacao/human-gate.service";
import { analisarCrossability } from "../src/modules/agentes/crossability/crossability-reasoning.agent";
import {
  planejar, executarJourney, retomarJourney, carregarSteps,
} from "../src/modules/agentes/orchestrator/cross-orchestrator";
import { fatoSchema, type EvidencePackage } from "../src/modules/agentes/evidencia/evidencia.schema";
import type { EntityIntelligenceProfile } from "../src/modules/agentes/entidade/perfil.schema";

const AGORA = new Date("2026-06-15T12:00:00.000Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

const linha = (t = "─", n = 78) => t.repeat(n);
function bloco(titulo: string) {
  console.log(`\n${linha()}`);
  console.log(titulo);
  console.log(linha());
}

function evidencia(nome: string, comFatos: boolean): EvidencePackage {
  const f = (categoria: string, claim: string, i: number) =>
    fatoSchema.parse({
      fact_id: `f${i}`, claim, entidade: nome, categoria, natureza: "fato",
      source_refs: [`s${i}`], dominios_independentes: 2,
      verificacao: "corroborada", confianca: 80,
      publicado_em: "2026-05-01", coletado_em: "2026-06-01",
    });
  return {
    entidade: nome,
    facts: comFatos ? [
      f("contexto_empresa", "Opera no mercado brasileiro.", 1),
      f("posicionamento", "Marca de cultura jovem.", 2),
      f("publico", "Jovens de 18 a 24 anos.", 3),
      f("territorio", "Brasil, foco Sudeste.", 4),
      f("ativo", "Programa de creators.", 5),
      f("produto", "Linha de streetwear.", 6),
    ] : [],
    fontes: [], lacunas: [], contradicoes: [],
    nivel_validacao: "estrutural",
    telemetria: {
      duracao_ms: 0, web_search_calls: 0, firecrawl_calls: 0,
      llm_calls: 0, custo_estimado_usd: 0,
    },
  } as unknown as EvidencePackage;
}

function perfil(nome: string, parteId: string | null, comFatos = true): EntityIntelligenceProfile {
  return construirPerfil({
    entidade: nome,
    internos: { parte_id: parteId, nome_exibicao: nome, eh_cliente_cross: parteId !== null },
    evidencia: evidencia(nome, comFatos),
    anterior: null,
  } as never);
}

interface Cenario {
  clienteParteId: string; parceiroParteId: string;
  frenteId: string; usuarioId: string;
}

/**
 * Público, território e ativo em comum entre origem e candidato.
 *
 * Sem isso o candidato é uma Parte vazia, e a recomendação sai sempre como
 * `requer_enriquecimento` — o que mediria a pobreza do fixture, não o
 * comportamento do Orchestrator.
 */
async function dadosInternos(client: PoolClient, partes: string[], sufixo: string) {
  const pub = await client.query<{ id: string }>(
    `INSERT INTO cross_intelligence.publico (nome, faixa_etaria, ativo)
     VALUES ($1,'18-24',true) RETURNING id`, [`Jovens ${sufixo}`]);
  const ter = await client.query<{ id: string }>(
    `INSERT INTO cross_intelligence.territorio (codigo, nome, ativo)
     VALUES ($1,$2,true) RETURNING id`, [`T-${sufixo}`, `Sudeste ${sufixo}`]);
  for (const parteId of partes) {
    await client.query(
      `INSERT INTO cross_intelligence.parte_publico (parte_id, publico_id, relevancia)
       VALUES ($1,$2,'alta')`, [parteId, pub.rows[0].id]);
    await client.query(
      `INSERT INTO cross_intelligence.parte_territorio (parte_id, territorio_id, relevancia)
       VALUES ($1,$2,'alta')`, [parteId, ter.rows[0].id]);
    await client.query(
      `INSERT INTO cross_intelligence.ativo (parte_id, nome, categoria)
       VALUES ($1,$2,'programa')`, [parteId, `Programa ${sufixo}`]);
  }
}

async function montarCenario(client: PoolClient, sufixo: string): Promise<Cenario> {
  const st = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const criarParte = async (nome: string) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       VALUES ('organizacao',$1,$2) RETURNING id`, [nome, st.rows[0].id]);
    return rows[0].id;
  };
  const usuario = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`,
    [`Showcase ${sufixo}`, `showcase.${sufixo}@cross.teste`]);
  const cliParte = await criarParte(`Cliente ${sufixo}`);
  const scli = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
     VALUES ($1,$2) RETURNING id`, [cliParte, scli.rows[0].id]);
  const sproj = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_projeto ORDER BY ordem LIMIT 1`);
  const projeto = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [cliente.rows[0].id, `Projeto ${sufixo}`, "Objetivo", sproj.rows[0].id]);
  const sfr = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_frente ORDER BY ordem LIMIT 1`);
  const frente = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade
       (projeto_id, nome, objetivo, data_abertura, status_frente_id)
     VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id`,
    [projeto.rows[0].id, `Frente ${sufixo}`, "Objetivo", sfr.rows[0].id]);
  const parceiroParteId = await criarParte(`Parceiro ${sufixo}`);
  await dadosInternos(client, [cliParte, parceiroParteId], sufixo);

  return {
    clienteParteId: cliParte,
    parceiroParteId,
    frenteId: frente.rows[0].id,
    usuarioId: usuario.rows[0].id,
  };
}

function imprimirSteps(steps: Array<{ ordem: number; step: string; status: string; motivo: string | null }>) {
  for (const s of steps) {
    const ic = { concluida: "✓", reutilizada: "♻", pulada: "–",
      aguardando_humano: "⏸", bloqueada: "⛔", falha: "✗" }[s.status] ?? "·";
    console.log(`  ${ic} ${String(s.ordem).padStart(2)}. ${s.step.padEnd(20)} ${s.status.padEnd(20)} ${s.motivo ?? ""}`);
  }
}

async function main() {
  console.log("CROSS ORCHESTRATOR — SHOWCASE E2E-01");
  console.log(`Execução: ${new Date().toISOString()}`);
  console.log("Modo estrutural · IA paga = 0 · Web ao vivo = DESLIGADA");

  await withTransaction(async (client) => {
    // ---------------------------------------------------------------- plano
    bloco("PLANO DETERMINÍSTICO · mesma entrada, duas vezes");
    const entradaPlano = {
      journeyType: "cliente_para_parceiro" as const,
      nomeOrigem: "Marca Alfa", agora: AGORA,
      artefatos: { perfilOrigem: perfil("Marca Alfa", null), perfilOrigemEm: diasAtras(2) },
    };
    const p1 = planejar(entradaPlano);
    const p2 = planejar(entradaPlano);
    console.log(`planos idênticos: ${JSON.stringify(p1) === JSON.stringify(p2)}`);
    console.log(`chamadas externas estimadas: ${p1.chamadas_externas_estimadas}`);
    console.log("");
    for (const s of p1.steps) {
      console.log(`  ${String(s.ordem).padStart(2)}. ${s.step.padEnd(20)} ${s.acao.padEnd(16)} ${s.motivo}`);
    }

    // ------------------------------------------------------------ jornada 1
    bloco("JORNADA 1 · cliente → parceiro");
    const c1 = await montarCenario(client, "j1");
    const j1 = await executarJourney(client, {
      journeyType: "cliente_para_parceiro",
      triggerSource: "system_test",
      parteOrigemId: c1.clienteParteId,
      nomeOrigem: "Cliente Alfa",
      objetivo: "ativação cultural",
      criadoPorId: c1.usuarioId,
      agora: AGORA,
      artefatos: {
        perfilOrigem: perfil("Cliente Alfa", c1.clienteParteId),
        perfilOrigemEm: diasAtras(2),
      },
    });
    console.log(`status:        ${j1.status}`);
    console.log(`motivo:        ${j1.motivo_parada}`);
    console.log(`recomendação:  ${j1.refs.recomendacao_id ? "criada" : "nenhuma"}`);
    console.log("");
    imprimirSteps(j1.steps);
    console.log("");
    console.log(`executados=${j1.telemetria.steps_executados}  reutilizados=${j1.telemetria.steps_reutilizados}  pulados=${j1.telemetria.steps_pulados}`);
    console.log(`research evitados=${j1.telemetria.research_evitados}  entity intelligence evitados=${j1.telemetria.entity_intelligence_evitados}`);
    console.log(`llm=${j1.telemetria.llm_calls}  web=${j1.telemetria.web_search_calls}  firecrawl=${j1.telemetria.firecrawl_calls}  custo=US$ ${j1.telemetria.custo_estimado_usd}`);

    bloco("QUALIDADE DA RECOMENDAÇÃO · o que o front receberia");
    const { rows: rec } = await client.query<{
      status: string; nivel_sustentacao: string; confianca: number;
      hipotese_oportunidade: string | null; proximo_passo: string;
      perfil_candidato_versao: number | null; proposta: Record<string, unknown>;
    }>(
      `SELECT status, nivel_sustentacao, confianca, hipotese_oportunidade,
              proximo_passo, perfil_candidato_versao, proposta
         FROM cross_ai.recomendacao WHERE id = $1`,
      [j1.refs.recomendacao_id]
    );
    const prop = rec[0].proposta as {
      evidencias_suporte: unknown[]; racional: string[];
      questoes_abertas: string[]; riscos: unknown[];
    };
    console.log(`status:              ${rec[0].status}`);
    console.log(`nível de sustentação: ${rec[0].nivel_sustentacao}`);
    console.log(`confiança:           ${rec[0].confianca}`);
    console.log(`próximo passo:       ${rec[0].proximo_passo}`);
    console.log(`perfil do candidato: v${rec[0].perfil_candidato_versao ?? "ausente"}`);
    console.log(`evidências de suporte: ${prop.evidencias_suporte.length}`);
    console.log(`riscos declarados:     ${prop.riscos.length}`);
    console.log(`questões abertas:      ${prop.questoes_abertas.length}`);
    console.log("");
    console.log("hipótese:");
    console.log(`  ${rec[0].hipotese_oportunidade ?? "(nenhuma — sustentação insuficiente)"}`);

    bloco("HUMAN GATE · a jornada parou de verdade");
    const semDecisao = await retomarJourney(client, j1.journey_id);
    console.log(`resume sem decisão → ${semDecisao.status}`);
    console.log(`candidatura criada: ${semDecisao.candidaturaId ?? "nenhuma"}`);

    await decidir(client, {
      recomendacao_id: j1.refs.recomendacao_id!,
      decisao: "aprovada_para_revisao_de_oportunidade",
      override_insuficiente: true,
      motivo: "Aprovada apesar da evidência magra do cenário.",
    }, { usuarioId: c1.usuarioId, nome: "Revisor Showcase" });

    const aprovado = await retomarJourney(client, j1.journey_id);
    console.log(`após aprovação  → ${aprovado.status}`);
    console.log(`candidatura criada: ${aprovado.candidaturaId ?? "nenhuma"}  ← aprovação NÃO promove`);

    const antesSteps = (await carregarSteps(client, j1.journey_id)).length;
    const promovido = await retomarJourney(client, j1.journey_id, {
      frenteOportunidadeId: c1.frenteId,
      promotorId: c1.usuarioId, promotorNome: "Promotor Showcase",
    });
    const depoisSteps = (await carregarSteps(client, j1.journey_id)).length;
    console.log(`após promoção   → ${promovido.status}`);
    console.log(`candidatura: ${promovido.candidaturaId ? "criada" : "nenhuma"}`);
    console.log(`etapas reexecutadas no resume: ${promovido.stepsReexecutados} (antes=${antesSteps}, depois=${depoisSteps})`);

    // ------------------------------------------------------------ jornada 2
    bloco("JORNADA 2 · parceiro → cliente");
    const c2 = await montarCenario(client, "j2");
    const j2 = await executarJourney(client, {
      journeyType: "parceiro_para_cliente",
      triggerSource: "system_test",
      parteOrigemId: c2.parceiroParteId,
      nomeOrigem: "Parceiro Beta",
      objetivo: "conectar a clientes",
      criadoPorId: c2.usuarioId,
      agora: AGORA,
      artefatos: {
        perfilOrigem: perfil("Parceiro Beta", c2.parceiroParteId),
        perfilOrigemEm: diasAtras(1),
      },
    });
    console.log(`status:  ${j2.status}`);
    console.log(`direção do matching: ${j2.refs.matching_direcao ?? "n/a"}`);
    console.log("");
    imprimirSteps(j2.steps);

    // ------------------------------------------------------------ jornada 3
    bloco("JORNADA 3 · prospecção do zero (origem não vinculada)");
    const c3 = await montarCenario(client, "j3");
    const partesAntes = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cross_core.parte`);
    const j3 = await executarJourney(client, {
      journeyType: "prospeccao_do_zero",
      triggerSource: "monitoring_alert",
      triggerRef: "alerta-showcase",
      parteOrigemId: null,
      nomeOrigem: "Marca Externa",
      objetivo: "avaliar entrada no portfólio",
      criadoPorId: c3.usuarioId,
      agora: AGORA,
      artefatos: {
        perfilOrigem: perfil("Marca Externa", null),
        perfilOrigemEm: diasAtras(1),
        monitoringAlertRef: "alerta-showcase",
      },
    });
    const partesDepois = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cross_core.parte`);
    console.log(`status:            ${j3.status}`);
    console.log(`origem:            ${j3.origem.vinculo}`);
    console.log(`trigger:           ${j3.trigger_source} (não-humano)`);
    console.log(`partes antes/depois: ${partesAntes.rows[0].n} / ${partesDepois.rows[0].n}  ← nenhuma Parte criada`);
    console.log(`bloqueios do plano: ${j3.plano.bloqueios.join(" | ") || "nenhum"}`);
    console.log(`alerta de monitoring como contexto: ${j3.contexto_opcional.monitoring_alert_ref}`);

    // ---------------------------------------------------------- fail-safe
    bloco("FAIL-SAFE FACTUAL · entidade sem fatos");
    const c4 = await montarCenario(client, "j4");
    const recAntes = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cross_ai.recomendacao`);
    const j4 = await executarJourney(client, {
      journeyType: "prospeccao_do_zero",
      triggerSource: "system_test",
      parteOrigemId: null,
      nomeOrigem: "Entidade Fantasma",
      criadoPorId: c4.usuarioId,
      agora: AGORA,
      artefatos: {
        perfilOrigem: perfil("Entidade Fantasma", null, false),
        perfilOrigemEm: diasAtras(1),
      },
    });
    const recDepois = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cross_ai.recomendacao`);
    console.log(`status: ${j4.status}  (≠ falha: ${j4.status !== "falha"})`);
    console.log(`motivo: ${j4.motivo_parada}`);
    console.log(`recomendações antes/depois: ${recAntes.rows[0].n} / ${recDepois.rows[0].n}`);
    console.log("");
    imprimirSteps(j4.steps);

    // ------------------------------------------------------------- economia
    bloco("ECONOMIA · reuso vs. pipeline ingênuo");
    const c5 = await montarCenario(client, "j5");
    // Adaptador controlado (zero rede, zero custo) para que a jornada SEM
    // artefatos chegue ao mesmo ponto final da COM artefatos. Comparar uma
    // jornada completa com outra que parou no fail-safe inflaria a economia.
    const semReuso = await executarJourney(client, {
      journeyType: "cliente_para_parceiro",
      triggerSource: "system_test",
      parteOrigemId: c5.clienteParteId,
      nomeOrigem: "Cliente Gama",
      criadoPorId: c5.usuarioId,
      agora: AGORA,
      artefatos: {},
      pesquisar: async (entidade) => evidencia(entidade, true),
    });
    // Crossability real da execução anterior — um stub aqui só provaria que o
    // planejador aceita qualquer objeto, não que o reuso funciona de verdade.
    const crossReal = await analisarCrossability({
      perfil: perfil("Cliente Gama", c5.clienteParteId),
      contexto: { objetivo: null },
      client,
      chamarModelo: async () => ({ dados: {}, origem: "estrutural" }),
    } as never);

    const comReuso = await executarJourney(client, {
      journeyType: "cliente_para_parceiro",
      triggerSource: "system_test",
      parteOrigemId: c5.clienteParteId,
      nomeOrigem: "Cliente Gama",
      criadoPorId: c5.usuarioId,
      agora: AGORA,
      artefatos: {
        perfilOrigem: perfil("Cliente Gama", c5.clienteParteId),
        perfilOrigemEm: diasAtras(2),
        crossability: crossReal,
        crossabilityEm: diasAtras(3),
      },
    });
    // O status importa para ler os números: uma jornada que parou cedo executa
    // POUCAS etapas, e isso não é economia — é interrupção. Sem esta linha, o
    // "executados=1" pareceria eficiência quando na verdade é o fail-safe.
    console.log(`sem artefatos  → status=${semReuso.status}`);
    console.log(`                 executados=${semReuso.telemetria.steps_executados} reutilizados=${semReuso.telemetria.steps_reutilizados} pulados=${semReuso.telemetria.steps_pulados}`);
    console.log(`com artefatos  → status=${comReuso.status}`);
    console.log(`                 executados=${comReuso.telemetria.steps_executados} reutilizados=${comReuso.telemetria.steps_reutilizados} pulados=${comReuso.telemetria.steps_pulados}`);
    console.log(`research evitados:            ${comReuso.telemetria.research_evitados}`);
    console.log(`entity intelligence evitados: ${comReuso.telemetria.entity_intelligence_evitados}`);
    console.log(`crossability evitados:        ${comReuso.telemetria.crossability_evitados}`);

    // ------------------------------------------------------- efeito zero
    bloco("EFEITO OPERACIONAL AUTOMÁTICO");
    const t = j1.telemetria;
    console.log(`oportunidades criadas pela IA: ${t.oportunidades_criadas}`);
    console.log(`projetos criados:              ${t.projetos_criados}`);
    console.log(`parcerias criadas:             ${t.parcerias_criadas}`);
    console.log(`reuniões criadas:              ${t.reunioes_criadas}`);
    console.log(`avanços de funil:              ${t.avancos_de_funil}`);
    console.log(`papers aprovados por IA:       ${t.papers_aprovados_por_ia}`);
    console.log("");
    console.log(`nível de validação:   ${j1.nivel_validacao}`);
    console.log(`validação IA real:    ${j1.validacao_ia_real}`);
    console.log(`validação web viva:   ${j1.validacao_web_ao_vivo}`);

    // Showcase não deve deixar resíduo no banco de teste.
    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e?.message !== "__ROLLBACK__") throw e;
    console.log(`\n${linha()}`);
    console.log("Transação revertida — o showcase não deixa resíduo no banco.");
    console.log(linha());
  });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
