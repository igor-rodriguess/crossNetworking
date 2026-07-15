import { PoolClient } from "pg";
import { CriarUsuarioInput } from "./admin.schema";

export interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  persona: string | null;
  ativo: boolean;
  criado_em: string;
  versao: string;
}

const USUARIO_COLS = `u.id, u.nome, u.email, u.cargo, u.persona, u.ativo, u.criado_em, u.xmin::text AS versao`;

export async function inserirUsuario(
  client: PoolClient,
  input: CriarUsuarioInput,
  criadoPorId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, cargo, persona, criado_por_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.nome, input.email, input.cargo ?? null, input.persona ?? null, criadoPorId]
  );
  return rows[0].id;
}

/** Define/atualiza a senha (hash) do usuário — upsert na tabela de credenciais. */
export async function definirCredencial(
  client: PoolClient,
  usuarioId: string,
  senhaHash: string
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.credencial_usuario (usuario_id, senha_hash, senha_atualizada_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (usuario_id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, senha_atualizada_em = NOW()`,
    [usuarioId, senhaHash]
  );
  // Trocar a senha revoga sessões abertas (força novo login).
  await client.query(
    "UPDATE cross_core.sessao_refresh SET revogado_em = NOW() WHERE usuario_id = $1 AND revogado_em IS NULL",
    [usuarioId]
  );
}

export async function buscarUsuarioPorId(
  client: PoolClient,
  id: string
): Promise<UsuarioRow | null> {
  const { rows } = await client.query<UsuarioRow>(
    `SELECT ${USUARIO_COLS} FROM cross_core.usuario_interno u
      WHERE u.id = $1 AND u.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarUsuarios(
  client: PoolClient,
  filtros: { busca: string | null; limit: number; offset: number }
): Promise<{ itens: Omit<UsuarioRow, "versao">[]; total: number }> {
  const { rows } = await client.query<UsuarioRow & { total: string }>(
    `SELECT ${USUARIO_COLS}, count(*) OVER() AS total
       FROM cross_core.usuario_interno u
      WHERE u.arquivado_em IS NULL
        AND ($1::text IS NULL OR u.nome ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
      ORDER BY u.nome
      LIMIT $2 OFFSET $3`,
    [filtros.busca, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, versao: _v, ...r }) => r);
  return { itens, total };
}

export async function atualizarUsuario(
  client: PoolClient,
  id: string,
  patch: { nome?: string; email?: string; cargo?: string; persona?: string; ativo?: boolean },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.usuario_interno
        SET nome = COALESCE($2, nome),
            email = COALESCE($3, email),
            cargo = COALESCE($4, cargo),
            persona = COALESCE($5, persona),
            ativo = COALESCE($6, ativo)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $7`,
    [id, patch.nome ?? null, patch.email ?? null, patch.cargo ?? null, patch.persona ?? null, patch.ativo ?? null, versaoEsperada]
  );
  return res.rowCount ?? 0;
}

/** Inativa o usuário (arquivamento lógico) — preserva o histórico de auditoria. */
export async function arquivarUsuario(
  client: PoolClient,
  id: string,
  usuarioId: string | null
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.usuario_interno
        SET arquivado_em = NOW(), arquivado_por_id = $2, ativo = FALSE
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id, usuarioId]
  );
  return res.rowCount ?? 0;
}

export async function existeUsuarioAtivo(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_core.usuario_interno WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Catálogos -------------------------------------------------------------

export interface ItemCatalogo {
  codigo: string;
  nome: string;
  descricao: string | null;
}

/**
 * Lista um catálogo de vocabulário controlado. Ordena por nome porque nem todos
 * os catálogos possuem a coluna `ordem` (ex.: territorio).
 */
export async function listarCatalogo(client: PoolClient, tabela: string): Promise<ItemCatalogo[]> {
  const { rows } = await client.query<ItemCatalogo>(
    `SELECT codigo, nome, descricao FROM ${tabela}
      WHERE ativo IS NOT FALSE
      ORDER BY nome`
  );
  return rows;
}
