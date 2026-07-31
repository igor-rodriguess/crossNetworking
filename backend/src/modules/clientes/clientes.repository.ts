import { PoolClient } from "pg";
import { CriarClienteInput, CriarComponenteInput, CriarContratoInput } from "./clientes.schema";

/** Resolve o id de um catálogo de vocabulário controlado pelo código. */
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

// --- Cliente Cross (RF016) -------------------------------------------------

export interface ClienteRow {
  id: string;
  parte_id: string;
  parte_nome: string;
  responsavel_conta_id: string | null;
  status: string;
  inicio_relacionamento: string | null;
  observacoes: string | null;
  criado_em: string;
  versao: string;
}

const CLIENTE_FROM = `
    FROM cross_commercial.cliente_cross cc
    JOIN cross_core.parte p ON p.id = cc.parte_id
    JOIN cross_commercial.status_cliente sc ON sc.id = cc.status_cliente_id`;

const CLIENTE_COLS = `cc.id, cc.parte_id, p.nome_exibicao AS parte_nome, cc.responsavel_conta_id,
         sc.codigo AS status, cc.inicio_relacionamento, cc.observacoes,
         cc.criado_em, cc.xmin::text AS versao`;

export async function inserirCliente(
  client: PoolClient,
  input: CriarClienteInput,
  statusId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross
       (parte_id, responsavel_conta_id, status_cliente_id, inicio_relacionamento, observacoes, criado_por_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.parte_id,
      input.responsavel_conta_id ?? null,
      statusId,
      input.inicio_relacionamento ?? null,
      input.observacoes ?? null,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

/** Garante que o vínculo comercial também esteja refletido no papel da Parte.
 * A Parte pode continuar sendo parceira: os papéis são complementares e não
 * representam cadastros duplicados. */
export async function garantirPapelCliente(
  client: PoolClient,
  parteId: string,
  criadoPorId: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.parte_papel (parte_id, papel_id, vigente_desde, criado_por_id)
     SELECT $1, p.id, CURRENT_DATE, $2
       FROM cross_core.papel p
      WHERE p.codigo = 'cliente'
        AND NOT EXISTS (
          SELECT 1
            FROM cross_core.parte_papel pp
           WHERE pp.parte_id = $1
             AND pp.papel_id = p.id
             AND pp.arquivado_em IS NULL
        )`,
    [parteId, criadoPorId]
  );
}

export async function buscarClientePorId(client: PoolClient, id: string): Promise<ClienteRow | null> {
  const { rows } = await client.query<ClienteRow>(
    `SELECT ${CLIENTE_COLS} ${CLIENTE_FROM} WHERE cc.id = $1 AND cc.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarClientes(
  client: PoolClient,
  filtros: { busca: string | null; limit: number; offset: number }
): Promise<{ itens: Omit<ClienteRow, "versao">[]; total: number }> {
  const { rows } = await client.query<ClienteRow & { total: string }>(
    `SELECT ${CLIENTE_COLS}, count(*) OVER() AS total ${CLIENTE_FROM}
      WHERE cc.arquivado_em IS NULL
        AND ($1::text IS NULL OR p.nome_exibicao ILIKE '%' || $1 || '%')
      ORDER BY cc.criado_em DESC
      LIMIT $2 OFFSET $3`,
    [filtros.busca, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, versao: _v, ...r }) => r);
  return { itens, total };
}

export async function atualizarCliente(
  client: PoolClient,
  id: string,
  patch: {
    responsavel_conta_id?: string;
    status_cliente_id?: string;
    inicio_relacionamento?: string;
    observacoes?: string;
  },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_commercial.cliente_cross
        SET responsavel_conta_id = COALESCE($2, responsavel_conta_id),
            status_cliente_id = COALESCE($3, status_cliente_id),
            inicio_relacionamento = COALESCE($4, inicio_relacionamento),
            observacoes = COALESCE($5, observacoes)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $6`,
    [
      id,
      patch.responsavel_conta_id ?? null,
      patch.status_cliente_id ?? null,
      patch.inicio_relacionamento ?? null,
      patch.observacoes ?? null,
      versaoEsperada,
    ]
  );
  return res.rowCount ?? 0;
}

export async function arquivarCliente(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_commercial.cliente_cross
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

export async function existeClienteAtivo(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_commercial.cliente_cross WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Contrato do cliente (RF017) -------------------------------------------

export interface ContratoRow {
  id: string;
  cliente_cross_id: string;
  codigo: string | null;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  criado_em: string;
  versao: string;
}

const CONTRATO_SELECT = `
  SELECT ct.id, ct.cliente_cross_id, ct.codigo, ct.descricao, ct.data_inicio, ct.data_fim,
         sc.codigo AS status, ct.criado_em, ct.xmin::text AS versao
    FROM cross_commercial.contrato_cliente ct
    JOIN cross_commercial.status_contrato sc ON sc.id = ct.status_contrato_id`;

export async function inserirContrato(
  client: PoolClient,
  clienteId: string,
  input: CriarContratoInput,
  statusId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.contrato_cliente
       (cliente_cross_id, codigo, descricao, data_inicio, data_fim, status_contrato_id, criado_por_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      clienteId,
      input.codigo ?? null,
      input.descricao ?? null,
      input.data_inicio ?? null,
      input.data_fim ?? null,
      statusId,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function buscarContratoPorId(client: PoolClient, id: string): Promise<ContratoRow | null> {
  const { rows } = await client.query<ContratoRow>(
    `${CONTRATO_SELECT} WHERE ct.id = $1 AND ct.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarContratosDoCliente(
  client: PoolClient,
  clienteId: string
): Promise<ContratoRow[]> {
  const { rows } = await client.query<ContratoRow>(
    `${CONTRATO_SELECT}
      WHERE ct.cliente_cross_id = $1 AND ct.arquivado_em IS NULL
      ORDER BY ct.criado_em DESC`,
    [clienteId]
  );
  return rows;
}

export async function atualizarContrato(
  client: PoolClient,
  id: string,
  patch: {
    codigo?: string;
    descricao?: string;
    data_inicio?: string;
    data_fim?: string;
    status_contrato_id?: string;
  },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_commercial.contrato_cliente
        SET codigo = COALESCE($2, codigo),
            descricao = COALESCE($3, descricao),
            data_inicio = COALESCE($4, data_inicio),
            data_fim = COALESCE($5, data_fim),
            status_contrato_id = COALESCE($6, status_contrato_id)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $7`,
    [
      id,
      patch.codigo ?? null,
      patch.descricao ?? null,
      patch.data_inicio ?? null,
      patch.data_fim ?? null,
      patch.status_contrato_id ?? null,
      versaoEsperada,
    ]
  );
  return res.rowCount ?? 0;
}

export async function existeContratoAtivo(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_commercial.contrato_cliente WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Modelos de contratação: N:N, substituição total (RF018 — RN009) -------

export async function substituirModelos(
  client: PoolClient,
  contratoId: string,
  modeloIds: string[]
): Promise<void> {
  await client.query(
    "DELETE FROM cross_commercial.contrato_modelo_contratacao WHERE contrato_cliente_id = $1",
    [contratoId]
  );
  for (const modeloId of modeloIds) {
    await client.query(
      `INSERT INTO cross_commercial.contrato_modelo_contratacao (contrato_cliente_id, modelo_contratacao_id)
       VALUES ($1, $2)`,
      [contratoId, modeloId]
    );
  }
}

export async function listarModelos(client: PoolClient, contratoId: string): Promise<string[]> {
  const { rows } = await client.query<{ codigo: string }>(
    `SELECT mc.codigo
       FROM cross_commercial.contrato_modelo_contratacao cmc
       JOIN cross_commercial.modelo_contratacao mc ON mc.id = cmc.modelo_contratacao_id
      WHERE cmc.contrato_cliente_id = $1
      ORDER BY mc.ordem NULLS LAST, mc.codigo`,
    [contratoId]
  );
  return rows.map((r) => r.codigo);
}

// --- Componentes de remuneração (RF018 — RN010) ----------------------------

export interface ComponenteRow {
  id: string;
  tipo_remuneracao_codigo: string;
  descricao: string | null;
  valor: string | null;
  moeda: string | null;
  percentual: string | null;
  vigente_desde: string | null;
  vigente_ate: string | null;
}

export async function inserirComponente(
  client: PoolClient,
  contratoId: string,
  input: CriarComponenteInput,
  tipoId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.componente_remuneracao
       (contrato_cliente_id, tipo_remuneracao_id, descricao, valor, moeda, percentual,
        vigente_desde, vigente_ate, criado_por_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      contratoId,
      tipoId,
      input.descricao ?? null,
      input.valor ?? null,
      input.moeda ?? null,
      input.percentual ?? null,
      input.vigente_desde ?? null,
      input.vigente_ate ?? null,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function listarComponentes(
  client: PoolClient,
  contratoId: string
): Promise<ComponenteRow[]> {
  const { rows } = await client.query<ComponenteRow>(
    `SELECT cr.id, tr.codigo AS tipo_remuneracao_codigo, cr.descricao,
            cr.valor, cr.moeda, cr.percentual, cr.vigente_desde, cr.vigente_ate
       FROM cross_commercial.componente_remuneracao cr
       JOIN cross_commercial.tipo_remuneracao tr ON tr.id = cr.tipo_remuneracao_id
      WHERE cr.contrato_cliente_id = $1 AND cr.arquivado_em IS NULL
      ORDER BY cr.criado_em`,
    [contratoId]
  );
  return rows;
}

export async function arquivarComponente(
  client: PoolClient,
  contratoId: string,
  componenteId: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_commercial.componente_remuneracao
        SET arquivado_em = NOW(), arquivado_por_id = $3
      WHERE id = $2 AND contrato_cliente_id = $1 AND arquivado_em IS NULL`,
    [contratoId, componenteId, usuarioId]
  );
  return res.rowCount ?? 0;
}
