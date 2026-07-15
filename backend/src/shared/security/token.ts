import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";

// -----------------------------------------------------------------------------
// JWT compacto (HS256) implementado sobre o `crypto` nativo — sem dependências.
// Formato padrão: base64url(header).base64url(payload).base64url(assinatura).
// -----------------------------------------------------------------------------

const b64url = (b: Buffer) => b.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

export interface AccessTokenPayload {
  sub: string; // id do usuário
  persona: string | null;
  nome: string;
  iat: number;
  exp: number;
}

function assinar(dados: string): string {
  return b64url(createHmac("sha256", env.jwtSecret).update(dados).digest());
}

/** Emite um access token assinado, válido por `accessTokenTtlMin` minutos. */
export function emitirAccessToken(usuario: { id: string; persona: string | null; nome: string }): string {
  const agora = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload: AccessTokenPayload = {
    sub: usuario.id,
    persona: usuario.persona,
    nome: usuario.nome,
    iat: agora,
    exp: agora + env.accessTokenTtlMin * 60,
  };
  const corpo = `${header}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  return `${corpo}.${assinar(corpo)}`;
}

/** Verifica assinatura e expiração; devolve o payload ou `null` se inválido. */
export function verificarAccessToken(token: string): AccessTokenPayload | null {
  // Limite defensivo: tokens legítimos são muito menores; evita processar
  // payloads gigantes antes de alcançar o rate-limit.
  if (token.length > 4096) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [header, payload, assinatura] = partes;

  let esperada: Buffer;
  let recebida: Buffer;
  try {
    const cabecalho = JSON.parse(fromB64url(header).toString()) as { alg?: unknown; typ?: unknown };
    // Não aceite algoritmos declarados diferentes do algoritmo implementado.
    if (cabecalho.alg !== "HS256" || cabecalho.typ !== "JWT") return null;
    esperada = fromB64url(assinar(`${header}.${payload}`));
    recebida = fromB64url(assinatura);
  } catch {
    return null;
  }
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const dados = JSON.parse(fromB64url(payload).toString()) as AccessTokenPayload;
    if (
      typeof dados.sub !== "string" ||
      typeof dados.nome !== "string" ||
      (dados.persona !== null && typeof dados.persona !== "string") ||
      typeof dados.iat !== "number" ||
      typeof dados.exp !== "number" ||
      dados.exp <= Math.floor(Date.now() / 1000) ||
      dados.exp <= dados.iat
    ) return null;
    return dados;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Refresh token: valor aleatório opaco. O banco guarda apenas o SHA-256 dele.
// -----------------------------------------------------------------------------

/** Gera um refresh token opaco (256 bits) e o hash que será persistido. */
export function gerarRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
