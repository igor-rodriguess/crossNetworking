// Autenticação real contra /v1/auth/* — substitui o login mock.
//
// Fluxo: login → guarda a sessão no cofre (sessao.ts) → o client.ts injeta o
// Bearer automaticamente. Em 401, o client chama de volta o refresh registrado
// aqui (configurarRefresh), que rotaciona o par de tokens.

import { requisitar, requisitarVazio, configurarRefresh } from './client';
import {
  definirSessao,
  limparSessao,
  obterRefreshToken,
  sessaoDaResposta,
  type Sessao,
} from './sessao';

/** Personas do backend (papel de autorização). */
export type Persona = 'estrategista' | 'gestor_contas' | 'coordenador' | 'administrador';

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  persona: Persona | null;
}

interface RespostaSessao {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  usuario: UsuarioSessao;
}

export interface ResultadoLogin {
  usuario: UsuarioSessao;
  sessao: Sessao;
}

/** Autentica por e-mail + senha e abre a sessão. */
export async function login(email: string, senha: string): Promise<ResultadoLogin> {
  const r = await requisitar<RespostaSessao>('/auth/login', {
    publico: true,
    corpo: { email, senha },
  });
  const sessao = sessaoDaResposta(r);
  definirSessao(sessao);
  return { usuario: r.usuario, sessao };
}

/**
 * Renova a sessão a partir do refresh token guardado. Registrado no client
 * para o retry automático de 401. Retorna true se renovou.
 */
export async function refresh(): Promise<boolean> {
  const refreshToken = obterRefreshToken();
  if (!refreshToken) return false;
  try {
    const r = await requisitar<RespostaSessao>('/auth/refresh', {
      publico: true,
      corpo: { refresh_token: refreshToken },
    });
    definirSessao(sessaoDaResposta(r));
    return true;
  } catch {
    // Refresh inválido/expirado/reúso → sessão morta. Limpa e deixa o 401 subir.
    limparSessao();
    return false;
  }
}

/** Encerra a sessão no servidor (revoga o refresh) e limpa o cofre local. */
export async function logout(): Promise<void> {
  const refreshToken = obterRefreshToken();
  limparSessao(); // desloga a UI imediatamente, mesmo que a chamada abaixo falhe
  if (!refreshToken) return;
  try {
    await requisitarVazio('/auth/logout', { publico: true, corpo: { refresh_token: refreshToken } });
  } catch {
    // Logout best-effort: se a rede falhar, o token expira sozinho no servidor.
  }
}

// Liga o refresh automático do client a este módulo (uma vez, no import).
configurarRefresh(refresh);
