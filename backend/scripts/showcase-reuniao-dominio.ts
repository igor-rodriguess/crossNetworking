/**
 * Showcase do domínio de Reunião normalizado (DOMAIN-01).
 *
 * Executa os quatro contextos de verdade contra o banco de teste e prova que
 * criar reunião não dispara nada operacional.
 *
 * Zero IA. Uso: npx tsx scripts/showcase-reuniao-dominio.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import * as repo from "../src/modules/execucao/execucao.repository";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "meeting-opportunity-domain");
const REUNIAO = { titulo: "Conversa", data_reuniao: new Date().toISOString() };

async function base(client: PoolClient, sufixo: string) {
  const stParte = await client.query<{ id: string }>(`SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const novaParte = async (nome: string) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       VALUES ('organizacao',$1,$2) RETURNING id`, [nome, stParte.rows[0].id]);
    return rows[0].id;
  };
  const usuario = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`, [`Ana ${sufixo}`, `ana.${sufixo}@cross.teste`]);
  const cliParte = await novaParte(`Cliente Alfa ${sufixo}`);
  const parParte = await novaParte(`Marca Prospect ${sufixo}`);
  const artParte = await novaParte(`Artista ${sufixo}`);
  const stCli = await client.query<{ id: string }>(`SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id) VALUES ($1,$2) RETURNING id`,
    [cliParte, stCli.rows[0].id]);
  const stProj = await client.query<{ id: string }>(`SELECT id FROM cross_projects.status_projeto ORDER BY ordem LIMIT 1`);
  const projeto = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
     VALUES ($1,$2,'Objetivo',$3) RETURNING id`, [cliente.rows[0].id, `Projeto ${sufixo}`, stProj.rows[0].id]);
  const stFr = await client.query<{ id: string }>(`SELECT id FROM cross_projects.status_frente ORDER BY ordem LIMIT 1`);
  const frente = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade (projeto_id, nome, objetivo, data_abertura, status_frente_id)
     VALUES ($1,$2,'Objetivo',CURRENT_DATE,$3) RETURNING id`, [projeto.rows[0].id, `Frente ${sufixo}`, stFr.rows[0].id]);
  const stCand = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_candidatura WHERE codigo='identificada'`);
  const cand = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.candidatura_parceiro (frente_oportunidade_id, parte_id, status_candidatura_id)
     VALUES ($1,$2,$3) RETURNING id`, [frente.rows[0].id, parParte, stCand.rows[0].id]);

  // Cadeia legada completa exigida por parceria (WAD 7.3.14).
  const tipoApr = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.tipo_decisao WHERE codigo='aprovada'`);
  await client.query(
    `INSERT INTO cross_methodologies.decisao_candidatura
       (candidatura_parceiro_id, tipo_decisao_id, responsavel_id, data_decisao) VALUES ($1,$2,$3,now())`,
    [cand.rows[0].id, tipoApr.rows[0].id, usuario.rows[0].id]);
  const stPaper = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.status_paper WHERE codigo='validado'`);
  const paper = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
     VALUES ($1,'Paper',$2) RETURNING id`, [frente.rows[0].id, stPaper.rows[0].id]);
  const vp = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
     VALUES ($1,1,'E') RETURNING id`, [paper.rows[0].id]);
  const tv = await client.query<{ id: string }>(`SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
  const sv = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='aprovada'`);
  await client.query(
    `INSERT INTO cross_methodologies.validacao_paper
       (versao_paper_id, tipo_validacao_id, status_validacao_id, responsavel_id, data_validacao)
     VALUES ($1,$2,$3,$4,now())`, [vp.rows[0].id, tv.rows[0].id, sv.rows[0].id, usuario.rows[0].id]);
  const stParc = await client.query<{ id: string }>(
    `SELECT id FROM cross_partnerships.status_parceria ORDER BY ordem LIMIT 1`);
  const parceria = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.parceria
       (candidatura_parceiro_id, projeto_id, frente_oportunidade_id, cliente_cross_id,
        parte_parceira_id, status_parceria_id, data_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING id`,
    [cand.rows[0].id, projeto.rows[0].id, frente.rows[0].id, cliente.rows[0].id, parParte, stParc.rows[0].id]);

  return {
    usuarioId: usuario.rows[0].id, cliParte, parParte, artParte,
    projetoId: projeto.rows[0].id, frenteId: frente.rows[0].id,
    candidaturaId: cand.rows[0].id, parceriaId: parceria.rows[0].id,
  };
}

async function contar(client: PoolClient) {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM cross_projects.candidatura_parceiro)::int candidaturas,
            (SELECT count(*) FROM cross_projects.projeto)::int projetos,
            (SELECT count(*) FROM cross_partnerships.parceria)::int parcerias,
            (SELECT count(*) FROM cross_projects.historico_candidatura)::int movimentacoes`);
  return rows[0];
}

function ctx(r: Record<string, unknown>) {
  const p = (v: unknown) => (v ? "SIM" : "null");
  return `parceria=${p(r.parceria_id)} candidatura=${p(r.candidatura_parceiro_id)} projeto=${p(r.projeto_id)}`;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  await withTransaction(async (client) => {
    const b = await base(client, "sc");
    const antes = await contar(client);

    console.log("=".repeat(76));
    console.log("OS QUATRO CONTEXTOS DE REUNIÃO");
    console.log("=".repeat(76));

    // 1 · pré-oportunidade
    const id1 = await repo.inserirReuniaoComContexto(client,
      { ...REUNIAO, titulo: "Primeira conversa exploratória" }, { tipo: "exploratoria" }, b.usuarioId);
    await repo.adicionarParticipante(client, id1, { parte_id: b.cliParte, papel: "cliente" });
    await repo.adicionarParticipante(client, id1, { parte_id: b.parParte, papel: "prospect" });
    const r1 = await repo.buscarReuniao(client, id1);
    console.log(`\n1 · PRÉ-OPORTUNIDADE  "${r1!.titulo}"`);
    console.log(`    ${ctx(r1!)}`);
    console.log(`    participantes: ${r1!.participantes.length}  tipo=${r1!.tipo}  status=${r1!.status}`);
    console.log(`    ⟵ ERA IMPOSSÍVEL antes da 061 (parceria_id NOT NULL)`);
    writeFileSync(join(SAIDA, "pre-opportunity-meeting.json"), JSON.stringify(r1, null, 2));

    // 2 · oportunidade
    const id2 = await repo.inserirReuniaoComContexto(client,
      { ...REUNIAO, titulo: "Negociação da oportunidade" },
      { candidaturaParceiroId: b.candidaturaId, tipo: "negociacao" }, b.usuarioId);
    await repo.adicionarParticipante(client, id2, { parte_id: b.parParte, papel: "parceiro" });
    const r2 = await repo.buscarReuniao(client, id2);
    console.log(`\n2 · OPORTUNIDADE      "${r2!.titulo}"`);
    console.log(`    ${ctx(r2!)}`);
    console.log(`    ⟵ ERA IMPOSSÍVEL antes da 061`);
    writeFileSync(join(SAIDA, "opportunity-meeting.json"), JSON.stringify(r2, null, 2));

    // 3 · projeto
    const id3 = await repo.inserirReuniaoComContexto(client,
      { ...REUNIAO, titulo: "Acompanhamento do projeto" },
      { projetoId: b.projetoId, tipo: "acompanhamento" }, b.usuarioId);
    const r3 = await repo.buscarReuniao(client, id3);
    console.log(`\n3 · PROJETO           "${r3!.titulo}"`);
    console.log(`    ${ctx(r3!)}`);
    writeFileSync(join(SAIDA, "project-meeting.json"), JSON.stringify(r3, null, 2));

    // 4 · legado
    const id4 = await repo.inserirReuniaoComContexto(client,
      { ...REUNIAO, titulo: "Reunião de parceria (legado)" }, { parceriaId: b.parceriaId }, b.usuarioId);
    const r4 = await repo.buscarReuniao(client, id4);
    const legado = await repo.listarReunioes(client, b.parceriaId);
    console.log(`\n4 · LEGADO PARCERIA   "${r4!.titulo}"`);
    console.log(`    ${ctx(r4!)}`);
    console.log(`    rota legada /parcerias/:id/reunioes devolve: ${legado.length}`);
    writeFileSync(join(SAIDA, "legacy-meeting.json"), JSON.stringify(r4, null, 2));

    // múltiplas partes
    const id5 = await repo.inserirReuniaoComContexto(client,
      { ...REUNIAO, titulo: "Reunião com várias partes" }, {}, b.usuarioId);
    await repo.adicionarParticipante(client, id5, { parte_id: b.cliParte, papel: "cliente" });
    await repo.adicionarParticipante(client, id5, { parte_id: b.parParte, papel: "parceiro" });
    await repo.adicionarParticipante(client, id5, { parte_id: b.artParte, papel: "artista" });
    await repo.adicionarParticipante(client, id5, { usuario_interno_id: b.usuarioId, papel: "cross" });
    const parts = await repo.listarParticipantes(client, id5);
    console.log(`\n${"=".repeat(76)}`);
    console.log("MÚLTIPLAS PARTES + USUÁRIO INTERNO");
    console.log("=".repeat(76));
    for (const p of parts) {
      console.log(`  ${p.parte_id ? "Parte  " : "Cross  "} ${(p.papel ?? "").padEnd(10)} ${p.nome ?? ""}`);
    }
    writeFileSync(join(SAIDA, "multiple-parties.json"), JSON.stringify(parts, null, 2));

    // queries
    console.log(`\n${"=".repeat(76)}`);
    console.log("CONSULTAS PARA O MEETING INTELLIGENCE");
    console.log("=".repeat(76));
    const porParte = await repo.listarReunioesPorParte(client, b.parParte);
    const porCand = await repo.listarReunioesPorCandidatura(client, b.candidaturaId);
    const porProj = await repo.listarReunioesPorProjeto(client, b.projetoId);
    console.log(`  por Parte (Marca Prospect): ${porParte.length} reuniões`);
    console.log(`  por Oportunidade:           ${porCand.length} reuniões`);
    console.log(`  por Projeto:                ${porProj.length} reuniões`);
    writeFileSync(join(SAIDA, "query-by-parte.json"), JSON.stringify(porParte, null, 2));
    writeFileSync(join(SAIDA, "query-by-opportunity.json"), JSON.stringify(porCand, null, 2));

    // Medição isolada: só o que a CRIAÇÃO DE REUNIÃO causou. Feita antes do
    // segundo cenário, que cria candidatura/projeto/parceria próprios e
    // contaminaria a contagem.
    const depoisReunioes = await contar(client);

    // contexto inválido
    console.log(`\n${"=".repeat(76)}`);
    console.log("INTEGRIDADE DE CONTEXTO");
    console.log("=".repeat(76));
    const b2 = await base(client, "x2");
    await client.query("SAVEPOINT ctx");
    try {
      await repo.inserirReuniaoComContexto(client, REUNIAO,
        { candidaturaParceiroId: b.candidaturaId, projetoId: b2.projetoId }, b.usuarioId);
      console.log("  ERRO: deveria ter bloqueado");
    } catch (e) {
      console.log(`  ✓ candidatura + projeto de cadeias diferentes: BLOQUEADO`);
      writeFileSync(join(SAIDA, "invalid-context.json"),
        JSON.stringify({ bloqueado: true, erro: (e as Error).message.slice(0, 200) }, null, 2));
    }
    await client.query("ROLLBACK TO SAVEPOINT ctx");

    // efeitos colaterais — delta medido APENAS sobre as 5 reuniões criadas
    console.log(`\n${"=".repeat(76)}`);
    console.log("EFEITOS OPERACIONAIS DE CRIAR REUNIÃO");
    console.log("=".repeat(76));
    console.log(`  meetings_created           = 5`);
    const deltas: Record<string, number> = {};
    for (const k of Object.keys(antes)) {
      const d = (depoisReunioes as Record<string, number>)[k] - (antes as Record<string, number>)[k];
      deltas[k] = d;
      console.log(`  ${k.padEnd(25)} = ${d}`);
    }
    writeFileSync(join(SAIDA, "no-side-effects.json"),
      JSON.stringify({ meetings_created: 5, antes, depois: depoisReunioes, deltas }, null, 2));

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
