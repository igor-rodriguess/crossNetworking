/**
 * Inspeciona o payload REAL de uma jornada, do ponto de vista do front.
 *
 * Pergunta que este script responde: o que o Orchestrator devolve já serve para
 * renderizar tela, ou o front teria que tratar/derivar dados?
 *
 *   npx tsx scripts/inspect-journey-payload.ts
 */
import type { PoolClient } from "pg";
import { withTransaction } from "../src/shared/db";
import { construirPerfil } from "../src/modules/agentes/entidade/entity-intelligence.agent";
import { executarJourney } from "../src/modules/agentes/orchestrator/cross-orchestrator";
import { fatoSchema, type EvidencePackage } from "../src/modules/agentes/evidencia/evidencia.schema";
import type { EntityIntelligenceProfile } from "../src/modules/agentes/entidade/perfil.schema";

const AGORA = new Date("2026-06-15T12:00:00.000Z");

function evidencia(nome: string): EvidencePackage {
  const f = (categoria: string, claim: string, i: number) =>
    fatoSchema.parse({
      fact_id: `f${i}`, claim, entidade: nome, categoria, natureza: "fato",
      source_refs: [`s${i}`], dominios_independentes: 2,
      verificacao: "corroborada", confianca: 80,
      publicado_em: "2026-05-01", coletado_em: "2026-06-01",
    });
  return {
    entidade: nome,
    facts: [
      f("contexto_empresa", "Opera no mercado brasileiro.", 1),
      f("posicionamento", "Marca de cultura jovem.", 2),
      f("publico", "Jovens de 18 a 24 anos.", 3),
      f("territorio", "Brasil, foco Sudeste.", 4),
      f("ativo", "Programa de creators.", 5),
      f("produto", "Linha de streetwear.", 6),
    ],
    fontes: [], lacunas: [], contradicoes: [],
    nivel_validacao: "estrutural",
    telemetria: {
      duracao_ms: 0, web_search_calls: 0, firecrawl_calls: 0,
      llm_calls: 0, custo_estimado_usd: 0,
    },
  } as unknown as EvidencePackage;
}

function perfil(nome: string, parteId: string | null): EntityIntelligenceProfile {
  return construirPerfil({
    entidade: nome,
    internos: { parte_id: parteId, nome_exibicao: nome, eh_cliente_cross: parteId !== null },
    evidencia: evidencia(nome), anterior: null,
  } as never);
}

/** Público/território/ativo em comum — o que uma base real da Cross teria. */
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

async function montar(client: PoolClient, sufixo: string) {
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
    [`Inspect ${sufixo}`, `inspect.${sufixo}@cross.teste`]);
  const cliParte = await criarParte(`Cliente ${sufixo}`);
  const scli = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  await client.query(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id) VALUES ($1,$2)`,
    [cliParte, scli.rows[0].id]);
  const parceiro = await criarParte(`Parceiro ${sufixo}`);
  await dadosInternos(client, [cliParte, parceiro], sufixo);
  return { clienteParteId: cliParte, usuarioId: usuario.rows[0].id };
}

withTransaction(async (client) => {
  const c = await montar(client, "insp");
  const r = await executarJourney(client, {
    journeyType: "cliente_para_parceiro",
    triggerSource: "system_test",
    parteOrigemId: c.clienteParteId,
    nomeOrigem: "Cliente Alfa",
    objetivo: "ativação cultural",
    criadoPorId: c.usuarioId,
    agora: AGORA,
    artefatos: {
      perfilOrigem: perfil("Cliente Alfa", c.clienteParteId),
      perfilOrigemEm: new Date(AGORA.getTime() - 2 * 86_400_000),
    },
  });

  console.log("=== PAYLOAD COMPLETO DA JORNADA ===");
  console.log(JSON.stringify(r, null, 2));

  console.log("\n=== O QUE A RECOMENDAÇÃO GUARDA (o que o front leria) ===");
  const { rows } = await client.query(
    `SELECT status, nivel_sustentacao, hipotese_oportunidade, confianca,
            proximo_passo, candidato_nome, objetivo,
            jsonb_pretty(proposta) AS proposta
       FROM cross_ai.recomendacao WHERE id = $1`,
    [r.refs.recomendacao_id]
  );
  console.log(JSON.stringify(rows[0], null, 2));

  throw new Error("__ROLLBACK__");
}).catch((e) => {
  if (e?.message !== "__ROLLBACK__") { console.error(e); process.exit(1); }
  process.exit(0);
});
