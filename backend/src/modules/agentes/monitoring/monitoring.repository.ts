import type { PoolClient } from "pg";

// -----------------------------------------------------------------------------
// Gestão de alvos, alertas e auditoria do Monitoring.
//
// Alvo é criado EXPLICITAMENTE. Não existe caminho que inscreva a base inteira
// em monitoramento — isso geraria pesquisa recorrente sobre entidades que
// ninguém pediu para observar.
// -----------------------------------------------------------------------------

export interface EntradaAlvo {
  parteId: string;
  prioridade?: "baixa" | "normal" | "alta";
  cadenciaHoras?: number;
  candidaturaParceiroId?: string | null;
  projetoId?: string | null;
  criadoPorId?: string | null;
  /** Primeira verificação; padrão é imediata. */
  proximaVerificacaoEm?: Date;
}

/** Registra um alvo. Idempotente por Parte. */
export async function criarAlvo(
  client: PoolClient, e: EntradaAlvo
): Promise<{ id: string; jaExistia: boolean }> {
  const { rows: existente } = await client.query<{ id: string }>(
    `SELECT id FROM cross_ai.monitoring_alvo WHERE parte_id = $1`,
    [e.parteId]
  );
  if (existente.length) return { id: existente[0].id, jaExistia: true };

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.monitoring_alvo
       (parte_id, prioridade, cadencia_horas, candidatura_parceiro_id,
        projeto_id, criado_por_id, proxima_verificacao_em)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()))
     RETURNING id`,
    [
      e.parteId, e.prioridade ?? "normal", e.cadenciaHoras ?? 168,
      e.candidaturaParceiroId ?? null, e.projetoId ?? null,
      e.criadoPorId ?? null, e.proximaVerificacaoEm ?? null,
    ]
  );
  return { id: rows[0].id, jaExistia: false };
}

export async function pausarAlvo(client: PoolClient, alvoId: string): Promise<void> {
  await client.query(
    `UPDATE cross_ai.monitoring_alvo SET status='pausado', atualizado_em=now() WHERE id=$1`,
    [alvoId]
  );
}

export async function reativarAlvo(client: PoolClient, alvoId: string): Promise<void> {
  await client.query(
    `UPDATE cross_ai.monitoring_alvo SET status='ativo', atualizado_em=now() WHERE id=$1`,
    [alvoId]
  );
}

/**
 * Alvos vencidos, sem reservar.
 *
 * Só leitura — a reserva acontece dentro do ciclo, com SKIP LOCKED.
 */
export async function listarVencidos(
  client: PoolClient, agora: Date, limite = 25
) {
  const { rows } = await client.query(
    `SELECT id, parte_id, prioridade, proxima_verificacao_em, falhas_consecutivas
       FROM cross_ai.monitoring_alvo
      WHERE status = 'ativo' AND proxima_verificacao_em <= $1
      ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
               proxima_verificacao_em
      LIMIT $2`,
    [agora, limite]
  );
  return rows;
}

/**
 * Por que um alvo não foi verificado.
 *
 * Requisito de observabilidade: a pergunta "por que esta Parte não foi checada?"
 * precisa ter resposta objetiva, não suposição.
 */
export async function diagnosticarAlvo(
  client: PoolClient, parteId: string, agora: Date
): Promise<{ motivo: string; detalhe: string }> {
  const { rows } = await client.query<{
    id: string; status: string; proxima_verificacao_em: Date;
    reservado_ate: Date | null; reservado_por: string | null;
  }>(
    `SELECT id, status, proxima_verificacao_em, reservado_ate, reservado_por
       FROM cross_ai.monitoring_alvo WHERE parte_id = $1`,
    [parteId]
  );
  if (!rows.length) {
    return { motivo: "alvo_invalido", detalhe: "Esta Parte não está registrada para monitoramento." };
  }

  const a = rows[0];
  if (a.status === "pausado") return { motivo: "pausado", detalhe: "Alvo pausado." };
  if (a.status === "arquivado") return { motivo: "arquivado", detalhe: "Alvo arquivado." };
  if (a.reservado_ate && a.reservado_ate > agora) {
    return {
      motivo: "reservado_por_outro_worker",
      detalhe: `Reservado por ${a.reservado_por} até ${a.reservado_ate.toISOString()}.`,
    };
  }
  if (a.proxima_verificacao_em > agora) {
    return {
      motivo: "nao_vencido",
      detalhe: `Próxima verificação em ${a.proxima_verificacao_em.toISOString()}.`,
    };
  }
  return { motivo: "limite_do_ciclo", detalhe: "Vencido, mas não coube no lote do último ciclo." };
}

export async function listarAlertasNovos(client: PoolClient, limite = 50) {
  const { rows } = await client.query(
    `SELECT id, parte_id, tipo, severidade, titulo, resumo, detectado_em
       FROM cross_ai.monitoring_alerta
      WHERE status = 'novo'
      ORDER BY detectado_em DESC LIMIT $1`,
    [limite]
  );
  return rows;
}

export async function listarAlertasPorParte(client: PoolClient, parteId: string) {
  const { rows } = await client.query(
    `SELECT id, tipo, severidade, titulo, status, detectado_em
       FROM cross_ai.monitoring_alerta
      WHERE parte_id = $1 ORDER BY detectado_em DESC`,
    [parteId]
  );
  return rows;
}

export async function listarAlertasDesde(client: PoolClient, desde: Date) {
  const { rows } = await client.query(
    `SELECT id, parte_id, tipo, severidade, titulo, detectado_em
       FROM cross_ai.monitoring_alerta
      WHERE detectado_em >= $1 ORDER BY detectado_em DESC`,
    [desde]
  );
  return rows;
}

export async function listarCiclos(client: PoolClient, limite = 20) {
  const { rows } = await client.query(
    `SELECT id, iniciado_em, finalizado_em, alvos_vencidos, alvos_processados,
            alvos_sucesso, alvos_falha, alertas_criados,
            research_evitados, big_moment_evitados
       FROM cross_ai.monitoring_ciclo
      ORDER BY iniciado_em DESC LIMIT $1`,
    [limite]
  );
  return rows;
}

export async function listarRunsDoCiclo(client: PoolClient, cicloId: string) {
  const { rows } = await client.query(
    `SELECT alvo_id, status, delta, evidencias_novas, big_moment_executado,
            alertas_criados, erro
       FROM cross_ai.monitoring_alvo_run WHERE ciclo_id = $1`,
    [cicloId]
  );
  return rows;
}
