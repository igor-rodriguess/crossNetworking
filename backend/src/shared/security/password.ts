import { randomBytes, scrypt as scryptCb, ScryptOptions, timingSafeEqual } from "node:crypto";

/** Envolve o scrypt nativo (com a sobrecarga de opções) numa Promise. */
function scrypt(senha: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(senha, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived)
    );
  });
}

// Parâmetros do scrypt (KDF memória-dura). N=2^15 é um custo robusto para 2026.
const KEYLEN = 64;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Gera o hash de uma senha. Formato armazenado: `scrypt$N$r$p$salt$hash`
 * (base64) — o sal é aleatório por senha e os parâmetros ficam embutidos,
 * permitindo evoluir o custo sem quebrar hashes antigos.
 */
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(senha.normalize("NFKC"), salt, KEYLEN, PARAMS)) as Buffer;
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** Confere a senha contra o hash armazenado, em tempo constante. */
export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = partes;
  const N = Number(n), R = Number(r), P = Number(p);
  // Os parâmetros vêm do hash persistido: valide-os antes de enviá-los ao
  // scrypt para impedir custo excessivo por dado corrompido/malicioso.
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P) || N < 16384 || N > 65536 || R < 1 || R > 16 || P < 1 || P > 4) return false;
  const salt = Buffer.from(saltB64, "base64");
  const esperado = Buffer.from(hashB64, "base64");
  if (salt.length < 16 || esperado.length !== KEYLEN) return false;
  const derived = (await scrypt(senha.normalize("NFKC"), salt, esperado.length, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return derived.length === esperado.length && timingSafeEqual(derived, esperado);
}
