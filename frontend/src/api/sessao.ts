// Cofre de sessão — fonte única dos tokens em memória para a camada HTTP.
//
// Fica FORA do store para evitar dependência circular (client → store → client)
// e para que o interceptor de refresh do client.ts leia/escreva tokens sem
// conhecer o React. O store (Bloco 1) sincroniza com este cofre e cuida da
// persistência; aqui guardamos só o necessário para autenticar requisições.

export interface Sessao {
  accessToken: string;
  refreshToken: string;
  /** Momento (epoch ms) em que o access token expira. */
  expiraEm: number;
}

let sessaoAtual: Sessao | null = null;

/** Observadores notificados quando a sessão muda (login, refresh, logout). */
type Ouvinte = (sessao: Sessao | null) => void;
const ouvintes = new Set<Ouvinte>();

export function definirSessao(sessao: Sessao | null): void {
  sessaoAtual = sessao;
  for (const ouvinte of ouvintes) ouvinte(sessao);
}

export function obterSessao(): Sessao | null {
  return sessaoAtual;
}

export function obterAccessToken(): string | null {
  return sessaoAtual?.accessToken ?? null;
}

export function obterRefreshToken(): string | null {
  return sessaoAtual?.refreshToken ?? null;
}

export function limparSessao(): void {
  definirSessao(null);
}

/** Registra um ouvinte de mudança de sessão; retorna a função de cancelamento. */
export function aoMudarSessao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Converte a resposta de login/refresh do backend numa Sessao. */
export function sessaoDaResposta(r: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): Sessao {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiraEm: Date.now() + r.expires_in * 1000,
  };
}
