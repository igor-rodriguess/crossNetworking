import type { PoolClient } from "pg";
import {
  ConflitoDeVersao,
  RevisaoInvalida,
  type DecidirRevisaoInput,
  type RevisaoRecomendacao,
} from "./human-gate.schema";

// -----------------------------------------------------------------------------
// Recommendation Human Gate — serviço.
//
// A IA propõe · o humano decide · o sistema registra.
//
// O que este serviço NÃO faz, por desenho:
//   · não cria candidatura, Paper, Score Card, projeto, parceria ou reunião
//   · não altera funil
//   · não reexecuta Research, Crossability, Matching ou Recommendation
//   · não toca em Evidence nem em Cross Knowledge
//
// Consome snapshots. Aprovar aqui significa apenas que a Cross aceitou a
// hipótese para seguir ao processo de promoção — que é AI-07B.
// -----------------------------------------------------------------------------

/** Contexto autenticado. A identidade do revisor vem daqui, nunca do payload. */
export interface ContextoRevisor {
  usuarioId: string | null;
  nome?: string | null;
}

interface LinhaRecomendacao {
  id: string;
  versao: number;
  proposta_logica_id: string;
  status: string;
  proposta: Record<string, unknown>;
}

async function carregarRecomendacao(
  client: PoolClient,
  recomendacaoId: string
): Promise<LinhaRecomendacao> {
  const { rows } = await client.query<LinhaRecomendacao>(
    `SELECT id, versao, proposta_logica_id, status, proposta
       FROM cross_ai.recomendacao WHERE id = $1`,
    [recomendacaoId]
  );
  if (!rows.length) {
    throw new RevisaoInvalida(`Recomendação ${recomendacaoId} não encontrada.`);
  }
  return rows[0];
}

/**
 * Registra a decisão humana.
 *
 * Idempotente por recomendação: um índice único parcial admite uma só decisão
 * efetiva por linha de recomendação. Reenviar a mesma aprovação devolve a
 * decisão existente em vez de duplicar histórico.
 */
export async function decidir(
  client: PoolClient,
  input: DecidirRevisaoInput,
  revisor: ContextoRevisor
): Promise<{ revisao: RevisaoRecomendacao; jaExistia: boolean }> {
  const rec = await carregarRecomendacao(client, input.recomendacao_id);

  // Hipótese sem sustentação não pode ser aprovada como se fosse normal.
  // Decidir assim mesmo é possível, mas exige reconhecimento explícito — e
  // fica registrado.
  const semSustentacao =
    rec.status === "sustentacao_insuficiente" || rec.status === "requer_enriquecimento";
  const aprovando =
    input.decisao === "aprovada_para_revisao_de_oportunidade" ||
    input.decisao === "aprovada_com_edicoes";

  if (semSustentacao && aprovando && !input.override_insuficiente) {
    throw new RevisaoInvalida(
      `A recomendação está com status "${rec.status}". Aprovar exige override_insuficiente=true, ` +
        "para que a insuficiência fique registrada em vez de silenciada."
    );
  }

  // Já existe decisão para esta recomendação?
  const existente = await client.query<{ id: string; versao_revisao: number; decisao: string }>(
    `SELECT id, versao_revisao, decisao
       FROM cross_ai.recomendacao_revisao
      WHERE recomendacao_id = $1 AND decidido_em IS NOT NULL`,
    [input.recomendacao_id]
  );

  if (existente.rows.length) {
    const atual = existente.rows[0];

    // Requisição repetida da MESMA decisão: idempotente, devolve a existente.
    if (atual.decisao === input.decisao && input.versao_revisao_lida === undefined) {
      const r = await buscarRevisao(client, atual.id);
      return { revisao: r, jaExistia: true };
    }

    // Decisão diferente exige declarar sobre qual versão se está escrevendo.
    // Sem isso, o segundo revisor sobrescreveria o primeiro sem perceber.
    if (input.versao_revisao_lida === undefined) {
      throw new ConflitoDeVersao(
        `Já existe decisão "${atual.decisao}" para esta recomendação. ` +
          "Informe versao_revisao_lida para alterá-la."
      );
    }
    if (input.versao_revisao_lida !== atual.versao_revisao) {
      throw new ConflitoDeVersao(
        `Versão obsoleta: você leu a v${input.versao_revisao_lida}, ` +
          `mas a decisão atual já está na v${atual.versao_revisao}. Recarregue antes de decidir.`
      );
    }

    const { rows } = await client.query<{ id: string }>(
      `UPDATE cross_ai.recomendacao_revisao
          SET decisao = $2, motivo = $3, edicoes_humanas = $4,
              override_insuficiente = $5, requer_enriquecimento = $6,
              revisor_id = $7, revisor_nome = $8,
              versao_revisao = versao_revisao + 1,
              decidido_em = now(), atualizado_em = now()
        WHERE id = $1 AND versao_revisao = $9
        RETURNING id`,
      [
        atual.id,
        input.decisao,
        input.motivo ?? null,
        input.edicoes ? JSON.stringify(input.edicoes) : null,
        input.override_insuficiente ?? false,
        input.decisao === "requer_mais_informacao",
        revisor.usuarioId,
        revisor.nome ?? null,
        input.versao_revisao_lida,
      ]
    );
    if (!rows.length) {
      // A linha mudou entre a leitura e o UPDATE — outra escrita venceu.
      throw new ConflitoDeVersao("A decisão foi alterada por outro revisor durante esta operação.");
    }
    return { revisao: await buscarRevisao(client, atual.id), jaExistia: false };
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.recomendacao_revisao (
       recomendacao_id, recomendacao_versao, proposta_logica_id,
       decisao, revisor_id, revisor_nome,
       snapshot_ia, edicoes_humanas, motivo,
       override_insuficiente, requer_enriquecimento, decidido_em
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     RETURNING id`,
    [
      rec.id,
      rec.versao,
      rec.proposta_logica_id,
      input.decisao,
      revisor.usuarioId,
      revisor.nome ?? null,
      // Congela o que a IA propôs: editar a recomendação depois não pode
      // reescrever o que o humano analisou.
      JSON.stringify(rec.proposta),
      input.edicoes ? JSON.stringify(input.edicoes) : null,
      input.motivo ?? null,
      input.override_insuficiente ?? false,
      input.decisao === "requer_mais_informacao",
    ]
  );

  return { revisao: await buscarRevisao(client, rows[0].id), jaExistia: false };
}

export async function buscarRevisao(
  client: PoolClient,
  id: string
): Promise<RevisaoRecomendacao> {
  const { rows } = await client.query(
    `SELECT id, recomendacao_id, recomendacao_versao, proposta_logica_id, decisao,
            revisor_id, revisor_nome, snapshot_ia, edicoes_humanas, motivo,
            override_insuficiente, requer_enriquecimento, nivel_validacao,
            versao_revisao, criado_em, decidido_em
       FROM cross_ai.recomendacao_revisao WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  return {
    id: r.id,
    recomendacao_id: r.recomendacao_id,
    recomendacao_versao: r.recomendacao_versao,
    proposta_logica_id: r.proposta_logica_id,
    decisao: r.decisao,
    revisor_id: r.revisor_id,
    revisor_nome: r.revisor_nome,
    snapshot_ia: r.snapshot_ia,
    edicoes_humanas: r.edicoes_humanas,
    motivo: r.motivo,
    override_insuficiente: r.override_insuficiente,
    requer_enriquecimento: r.requer_enriquecimento,
    nivel_validacao: r.nivel_validacao,
    versao_revisao: r.versao_revisao,
    criado_em: r.criado_em,
    decidido_em: r.decidido_em,
  };
}

/**
 * Recomendações aguardando decisão humana.
 *
 * Recomendação sem linha de revisão decidida está pendente. Alimenta a fila de
 * decisão e, futuramente, o Dashboard.
 */
export async function listarPendentes(
  client: PoolClient,
  limite = 50
): Promise<Array<{
  recomendacaoId: string;
  versao: number;
  entidadeCandidata: string;
  status: string;
  confianca: number;
  criadoEm: string;
}>> {
  const { rows } = await client.query(
    `SELECT r.id, r.versao, r.candidato_nome, r.status, r.confianca, r.criado_em
       FROM cross_ai.recomendacao r
       LEFT JOIN cross_ai.recomendacao_revisao rv
              ON rv.recomendacao_id = r.id AND rv.decidido_em IS NOT NULL
      WHERE rv.id IS NULL
      ORDER BY r.criado_em DESC
      LIMIT $1`,
    [limite]
  );
  return rows.map((r) => ({
    recomendacaoId: r.id,
    versao: r.versao,
    entidadeCandidata: r.candidato_nome,
    status: r.status,
    confianca: r.confianca,
    criadoEm: r.criado_em,
  }));
}

/** Histórico de decisões de uma proposta lógica, mais recente primeiro. */
export async function historicoDecisoes(
  client: PoolClient,
  propostaLogicaId: string
): Promise<Array<{
  revisaoId: string;
  recomendacaoVersao: number;
  decisao: string;
  motivo: string | null;
  decididoEm: string | null;
}>> {
  const { rows } = await client.query(
    `SELECT id, recomendacao_versao, decisao, motivo, decidido_em
       FROM cross_ai.recomendacao_revisao
      WHERE proposta_logica_id = $1
      ORDER BY recomendacao_versao DESC, criado_em DESC`,
    [propostaLogicaId]
  );
  return rows.map((r) => ({
    revisaoId: r.id,
    recomendacaoVersao: r.recomendacao_versao,
    decisao: r.decisao,
    motivo: r.motivo,
    decididoEm: r.decidido_em,
  }));
}
