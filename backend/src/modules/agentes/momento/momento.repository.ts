import type { PoolClient } from "pg";
import type { BigMomentSignal } from "./momento.schema";

// -----------------------------------------------------------------------------
// Persistência dos Big Moment Signals.
//
// Existe porque o AI-10 Monitoring precisará COMPARAR execuções: o que é novo,
// o que mudou, o que expirou. Sem estado persistido, toda execução acharia que
// descobriu tudo pela primeira vez.
//
// Upsert por `event_fingerprint`: nova Evidence sobre o mesmo evento atualiza a
// linha e registra uma versão, em vez de criar um momento duplicado.
// -----------------------------------------------------------------------------

export interface MomentoPersistido {
  id: string;
  versao: number;
  situacao: "novo" | "atualizado" | "inalterado";
}

export async function salvarMomento(
  client: PoolClient,
  m: BigMomentSignal,
  opcoes: { execucaoId?: string | null; classifierVersao: string }
): Promise<MomentoPersistido> {
  const { rows: existente } = await client.query<{
    id: string; versao: number; temporal_status: string; evidence_refs: string[];
  }>(
    `SELECT id, versao, temporal_status, evidence_refs
       FROM cross_ai.big_moment_signal WHERE event_fingerprint = $1`,
    [m.event_fingerprint]
  );

  if (!existente.length) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_ai.big_moment_signal (
         parte_id, entidade_nome, event_type, titulo, resumo_factual,
         temporal_status, expressao_temporal,
         anunciado_em, inicia_em, termina_em, ocorreu_em,
         janela_oportunidade, evidence_refs, forca_verificacao,
         dominios_independentes, prioridade_score, componentes_relevancia,
         conflitos, lacunas, event_fingerprint, versao,
         classifier_versao, execucao_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,1,$21,$22)
       RETURNING id`,
      [
        m.parte_id, m.entidade, m.event_type, m.titulo, m.resumo_factual,
        m.temporal_status, m.expressao_temporal,
        m.anunciado_em, m.inicia_em, m.termina_em, m.ocorreu_em,
        m.janela_oportunidade, m.evidence_refs, m.forca_verificacao,
        m.dominios_independentes, m.prioridade_score,
        JSON.stringify(m.componentes_relevancia), JSON.stringify(m.conflitos),
        m.lacunas, m.event_fingerprint, opcoes.classifierVersao,
        opcoes.execucaoId ?? null,
      ]
    );
    await registrarVersao(client, rows[0].id, 1, m, "Momento identificado pela primeira vez.");
    return { id: rows[0].id, versao: 1, situacao: "novo" };
  }

  const atual = existente[0];
  const refsNovas = m.evidence_refs.filter((r) => !atual.evidence_refs.includes(r));
  const statusMudou = atual.temporal_status !== m.temporal_status;

  // Nada de novo: só atualiza quando revimos, sem inflar versão.
  if (!refsNovas.length && !statusMudou) {
    await client.query(
      `UPDATE cross_ai.big_moment_signal SET ultimo_visto_em = now() WHERE id = $1`,
      [atual.id]
    );
    return { id: atual.id, versao: atual.versao, situacao: "inalterado" };
  }

  const novaVersao = atual.versao + 1;
  await client.query(
    `UPDATE cross_ai.big_moment_signal
        SET temporal_status = $2, janela_oportunidade = $3,
            evidence_refs = $4, forca_verificacao = $5,
            dominios_independentes = $6, prioridade_score = $7,
            componentes_relevancia = $8, conflitos = $9, lacunas = $10,
            inicia_em = COALESCE($11, inicia_em),
            ocorreu_em = COALESCE($12, ocorreu_em),
            ultimo_visto_em = now(), atualizado_em = now(), versao = $13
      WHERE id = $1`,
    [
      atual.id, m.temporal_status, m.janela_oportunidade,
      [...new Set([...atual.evidence_refs, ...m.evidence_refs])],
      m.forca_verificacao, m.dominios_independentes, m.prioridade_score,
      JSON.stringify(m.componentes_relevancia), JSON.stringify(m.conflitos),
      m.lacunas, m.inicia_em, m.ocorreu_em, novaVersao,
    ]
  );

  const motivo = statusMudou
    ? `Status mudou de ${atual.temporal_status} para ${m.temporal_status}.`
    : `${refsNovas.length} nova(s) evidência(s).`;
  await registrarVersao(client, atual.id, novaVersao, m, motivo);

  return { id: atual.id, versao: novaVersao, situacao: "atualizado" };
}

/** Congela o estado do momento numa versão. A trajetória é a informação. */
async function registrarVersao(
  client: PoolClient, id: string, versao: number,
  m: BigMomentSignal, motivo: string
): Promise<void> {
  await client.query(
    `INSERT INTO cross_ai.big_moment_versao
       (big_moment_id, versao, temporal_status, evidence_refs, motivo_mudanca, snapshot)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (big_moment_id, versao) DO NOTHING`,
    [id, versao, m.temporal_status, m.evidence_refs, motivo, JSON.stringify(m)]
  );
}

/** Momentos de uma Parte, mais recentes primeiro. */
export async function listarPorParte(client: PoolClient, parteId: string) {
  const { rows } = await client.query(
    `SELECT id, entidade_nome, event_type, titulo, temporal_status,
            janela_oportunidade, prioridade_score, versao,
            primeiro_visto_em, ultimo_visto_em
       FROM cross_ai.big_moment_signal
      WHERE parte_id = $1
      ORDER BY ultimo_visto_em DESC`,
    [parteId]
  );
  return rows;
}

/**
 * Momentos ativos agora.
 *
 * Responde "o que está quente?" sem reprocessar análise — é o que o Monitoring
 * consultará a cada ciclo.
 */
export async function listarAtivos(client: PoolClient, limite = 50) {
  const { rows } = await client.query(
    `SELECT id, entidade_nome, event_type, titulo, temporal_status,
            janela_oportunidade, prioridade_score, inicia_em
       FROM cross_ai.big_moment_signal
      WHERE janela_oportunidade IN ('active','pre_event')
        AND temporal_status <> 'cancelled'
      ORDER BY prioridade_score DESC, event_fingerprint
      LIMIT $1`,
    [limite]
  );
  return rows;
}

/** Momentos vistos pela primeira vez desde uma data. Base do Monitoring. */
export async function listarRecentes(client: PoolClient, desde: Date, limite = 50) {
  const { rows } = await client.query(
    `SELECT id, entidade_nome, event_type, titulo, temporal_status,
            primeiro_visto_em, prioridade_score
       FROM cross_ai.big_moment_signal
      WHERE primeiro_visto_em >= $1
      ORDER BY primeiro_visto_em DESC
      LIMIT $2`,
    [desde, limite]
  );
  return rows;
}

/** Momentos conhecidos de uma entidade, para distinguir novo de atualização. */
export async function carregarConhecidos(
  client: PoolClient, entidade: string
): Promise<BigMomentSignal[]> {
  const { rows } = await client.query(
    `SELECT id, event_fingerprint, temporal_status, evidence_refs, versao,
            primeiro_visto_em
       FROM cross_ai.big_moment_signal WHERE entidade_nome = $1`,
    [entidade]
  );
  return rows.map((r) => ({
    id: r.id,
    event_fingerprint: r.event_fingerprint,
    temporal_status: r.temporal_status,
    evidence_refs: r.evidence_refs,
    versao: r.versao,
    // pg devolve timestamptz como Date; o contrato usa ISO string. Sem a
    // conversão, o valor volta ao agente e quebra a validação do schema.
    primeiro_visto_em: r.primeiro_visto_em instanceof Date
      ? r.primeiro_visto_em.toISOString()
      : r.primeiro_visto_em,
  })) as BigMomentSignal[];
}

/** Trajetória completa de um momento. */
export async function listarVersoes(client: PoolClient, bigMomentId: string) {
  const { rows } = await client.query(
    `SELECT versao, temporal_status, motivo_mudanca, criado_em
       FROM cross_ai.big_moment_versao
      WHERE big_moment_id = $1 ORDER BY versao DESC`,
    [bigMomentId]
  );
  return rows;
}
