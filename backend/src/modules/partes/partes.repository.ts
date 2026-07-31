import { PoolClient } from "pg";
import { CriarOrganizacaoInput, CriarPessoaInput } from "./partes.schema";

export async function resolverStatusParteId(
  client: PoolClient,
  codigo: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM cross_core.status_parte WHERE codigo = $1",
    [codigo]
  );
  return rows[0]?.id ?? null;
}

export async function inserirParte(
  client: PoolClient,
  data: { tipo: string; nome_exibicao: string; status_parte_id: string; criado_por_id: string | null }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id, criado_por_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.tipo, data.nome_exibicao, data.status_parte_id, data.criado_por_id]
  );
  return rows[0].id;
}

export async function inserirOrganizacao(
  client: PoolClient,
  parteId: string,
  org: CriarOrganizacaoInput["organizacao"]
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.organizacao
       (parte_id, nome_fantasia, razao_social, cnpj, segmento_principal, site)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [parteId, org.nome_fantasia, org.razao_social ?? null, org.cnpj ?? null, org.segmento_principal ?? null, org.site ?? null]
  );
}

export async function inserirPessoa(
  client: PoolClient,
  parteId: string,
  p: CriarPessoaInput["pessoa"]
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.pessoa
       (parte_id, nome_completo, nome_artistico, cpf, nacionalidade)
     VALUES ($1, $2, $3, $4, $5)`,
    [parteId, p.nome_completo, p.nome_artistico ?? null, p.cpf ?? null, p.nacionalidade ?? null]
  );
}

export interface ParteRow {
  id: string;
  tipo: "organizacao" | "pessoa";
  nome_exibicao: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  versao: string; // xmin — token de concorrência otimista
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  segmento_principal: string | null;
  site: string | null;
  nome_completo: string | null;
  nome_artistico: string | null;
  cpf: string | null;
  nacionalidade: string | null;
}

export async function buscarPorId(client: PoolClient, id: string): Promise<ParteRow | null> {
  const { rows } = await client.query<ParteRow>(
    `SELECT p.id, p.tipo, p.nome_exibicao, sp.codigo AS status,
            p.criado_em, p.atualizado_em, p.xmin::text AS versao,
            o.nome_fantasia, o.razao_social, o.cnpj, o.segmento_principal, o.site,
            pe.nome_completo, pe.nome_artistico, pe.cpf, pe.nacionalidade
       FROM cross_core.parte p
       JOIN cross_core.status_parte sp ON sp.id = p.status_parte_id
       LEFT JOIN cross_core.organizacao o ON o.parte_id = p.id
       LEFT JOIN cross_core.pessoa pe ON pe.parte_id = p.id
      WHERE p.id = $1 AND p.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export interface ParteListaRow {
  id: string;
  tipo: string;
  nome_exibicao: string;
  status: string;
  papeis: string[];
  criado_em: string;
  total: string;
}

export async function listarPartes(
  client: PoolClient,
  filtros: { busca: string | null; tipo: string | null; limit: number; offset: number }
): Promise<{ itens: Omit<ParteListaRow, "total">[]; total: number }> {
  const { rows } = await client.query<ParteListaRow>(
    `SELECT p.id, p.tipo, p.nome_exibicao, sp.codigo AS status,
            COALESCE(papeis.codigos, ARRAY[]::text[]) AS papeis, p.criado_em,
            count(*) OVER() AS total
       FROM cross_core.parte p
       JOIN cross_core.status_parte sp ON sp.id = p.status_parte_id
       LEFT JOIN LATERAL (
         SELECT array_agg(pa.codigo ORDER BY pa.ordem NULLS LAST, pa.codigo) AS codigos
           FROM cross_core.parte_papel pp
           JOIN cross_core.papel pa ON pa.id = pp.papel_id
          WHERE pp.parte_id = p.id
            AND pp.arquivado_em IS NULL
       ) papeis ON TRUE
      WHERE p.arquivado_em IS NULL
        AND ($1::text IS NULL OR p.nome_exibicao ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR p.tipo::text = $2)
      ORDER BY p.criado_em DESC
      LIMIT $3 OFFSET $4`,
    [filtros.busca, filtros.tipo, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, ...r }) => r);
  return { itens, total };
}

/** Atualiza campos base da Parte com trava otimista (xmin). Retorna linhas afetadas. */
export async function atualizarParteBase(
  client: PoolClient,
  id: string,
  patch: { nome_exibicao?: string; status_parte_id?: string },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.parte
        SET nome_exibicao = COALESCE($2, nome_exibicao),
            status_parte_id = COALESCE($3, status_parte_id)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $4`,
    [id, patch.nome_exibicao ?? null, patch.status_parte_id ?? null, versaoEsperada]
  );
  return res.rowCount ?? 0;
}

export async function existeParteAtiva(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_core.parte WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Grupo empresarial e marcas/unidades
// ---------------------------------------------------------------------------

export interface MarcaDoGrupoRow {
  id: string;
  nome: string;
  categoria: string | null;
}

export async function listarMarcasDoGrupo(client: PoolClient, grupoParteId: string): Promise<MarcaDoGrupoRow[]> {
  const { rows } = await client.query<MarcaDoGrupoRow>(
    `SELECT m.id, m.nome_exibicao AS nome, o.segmento_principal AS categoria
       FROM cross_core.grupo_marca gm
       JOIN cross_core.parte m ON m.id = gm.marca_parte_id
       LEFT JOIN cross_core.organizacao o ON o.parte_id = m.id
      WHERE gm.grupo_parte_id = $1
        AND m.arquivado_em IS NULL
      ORDER BY m.nome_exibicao`,
    [grupoParteId]
  );
  return rows;
}

/** Tipo da Parte, para validar qual especialização o PATCH pode tocar. */
export async function tipoDaParte(client: PoolClient, id: string): Promise<string | null> {
  const { rows } = await client.query<{ tipo: string }>(
    "SELECT tipo::text AS tipo FROM cross_core.parte WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows[0]?.tipo ?? null;
}

export async function atualizarOrganizacao(
  client: PoolClient,
  parteId: string,
  org: { nome_fantasia?: string; razao_social?: string; cnpj?: string; segmento_principal?: string; site?: string }
): Promise<void> {
  await client.query(
    `UPDATE cross_core.organizacao
        SET nome_fantasia = COALESCE($2, nome_fantasia),
            razao_social = COALESCE($3, razao_social),
            cnpj = COALESCE($4, cnpj),
            segmento_principal = COALESCE($5, segmento_principal),
            site = COALESCE($6, site)
      WHERE parte_id = $1`,
    [parteId, org.nome_fantasia ?? null, org.razao_social ?? null, org.cnpj ?? null, org.segmento_principal ?? null, org.site ?? null]
  );
}

export async function atualizarPessoa(
  client: PoolClient,
  parteId: string,
  p: { nome_completo?: string; nome_artistico?: string; cpf?: string; nacionalidade?: string }
): Promise<void> {
  await client.query(
    `UPDATE cross_core.pessoa
        SET nome_completo = COALESCE($2, nome_completo),
            nome_artistico = COALESCE($3, nome_artistico),
            cpf = COALESCE($4, cpf),
            nacionalidade = COALESCE($5, nacionalidade)
      WHERE parte_id = $1`,
    [parteId, p.nome_completo ?? null, p.nome_artistico ?? null, p.cpf ?? null, p.nacionalidade ?? null]
  );
}

/** Arquivamento lógico da Parte (RN035). */
export async function arquivarParte(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.parte
        SET arquivado_em = NOW(), arquivado_por_id = $2
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Papéis da Parte (RF006)
// ---------------------------------------------------------------------------

export async function resolverPapelId(client: PoolClient, codigo: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM cross_core.papel WHERE codigo = $1",
    [codigo]
  );
  return rows[0]?.id ?? null;
}

export interface PapelVinculoRow {
  id: string;
  papel_codigo: string;
  papel_nome: string;
  vigente_desde: string | null;
  vigente_ate: string | null;
}

export async function inserirPapelDaParte(
  client: PoolClient,
  data: {
    parte_id: string;
    papel_id: string;
    vigente_desde: string | null;
    vigente_ate: string | null;
    criado_por_id: string | null;
  }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte_papel
       (parte_id, papel_id, vigente_desde, vigente_ate, criado_por_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [data.parte_id, data.papel_id, data.vigente_desde, data.vigente_ate, data.criado_por_id]
  );
  return rows[0].id;
}

export async function listarPapeisDaParte(
  client: PoolClient,
  parteId: string
): Promise<PapelVinculoRow[]> {
  const { rows } = await client.query<PapelVinculoRow>(
    `SELECT pp.id, pa.codigo AS papel_codigo, pa.nome AS papel_nome,
            pp.vigente_desde, pp.vigente_ate
       FROM cross_core.parte_papel pp
       JOIN cross_core.papel pa ON pa.id = pp.papel_id
      WHERE pp.parte_id = $1 AND pp.arquivado_em IS NULL
      ORDER BY pa.ordem NULLS LAST, pa.nome`,
    [parteId]
  );
  return rows;
}

export async function buscarPapelDaParte(
  client: PoolClient,
  parteId: string,
  vinculoId: string
): Promise<PapelVinculoRow | null> {
  const { rows } = await client.query<PapelVinculoRow>(
    `SELECT pp.id, pa.codigo AS papel_codigo, pa.nome AS papel_nome,
            pp.vigente_desde, pp.vigente_ate
       FROM cross_core.parte_papel pp
       JOIN cross_core.papel pa ON pa.id = pp.papel_id
      WHERE pp.id = $2 AND pp.parte_id = $1 AND pp.arquivado_em IS NULL`,
    [parteId, vinculoId]
  );
  return rows[0] ?? null;
}

/** Arquivamento lógico do vínculo de papel (RN035) — permite reentrada futura. */
export async function arquivarPapelDaParte(
  client: PoolClient,
  parteId: string,
  vinculoId: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.parte_papel
        SET arquivado_em = NOW(), arquivado_por_id = $3
      WHERE id = $2 AND parte_id = $1 AND arquivado_em IS NULL`,
    [parteId, vinculoId, usuarioId]
  );
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Contatos da Parte (RF007)
// ---------------------------------------------------------------------------

export interface ContatoRow {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
  observacoes: string | null;
  versao: string;
}

const CONTATO_SELECT = `
  SELECT c.id, c.nome, c.cargo, c.email, c.telefone, c.principal, c.observacoes,
         c.xmin::text AS versao
    FROM cross_core.contato c`;

export async function inserirContato(
  client: PoolClient,
  parteId: string,
  data: {
    nome: string;
    cargo?: string;
    email?: string;
    telefone?: string;
    principal?: boolean;
    observacoes?: string;
  },
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.contato
       (parte_id, nome, cargo, email, telefone, principal, observacoes, criado_por_id)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE), $7, $8)
     RETURNING id`,
    [
      parteId,
      data.nome,
      data.cargo ?? null,
      data.email ?? null,
      data.telefone ?? null,
      data.principal ?? null,
      data.observacoes ?? null,
      criadoPorId,
    ]
  );
  return rows[0].id;
}

export async function listarContatos(client: PoolClient, parteId: string): Promise<ContatoRow[]> {
  const { rows } = await client.query<ContatoRow>(
    `${CONTATO_SELECT}
      WHERE c.parte_id = $1 AND c.arquivado_em IS NULL
      ORDER BY c.principal DESC, c.nome`,
    [parteId]
  );
  return rows;
}

export async function buscarContato(
  client: PoolClient,
  parteId: string,
  contatoId: string
): Promise<ContatoRow | null> {
  const { rows } = await client.query<ContatoRow>(
    `${CONTATO_SELECT}
      WHERE c.id = $2 AND c.parte_id = $1 AND c.arquivado_em IS NULL`,
    [parteId, contatoId]
  );
  return rows[0] ?? null;
}

/** Atualiza o contato com trava otimista (xmin). */
export async function atualizarContato(
  client: PoolClient,
  parteId: string,
  contatoId: string,
  patch: {
    nome?: string;
    cargo?: string;
    email?: string;
    telefone?: string;
    principal?: boolean;
  },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.contato
        SET nome = COALESCE($3, nome),
            cargo = COALESCE($4, cargo),
            email = COALESCE($5, email),
            telefone = COALESCE($6, telefone),
            principal = COALESCE($7, principal)
      WHERE id = $2 AND parte_id = $1 AND arquivado_em IS NULL AND xmin::text = $8`,
    [
      parteId,
      contatoId,
      patch.nome ?? null,
      patch.cargo ?? null,
      patch.email ?? null,
      patch.telefone ?? null,
      patch.principal ?? null,
      versaoEsperada,
    ]
  );
  return res.rowCount ?? 0;
}

export async function arquivarContato(
  client: PoolClient,
  parteId: string,
  contatoId: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.contato
        SET arquivado_em = NOW(), arquivado_por_id = $3
      WHERE id = $2 AND parte_id = $1 AND arquivado_em IS NULL`,
    [parteId, contatoId, usuarioId]
  );
  return res.rowCount ?? 0;
}
