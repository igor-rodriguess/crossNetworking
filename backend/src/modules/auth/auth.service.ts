import { withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { env } from "../../config/env";
import { verificarSenha } from "../../shared/security/password";
import { emitirAccessToken, gerarRefreshToken, hashRefreshToken } from "../../shared/security/token";
import * as repo from "./auth.repository";

export interface ContextoSessao {
  userAgent: string | null;
  ip: string | null;
}

const CREDENCIAIS_INVALIDAS = new AppError(401, "E-mail ou senha inválidos", "unauthorized");

function montarSessao(usuario: { id: string; nome: string; persona: string | null }) {
  const accessToken = emitirAccessToken(usuario);
  const { token: refreshToken, hash } = gerarRefreshToken();
  const expiraEm = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  return { accessToken, refreshToken, hash, expiraEm };
}

function respostaSessao(
  usuario: { id: string; nome: string; email?: string; persona: string | null },
  accessToken: string,
  refreshToken: string
) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer" as const,
    expires_in: env.accessTokenTtlMin * 60,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, persona: usuario.persona },
  };
}

/** Autentica por e-mail + senha e abre uma sessão (access + refresh). */
export async function login(email: string, senha: string, ctx: ContextoSessao) {
  return withTransaction(async (c) => {
    const usuario = await repo.buscarPorEmail(c, email);
    // Sempre executa a verificação (mesmo sem usuário) para não vazar, pelo
    // tempo de resposta, se o e-mail existe.
    const hashReferencia =
      usuario?.senha_hash ??
      "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    const senhaOk = await verificarSenha(senha, hashReferencia);

    if (!usuario || !usuario.senha_hash || !usuario.ativo || !senhaOk) {
      throw CREDENCIAIS_INVALIDAS;
    }

    const s = montarSessao(usuario);
    await repo.criarRefresh(c, {
      usuarioId: usuario.id,
      tokenHash: s.hash,
      expiraEm: s.expiraEm,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return respostaSessao(usuario, s.accessToken, s.refreshToken);
  });
}

/**
 * Troca um refresh token por um novo par (rotação). Detecta reúso: se o token
 * apresentado já foi revogado, trata como comprometimento e revoga todas as
 * sessões do usuário.
 */
export async function refresh(refreshToken: string, ctx: ContextoSessao) {
  const tokenHash = hashRefreshToken(refreshToken);

  // Fase 1: avalia e (se válido) rotaciona numa transação. Não lançamos erro
  // aqui dentro para não dar ROLLBACK na eventual revogação de reúso — ela
  // precisa ser efetivada, então roda numa transação própria na fase 2.
  const resultado = await withTransaction(async (c) => {
    const sessao = await repo.buscarRefresh(c, tokenHash);
    if (!sessao) return { tipo: "invalido" as const };
    if (sessao.revogado_em) return { tipo: "reuso" as const, usuarioId: sessao.usuario_id };
    if (new Date(sessao.expira_em) < new Date()) return { tipo: "expirado" as const };

    const usuario = await repo.buscarPorId(c, sessao.usuario_id);
    if (!usuario || !usuario.ativo) return { tipo: "inativo" as const };

    const s = montarSessao(usuario);
    const novoId = await repo.criarRefresh(c, {
      usuarioId: usuario.id,
      tokenHash: s.hash,
      expiraEm: s.expiraEm,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await repo.revogar(c, sessao.id, novoId);
    return { tipo: "ok" as const, resposta: respostaSessao(usuario, s.accessToken, s.refreshToken) };
  });

  if (resultado.tipo === "reuso") {
    // Reúso de um token já rotacionado → possível vazamento. Corta tudo
    // (numa transação que efetivamente commita) e recusa.
    await withTransaction((c) => repo.revogarTodasDoUsuario(c, resultado.usuarioId));
    throw new AppError(401, "Sessão inválida (reúso detectado)", "unauthorized");
  }
  if (resultado.tipo !== "ok") throw new AppError(401, "Sessão inválida ou expirada", "unauthorized");
  return resultado.resposta;
}

/** Revoga a sessão do refresh token informado (logout do dispositivo atual). */
export async function logout(refreshToken: string): Promise<void> {
  await withTransaction(async (c) => {
    const sessao = await repo.buscarRefresh(c, hashRefreshToken(refreshToken));
    if (sessao && !sessao.revogado_em) await repo.revogar(c, sessao.id);
  });
}

/** Revoga todas as sessões do usuário (sair de todos os dispositivos). */
export async function logoutTodos(usuarioId: string): Promise<number> {
  return withTransaction((c) => repo.revogarTodasDoUsuario(c, usuarioId));
}

export async function sessaoAtual(usuarioId: string) {
  const usuario = await withTransaction((c) => repo.buscarPorId(c, usuarioId));
  if (!usuario) throw new AppError(401, "Sessão inválida", "unauthorized");
  return usuario;
}
