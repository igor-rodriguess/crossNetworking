import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";
import { AppError } from "../errors";
import { env } from "../../config/env";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UsuarioAutenticado {
  id: string | null;
  persona: string | null;
  nome: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      /** Autor da operação (auditoria). Definido pela autenticação. */
      usuarioId: string | null;
      /** Identidade autenticada (token). */
      usuario?: UsuarioAutenticado;
    }
  }
}

/**
 * Define o id de correlação (`x-request-id`). O autor da operação NÃO é lido do
 * header em produção — vem exclusivamente do token (middleware `autenticar`).
 * O header `x-usuario-id` só é aceito em modo de teste, para os testes que
 * precisam fixar um autor de auditoria.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  req.id = req.header("x-request-id")?.trim() || randomUUID();
  res.setHeader("x-request-id", req.id);

  req.usuarioId = null;

  if (env.isTest) {
    const u = req.header("x-usuario-id")?.trim();
    if (u) {
      if (!UUID_RE.test(u)) {
        return next(new AppError(400, "Cabeçalho x-usuario-id deve ser um UUID válido", "bad_request"));
      }
      req.usuarioId = u;
    }
  }
  next();
};
