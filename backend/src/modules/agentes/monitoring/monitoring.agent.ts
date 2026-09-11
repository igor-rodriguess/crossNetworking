import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { analisarBigMoments } from "../momento/big-moment.agent";
import {
  LIMITES_MONITORING,
  monitoringCycleResultSchema,
  type AdaptadorPesquisa,
  type AlvoRun,
  type CheckpointAlvo,
  type MonitoringAlerta,
  type MonitoringCycleResult,
  type TipoDelta,
} from "./monitoring.schema";
import type { Fato } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Monitoring Agent.
//
// Executa UM ciclo finito:
//
//   seleciona vencidos → reserva → pesquisa → compara → classifica → alerta
//
// Não é polling: não existe `while(true)`. A infraestrutura chama de novo
// depois. Isso mantém o motor testável e impede que um worker preso segure o
// processo web.
//
// O que este agente NÃO faz:
//   · não rasteja a web (delega ao adaptador de pesquisa)
//   · não classifica evento (delega ao Big Moment, e só quando há mudança)
//   · não executa Crossability, Matching nem Recommendation
//   · não altera Entity Intelligence, funil, Score Card, Knowledge ou Memory
//   · não envia notificação externa
//
// A economia é o produto: alvo não vencido não gera pesquisa; alvo sem mudança
// não gera classificação.
// -----------------------------------------------------------------------------

export interface EntradaCiclo {
  agora?: Date;
  workerId?: string;
  maxAlvos?: number;
  pesquisa: AdaptadorPesquisa;
}

/**
 * Impressão digital do fato.
 *
 * Sobre o CONTEÚDO, não sobre o id: uma nova execução de pesquisa pode gerar
 * `fact_id` novo para o mesmo texto, e comparar ids acusaria mudança onde não
 * houve — exatamente o desperdício que o Monitoring existe para evitar.
 */
export function fingerprintEvidencia(fato: Fato): string {
  const material = [
    fato.claim.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(),
    fato.categoria,
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 24);
}

/**
 * Chave de correlação do Monitoring.
 *
 * SEM data — de propósito. A AI-09 inclui o contexto temporal no fingerprint,
 * então "show em 12/10" e "show em 15/10" viram eventos distintos. Isso está
 * correto para identidade estrita, mas faria o Monitoring anunciar dois eventos
 * novos independentes quando pode ser o mesmo show remarcado.
 *
 * Esta chave detecta a relação SEM alterar o fingerprint oficial da AI-09.
 */
/**
 * Termos removidos da correlação.
 *
 * Duas famílias, ambas ruído para identificar o MESMO evento:
 *   · temporais — data é justamente o que muda quando algo é remarcado;
 *   · de estado/ação — "cancelada", "adiada", "confirmada" descrevem o que
 *     aconteceu COM o evento, não qual evento é. Mantê-los faria a notícia do
 *     cancelamento parecer um evento diferente do que ela cancela.
 */
const TERMOS_TEMPORAIS = new Set([
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
  "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
  "semestre", "trimestre", "proximo", "proxima", "amanha",
  // estado / ação sobre o evento
  "cancelada", "cancelado", "adiada", "adiado", "suspensa", "suspenso",
  "confirmada", "confirmado", "anunciou", "anunciada", "anunciado",
  "producao", "organizacao", "realizada", "realizado", "remarcada", "remarcado",
]);

export function correlationKey(entidade: string, tipo: string, titulo: string): string {
  // Vocabulário do título é ruído para esta finalidade: a mesma turnê é
  // descrita de formas diferentes quando é anunciada, remarcada ou cancelada
  // ("artista anunciou" × "cancelada pela produção"). Tentar filtrar palavra a
  // palavra viraria uma lista infinita de exceções.
  //
  // ENTIDADE + TIPO é o que identifica "o mesmo assunto" para monitoramento.
  // Deliberadamente MAIS FROUXO que o fingerprint da AI-09 — precisa ser, ou
  // não detectaria a relação que a AI-09 (corretamente) separa.
  //
  // O preço é conhecido: duas turnês realmente distintas da mesma entidade
  // caem na mesma correlação. Por isso o resultado é POSSÍVEL conflito, para
  // revisão humana — nunca fusão automática.
  const termosRelevantes = titulo
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 4 && !/\d/.test(w) && !TERMOS_TEMPORAIS.has(w));

  // Mantém apenas termos que aparecem no próprio tipo de evento normalizado,
  // se houver — caso contrário, a correlação fica em entidade+tipo.
  const marcador = termosRelevantes.find((w) => tipo.includes(w.slice(0, 4))) ?? "";

  return createHash("sha256")
    .update(`${entidade.toLowerCase()}|${tipo}|${marcador}`)
    .digest("hex").slice(0, 24);
}

interface LinhaAlvo {
  id: string;
  parte_id: string;
  entidade: string;
  prioridade: string;
  cadencia_horas: number;
  falhas_consecutivas: number;
  checkpoint: CheckpointAlvo;
}

/** Próxima verificação, com backoff determinístico em caso de falha. */
function calcularProxima(cadenciaHoras: number, falhas: number, agora: Date): Date {
  const multiplicador = falhas > 0
    ? Math.pow(LIMITES_MONITORING.backoffMultiplicador, falhas)
    : 1;
  const horas = Math.min(cadenciaHoras * multiplicador, LIMITES_MONITORING.backoffMaxHoras);
  return new Date(agora.getTime() + horas * 3_600_000);
}

export async function executarCiclo(
  client: PoolClient,
  entrada: EntradaCiclo
): Promise<MonitoringCycleResult> {
  const inicioMs = Date.now();
  const agora = entrada.agora ?? new Date();
  const workerId = entrada.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const maxAlvos = entrada.maxAlvos ?? LIMITES_MONITORING.maxAlvosPorCiclo;
  const avisos: string[] = [];

  const { rows: ciclo } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.monitoring_ciclo (worker_id) VALUES ($1) RETURNING id`,
    [workerId]
  );
  const cicloId = ciclo[0].id;

  // Quantos estão vencidos ao todo — o denominador honesto da economia.
  const { rows: totalVencidos } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM cross_ai.monitoring_alvo
      WHERE status = 'ativo' AND proxima_verificacao_em <= $1`,
    [agora]
  );
  const vencidos = Number(totalVencidos[0].n);

  // ------------------------------------------------------------- seleção
  //
  // FOR UPDATE SKIP LOCKED + lease: dois workers concorrentes nunca pegam o
  // mesmo alvo. O lease tem expiry, então um worker que morre não trava o alvo.
  const { rows: alvos } = await client.query<LinhaAlvo>(
    `UPDATE cross_ai.monitoring_alvo a
        SET reservado_ate = $2, reservado_por = $3
      WHERE a.id IN (
        SELECT s.id FROM cross_ai.monitoring_alvo s
         WHERE s.status = 'ativo'
           AND s.proxima_verificacao_em <= $1
           AND (s.reservado_ate IS NULL OR s.reservado_ate < $1)
         ORDER BY CASE s.prioridade WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                  s.proxima_verificacao_em
         LIMIT $4
         FOR UPDATE SKIP LOCKED
      )
      RETURNING a.id, a.parte_id, a.prioridade, a.cadencia_horas,
                a.falhas_consecutivas, a.checkpoint,
                (SELECT p.nome_exibicao FROM cross_core.parte p WHERE p.id = a.parte_id) AS entidade`,
    [agora, new Date(agora.getTime() + LIMITES_MONITORING.leaseMinutos * 60_000), workerId, maxAlvos]
  );

  const pulados: MonitoringCycleResult["alvos_pulados"] = [];
  if (vencidos > alvos.length) {
    avisos.push(
      `${vencidos - alvos.length} alvo(s) vencido(s) ficaram para o próximo ciclo (teto de ${maxAlvos}).`
    );
  }

  // ------------------------------------------------------------ execução
  const runs: AlvoRun[] = [];
  const alertas: MonitoringAlerta[] = [];
  const followUps: MonitoringCycleResult["follow_ups"] = [];

  let researchCalls = 0;
  let bigMomentCalls = 0;
  let bigMomentEvitados = 0;
  let webSearchCalls = 0;
  let firecrawlCalls = 0;
  let custo = 0;
  let sucesso = 0;
  let falha = 0;

  for (const alvo of alvos) {
    const checkpoint: CheckpointAlvo = {
      evidence_fingerprints: alvo.checkpoint?.evidence_fingerprints ?? [],
      big_moment_fingerprints: alvo.checkpoint?.big_moment_fingerprints ?? [],
      big_moment_status: alvo.checkpoint?.big_moment_status ?? {},
      ultima_verificacao_em: alvo.checkpoint?.ultima_verificacao_em ?? null,
    };
    const antes = checkpoint.evidence_fingerprints.length;

    try {
      const pesquisa = await entrada.pesquisa.pesquisar({
        entidade: alvo.entidade, parteId: alvo.parte_id,
      });
      researchCalls++;
      webSearchCalls += pesquisa.webSearchCalls;
      firecrawlCalls += pesquisa.firecrawlCalls;
      custo += pesquisa.custoUsd;

      const fingerprintsAgora = pesquisa.fatos.map(fingerprintEvidencia);
      const conhecidos = new Set(checkpoint.evidence_fingerprints);
      const novos = fingerprintsAgora.filter((f) => !conhecidos.has(f));

      // ------------------------------------------- FAST PATH: sem mudança
      //
      // Nenhuma evidência nova ⇒ não há o que classificar. Chamar o Big Moment
      // aqui seria gastar processamento para redescobrir o que já sabemos.
      if (novos.length === 0) {
        bigMomentEvitados++;
        const proxima = calcularProxima(alvo.cadencia_horas, 0, agora);
        await finalizarAlvo(client, alvo.id, {
          checkpoint: { ...checkpoint, ultima_verificacao_em: agora.toISOString() },
          proxima, falhas: 0, agora,
        });
        await registrarRun(client, cicloId, alvo.id, {
          status: "sem_mudanca", delta: "sem_mudanca",
          antes, depois: fingerprintsAgora.length, novas: 0,
          bigMomentExecutado: false, alertas: 0, proxima,
        });
        runs.push({
          alvo_id: alvo.id, parte_id: alvo.parte_id, entidade: alvo.entidade,
          status: "sem_mudanca", delta: "sem_mudanca", motivo_pulo: null,
          evidencias_antes: antes, evidencias_depois: fingerprintsAgora.length,
          evidencias_novas: 0, big_moment_executado: false, alertas: [],
          proxima_verificacao_em: proxima.toISOString(), erro: null,
        });
        followUps.push({ alvo_id: alvo.id, sugestao: "nenhuma" });
        sucesso++;
        continue;
      }

      // ----------------------------------- há mudança: aciona o Big Moment
      const fatosNovos = pesquisa.fatos.filter((f) => !conhecidos.has(fingerprintEvidencia(f)));
      const analise = await analisarBigMoments({
        entidade: alvo.entidade, parteId: alvo.parte_id,
        evidencias: fatosNovos, agora,
      });
      bigMomentCalls++;

      const alertasDoAlvo: MonitoringAlerta[] = [];
      let delta: TipoDelta = "evidencia_nova";

      for (const m of analise.moments) {
        const conhecido = checkpoint.big_moment_fingerprints.includes(m.event_fingerprint);
        const statusAnterior = checkpoint.big_moment_status[m.event_fingerprint];
        const corr = correlationKey(alvo.entidade, m.event_type, m.titulo);

        // Cancelamento é sempre relevante — não depende de score.
        //
        // O fingerprint da AI-09 inclui o texto do claim, então a notícia do
        // cancelamento tem identidade própria e `statusAnterior` costuma vir
        // vazio. Por isso a correlação também conta: um cancelamento correlato
        // a evento já conhecido é cancelamento, não evento novo.
        const conheciaCorrelato = Boolean(await buscarPorCorrelacao(client, alvo.id, corr));
        if (
          m.temporal_status === "cancelled" &&
          ((statusAnterior && statusAnterior !== "cancelled") || conheciaCorrelato)
        ) {
          delta = "big_moment_cancelado";
          alertasDoAlvo.push(await criarAlerta(client, {
            cicloId, alvoId: alvo.id, parteId: alvo.parte_id,
            tipo: "big_moment_cancelado", severidade: "alta",
            titulo: `Evento cancelado: ${m.titulo.slice(0, 120)}`,
            resumo: statusAnterior
              ? `O evento passou de "${statusAnterior}" para cancelado.`
              : "Evento correlato a um já conhecido aparece agora como cancelado.",
            evidenceRefs: m.evidence_refs, bigMomentRefs: [m.event_fingerprint],
            dedupeKey: `${m.event_fingerprint}:cancelled`, correlationKey: corr,
          }));
          continue;
        }

        if (conhecido) {
          delta = "big_moment_atualizado";
          alertasDoAlvo.push(await criarAlerta(client, {
            cicloId, alvoId: alvo.id, parteId: alvo.parte_id,
            tipo: "big_moment_atualizado", severidade: "media",
            titulo: `Evento atualizado: ${m.titulo.slice(0, 120)}`,
            resumo: `Nova evidência sobre evento já conhecido (v${m.versao}).`,
            evidenceRefs: m.evidence_refs, bigMomentRefs: [m.event_fingerprint],
            dedupeKey: `${m.event_fingerprint}:v${m.versao}`, correlationKey: corr,
          }));
          continue;
        }

        // ------------------------- correlação: evento possivelmente o mesmo
        //
        // Fingerprint diferente mas correlação igual sugere o mesmo evento com
        // data alterada. Trata-se como POSSÍVEL CONFLITO, não como dois eventos
        // novos independentes — e sem fundir nada automaticamente.
        const relacionado = await buscarPorCorrelacao(client, alvo.id, corr);
        if (relacionado) {
          delta = "possivel_conflito_de_evento";
          alertasDoAlvo.push(await criarAlerta(client, {
            cicloId, alvoId: alvo.id, parteId: alvo.parte_id,
            tipo: "possivel_conflito_de_evento", severidade: "media",
            titulo: `Possível conflito de evento: ${m.titulo.slice(0, 100)}`,
            resumo:
              "Evento com identidade distinta mas assunto correlato a um já conhecido — " +
              "possivelmente o mesmo evento com data alterada. Nenhuma fusão foi feita.",
            evidenceRefs: m.evidence_refs,
            bigMomentRefs: [m.event_fingerprint, relacionado],
            dedupeKey: `${m.event_fingerprint}:conflito`, correlationKey: corr,
          }));
          continue;
        }

        delta = "big_moment_novo";
        alertasDoAlvo.push(await criarAlerta(client, {
          cicloId, alvoId: alvo.id, parteId: alvo.parte_id,
          tipo: "big_moment_novo",
          severidade: m.prioridade_score >= 70 ? "alta" : "media",
          titulo: m.titulo.slice(0, 200),
          resumo: `${m.event_type} · ${m.temporal_status} · janela ${m.janela_oportunidade}.`,
          evidenceRefs: m.evidence_refs, bigMomentRefs: [m.event_fingerprint],
          dedupeKey: `${m.event_fingerprint}:novo`, correlationKey: corr,
        }));
      }

      // Evidência nova sem momento algum: registra o delta, sem alerta forte.
      if (analise.moments.length === 0) {
        delta = "evidencia_nova";
      }

      const efetivos = alertasDoAlvo.filter(Boolean);
      alertas.push(...efetivos);

      const novoCheckpoint: CheckpointAlvo = {
        evidence_fingerprints: [...new Set([...checkpoint.evidence_fingerprints, ...fingerprintsAgora])],
        big_moment_fingerprints: [...new Set([
          ...checkpoint.big_moment_fingerprints,
          ...analise.moments.map((m) => m.event_fingerprint),
        ])],
        big_moment_status: {
          ...checkpoint.big_moment_status,
          ...Object.fromEntries(analise.moments.map((m) => [m.event_fingerprint, m.temporal_status])),
        },
        ultima_verificacao_em: agora.toISOString(),
      };

      const proxima = calcularProxima(alvo.cadencia_horas, 0, agora);
      await finalizarAlvo(client, alvo.id, {
        checkpoint: novoCheckpoint, proxima, falhas: 0, agora,
      });
      await registrarRun(client, cicloId, alvo.id, {
        status: "sucesso", delta,
        antes, depois: novoCheckpoint.evidence_fingerprints.length, novas: novos.length,
        bigMomentExecutado: true, alertas: efetivos.length, proxima,
      });

      runs.push({
        alvo_id: alvo.id, parte_id: alvo.parte_id, entidade: alvo.entidade,
        status: "sucesso", delta, motivo_pulo: null,
        evidencias_antes: antes,
        evidencias_depois: novoCheckpoint.evidence_fingerprints.length,
        evidencias_novas: novos.length,
        big_moment_executado: true, alertas: efetivos,
        proxima_verificacao_em: proxima.toISOString(), erro: null,
      });
      followUps.push({
        alvo_id: alvo.id,
        sugestao: efetivos.length ? "revisar_alerta" : "nenhuma",
      });
      sucesso++;
    } catch (e) {
      // Falha de um alvo NÃO aborta o ciclo — os demais continuam.
      const falhas = alvo.falhas_consecutivas + 1;
      const proxima = calcularProxima(alvo.cadencia_horas, falhas, agora);
      await finalizarAlvo(client, alvo.id, {
        checkpoint, proxima, falhas, agora, semSucesso: true,
      });
      await registrarRun(client, cicloId, alvo.id, {
        status: "falha", delta: "falha_de_pesquisa",
        antes, depois: antes, novas: 0,
        bigMomentExecutado: false, alertas: 0, proxima,
        erro: (e as Error).message,
      });
      runs.push({
        alvo_id: alvo.id, parte_id: alvo.parte_id, entidade: alvo.entidade,
        status: "falha", delta: "falha_de_pesquisa", motivo_pulo: null,
        evidencias_antes: antes, evidencias_depois: antes, evidencias_novas: 0,
        big_moment_executado: false, alertas: [],
        proxima_verificacao_em: proxima.toISOString(),
        erro: (e as Error).message,
      });
      falha++;
    }
  }

  const finalizado = new Date();
  await client.query(
    `UPDATE cross_ai.monitoring_ciclo
        SET finalizado_em = $2, alvos_vencidos = $3, alvos_processados = $4,
            alvos_sucesso = $5, alvos_falha = $6,
            evidencias_novas = $7, momentos_novos = $8, momentos_atualizados = $9,
            alertas_criados = $10, research_evitados = $11, big_moment_evitados = $12,
            custo_estimado_usd = $13, avisos = $14
      WHERE id = $1`,
    [
      cicloId, finalizado, vencidos, alvos.length, sucesso, falha,
      runs.reduce((s, r) => s + r.evidencias_novas, 0),
      alertas.filter((a) => a.tipo === "big_moment_novo").length,
      alertas.filter((a) => a.tipo === "big_moment_atualizado").length,
      alertas.length, Math.max(0, vencidos - alvos.length), bigMomentEvitados,
      custo, JSON.stringify(avisos),
    ]
  );

  return monitoringCycleResultSchema.parse({
    ciclo_id: cicloId,
    iniciado_em: agora.toISOString(),
    finalizado_em: finalizado.toISOString(),
    worker_id: workerId,
    alvos_vencidos: vencidos,
    alvos_processados: alvos.length,
    alvos_sucesso: sucesso,
    alvos_falha: falha,
    alvos_pulados: pulados,
    runs,
    alertas,
    follow_ups: followUps,
    nivel_validacao: "estrutural",
    validacao_live_monitoring: "pendente",
    telemetria: {
      duracao_ms: Date.now() - inicioMs,
      research_calls: researchCalls,
      research_evitados: Math.max(0, vencidos - alvos.length),
      big_moment_calls: bigMomentCalls,
      big_moment_evitados: bigMomentEvitados,
      web_search_calls: webSearchCalls,
      firecrawl_calls: firecrawlCalls,
      llm_calls: 0,
      embedding_calls: 0,
      custo_estimado_usd: custo,
      // O Monitoring não aciona nenhum agente downstream.
      crossability_runs: 0,
      matching_runs: 0,
      recommendations_criadas: 0,
      entity_intelligence_writes: 0,
      oportunidades_criadas: 0,
      score_cards_alterados: 0,
      cross_knowledge_writes: 0,
      cross_memory_promocoes: 0,
      avisos,
    },
  });
}

/** Existe alerta anterior com a mesma correlação neste alvo? */
async function buscarPorCorrelacao(
  client: PoolClient, alvoId: string, corr: string
): Promise<string | null> {
  const { rows } = await client.query<{ big_moment_refs: string[] }>(
    `SELECT big_moment_refs FROM cross_ai.monitoring_alerta
      WHERE alvo_id = $1 AND correlation_key = $2
      ORDER BY detectado_em DESC LIMIT 1`,
    [alvoId, corr]
  );
  return rows[0]?.big_moment_refs?.[0] ?? null;
}

/**
 * Cria o alerta, deduplicando.
 *
 * O índice único em `deduplication_key` é a garantia real: o mesmo evento em
 * ciclos consecutivos não vira alerta novo. `ON CONFLICT DO NOTHING` devolve
 * zero linhas, e o alerta simplesmente não é recriado.
 */
async function criarAlerta(
  client: PoolClient,
  a: {
    cicloId: string; alvoId: string; parteId: string;
    tipo: MonitoringAlerta["tipo"]; severidade: MonitoringAlerta["severidade"];
    titulo: string; resumo: string;
    evidenceRefs: string[]; bigMomentRefs: string[];
    dedupeKey: string; correlationKey: string | null;
  }
): Promise<MonitoringAlerta> {
  // `detectado_em` chega como Date do pg; o contrato usa ISO string.
  const { rows } = await client.query<{ id: string; detectado_em: Date | string }>(
    `INSERT INTO cross_ai.monitoring_alerta
       (alvo_id, parte_id, ciclo_id, tipo, severidade, titulo, resumo,
        evidence_refs, big_moment_refs, deduplication_key, correlation_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (deduplication_key) DO NOTHING
     RETURNING id, detectado_em`,
    [
      a.alvoId, a.parteId, a.cicloId, a.tipo, a.severidade, a.titulo, a.resumo,
      a.evidenceRefs, a.bigMomentRefs, a.dedupeKey, a.correlationKey,
    ]
  );

  // Já existia: devolve marcado, e o chamador não o conta como novo.
  if (!rows.length) {
    return {
      id: "", alvo_id: a.alvoId, parte_id: a.parteId, tipo: a.tipo,
      severidade: a.severidade, titulo: a.titulo, resumo: a.resumo,
      evidence_refs: a.evidenceRefs, big_moment_refs: a.bigMomentRefs,
      deduplication_key: a.dedupeKey, correlation_key: a.correlationKey,
      status: "visto", detectado_em: new Date().toISOString(),
    } as MonitoringAlerta;
  }

  return {
    id: rows[0].id, alvo_id: a.alvoId, parte_id: a.parteId, tipo: a.tipo,
    severidade: a.severidade, titulo: a.titulo, resumo: a.resumo,
    evidence_refs: a.evidenceRefs, big_moment_refs: a.bigMomentRefs,
    deduplication_key: a.dedupeKey, correlation_key: a.correlationKey,
    status: "novo",
    detectado_em: rows[0].detectado_em instanceof Date
      ? rows[0].detectado_em.toISOString()
      : rows[0].detectado_em,
  };
}

async function finalizarAlvo(
  client: PoolClient, alvoId: string,
  a: { checkpoint: CheckpointAlvo; proxima: Date; falhas: number; agora: Date; semSucesso?: boolean }
): Promise<void> {
  await client.query(
    `UPDATE cross_ai.monitoring_alvo
        SET checkpoint = $2, proxima_verificacao_em = $3,
            ultima_verificacao_em = $4, falhas_consecutivas = $5,
            ultimo_sucesso_em = CASE WHEN $6 THEN ultimo_sucesso_em ELSE $4 END,
            reservado_ate = NULL, reservado_por = NULL, atualizado_em = now()
      WHERE id = $1`,
    [alvoId, JSON.stringify(a.checkpoint), a.proxima, a.agora, a.falhas, a.semSucesso ?? false]
  );
}

async function registrarRun(
  client: PoolClient, cicloId: string, alvoId: string,
  a: {
    status: string; delta: string; antes: number; depois: number; novas: number;
    bigMomentExecutado: boolean; alertas: number; proxima: Date; erro?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO cross_ai.monitoring_alvo_run
       (ciclo_id, alvo_id, status, delta, finalizado_em,
        evidencias_antes, evidencias_depois, evidencias_novas,
        big_moment_executado, alertas_criados, erro, proxima_verificacao_em)
     VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8,$9,$10,$11)`,
    [
      cicloId, alvoId, a.status, a.delta, a.antes, a.depois, a.novas,
      a.bigMomentExecutado, a.alertas, a.erro ?? null, a.proxima,
    ]
  );
}
