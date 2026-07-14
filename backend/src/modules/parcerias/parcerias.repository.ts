import { PoolClient } from "pg";
import {
  AtualizarContrapartidaInput,
  AtualizarContratoParceriaInput,
  AtualizarNegociacaoInput,
  AtualizarParceriaInput,
  CriarContrapartidaInput,
  CriarContratoParceriaInput,
  CriarNegociacaoInput,
  FormalizarParceriaInput,
} from "./parcerias.schema";

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

/** Monta um SET dinâmico a partir dos campos presentes no patch. */
function montarSet(
  campos: Record<string, unknown>,
  params: unknown[]
): string[] {
  const set: string[] = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    params.push(valor);
    set.push(`${coluna} = $${params.length}`);
  }
  return set;
}

// --- Contexto da candidatura (origem da parceria — RN026) ------------------

export interface ContextoCandidatura {
  candidatura_id: string;
  frente_oportunidade_id: string;
  projeto_id: string;
  cliente_cross_id: string;
  parte_id: string;
}

export async function contextoDaCandidatura(
  client: PoolClient,
  candidaturaId: string
): Promise<ContextoCandidatura | null> {
  const { rows } = await client.query<ContextoCandidatura>(
    `SELECT cp.id AS candidatura_id, cp.parte_id,
            f.id AS frente_oportunidade_id,
            pr.id AS projeto_id, pr.cliente_cross_id
       FROM cross_projects.candidatura_parceiro cp
       JOIN cross_projects.frente_oportunidade f ON f.id = cp.frente_oportunidade_id
       JOIN cross_projects.projeto pr ON pr.id = f.projeto_id
      WHERE cp.id = $1 AND cp.arquivado_em IS NULL`,
    [candidaturaId]
  );
  return rows[0] ?? null;
}

export async function parceriaDaCandidatura(
  client: PoolClient,
  candidaturaId: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM cross_partnerships.parceria
      WHERE candidatura_parceiro_id = $1 AND arquivado_em IS NULL`,
    [candidaturaId]
  );
  return rows[0]?.id ?? null;
}

// --- Parceria (RF034) -------------------------------------------------------

export async function inserirParceria(
  client: PoolClient,
  ctx: ContextoCandidatura,
  input: FormalizarParceriaInput,
  ids: { tipoId: string | null; statusId: string },
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.parceria
       (candidatura_parceiro_id, projeto_id, frente_oportunidade_id, cliente_cross_id,
        parte_parceira_id, tipo_parceria_id, status_parceria_id, data_inicio, data_fim,
        condicoes_comerciais, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING id`,
    [
      ctx.candidatura_id,
      ctx.projeto_id,
      ctx.frente_oportunidade_id,
      ctx.cliente_cross_id,
      ctx.parte_id,
      ids.tipoId,
      ids.statusId,
      input.data_inicio ?? null,
      input.data_fim ?? null,
      input.condicoes_comerciais ?? null,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_PARCERIA = `
  SELECT p.id, p.candidatura_parceiro_id, p.projeto_id, p.frente_oportunidade_id,
         p.cliente_cross_id, p.parte_parceira_id, pa.nome_exibicao AS parceiro,
         t.codigo AS tipo, s.codigo AS status,
         p.data_inicio, p.data_fim, p.condicoes_comerciais,
         p.criado_em, p.xmin::text AS versao
    FROM cross_partnerships.parceria p
    JOIN cross_partnerships.status_parceria s ON s.id = p.status_parceria_id
    JOIN cross_core.parte pa ON pa.id = p.parte_parceira_id
    LEFT JOIN cross_partnerships.tipo_parceria t ON t.id = p.tipo_parceria_id
   WHERE p.arquivado_em IS NULL`;

export async function buscarParceria(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_PARCERIA} AND p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarParcerias(
  client: PoolClient,
  filtros: { projetoId?: string; status?: string },
  limit: number,
  offset: number
) {
  const params: unknown[] = [];
  let where = "";
  if (filtros.projetoId) {
    params.push(filtros.projetoId);
    where += ` AND p.projeto_id = $${params.length}`;
  }
  if (filtros.status) {
    params.push(filtros.status);
    where += ` AND s.codigo = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await client.query(
    `${SELECT_PARCERIA}${where}
       ORDER BY p.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: contagem } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM cross_partnerships.parceria p
       JOIN cross_partnerships.status_parceria s ON s.id = p.status_parceria_id
      WHERE p.arquivado_em IS NULL${where}`,
    params.slice(0, params.length - 2)
  );
  return { itens: rows, total: Number(contagem[0].total) };
}

export async function atualizarParceria(
  client: PoolClient,
  id: string,
  patch: AtualizarParceriaInput & { tipo_parceria_id?: string; status_parceria_id?: string },
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      tipo_parceria_id: patch.tipo_parceria_id,
      status_parceria_id: patch.status_parceria_id,
      data_inicio: patch.data_inicio,
      data_fim: patch.data_fim,
      condicoes_comerciais: patch.condicoes_comerciais,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");

  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_partnerships.parceria
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

export async function arquivarParceria(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_partnerships.parceria
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

// --- Negociação (RF035) -----------------------------------------------------

export async function inserirNegociacao(
  client: PoolClient,
  parceriaId: string,
  input: CriarNegociacaoInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.negociacao
       (parceria_id, status_negociacao_id, descricao, data_inicio, data_fim,
        responsavel_id, resultado, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$6)
     RETURNING id`,
    [
      parceriaId,
      statusId,
      input.descricao ?? null,
      input.data_inicio ?? null,
      input.data_fim ?? null,
      usuarioId,
      input.resultado ?? null,
    ]
  );
  return rows[0].id;
}

const SELECT_NEGOCIACAO = `
  SELECT n.id, n.parceria_id, s.codigo AS status, n.descricao, n.data_inicio,
         n.data_fim, n.responsavel_id, n.resultado, n.criado_em, n.xmin::text AS versao
    FROM cross_partnerships.negociacao n
    JOIN cross_partnerships.status_negociacao s ON s.id = n.status_negociacao_id
   WHERE n.arquivado_em IS NULL`;

export async function buscarNegociacao(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_NEGOCIACAO} AND n.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarNegociacoes(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `${SELECT_NEGOCIACAO} AND n.parceria_id = $1 ORDER BY n.criado_em DESC`,
    [parceriaId]
  );
  return rows;
}

export async function atualizarNegociacao(
  client: PoolClient,
  id: string,
  patch: AtualizarNegociacaoInput & { status_negociacao_id?: string },
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      status_negociacao_id: patch.status_negociacao_id,
      descricao: patch.descricao,
      data_inicio: patch.data_inicio,
      data_fim: patch.data_fim,
      resultado: patch.resultado,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");

  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_partnerships.negociacao
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

// --- Contrapartida (RF036 — RN027) -----------------------------------------

export async function inserirContrapartida(
  client: PoolClient,
  parceriaId: string,
  input: CriarContrapartidaInput,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.contrapartida
       (parceria_id, descricao, categoria, valor_estimado, moeda, prazo, cumprida,
        criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     RETURNING id`,
    [
      parceriaId,
      input.descricao,
      input.categoria ?? null,
      input.valor_estimado ?? null,
      input.moeda ?? null,
      input.prazo ?? null,
      input.cumprida ?? false,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_CONTRAPARTIDA = `
  SELECT id, parceria_id, descricao, categoria, valor_estimado::float8 AS valor_estimado,
         moeda, prazo, cumprida, criado_em, xmin::text AS versao
    FROM cross_partnerships.contrapartida
   WHERE arquivado_em IS NULL`;

export async function buscarContrapartida(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_CONTRAPARTIDA} AND id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarContrapartidas(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `${SELECT_CONTRAPARTIDA} AND parceria_id = $1 ORDER BY prazo NULLS LAST, criado_em`,
    [parceriaId]
  );
  return rows;
}

export async function atualizarContrapartida(
  client: PoolClient,
  id: string,
  patch: AtualizarContrapartidaInput,
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      descricao: patch.descricao,
      categoria: patch.categoria,
      valor_estimado: patch.valor_estimado,
      moeda: patch.moeda,
      prazo: patch.prazo,
      cumprida: patch.cumprida,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");

  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_partnerships.contrapartida
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

export async function arquivarContrapartida(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_partnerships.contrapartida
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

// --- Contrato de parceria (RF037) ------------------------------------------

export async function inserirContrato(
  client: PoolClient,
  parceriaId: string,
  input: CriarContratoParceriaInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.contrato_parceria
       (parceria_id, descricao, data_assinatura, data_inicio, data_fim, valor, moeda,
        status_contrato_id, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING id`,
    [
      parceriaId,
      input.descricao ?? null,
      input.data_assinatura ?? null,
      input.data_inicio ?? null,
      input.data_fim ?? null,
      input.valor ?? null,
      input.moeda ?? null,
      statusId,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_CONTRATO = `
  SELECT c.id, c.parceria_id, c.descricao, c.data_assinatura, c.data_inicio, c.data_fim,
         c.valor::float8 AS valor, c.moeda, s.codigo AS status, c.criado_em,
         c.xmin::text AS versao
    FROM cross_partnerships.contrato_parceria c
    JOIN cross_commercial.status_contrato s ON s.id = c.status_contrato_id
   WHERE c.arquivado_em IS NULL`;

export async function buscarContrato(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_CONTRATO} AND c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarContratos(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `${SELECT_CONTRATO} AND c.parceria_id = $1 ORDER BY c.criado_em DESC`,
    [parceriaId]
  );
  return rows;
}

export async function atualizarContrato(
  client: PoolClient,
  id: string,
  patch: AtualizarContratoParceriaInput & { status_contrato_id?: string },
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      descricao: patch.descricao,
      data_assinatura: patch.data_assinatura,
      data_inicio: patch.data_inicio,
      data_fim: patch.data_fim,
      valor: patch.valor,
      moeda: patch.moeda,
      status_contrato_id: patch.status_contrato_id,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");

  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_partnerships.contrato_parceria
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}
