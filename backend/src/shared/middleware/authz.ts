import { RequestHandler } from "express";
import { AppError } from "../errors";
import { env } from "../../config/env";
import { verificarAccessToken } from "../security/token";

/**
 * Personas (WAD 5.1 — Atores). O `administrador` é superconjunto: passa em
 * qualquer verificação de persona.
 */
export type Persona = "estrategista" | "gestor_contas" | "coordenador" | "administrador";

/**
 * Autentica a requisição a partir do `Authorization: Bearer <access-token>`.
 * Define `req.usuario` e `req.usuarioId` (autor da auditoria).
 *
 * Em modo de teste, requisições sem token são autenticadas como administrador
 * (para não travar a suíte de integração); o autor da auditoria permanece o que
 * `request-context` definiu (nulo, salvo `x-usuario-id`). Esse atalho NUNCA
 * está ativo fora de teste.
 */
export const autenticar: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  if (header && header.startsWith("Bearer ")) {
    const payload = verificarAccessToken(header.slice(7).trim());
    if (!payload) return next(new AppError(401, "Token inválido ou expirado", "unauthorized"));
    req.usuario = { id: payload.sub, persona: payload.persona, nome: payload.nome };
    req.usuarioId = payload.sub;
    return next();
  }

  if (env.isTest) {
    req.usuario = { id: req.usuarioId, persona: "administrador", nome: "teste" };
    return next();
  }

  return next(new AppError(401, "Autenticação obrigatória", "unauthorized"));
};

/**
 * Exige autenticação e, quando personas são informadas, que a persona do
 * usuário esteja entre elas (ou seja `administrador`). Sem personas: qualquer
 * usuário autenticado. Retorna a cadeia [autenticar, verificação] — o Express
 * aceita arrays de middleware.
 */
export function autorizar(...personas: Persona[]): RequestHandler[] {
  const verificar: RequestHandler = (req, _res, next) => {
    const persona = req.usuario?.persona;
    if (personas.length === 0) return next();
    if (persona === "administrador" || (persona && personas.includes(persona as Persona))) {
      return next();
    }
    return next(new AppError(403, "Persona sem permissão para esta operação", "forbidden"));
  };
  return [autenticar, verificar];
}
