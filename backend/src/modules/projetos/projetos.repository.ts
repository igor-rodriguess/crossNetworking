import { PoolClient } from "pg";
import {
  CriarBriefingInput,
  CriarOrigemDemandaInput,
  CriarPlanejamentoInput,
  CriarProjetoInput,
  CriarResponsavelInput,
} from "./projetos.schema";

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

// --- Projeto ---------------------------------------------------------------

export interface ProjetoRow {
  id: string;
  cliente_cross_id: string;
  contrato_cliente_id: string | null;
  nome: string;
  descricao: string | null;
  objetivo: string;
  produto: string | null;
  data_inicio: string | null;
  data_previsao_fim: string | null;
  data_fim_real: string | null;
  status: string;
  prioridade: string | null;
  criado_em: string;
  versao: string;
}

const PROJETO_COLS = `pj.id, pj.cliente_cross_id, pj.contrato_cliente_id, pj.nome, pj.descricao,
       pj.objetivo, pj.produto, pj.data_inicio, pj.data_previsao_fim, pj.data_fim_real,
       sp.codigo AS status, pr.codigo AS prioridade, pj.criado_em, pj.xmin::text AS versao`;

const PROJETO_FROM = `
    FROM cross_projects.projeto pj
    JOIN cross_projects.status_projeto sp ON sp.id = pj.status_projeto_id
    LEFT JOIN cross_projects.prioridade pr ON pr.id = pj.prioridade_id`;

export async function inserirProjeto(
  client: PoolClient,
  input: CriarProjetoInput,
  statusId: string,
  prioridadeId: string | null,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto
       (cliente_cross_id, contrato_cliente_id, nome, descricao, objetivo, produto,
        data_inicio, data_previsao_fim, data_fim_real, status_projeto_id, prioridade_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      input.cliente_cross_id,
      input.contrato_cliente_id ?? null,
      input.nome,
      input.descricao ?? null,
      input.objetivo,
      input.produto ?? null,
      input.data_inicio ?? null,
      input.data_previsao_fim ?? null,
      input.data_fim_real ?? null,
      statusId,
      prioridadeId,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function buscarProjetoPorId(
  client: PoolClient,
  id: string
): Promise<ProjetoRow | null> {
  const { rows } = await client.query<ProjetoRow>(
    `SELECT ${PROJETO_COLS} ${PROJETO_FROM} WHERE pj.id = $1 AND pj.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarProjetos(
  client: PoolClient,
  filtros: { busca: string | null; clienteId: string | null; limit: number; offset: number }
): Promise<{ itens: Omit<ProjetoRow, "versao">[]; total: number }> {
  const { rows } = await client.query<ProjetoRow & { total: string }>(
    `SELECT ${PROJETO_COLS}, count(*) OVER() AS total ${PROJETO_FROM}
      WHERE pj.arquivado_em IS NULL
        AND ($1::text IS NULL OR pj.nome ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR pj.cliente_cross_id = $2)
      ORDER BY pj.criado_em DESC
      LIMIT $3 OFFSET $4`,
    [filtros.busca, filtros.clienteId, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, versao: _v, ...r }) => r);
  return { itens, total };
}

export async function atualizarProjeto(
  client: PoolClient,
  id: string,
  patch: Record<string, unknown>,
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.projeto
        SET contrato_cliente_id = COALESCE($2, contrato_cliente_id),
            nome = COALESCE($3, nome),
            objetivo = COALESCE($4, objetivo),
            descricao = COALESCE($5, descricao),
            produto = COALESCE($6, produto),
            data_inicio = COALESCE($7, data_inicio),
            data_previsao_fim = COALESCE($8, data_previsao_fim),
            data_fim_real = COALESCE($9, data_fim_real),
            status_projeto_id = COALESCE($10, status_projeto_id),
            prioridade_id = COALESCE($11, prioridade_id)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $12`,
    [
      id,
      patch.contrato_cliente_id ?? null,
      patch.nome ?? null,
      patch.objetivo ?? null,
      patch.descricao ?? null,
      patch.produto ?? null,
      patch.data_inicio ?? null,
      patch.data_previsao_fim ?? null,
      patch.data_fim_real ?? null,
      patch.status_projeto_id ?? null,
      patch.prioridade_id ?? null,
      versaoEsperada,
    ]
  );
  return res.rowCount ?? 0;
}

export async function arquivarProjeto(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.projeto
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

export async function existeProjetoAtivo(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_projects.projeto WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Origem da demanda (RF020) ---------------------------------------------

export interface OrigemRow {
  id: string;
  tipo_origem_demanda_codigo: string;
  descricao: string | null;
  data_registro: string;
}

export async function inserirOrigem(
  client: PoolClient,
  projetoId: string,
  input: CriarOrigemDemandaInput,
  tipoId: string,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.origem_demanda
       (projeto_id, tipo_origem_demanda_id, descricao, criado_por_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [projetoId, tipoId, input.descricao ?? null, criadoPorId]
  );
  return rows[0].id;
}

export async function listarOrigens(client: PoolClient, projetoId: string): Promise<OrigemRow[]> {
  const { rows } = await client.query<OrigemRow>(
    `SELECT od.id, t.codigo AS tipo_origem_demanda_codigo, od.descricao, od.data_registro
       FROM cross_projects.origem_demanda od
       JOIN cross_projects.tipo_origem_demanda t ON t.id = od.tipo_origem_demanda_id
      WHERE od.projeto_id = $1
      ORDER BY od.data_registro DESC`,
    [projetoId]
  );
  return rows;
}

// --- Versionados: briefing e planejamento (RF021/RF022 — RN021) ------------

export interface VersaoRow {
  id: string;
  numero_versao: number;
  status_versao: string;
  criado_em: string;
  [campo: string]: unknown;
}

async function proximaVersao(
  client: PoolClient,
  tabela: string,
  projetoId: string
): Promise<number> {
  const { rows } = await client.query<{ proxima: number }>(
    `SELECT COALESCE(MAX(numero_versao), 0) + 1 AS proxima FROM ${tabela} WHERE projeto_id = $1`,
    [projetoId]
  );
  return Number(rows[0].proxima);
}

export async function inserirBriefing(
  client: PoolClient,
  projetoId: string,
  input: CriarBriefingInput,
  criadoPorId: string | null
): Promise<string> {
  const versao = await proximaVersao(client, "cross_projects.briefing", projetoId);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.briefing
       (projeto_id, numero_versao, conteudo, objetivos, criado_por_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [projetoId, versao, input.conteudo, input.objetivos ?? null, criadoPorId]
  );
  return rows[0].id;
}

export async function listarBriefings(client: PoolClient, projetoId: string): Promise<VersaoRow[]> {
  const { rows } = await client.query<VersaoRow>(
    `SELECT id, numero_versao, status_versao, conteudo, objetivos, criado_em
       FROM cross_projects.briefing
      WHERE projeto_id = $1 AND arquivado_em IS NULL
      ORDER BY numero_versao DESC`,
    [projetoId]
  );
  return rows;
}

export async function inserirPlanejamento(
  client: PoolClient,
  projetoId: string,
  input: CriarPlanejamentoInput,
  criadoPorId: string | null
): Promise<string> {
  const versao = await proximaVersao(client, "cross_projects.planejamento_estrategico", projetoId);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.planejamento_estrategico
       (projeto_id, numero_versao, consolidacao_materiais, estudos_marca, diagnosticos,
        objetivos_negocio, desafios, territorios, oportunidades, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      projetoId,
      versao,
      input.consolidacao_materiais ?? null,
      input.estudos_marca ?? null,
      input.diagnosticos ?? null,
      input.objetivos_negocio ?? null,
      input.desafios ?? null,
      input.territorios ?? null,
      input.oportunidades ?? null,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function listarPlanejamentos(
  client: PoolClient,
  projetoId: string
): Promise<VersaoRow[]> {
  const { rows } = await client.query<VersaoRow>(
    `SELECT id, numero_versao, status_versao, objetivos_negocio, desafios, territorios,
            oportunidades, criado_em
       FROM cross_projects.planejamento_estrategico
      WHERE projeto_id = $1 AND arquivado_em IS NULL
      ORDER BY numero_versao DESC`,
    [projetoId]
  );
  return rows;
}

/**
 * Publica a versão como vigente: rebaixa a atual para 'substituida' e promove
 * esta — na mesma transação, respeitando o índice único parcial (RN021).
 */
export async function publicarVersaoVigente(
  client: PoolClient,
  tabela: string,
  id: string
): Promise<VersaoRow | null> {
  const { rows: alvo } = await client.query<{ projeto_id: string }>(
    `SELECT projeto_id FROM ${tabela} WHERE id = $1 AND arquivado_em IS NULL`,
    [id]
  );
  if (!alvo[0]) return null;

  await client.query(
    `UPDATE ${tabela}
        SET status_versao = 'substituida', vigente_ate = NOW()
      WHERE projeto_id = $1 AND status_versao = 'vigente' AND arquivado_em IS NULL AND id <> $2`,
    [alvo[0].projeto_id, id]
  );

  const { rows } = await client.query<VersaoRow>(
    `UPDATE ${tabela}
        SET status_versao = 'vigente', vigente_desde = NOW(), vigente_ate = NULL
      WHERE id = $1 AND arquivado_em IS NULL
      RETURNING id, numero_versao, status_versao, criado_em`,
    [id]
  );
  return rows[0] ?? null;
}

// --- Responsáveis (RF023 — RN013) ------------------------------------------

export interface ResponsavelRow {
  id: string;
  usuario_interno_id: string;
  usuario_nome: string;
  funcao: string | null;
  inicio: string;
  fim: string | null;
}

export async function inserirResponsavel(
  client: PoolClient,
  projetoId: string,
  input: CriarResponsavelInput
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.responsavel_projeto
       (projeto_id, usuario_interno_id, funcao, inicio, fim)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5)
     RETURNING id`,
    [projetoId, input.usuario_interno_id, input.funcao ?? null, input.inicio ?? null, input.fim ?? null]
  );
  return rows[0].id;
}

export async function listarResponsaveis(
  client: PoolClient,
  projetoId: string
): Promise<ResponsavelRow[]> {
  const { rows } = await client.query<ResponsavelRow>(
    `SELECT rp.id, rp.usuario_interno_id, u.nome AS usuario_nome, rp.funcao, rp.inicio, rp.fim
       FROM cross_projects.responsavel_projeto rp
       JOIN cross_core.usuario_interno u ON u.id = rp.usuario_interno_id
      WHERE rp.projeto_id = $1 AND rp.arquivado_em IS NULL AND rp.fim IS NULL
      ORDER BY u.nome`,
    [projetoId]
  );
  return rows;
}

export async function contarResponsaveisAtivos(
  client: PoolClient,
  projetoId: string
): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM cross_projects.responsavel_projeto
      WHERE projeto_id = $1 AND arquivado_em IS NULL AND fim IS NULL`,
    [projetoId]
  );
  return Number(rows[0].n);
}

export async function arquivarResponsavel(
  client: PoolClient,
  projetoId: string,
  respId: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_projects.responsavel_projeto
        SET arquivado_em = NOW()
      WHERE id = $2 AND projeto_id = $1 AND arquivado_em IS NULL`,
    [projetoId, respId]
  );
  return res.rowCount ?? 0;
}
