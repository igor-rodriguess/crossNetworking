import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";
import { AppError } from "../errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      usuarioId: string | null;
    }
  }
}

/**
 * Define o id de correlação da requisição (`x-request-id`) e valida o
 * `x-usuario-id` (autor da operação, para auditoria) — 400 se não for UUID.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  req.id = req.header("x-request-id")?.trim() || randomUUID();
  res.setHeader("x-request-id", req.id);

  const u = req.header("x-usuario-id");
  if (u && u.trim()) {
    if (!UUID_RE.test(u.trim())) {
      return next(new AppError(400, "Cabeçalho x-usuario-id deve ser um UUID válido", "bad_request"));
    }
    req.usuarioId = u.trim();
  } else {
    req.usuarioId = null;
  }
  next();
};
