import { PoolClient } from "pg";

export interface UsuarioComCredencial {
  id: string;
  nome: string;
  email: string;
  persona: string | null;
  ativo: boolean;
  senha_hash: string | null;
}

export async function buscarPorEmail(c: PoolClient, email: string): Promise<UsuarioComCredencial | null> {
  const { rows } = await c.query<UsuarioComCredencial>(
    `SELECT u.id, u.nome, u.email, u.persona, u.ativo, cr.senha_hash
       FROM cross_core.usuario_interno u
       LEFT JOIN cross_core.credencial_usuario cr ON cr.usuario_id = u.id
      WHERE lower(u.email) = lower($1) AND u.arquivado_em IS NULL`,
    [email]
  );
  return rows[0] ?? null;
}

export async function buscarPorId(c: PoolClient, id: string) {
  const { rows } = await c.query(
    `SELECT id, nome, email, persona, ativo, criado_em
       FROM cross_core.usuario_interno
      WHERE id = $1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

// --- Refresh tokens ---------------------------------------------------------

export async function criarRefresh(
  c: PoolClient,
  dados: { usuarioId: string; tokenHash: string; expiraEm: Date; userAgent: string | null; ip: string | null }
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO cross_core.sessao_refresh (usuario_id, token_hash, expira_em, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [dados.usuarioId, dados.tokenHash, dados.expiraEm, dados.userAgent, dados.ip]
  );
  return rows[0].id;
}

export interface SessaoRefresh {
  id: string;
  usuario_id: string;
  expira_em: string;
  revogado_em: string | null;
}

export async function buscarRefresh(c: PoolClient, tokenHash: string): Promise<SessaoRefresh | null> {
  const { rows } = await c.query<SessaoRefresh>(
    `SELECT id, usuario_id, expira_em, revogado_em
       FROM cross_core.sessao_refresh WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function revogar(c: PoolClient, id: string, substituidoPorId: string | null = null): Promise<void> {
  await c.query(
    `UPDATE cross_core.sessao_refresh
        SET revogado_em = NOW(), substituido_por_id = COALESCE($2, substituido_por_id)
      WHERE id = $1 AND revogado_em IS NULL`,
    [id, substituidoPorId]
  );
}

/** Revoga todas as sessões ativas do usuário — logout global / offboarding. */
export async function revogarTodasDoUsuario(c: PoolClient, usuarioId: string): Promise<number> {
  const r = await c.query(
    `UPDATE cross_core.sessao_refresh SET revogado_em = NOW()
      WHERE usuario_id = $1 AND revogado_em IS NULL`,
    [usuarioId]
  );
  return r.rowCount ?? 0;
}
