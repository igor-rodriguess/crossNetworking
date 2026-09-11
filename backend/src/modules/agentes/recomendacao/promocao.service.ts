import type { PoolClient } from "pg";

// -----------------------------------------------------------------------------
// Promoção de Recommendation para Oportunidade.
//
// Esta é a AÇÃO HUMANA EXPLÍCITA que liga a inteligência ao domínio operacional:
//
//   Recommendation aprovada (AI-07A)  →  [humano promove]  →  candidatura_parceiro
//
// Nada aqui roda sozinho. Não existe caminho `if aprovada: criar candidatura` —
// a promoção só acontece quando alguém a invoca deliberadamente, com identidade
// autenticada.
//
// O que este serviço NÃO faz:
//   · não avança estágio do funil depois da entrada
//   · não cria Parte (prospecção sem vínculo é bloqueada)
//   · não cria nem aprova Paper
//   · não executa Score Card
//   · não cria projeto, parceria ou reunião
//
// RN022 e RN023 permanecem intocadas: o Score Card oficial continua exigindo
// candidatura + Paper aprovado, e é aplicado pelo engine existente.
// -----------------------------------------------------------------------------

/** Estado inicial de uma oportunidade recém-promovida. */
const STATUS_INICIAL = "identificada";

export type MotivoBloqueioPromocao =
  | "recomendacao_inexistente"
  | "sem_revisao_humana"
  | "revisao_nao_aprovada"
  | "revisao_de_outra_versao"
  | "requer_resolucao_de_entidade"
  | "ja_promovida";

export class PromocaoBloqueada extends Error {
  constructor(
    public readonly motivo: MotivoBloqueioPromocao,
    public readonly detalhe: string
  ) {
    super(detalhe);
    this.name = "PromocaoBloqueada";
  }
}

export interface ContextoPromotor {
  usuarioId: string | null;
  nome?: string | null;
}

export interface EntradaPromocao {
  recomendacaoId: string;
  /** Frente onde a oportunidade entrará. Decisão humana, não inferida. */
  frenteOportunidadeId: string;
  observacao?: string | null;
}

export interface ResultadoPromocao {
  promocaoId: string;
  candidaturaId: string;
  statusInicial: string;
  jaExistia: boolean;
}

interface LinhaRecomendacao {
  id: string;
  versao: number;
  status: string;
  candidato_parte_id: string | null;
  candidato_nome: string;
  origem_parte_id: string | null;
  origem_vinculo: string;
}

/**
 * Promove uma hipótese aprovada a candidatura.
 *
 * Toda a operação roda numa transação: não pode existir promoção registrada sem
 * candidatura, nem candidatura sem rastreabilidade até a Recommendation.
 */
export async function promover(
  client: PoolClient,
  entrada: EntradaPromocao,
  promotor: ContextoPromotor
): Promise<ResultadoPromocao> {
  // ------------------------------------------------ 1. a recomendação existe?
  const { rows: recs } = await client.query<LinhaRecomendacao>(
    `SELECT id, versao, status, candidato_parte_id, candidato_nome,
            origem_parte_id, origem_vinculo
       FROM cross_ai.recomendacao WHERE id = $1`,
    [entrada.recomendacaoId]
  );
  if (!recs.length) {
    throw new PromocaoBloqueada(
      "recomendacao_inexistente",
      `Recomendação ${entrada.recomendacaoId} não encontrada.`
    );
  }
  const rec = recs[0];

  // --------------------------------------------- 2. já foi promovida antes?
  // Checado cedo para que clique duplo devolva a promoção existente em vez de
  // esbarrar na constraint no fim da transação.
  const { rows: jaPromovida } = await client.query<{
    id: string;
    candidatura_parceiro_id: string;
  }>(
    `SELECT id, candidatura_parceiro_id
       FROM cross_ai.promocao_oportunidade WHERE recomendacao_id = $1`,
    [entrada.recomendacaoId]
  );
  if (jaPromovida.length) {
    return {
      promocaoId: jaPromovida[0].id,
      candidaturaId: jaPromovida[0].candidatura_parceiro_id,
      statusInicial: STATUS_INICIAL,
      jaExistia: true,
    };
  }

  // ------------------------------------- 3. existe aprovação humana válida?
  const { rows: revisoes } = await client.query<{
    id: string;
    decisao: string;
    recomendacao_versao: number;
  }>(
    `SELECT id, decisao, recomendacao_versao
       FROM cross_ai.recomendacao_revisao
      WHERE recomendacao_id = $1 AND decidido_em IS NOT NULL`,
    [entrada.recomendacaoId]
  );
  if (!revisoes.length) {
    throw new PromocaoBloqueada(
      "sem_revisao_humana",
      "Não existe decisão humana para esta recomendação. Promoção exige aprovação no Human Gate."
    );
  }
  const revisao = revisoes[0];

  const aprovada =
    revisao.decisao === "aprovada_para_revisao_de_oportunidade" ||
    revisao.decisao === "aprovada_com_edicoes";
  if (!aprovada) {
    throw new PromocaoBloqueada(
      "revisao_nao_aprovada",
      `A decisão humana registrada é "${revisao.decisao}". Só hipóteses aprovadas podem ser promovidas.`
    );
  }

  // A decisão precisa valer para a versão que está sendo promovida: aprovar a
  // v1 não autoriza promover a v2, que pode dizer outra coisa.
  if (revisao.recomendacao_versao !== rec.versao) {
    throw new PromocaoBloqueada(
      "revisao_de_outra_versao",
      `A aprovação refere-se à v${revisao.recomendacao_versao}, mas a recomendação está na v${rec.versao}.`
    );
  }

  // ----------------------------------- 4. a entidade existe como Parte real?
  // Prospecção do zero pode chegar aqui com entidade externa não vinculada.
  // Criar Parte automaticamente seria inventar identidade no domínio — a
  // resolução é humana, por fluxo próprio.
  if (!rec.candidato_parte_id) {
    throw new PromocaoBloqueada(
      "requer_resolucao_de_entidade",
      `A entidade "${rec.candidato_nome}" ainda não está vinculada a uma Parte. ` +
        "Resolva o vínculo antes de promover; o sistema não cria Parte automaticamente."
    );
  }
  if (rec.origem_vinculo === "nao_vinculada") {
    throw new PromocaoBloqueada(
      "requer_resolucao_de_entidade",
      "A entidade de origem não está vinculada a uma Parte. Resolva o vínculo antes de promover."
    );
  }

  // ------------------------------------------------ 5. cria a candidatura
  const { rows: status } = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_candidatura WHERE codigo = $1`,
    [STATUS_INICIAL]
  );
  if (!status.length) {
    throw new PromocaoBloqueada(
      "recomendacao_inexistente",
      `Status inicial "${STATUS_INICIAL}" não existe na base.`
    );
  }

  const { rows: cand } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.candidatura_parceiro
       (frente_oportunidade_id, parte_id, status_candidatura_id, observacoes, criado_por_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [
      entrada.frenteOportunidadeId,
      rec.candidato_parte_id,
      status[0].id,
      entrada.observacao ??
        `Promovida a partir da Recommendation ${rec.id} (v${rec.versao}) da Cross Intelligence.`,
      promotor.usuarioId,
    ]
  );
  const candidaturaId = cand[0].id;

  // Entrada no funil registrada com o ATOR HUMANO como responsável. A
  // inteligência propôs; quem colocou no funil foi uma pessoa, e o histórico
  // precisa refletir isso.
  await client.query(
    `INSERT INTO cross_projects.historico_candidatura
       (candidatura_parceiro_id, status_anterior_id, status_novo_id,
        responsavel_id, justificativa, contexto)
     VALUES ($1, NULL, $2, $3, $4, $5)`,
    [
      candidaturaId,
      status[0].id,
      promotor.usuarioId,
      "Entrada no funil por promoção humana de hipótese da Cross Intelligence.",
      JSON.stringify({
        origem: "cross_intelligence",
        recomendacao_id: rec.id,
        recomendacao_versao: rec.versao,
        revisao_id: revisao.id,
      }),
    ]
  );

  // ------------------------------------------------ 6. registra a promoção
  const { rows: promo } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.promocao_oportunidade
       (recomendacao_id, recomendacao_versao, revisao_id,
        candidatura_parceiro_id, frente_oportunidade_id,
        promovido_por_id, promovido_por_nome, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      rec.id,
      rec.versao,
      revisao.id,
      candidaturaId,
      entrada.frenteOportunidadeId,
      promotor.usuarioId,
      promotor.nome ?? null,
      entrada.observacao ?? null,
    ]
  );

  return {
    promocaoId: promo[0].id,
    candidaturaId,
    statusInicial: STATUS_INICIAL,
    jaExistia: false,
  };
}

/**
 * Cadeia de proveniência completa de uma oportunidade.
 *
 * Permite responder "de onde veio esta candidatura?" atravessando promoção →
 * revisão humana → recomendação.
 */
export async function rastrearOrigem(
  client: PoolClient,
  candidaturaId: string
): Promise<{
  candidaturaId: string;
  promocaoId: string;
  promovidoPor: string | null;
  promovidoEm: string;
  revisaoId: string;
  decisaoHumana: string;
  revisor: string | null;
  recomendacaoId: string;
  recomendacaoVersao: number;
  hipotese: string | null;
  matchingPesosVersao: string | null;
  crossabilityHash: string | null;
} | null> {
  const { rows } = await client.query(
    `SELECT p.id AS promocao_id, p.promovido_por_nome, p.promovido_em,
            rv.id AS revisao_id, rv.decisao, rv.revisor_nome,
            r.id AS recomendacao_id, r.versao, r.hipotese_oportunidade,
            r.matching_pesos_versao, r.crossability_hash
       FROM cross_ai.promocao_oportunidade p
       JOIN cross_ai.recomendacao_revisao rv ON rv.id = p.revisao_id
       JOIN cross_ai.recomendacao r          ON r.id  = p.recomendacao_id
      WHERE p.candidatura_parceiro_id = $1`,
    [candidaturaId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    candidaturaId,
    promocaoId: r.promocao_id,
    promovidoPor: r.promovido_por_nome,
    promovidoEm: r.promovido_em,
    revisaoId: r.revisao_id,
    decisaoHumana: r.decisao,
    revisor: r.revisor_nome,
    recomendacaoId: r.recomendacao_id,
    recomendacaoVersao: r.versao,
    hipotese: r.hipotese_oportunidade,
    matchingPesosVersao: r.matching_pesos_versao,
    crossabilityHash: r.crossability_hash,
  };
}
