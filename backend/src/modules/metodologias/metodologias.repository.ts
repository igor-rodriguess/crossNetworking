import { PoolClient } from "pg";
import {
  AplicarAvaliacaoInput,
  CriarAnaliseInput,
  CriarPaperInput,
  CriarValidacaoInput,
  CriarVersaoPaperInput,
  DefinirCriteriosInput,
  RecomendarCandidaturaInput,
  RegistrarDecisaoInput,
} from "./metodologias.schema";

export async function resolverCodigo(
  client: PoolClient,
  tabela: string,
  codigo: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM ${tabela} WHERE codigo = $1`,
    [codigo]
  );
  return rows[0]?.id ?? null;
}

async function proximaVersao(
  client: PoolClient,
  tabela: string,
  coluna: string,
  paiId: string
): Promise<number> {
  const { rows } = await client.query<{ proxima: number }>(
    `SELECT COALESCE(MAX(numero_versao), 0) + 1 AS proxima FROM ${tabela} WHERE ${coluna} = $1`,
    [paiId]
  );
  return Number(rows[0].proxima);
}

// --- Análise Crossability (RF027 — RN019) ----------------------------------

export async function existeCandidatura(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_projects.candidatura_parceiro WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

export async function inserirAnalise(
  client: PoolClient,
  candidaturaId: string,
  input: CriarAnaliseInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const numero = await proximaVersao(
    client,
    "cross_methodologies.analise_crossability",
    "candidatura_parceiro_id",
    candidaturaId
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.analise_crossability
       (candidatura_parceiro_id, numero_versao, compatibilidade_publicos,
        compatibilidade_territorios, complementaridade_ativos, sinergias,
        fit_estrategico, momento_estrategico, racional_recomendacao,
        status_crossability_id, responsavel_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING id`,
    [
      candidaturaId,
      numero,
      input.compatibilidade_publicos ?? null,
      input.compatibilidade_territorios ?? null,
      input.complementaridade_ativos ?? null,
      input.sinergias ?? null,
      input.fit_estrategico ?? null,
      input.momento_estrategico ?? null,
      input.racional_recomendacao ?? null,
      statusId,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_ANALISE = `
  SELECT a.id, a.candidatura_parceiro_id, a.numero_versao,
         a.compatibilidade_publicos, a.compatibilidade_territorios,
         a.complementaridade_ativos, a.sinergias, a.fit_estrategico,
         a.momento_estrategico, a.racional_recomendacao,
         s.codigo AS status, a.responsavel_id, a.data_analise, a.criado_em
    FROM cross_methodologies.analise_crossability a
    JOIN cross_methodologies.status_crossability s ON s.id = a.status_crossability_id
   WHERE a.arquivado_em IS NULL`;

export async function buscarAnalise(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_ANALISE} AND a.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarAnalises(client: PoolClient, candidaturaId: string) {
  const { rows } = await client.query(
    `${SELECT_ANALISE} AND a.candidatura_parceiro_id = $1 ORDER BY a.numero_versao DESC`,
    [candidaturaId]
  );
  return rows;
}

// --- Paper e versões (RF028 — RN021) ---------------------------------------

export async function existeFrente(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_projects.frente_oportunidade WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

export async function inserirPaper(
  client: PoolClient,
  frenteId: string,
  input: CriarPaperInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.paper
       (frente_oportunidade_id, titulo, status_paper_id, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$4)
     RETURNING id`,
    [frenteId, input.titulo, statusId, usuarioId]
  );
  return rows[0].id;
}

export async function buscarPaper(client: PoolClient, id: string) {
  const { rows } = await client.query(
    `SELECT p.id, p.frente_oportunidade_id, p.titulo, s.codigo AS status,
            p.criado_em, p.atualizado_em, p.xmin::text AS versao
       FROM cross_methodologies.paper p
       JOIN cross_methodologies.status_paper s ON s.id = p.status_paper_id
      WHERE p.id = $1 AND p.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarPapersDaFrente(client: PoolClient, frenteId: string) {
  const { rows } = await client.query(
    `SELECT p.id, p.titulo, s.codigo AS status, p.criado_em
       FROM cross_methodologies.paper p
       JOIN cross_methodologies.status_paper s ON s.id = p.status_paper_id
      WHERE p.frente_oportunidade_id = $1 AND p.arquivado_em IS NULL
      ORDER BY p.criado_em DESC`,
    [frenteId]
  );
  return rows;
}

export async function atualizarStatusPaper(
  client: PoolClient,
  paperId: string,
  statusId: string,
  usuarioId: string | null
): Promise<void> {
  await client.query(
    `UPDATE cross_methodologies.paper
        SET status_paper_id = $2, atualizado_em = NOW(), atualizado_por_id = $3
      WHERE id = $1 AND arquivado_em IS NULL`,
    [paperId, statusId, usuarioId]
  );
}

export async function inserirVersaoPaper(
  client: PoolClient,
  paperId: string,
  input: CriarVersaoPaperInput,
  usuarioId: string | null
): Promise<string> {
  const numero = await proximaVersao(
    client,
    "cross_methodologies.versao_paper",
    "paper_id",
    paperId
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.versao_paper
       (paper_id, numero_versao, estrategia_proposta, beneficios_esperados,
        plano_implementacao, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      paperId,
      numero,
      input.estrategia_proposta,
      input.beneficios_esperados ?? null,
      input.plano_implementacao ?? null,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_VERSAO_PAPER = `
  SELECT id, paper_id, numero_versao, estrategia_proposta, beneficios_esperados,
         plano_implementacao, status_versao, vigente_desde, vigente_ate, criado_em
    FROM cross_methodologies.versao_paper
   WHERE arquivado_em IS NULL`;

export async function buscarVersaoPaper(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_VERSAO_PAPER} AND id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarVersoesPaper(client: PoolClient, paperId: string) {
  const { rows } = await client.query(
    `${SELECT_VERSAO_PAPER} AND paper_id = $1 ORDER BY numero_versao DESC`,
    [paperId]
  );
  return rows;
}

/**
 * Promove a versão a vigente e rebaixa a anterior a 'substituida' — garante
 * exatamente uma versão vigente por Paper (RN021 / uq_versao_paper_vigente).
 */
export async function publicarVersaoPaper(client: PoolClient, versaoId: string, paperId: string) {
  await client.query(
    `UPDATE cross_methodologies.versao_paper
        SET status_versao = 'substituida', vigente_ate = NOW()
      WHERE paper_id = $1 AND status_versao = 'vigente' AND arquivado_em IS NULL AND id <> $2`,
    [paperId, versaoId]
  );
  const { rows } = await client.query(
    `UPDATE cross_methodologies.versao_paper
        SET status_versao = 'vigente', vigente_desde = NOW(), vigente_ate = NULL
      WHERE id = $1 AND arquivado_em IS NULL
      RETURNING id, paper_id, numero_versao, status_versao, vigente_desde`,
    [versaoId]
  );
  return rows[0] ?? null;
}

// --- Recomendações do Paper (RF029) ----------------------------------------

export async function recomendarCandidatura(
  client: PoolClient,
  paperId: string,
  input: RecomendarCandidaturaInput
): Promise<void> {
  await client.query(
    `INSERT INTO cross_methodologies.paper_candidatura
       (paper_id, candidatura_parceiro_id, ordem_prioridade, justificativa,
        recomendacao, status_recomendacao)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (paper_id, candidatura_parceiro_id) DO UPDATE
        SET ordem_prioridade = EXCLUDED.ordem_prioridade,
            justificativa = EXCLUDED.justificativa,
            recomendacao = EXCLUDED.recomendacao,
            status_recomendacao = EXCLUDED.status_recomendacao`,
    [
      paperId,
      input.candidatura_parceiro_id,
      input.ordem_prioridade ?? null,
      input.justificativa ?? null,
      input.recomendacao ?? null,
      input.status_recomendacao ?? null,
    ]
  );
}

export async function listarRecomendacoes(client: PoolClient, paperId: string) {
  const { rows } = await client.query(
    `SELECT pc.candidatura_parceiro_id, pc.ordem_prioridade, pc.justificativa,
            pc.recomendacao, pc.status_recomendacao, pa.nome_exibicao AS parceiro
       FROM cross_methodologies.paper_candidatura pc
       JOIN cross_projects.candidatura_parceiro cp ON cp.id = pc.candidatura_parceiro_id
       JOIN cross_core.parte pa ON pa.id = cp.parte_id
      WHERE pc.paper_id = $1
      ORDER BY pc.ordem_prioridade NULLS LAST, pa.nome_exibicao`,
    [paperId]
  );
  return rows;
}

export async function removerRecomendacao(
  client: PoolClient,
  paperId: string,
  candidaturaId: string
): Promise<number> {
  const res = await client.query(
    `DELETE FROM cross_methodologies.paper_candidatura
      WHERE paper_id = $1 AND candidatura_parceiro_id = $2`,
    [paperId, candidaturaId]
  );
  return res.rowCount ?? 0;
}

// --- Validação do Paper (RF030 — RN020) ------------------------------------

export async function inserirValidacao(
  client: PoolClient,
  versaoPaperId: string,
  input: CriarValidacaoInput,
  ids: { tipoId: string; statusId: string },
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.validacao_paper
       (versao_paper_id, tipo_validacao_id, status_validacao_id, responsavel_id,
        data_validacao, observacoes, criado_por_id)
     VALUES ($1,$2,$3,$4,NOW(),$5,$4)
     RETURNING id`,
    [versaoPaperId, ids.tipoId, ids.statusId, usuarioId, input.observacoes ?? null]
  );
  return rows[0].id;
}

const SELECT_VALIDACAO = `
  SELECT v.id, v.versao_paper_id, t.codigo AS tipo, s.codigo AS status,
         v.responsavel_id, v.data_validacao, v.observacoes, v.criado_em
    FROM cross_methodologies.validacao_paper v
    JOIN cross_methodologies.tipo_validacao t ON t.id = v.tipo_validacao_id
    JOIN cross_methodologies.status_validacao s ON s.id = v.status_validacao_id`;

export async function buscarValidacao(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_VALIDACAO} WHERE v.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarValidacoes(client: PoolClient, versaoPaperId: string) {
  const { rows } = await client.query(
    `${SELECT_VALIDACAO} WHERE v.versao_paper_id = $1 ORDER BY v.criado_em DESC`,
    [versaoPaperId]
  );
  return rows;
}

// --- Modelo de Score Card (RF031) ------------------------------------------

export async function inserirModelo(
  client: PoolClient,
  nome: string,
  descricao: string | null,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.modelo_score_card
       (nome, descricao, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$3)
     RETURNING id`,
    [nome, descricao, usuarioId]
  );
  return rows[0].id;
}

export async function buscarModelo(client: PoolClient, id: string) {
  const { rows } = await client.query(
    `SELECT id, nome, descricao, ativo, criado_em, xmin::text AS versao
       FROM cross_methodologies.modelo_score_card
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarModelos(client: PoolClient, limite: number, deslocamento: number) {
  const { rows } = await client.query(
    `SELECT id, nome, descricao, ativo, criado_em,
            COUNT(*) OVER () AS total
       FROM cross_methodologies.modelo_score_card
      WHERE arquivado_em IS NULL
      ORDER BY nome
      LIMIT $1 OFFSET $2`,
    [limite, deslocamento]
  );
  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  return { itens: rows.map(({ total: _t, ...r }) => r), total };
}

export async function inserirVersaoModelo(
  client: PoolClient,
  modeloId: string,
  usuarioId: string | null
): Promise<string> {
  const numero = await proximaVersao(
    client,
    "cross_methodologies.versao_modelo_score_card",
    "modelo_score_card_id",
    modeloId
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.versao_modelo_score_card
       (modelo_score_card_id, numero_versao, criado_por_id)
     VALUES ($1,$2,$3)
     RETURNING id`,
    [modeloId, numero, usuarioId]
  );
  return rows[0].id;
}

export async function buscarVersaoModelo(client: PoolClient, id: string) {
  const { rows } = await client.query(
    `SELECT id, modelo_score_card_id, numero_versao, status_versao,
            vigente_desde, vigente_ate, criado_em
       FROM cross_methodologies.versao_modelo_score_card
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarVersoesModelo(client: PoolClient, modeloId: string) {
  const { rows } = await client.query(
    `SELECT id, numero_versao, status_versao, vigente_desde, vigente_ate, criado_em
       FROM cross_methodologies.versao_modelo_score_card
      WHERE modelo_score_card_id = $1 AND arquivado_em IS NULL
      ORDER BY numero_versao DESC`,
    [modeloId]
  );
  return rows;
}

export async function publicarVersaoModelo(
  client: PoolClient,
  versaoId: string,
  modeloId: string
) {
  await client.query(
    `UPDATE cross_methodologies.versao_modelo_score_card
        SET status_versao = 'substituida', vigente_ate = NOW()
      WHERE modelo_score_card_id = $1 AND status_versao = 'vigente'
        AND arquivado_em IS NULL AND id <> $2`,
    [modeloId, versaoId]
  );
  const { rows } = await client.query(
    `UPDATE cross_methodologies.versao_modelo_score_card
        SET status_versao = 'vigente', vigente_desde = NOW(), vigente_ate = NULL
      WHERE id = $1 AND arquivado_em IS NULL
      RETURNING id, modelo_score_card_id, numero_versao, status_versao, vigente_desde`,
    [versaoId]
  );
  return rows[0] ?? null;
}

// --- Critérios (RF031 — substituição integral da versão em rascunho) --------

export async function substituirCriterios(
  client: PoolClient,
  versaoModeloId: string,
  input: DefinirCriteriosInput
) {
  await client.query(
    "DELETE FROM cross_methodologies.criterio_score_card WHERE versao_modelo_score_card_id = $1",
    [versaoModeloId]
  );
  for (const c of input.criterios) {
    await client.query(
      `INSERT INTO cross_methodologies.criterio_score_card
         (versao_modelo_score_card_id, nome, descricao, peso_sim, peso_nao, ordem, obrigatorio)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        versaoModeloId,
        c.nome,
        c.descricao ?? null,
        c.peso_sim,
        c.peso_nao,
        c.ordem,
        c.obrigatorio ?? true,
      ]
    );
  }
  return listarCriterios(client, versaoModeloId);
}

export async function listarCriterios(client: PoolClient, versaoModeloId: string) {
  const { rows } = await client.query(
    `SELECT id, nome, descricao, peso_sim::float8 AS peso_sim, peso_nao::float8 AS peso_nao,
            ordem, obrigatorio, ativo
       FROM cross_methodologies.criterio_score_card
      WHERE versao_modelo_score_card_id = $1 AND ativo IS TRUE
      ORDER BY ordem`,
    [versaoModeloId]
  );
  return rows as Array<{
    id: string;
    nome: string;
    peso_sim: number;
    peso_nao: number;
    ordem: number;
    obrigatorio: boolean;
  }>;
}

// --- Avaliação Score Card (RF032 — RN022, RN023, RN024) --------------------

export interface RespostaCalculada {
  criterioId: string;
  valor: "sim" | "nao" | "nao_avaliado";
  pesoSim: number;
  pesoNao: number;
  pontuacao: number;
  justificativa: string | null;
}

export async function inserirAvaliacao(
  client: PoolClient,
  candidaturaId: string,
  input: AplicarAvaliacaoInput,
  scoreTotal: number,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.avaliacao_score_card
       (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
        potencial_disruptivo, score_total, status_avaliacao_score_card_id,
        responsavel_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING id`,
    [
      candidaturaId,
      input.versao_modelo_score_card_id,
      input.validacao_paper_id,
      input.potencial_disruptivo,
      scoreTotal,
      statusId,
      usuarioId,
    ]
  );
  return rows[0].id;
}

export async function inserirRespostas(
  client: PoolClient,
  avaliacaoId: string,
  respostas: RespostaCalculada[]
): Promise<void> {
  for (const r of respostas) {
    await client.query(
      `INSERT INTO cross_methodologies.resposta_score_card
         (avaliacao_score_card_id, criterio_score_card_id, valor_resposta,
          peso_sim_aplicado, peso_nao_aplicado, pontuacao_obtida, justificativa)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [avaliacaoId, r.criterioId, r.valor, r.pesoSim, r.pesoNao, r.pontuacao, r.justificativa]
    );
  }
}

export async function buscarAvaliacao(client: PoolClient, id: string) {
  const { rows } = await client.query(
    `SELECT a.id, a.candidatura_parceiro_id, a.versao_modelo_score_card_id,
            a.validacao_paper_id, a.potencial_disruptivo,
            a.score_total::float8 AS score_total, s.codigo AS status,
            a.data_aplicacao, a.responsavel_id
       FROM cross_methodologies.avaliacao_score_card a
       JOIN cross_methodologies.status_avaliacao_score_card s
         ON s.id = a.status_avaliacao_score_card_id
      WHERE a.id = $1 AND a.arquivado_em IS NULL`,
    [id]
  );
  if (!rows[0]) return null;

  const { rows: respostas } = await client.query(
    `SELECT r.criterio_score_card_id, c.nome AS criterio, c.ordem,
            r.valor_resposta AS valor,
            r.peso_sim_aplicado::float8 AS peso_sim_aplicado,
            r.peso_nao_aplicado::float8 AS peso_nao_aplicado,
            r.pontuacao_obtida::float8 AS pontuacao_obtida,
            r.justificativa
       FROM cross_methodologies.resposta_score_card r
       JOIN cross_methodologies.criterio_score_card c ON c.id = r.criterio_score_card_id
      WHERE r.avaliacao_score_card_id = $1
      ORDER BY c.ordem`,
    [id]
  );
  return { ...rows[0], respostas };
}

export async function listarAvaliacoesDaCandidatura(client: PoolClient, candidaturaId: string) {
  const { rows } = await client.query(
    `SELECT a.id, a.versao_modelo_score_card_id, a.potencial_disruptivo,
            a.score_total::float8 AS score_total, s.codigo AS status, a.data_aplicacao
       FROM cross_methodologies.avaliacao_score_card a
       JOIN cross_methodologies.status_avaliacao_score_card s
         ON s.id = a.status_avaliacao_score_card_id
      WHERE a.candidatura_parceiro_id = $1 AND a.arquivado_em IS NULL
      ORDER BY a.data_aplicacao DESC`,
    [candidaturaId]
  );
  return rows;
}

// --- Decisão (RF033 — RN025) -----------------------------------------------

export async function inserirDecisao(
  client: PoolClient,
  candidaturaId: string,
  input: RegistrarDecisaoInput,
  tipoId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.decisao_candidatura
       (candidatura_parceiro_id, tipo_decisao_id, justificativa, responsavel_id,
        contexto, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$4)
     RETURNING id`,
    [
      candidaturaId,
      tipoId,
      input.justificativa ?? null,
      usuarioId,
      input.contexto ? JSON.stringify(input.contexto) : null,
    ]
  );
  return rows[0].id;
}

const SELECT_DECISAO = `
  SELECT d.id, d.candidatura_parceiro_id, t.codigo AS tipo, d.justificativa,
         d.responsavel_id, d.data_decisao, d.contexto
    FROM cross_methodologies.decisao_candidatura d
    JOIN cross_methodologies.tipo_decisao t ON t.id = d.tipo_decisao_id`;

export async function buscarDecisao(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_DECISAO} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarDecisoes(client: PoolClient, candidaturaId: string) {
  const { rows } = await client.query(
    `${SELECT_DECISAO} WHERE d.candidatura_parceiro_id = $1 ORDER BY d.data_decisao DESC`,
    [candidaturaId]
  );
  return rows;
}
