import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { executarCiclo, fingerprintEvidencia, correlationKey } from "./monitoring.agent";
import {
  criarAlvo, pausarAlvo, listarVencidos, diagnosticarAlvo,
  listarAlertasNovos, listarAlertasPorParte, listarCiclos, listarRunsDoCiclo,
} from "./monitoring.repository";
import { LIMITES_MONITORING, type AdaptadorPesquisa } from "./monitoring.schema";
import type { Fato } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Monitoring — cenários A a AR da Sprint AI-10.
//
// LIVE WEB DESLIGADA: todo Research vem de adaptador controlado. O que se
// valida é o MOTOR — seleção, delta, economia, concorrência, recuperação — não
// a qualidade de uma busca externa.
//
// A economia é o produto: alvo não vencido não pesquisa; alvo sem mudança não
// classifica.
// -----------------------------------------------------------------------------

const AGORA = new Date("2026-06-15T12:00:00Z");
/**
 * Data de vencimento para as fixtures.
 *
 * O ciclo compara contra o relógio INJETADO (AGORA), não contra now(). Sem
 * isto, um alvo criado com `now()` real (2026-08) nunca estaria vencido em
 * relação a AGORA, e nenhum alvo seria selecionado.
 */
const VENCIDO = new Date(AGORA.getTime() - 3_600_000);

function fato(id: string, claim: string): Fato {
  return {
    fact_id: id, claim, entidade: "E", categoria: "movimento_estrategico",
    natureza: "fato", source_refs: [`src_${id}`], dominios_independentes: 2,
    verificacao: "corroborada", confianca: 80,
    publicado_em: "2026-06-01", coletado_em: "2026-06-10",
  } as Fato;
}

/** Adaptador controlado: nenhuma rede, resposta determinística. */
function adaptador(
  porEntidade: Record<string, Fato[]> | Fato[],
  opcoes: { falharEm?: string[] } = {}
): AdaptadorPesquisa & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    modo: "controlado",
    chamadas,
    async pesquisar({ entidade }) {
      chamadas.push(entidade);
      if (opcoes.falharEm?.includes(entidade)) {
        throw new Error(`Falha controlada para ${entidade}`);
      }
      const fatos = Array.isArray(porEntidade) ? porEntidade : (porEntidade[entidade] ?? []);
      // Zero rede: os contadores provam que nada externo foi chamado.
      return { fatos, webSearchCalls: 0, firecrawlCalls: 0, custoUsd: 0 };
    },
  };
}

async function novaParte(client: PoolClient, nome: string): Promise<string> {
  const { rows: st } = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
     VALUES ('organizacao',$1,$2) RETURNING id`, [nome, st[0].id]);
  return rows[0].id;
}

const TURNE = "O artista anunciou turnê nacional em 20/11/2026.";

// -----------------------------------------------------------------------------

describe("A/B/C · Registro e seleção de alvos", () => {
  it("cria alvo explicitamente e é idempotente por Parte", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Alvo A");
      const a = await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const b = await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      expect(a.jaExistia).toBe(false);
      expect(b.jaExistia).toBe(true);
      expect(b.id).toBe(a.id);
    });
  });

  it("não inscreve a base automaticamente", async () => {
    await withTransaction(async (client) => {
      await novaParte(client, "Parte Sem Alvo 1");
      await novaParte(client, "Parte Sem Alvo 2");

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.monitoring_alvo`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  it("alvo não vencido não é selecionado nem pesquisado", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Futura");
      await criarAlvo(client, {
        parteId: p, proximaVerificacaoEm: new Date(AGORA.getTime() + 86_400_000),
      });

      const ad = adaptador([fato("EV-1", TURNE)]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(r.alvos_vencidos).toBe(0);
      expect(r.alvos_processados).toBe(0);
      expect(ad.chamadas).toHaveLength(0);
      expect(r.telemetria.research_calls).toBe(0);
    });
  });
});

describe("D/E/F · Prioridade, lote e pausa", () => {
  it("processa alta prioridade primeiro", async () => {
    await withTransaction(async (client) => {
      const baixa = await novaParte(client, "Zzz Baixa");
      const alta = await novaParte(client, "Aaa Alta");
      await criarAlvo(client, { parteId: baixa, prioridade: "baixa", proximaVerificacaoEm: VENCIDO });
      await criarAlvo(client, { parteId: alta, prioridade: "alta", proximaVerificacaoEm: VENCIDO });

      const ad = adaptador([]);
      await executarCiclo(client, { agora: AGORA, pesquisa: ad, maxAlvos: 1 });

      expect(ad.chamadas).toEqual(["Aaa Alta"]);
    });
  });

  it("respeita o teto do ciclo e deixa o resto vencido", async () => {
    await withTransaction(async (client) => {
      for (let i = 1; i <= 5; i++) {
        await criarAlvo(client, { parteId: await novaParte(client, `Marca Lote ${i}`), proximaVerificacaoEm: VENCIDO });
      }

      const ad = adaptador([]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad, maxAlvos: 2 });

      expect(r.alvos_vencidos).toBe(5);
      expect(r.alvos_processados).toBe(2);
      expect(r.telemetria.research_evitados).toBe(3);
      expect(r.telemetria.avisos.some((a) => /próximo ciclo/i.test(a))).toBe(true);
    });
  });

  it("alvo pausado não é processado", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Pausada");
      const { id } = await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      await pausarAlvo(client, id);

      const ad = adaptador([fato("EV-1", TURNE)]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(r.alvos_processados).toBe(0);
      expect(ad.chamadas).toHaveLength(0);

      const d = await diagnosticarAlvo(client, p, AGORA);
      expect(d.motivo).toBe("pausado");
    });
  });
});

describe("G/H/AF · Fast path de ausência de mudança", () => {
  it("evidência idêntica NÃO dispara Big Moment", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Estavel");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const ad = adaptador([fato("EV-1", TURNE)]);

      // Ciclo 1: descobre.
      const c1 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });
      expect(c1.telemetria.big_moment_calls).toBe(1);

      // Ciclo 2: mesma evidência, alvo já vencido de novo.
      await client.query(
        `UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em = $1`, [AGORA]);
      const c2 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(c2.runs[0].delta).toBe("sem_mudanca");
      expect(c2.runs[0].big_moment_executado).toBe(false);
      // A economia central da Sprint.
      expect(c2.telemetria.big_moment_calls).toBe(0);
      expect(c2.telemetria.big_moment_evitados).toBe(1);
      expect(c2.alertas).toHaveLength(0);
    });
  });

  it("fingerprint é sobre conteúdo, não sobre fact_id", () => {
    // Research pode gerar id novo para o mesmo texto; comparar ids acusaria
    // mudança inexistente.
    const a = fingerprintEvidencia(fato("EV-1", TURNE));
    const b = fingerprintEvidencia(fato("EV-999", TURNE));
    expect(a).toBe(b);

    const c = fingerprintEvidencia(fato("EV-2", "A marca inaugurou loja no Recife."));
    expect(c).not.toBe(a);
  });
});

describe("I/J/K/L/M · Delta e alertas", () => {
  it("evidência nova sem momento gera delta, sem alerta forte", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Rotina");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const ad = adaptador([fato("EV-1", "A marca atualizou sua política de privacidade.")]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(r.runs[0].delta).toBe("evidencia_nova");
      expect(r.runs[0].evidencias_novas).toBe(1);
      // Notícia rotineira não vira alerta.
      expect(r.alertas.filter((a) => a.tipo === "big_moment_novo")).toHaveLength(0);
    });
  });

  it("Big Moment novo gera alerta", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Artista Novo");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const ad = adaptador([fato("EV-1", TURNE)]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(r.runs[0].delta).toBe("big_moment_novo");
      expect(r.alertas).toHaveLength(1);
      expect(r.alertas[0].tipo).toBe("big_moment_novo");
      expect(r.alertas[0].status).toBe("novo");
    });
  });

  it("cancelamento gera alerta de alta severidade", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Artista Cancelamento");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const ad1 = adaptador([fato("EV-1", TURNE)]);
      await executarCiclo(client, { agora: AGORA, pesquisa: ad1 });

      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em = $1`, [AGORA]);
      const ad2 = adaptador([
        fato("EV-1", TURNE),
        fato("EV-2", "A turnê nacional foi cancelada pela produção em 20/11/2026."),
      ]);
      const r2 = await executarCiclo(client, { agora: AGORA, pesquisa: ad2 });

      const cancelamento = r2.alertas.find((a) => a.tipo === "big_moment_cancelado");
      expect(cancelamento).toBeDefined();
      expect(cancelamento!.severidade).toBe("alta");
    });
  });
});

describe("N/O · Deduplicação de alertas", () => {
  it("três ciclos com o mesmo evento produzem UM alerta", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Artista Dedupe");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const ad = adaptador([fato("EV-1", TURNE)]);

      const c1 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [AGORA]);
      const c2 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [AGORA]);
      const c3 = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      const novos = (c: typeof c1) => c.alertas.filter((a) => a.status === "novo").length;
      expect(novos(c1)).toBe(1);
      expect(novos(c2)).toBe(0);
      expect(novos(c3)).toBe(0);

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.monitoring_alerta WHERE parte_id=$1`, [p]);
      expect(Number(rows[0].n)).toBe(1);
    });
  });
});

describe("P/Q · Correlação e limitação conhecida da AI-09", () => {
  it("chave de correlação ignora a data", () => {
    // A AI-09 inclui data no fingerprint — correto para identidade estrita.
    // A correlação existe para reconhecer que pode ser o MESMO evento.
    const a = correlationKey("Artista", "tour", "Turnê nacional anunciada para novembro");
    const b = correlationKey("Artista", "tour", "Turnê nacional anunciada para dezembro");
    expect(a).toBe(b);
  });

  it("evento com data diferente vira possível conflito, não dois eventos novos", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Artista Conflito");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const ad1 = adaptador([fato("EV-1", "O artista anunciou turnê nacional em 12/10/2026.")]);
      const c1 = await executarCiclo(client, { agora: AGORA, pesquisa: ad1 });
      expect(c1.alertas[0].tipo).toBe("big_moment_novo");

      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [AGORA]);
      const ad2 = adaptador([
        fato("EV-1", "O artista anunciou turnê nacional em 12/10/2026."),
        fato("EV-2", "O artista anunciou turnê nacional em 15/10/2026."),
      ]);
      const c2 = await executarCiclo(client, { agora: AGORA, pesquisa: ad2 });

      // Não anuncia um segundo evento independente.
      const conflito = c2.alertas.find((a) => a.tipo === "possivel_conflito_de_evento");
      expect(conflito).toBeDefined();
      expect(conflito!.big_moment_refs.length).toBe(2);
      expect(conflito!.resumo).toMatch(/nenhuma fusão/i);
    });
  });

  it("o fingerprint estrito da AI-09 permanece intocado", async () => {
    // A correlação é SECUNDÁRIA: a identidade oficial continua sendo a da AI-09.
    const { calcularFingerprint } = await import("../momento/big-moment.agent");
    const a = calcularFingerprint("Artista", "tour", "Turnê nacional", "2026-10-12");
    const b = calcularFingerprint("Artista", "tour", "Turnê nacional", "2026-10-15");
    expect(a).not.toBe(b);
  });
});

describe("R/S/T/U · Falhas, contagem e backoff", () => {
  it("falha em um alvo não aborta o ciclo", async () => {
    await withTransaction(async (client) => {
      const a = await novaParte(client, "Marca Falha");
      const b = await novaParte(client, "Marca Ok 1");
      const c = await novaParte(client, "Marca Ok 2");
      for (const p of [a, b, c]) await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const ad = adaptador([fato("EV-1", TURNE)], { falharEm: ["Marca Falha"] });
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad });

      expect(r.alvos_processados).toBe(3);
      expect(r.alvos_falha).toBe(1);
      expect(r.alvos_sucesso).toBe(2);
      expect(r.runs.find((x) => x.entidade === "Marca Falha")!.erro).toMatch(/Falha controlada/);
    });
  });

  it("falha incrementa contador e afasta a próxima verificação", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Backoff");
      await criarAlvo(client, { parteId: p, cadenciaHoras: 24, proximaVerificacaoEm: VENCIDO });
      const ad = adaptador([], { falharEm: ["Marca Backoff"] });

      await executarCiclo(client, { agora: AGORA, pesquisa: ad });
      const { rows: r1 } = await client.query<{ falhas: number; proxima: Date }>(
        `SELECT falhas_consecutivas AS falhas, proxima_verificacao_em AS proxima
           FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      expect(r1[0].falhas).toBe(1);

      // Backoff: 24h × 2^1 = 48h.
      const horas = (r1[0].proxima.getTime() - AGORA.getTime()) / 3_600_000;
      expect(horas).toBeCloseTo(48, 0);

      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [AGORA]);
      await executarCiclo(client, { agora: AGORA, pesquisa: ad });
      const { rows: r2 } = await client.query<{ falhas: number; proxima: Date }>(
        `SELECT falhas_consecutivas AS falhas, proxima_verificacao_em AS proxima
           FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      expect(r2[0].falhas).toBe(2);
      // 24h × 2^2 = 96h.
      expect((r2[0].proxima.getTime() - AGORA.getTime()) / 3_600_000).toBeCloseTo(96, 0);
    });
  });

  it("sucesso zera o contador de falhas", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Recupera");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      await executarCiclo(client, {
        agora: AGORA, pesquisa: adaptador([], { falharEm: ["Marca Recupera"] }),
      });
      await client.query(`UPDATE cross_ai.monitoring_alvo SET proxima_verificacao_em=$1`, [AGORA]);
      await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const { rows } = await client.query<{ falhas: number; sucesso: Date | null }>(
        `SELECT falhas_consecutivas AS falhas, ultimo_sucesso_em AS sucesso
           FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      expect(rows[0].falhas).toBe(0);
      expect(rows[0].sucesso).not.toBeNull();
    });
  });

  it("backoff tem teto", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Teto");
      await criarAlvo(client, { parteId: p, cadenciaHoras: 168, proximaVerificacaoEm: VENCIDO });
      await client.query(
        `UPDATE cross_ai.monitoring_alvo SET falhas_consecutivas = 20 WHERE parte_id=$1`, [p]);

      await executarCiclo(client, {
        agora: AGORA, pesquisa: adaptador([], { falharEm: ["Marca Teto"] }),
      });

      const { rows } = await client.query<{ proxima: Date }>(
        `SELECT proxima_verificacao_em AS proxima FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      const horas = (rows[0].proxima.getTime() - AGORA.getTime()) / 3_600_000;
      expect(horas).toBeLessThanOrEqual(LIMITES_MONITORING.backoffMaxHoras);
    });
  });
});

describe("V/W · Concorrência e recuperação de lease", () => {
  it("alvo reservado por outro worker não é reprocessado", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Reservada");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      // Simula worker A tendo reservado o alvo.
      await client.query(
        `UPDATE cross_ai.monitoring_alvo
            SET reservado_ate = $1, reservado_por = 'worker-A' WHERE parte_id = $2`,
        [new Date(AGORA.getTime() + 5 * 60_000), p]);

      const ad = adaptador([fato("EV-1", TURNE)]);
      const r = await executarCiclo(client, {
        agora: AGORA, pesquisa: ad, workerId: "worker-B",
      });

      expect(r.alvos_processados).toBe(0);
      expect(ad.chamadas).toHaveLength(0);

      const d = await diagnosticarAlvo(client, p, AGORA);
      expect(d.motivo).toBe("reservado_por_outro_worker");
    });
  });

  it("lease expirado permite recuperar alvo de worker morto", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Orfa");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      // Worker morreu: reserva ficou no passado.
      await client.query(
        `UPDATE cross_ai.monitoring_alvo
            SET reservado_ate = $1, reservado_por = 'worker-morto' WHERE parte_id = $2`,
        [new Date(AGORA.getTime() - 60 * 60_000), p]);

      const ad = adaptador([fato("EV-1", TURNE)]);
      const r = await executarCiclo(client, {
        agora: AGORA, pesquisa: ad, workerId: "worker-novo",
      });

      // Sem expiry, o alvo ficaria travado para sempre.
      expect(r.alvos_processados).toBe(1);
      expect(ad.chamadas).toEqual(["Marca Orfa"]);
    });
  });

  it("libera a reserva ao terminar", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Libera");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const { rows } = await client.query<{ reservado_ate: Date | null }>(
        `SELECT reservado_ate FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      expect(rows[0].reservado_ate).toBeNull();
    });
  });
});

describe("X/Y/Z · Checkpoint e agendamento", () => {
  it("checkpoint guarda referências, não conteúdo", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Checkpoint");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const { rows } = await client.query<{ checkpoint: Record<string, unknown> }>(
        `SELECT checkpoint FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);
      const cp = rows[0].checkpoint;

      expect(Array.isArray(cp.evidence_fingerprints)).toBe(true);
      expect((cp.evidence_fingerprints as string[]).length).toBe(1);
      // Nenhum texto de fato: só hashes.
      expect(JSON.stringify(cp)).not.toContain("turnê");
      expect(JSON.stringify(cp).length).toBeLessThan(1000);
    });
  });

  it("registra primeira/última verificação e agenda a próxima pela cadência", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Agenda");
      await criarAlvo(client, { parteId: p, cadenciaHoras: 72, proximaVerificacaoEm: VENCIDO });
      await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const { rows } = await client.query<{ ultima: Date; proxima: Date }>(
        `SELECT ultima_verificacao_em AS ultima, proxima_verificacao_em AS proxima
           FROM cross_ai.monitoring_alvo WHERE parte_id=$1`, [p]);

      expect(rows[0].ultima.toISOString()).toBe(AGORA.toISOString());
      expect((rows[0].proxima.getTime() - AGORA.getTime()) / 3_600_000).toBeCloseTo(72, 0);
    });
  });
});

describe("AA/AB/AC · Auditoria e consultas", () => {
  it("persiste ciclo e execução por alvo", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Auditoria");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const ciclos = await listarCiclos(client);
      expect(ciclos.some((c) => c.id === r.ciclo_id)).toBe(true);

      const runs = await listarRunsDoCiclo(client, r.ciclo_id);
      expect(runs).toHaveLength(1);
      expect(runs[0].delta).toBe("big_moment_novo");
      expect(runs[0].big_moment_executado).toBe(true);
    });
  });

  it("consulta alertas novos e por Parte", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Consulta");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      expect((await listarAlertasNovos(client)).length).toBeGreaterThan(0);
      expect((await listarAlertasPorParte(client, p))).toHaveLength(1);
    });
  });

  it("explica por que um alvo não foi verificado", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca Diagnostico");
      await criarAlvo(client, {
        parteId: p, proximaVerificacaoEm: new Date(AGORA.getTime() + 86_400_000),
      });
      const d = await diagnosticarAlvo(client, p, AGORA);
      expect(d.motivo).toBe("nao_vencido");
      expect(d.detalhe).toMatch(/Próxima verificação/);

      const semAlvo = await novaParte(client, "Marca Sem Registro");
      expect((await diagnosticarAlvo(client, semAlvo, AGORA)).motivo).toBe("alvo_invalido");
    });
  });
});

describe("AE · 500 alvos com teto", () => {
  it("processa somente o lote e deixa o resto vencido", async () => {
    await withTransaction(async (client) => {
      const { rows: st } = await client.query<{ id: string }>(
        `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
      await client.query(
        `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
         SELECT 'organizacao', 'Massa ' || g, $1 FROM generate_series(1,500) g`, [st[0].id]);
      // proxima_verificacao_em explícita: o default é now(), que não está
      // vencido em relação ao relógio injetado.
      await client.query(
        `INSERT INTO cross_ai.monitoring_alvo (parte_id, proxima_verificacao_em)
         SELECT id, $1 FROM cross_core.parte WHERE nome_exibicao LIKE 'Massa %'`,
        [VENCIDO]);

      const inicio = Date.now();
      const ad = adaptador([]);
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: ad, maxAlvos: 25 });
      const ms = Date.now() - inicio;

      expect(r.alvos_vencidos).toBe(500);
      expect(r.alvos_processados).toBe(25);
      expect(ad.chamadas).toHaveLength(25);
      expect(r.telemetria.research_evitados).toBe(475);
      expect(ms).toBeLessThan(15000);

      const restantes = await listarVencidos(client, AGORA, 1000);
      expect(restantes.length).toBe(475);
    });
  });
});

describe("AG–AR · Zero efeito colateral e zero IA paga", () => {
  it("não executa nenhum agente downstream nem altera estruturas", async () => {
    await withTransaction(async (client) => {
      const contar = async () => {
        const { rows } = await client.query(
          `SELECT (SELECT count(*) FROM cross_ai.perfil_entidade)::int perfis,
                  (SELECT count(*) FROM cross_ai.recomendacao)::int recomendacoes,
                  (SELECT count(*) FROM cross_projects.candidatura_parceiro)::int candidaturas,
                  (SELECT count(*) FROM cross_projects.historico_candidatura)::int funil,
                  (SELECT count(*) FROM cross_methodologies.avaliacao_score_card)::int score_cards,
                  (SELECT count(*) FROM cross_ai.conhecimento_documento)::int knowledge`);
        return rows[0];
      };

      const p = await novaParte(client, "Marca SideEffect");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });

      const antes = await contar();
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });
      expect(await contar()).toEqual(antes);

      const t = r.telemetria;
      expect(t.crossability_runs).toBe(0);
      expect(t.matching_runs).toBe(0);
      expect(t.recommendations_criadas).toBe(0);
      expect(t.entity_intelligence_writes).toBe(0);
      expect(t.oportunidades_criadas).toBe(0);
      expect(t.score_cards_alterados).toBe(0);
      expect(t.cross_knowledge_writes).toBe(0);
      expect(t.cross_memory_promocoes).toBe(0);
    });
  });

  it("zero IA paga e zero web ao vivo na validação estrutural", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca SemCusto");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      const t = r.telemetria;
      expect(t.llm_calls).toBe(0);
      expect(t.embedding_calls).toBe(0);
      expect(t.web_search_calls).toBe(0);
      expect(t.firecrawl_calls).toBe(0);
      expect(t.custo_estimado_usd).toBe(0);
      expect(r.nivel_validacao).toBe("estrutural");
      expect(r.validacao_live_monitoring).toBe("pendente");
    });
  });

  it("follow-ups são sugestões, nunca execuções", async () => {
    await withTransaction(async (client) => {
      const p = await novaParte(client, "Marca FollowUp");
      await criarAlvo(client, { parteId: p, proximaVerificacaoEm: VENCIDO });
      const r = await executarCiclo(client, { agora: AGORA, pesquisa: adaptador([fato("EV-1", TURNE)]) });

      expect(r.follow_ups).toHaveLength(1);
      expect(r.follow_ups[0].sugestao).toBe("revisar_alerta");
      // Nada foi disparado.
      expect(r.telemetria.crossability_runs).toBe(0);
      expect(r.telemetria.matching_runs).toBe(0);
    });
  });
});
