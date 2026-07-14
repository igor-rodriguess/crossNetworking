import { PoolClient } from "pg";
import { CriarCandidaturaInput, CriarFrenteInput } from "./frentes.schema";

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

// --- Frente ----------------------------------------------------------------

export interface FrenteRow {
  id: string;
  projeto_id: string;
  territorio_id: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  objetivo: string;
  data_abertura: string;
  data_encerramento: string | null;
  status: string;
  criado_em: string;
  versao: string;
}

const FRENTE_SELECT = `
  SELECT f.id, f.projeto_id, f.territorio_id, f.nome, f.descricao, f.categoria, f.objetivo,
         f.data_abertura, f.data_encerramento, sf.codigo AS status, f.criado_em,
         f.xmin::text AS versao
    FROM cross_projects.frente_oportunidade f
    JOIN cross_projects.status_frente sf ON sf.id = f.status_frente_id`;

export async function inserirFrente(
  client: PoolClient,
  projetoId: string,
  input: CriarFrenteInput,
  statusId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade
       (projeto_id, territorio_id, nome, descricao, categoria, objetivo,
        data_abertura, data_encerramento, status_frente_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10)
     RETURNING id`,
    [
      projetoId,
      input.territorio_id ?? null,
      input.nome,
      input.descricao ?? null,
      input.categoria ?? null,
      input.objetivo,
      input.data_abertura ?? null,
      input.data_encerramento ?? null,
      statusId,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function buscarFrentePorId(client: PoolClient, id: string): Promise<FrenteRow | null> {
  const { rows } = await client.query<FrenteRow>(
    `${FRENTE_SELECT} WHERE f.id = $1 AND f.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarFrentesDoProjeto(
  client: PoolClient,
  projetoId: string
): Promise<FrenteRow[]> {
  const { rows } = await client.query<FrenteRow>(
    `${FRENTE_SELECT}
      WHERE f.projeto_id = $1 AND f.arquivado_em IS NULL
      ORDER BY f.data_abertura DESC`,
    [projetoId]
  );
  return rows;
}

export async function atualizarFrente(
  client: PoolClient,
  id: string,
  patch: Record<string, unknown>,
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.frente_oportunidade
        SET nome = COALESCE($2, nome),
            objetivo = COALESCE($3, objetivo),
            territorio_id = COALESCE($4, territorio_id),
            descricao = COALESCE($5, descricao),
            categoria = COALESCE($6, categoria),
            data_encerramento = COALESCE($7, data_encerramento),
            status_frente_id = COALESCE($8, status_frente_id)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $9`,
    [
      id,
      patch.nome ?? null,
      patch.objetivo ?? null,
      patch.territorio_id ?? null,
      patch.descricao ?? null,
      patch.categoria ?? null,
      patch.data_encerramento ?? null,
      patch.status_frente_id ?? null,
      versaoEsperada,
    ]
  );
  return res.rowCount ?? 0;
}

/** Reabre a frente preservando o histórico anterior (RN014). */
export async function reabrirFrente(
  client: PoolClient,
  id: string,
  statusReabertaId: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.frente_oportunidade
        SET status_frente_id = $2, data_encerramento = NULL
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, statusReabertaId]
  );
  return res.rowCount ?? 0;
}

export async function existeFrenteAtiva(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_projects.frente_oportunidade WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Candidatura -----------------------------------------------------------

export interface CandidaturaRow {
  id: string;
  frente_oportunidade_id: string;
  parte_id: string;
  parte_nome: string;
  interesse_cliente: string | null;
  interesse_parceiro: string | null;
  prioridade: string | null;
  disponibilidade_confirmada: boolean | null;
  status: string;
  data_entrada: string;
  data_saida: string | null;
  motivo_recusa: string | null;
  observacoes: string | null;
  versao: string;
}

const CANDIDATURA_SELECT = `
  SELECT cp.id, cp.frente_oportunidade_id, cp.parte_id, p.nome_exibicao AS parte_nome,
         ic.codigo AS interesse_cliente, ip.codigo AS interesse_parceiro, pr.codigo AS prioridade,
         cp.disponibilidade_confirmada, sc.codigo AS status, cp.data_entrada, cp.data_saida,
         cp.motivo_recusa, cp.observacoes, cp.xmin::text AS versao
    FROM cross_projects.candidatura_parceiro cp
    JOIN cross_core.parte p ON p.id = cp.parte_id
    JOIN cross_projects.status_candidatura sc ON sc.id = cp.status_candidatura_id
    LEFT JOIN cross_projects.nivel_interesse ic ON ic.id = cp.interesse_cliente_id
    LEFT JOIN cross_projects.nivel_interesse ip ON ip.id = cp.interesse_parceiro_id
    LEFT JOIN cross_projects.prioridade pr ON pr.id = cp.prioridade_id`;

export async function inserirCandidatura(
  client: PoolClient,
  frenteId: string,
  input: CriarCandidaturaInput,
  ids: {
    status: string;
    interesseCliente: string | null;
    interesseParceiro: string | null;
    prioridade: string | null;
  },
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.candidatura_parceiro
       (frente_oportunidade_id, parte_id, interesse_cliente_id, interesse_parceiro_id,
        prioridade_id, disponibilidade_confirmada, status_candidatura_id, observacoes, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      frenteId,
      input.parte_id,
      ids.interesseCliente,
      ids.interesseParceiro,
      ids.prioridade,
      input.disponibilidade_confirmada ?? null,
      ids.status,
      input.observacoes ?? null,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function buscarCandidaturaPorId(
  client: PoolClient,
  id: string
): Promise<CandidaturaRow | null> {
  const { rows } = await client.query<CandidaturaRow>(
    `${CANDIDATURA_SELECT} WHERE cp.id = $1 AND cp.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarCandidaturasDaFrente(
  client: PoolClient,
  frenteId: string
): Promise<CandidaturaRow[]> {
  const { rows } = await client.query<CandidaturaRow>(
    `${CANDIDATURA_SELECT}
      WHERE cp.frente_oportunidade_id = $1 AND cp.arquivado_em IS NULL
      ORDER BY cp.data_entrada DESC`,
    [frenteId]
  );
  return rows;
}

export async function arquivarCandidatura(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.candidatura_parceiro
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

/** Status atual (id) da candidatura, para compor o histórico da movimentação. */
export async function statusAtualDaCandidatura(
  client: PoolClient,
  id: string
): Promise<string | null> {
  const { rows } = await client.query<{ status_candidatura_id: string }>(
    `SELECT status_candidatura_id FROM cross_projects.candidatura_parceiro
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0]?.status_candidatura_id ?? null;
}

/**
 * Movimenta o status e grava o histórico na MESMA transação (RN017):
 * estado atual e trilha de movimentações permanecem consistentes.
 */
export async function movimentarCandidatura(
  client: PoolClient,
  id: string,
  dados: {
    statusAnteriorId: string;
    statusNovoId: string;
    responsavelId: string | null;
    justificativa: string | null;
    motivoRecusa: string | null;
    contexto: unknown;
  }
): Promise<void> {
  await client.query(
    `UPDATE cross_projects.candidatura_parceiro
        SET status_candidatura_id = $2,
            motivo_recusa = COALESCE($3, motivo_recusa)
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, dados.statusNovoId, dados.motivoRecusa]
  );

  await client.query(
    `INSERT INTO cross_projects.historico_candidatura
       (candidatura_parceiro_id, status_anterior_id, status_novo_id, responsavel_id,
        justificativa, contexto)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      dados.statusAnteriorId,
      dados.statusNovoId,
      dados.responsavelId,
      dados.justificativa,
      dados.contexto ? JSON.stringify(dados.contexto) : null,
    ]
  );
}

export interface MovimentacaoRow {
  id: string;
  status_anterior: string | null;
  status_novo: string;
  data_movimentacao: string;
  responsavel_id: string | null;
  justificativa: string | null;
}

export async function listarMovimentacoes(
  client: PoolClient,
  candidaturaId: string
): Promise<MovimentacaoRow[]> {
  const { rows } = await client.query<MovimentacaoRow>(
    `SELECT h.id, sa.codigo AS status_anterior, sn.codigo AS status_novo,
            h.data_movimentacao, h.responsavel_id, h.justificativa
       FROM cross_projects.historico_candidatura h
       LEFT JOIN cross_projects.status_candidatura sa ON sa.id = h.status_anterior_id
       JOIN cross_projects.status_candidatura sn ON sn.id = h.status_novo_id
      WHERE h.candidatura_parceiro_id = $1
      ORDER BY h.data_movimentacao DESC`,
    [candidaturaId]
  );
  return rows;
}
