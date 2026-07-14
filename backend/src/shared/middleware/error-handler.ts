import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, mapPgError } from "../errors";
import { logger } from "../logger";

// Envelope padrão: { codigo (HTTP), erro (identificador), mensagem, detalhes, requisicao_id }
// — o front lê o código e o identificador para tratar cada caso.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requisicaoId = (req as { id?: string }).id;

  const responder = (status: number, erro: string, mensagem: string, detalhes?: unknown) =>
    res.status(status).json({ codigo: status, erro, mensagem, detalhes, requisicao_id: requisicaoId });

  if (err instanceof ZodError) {
    return responder(422, "validation", "Dados inválidos", err.issues);
  }
  if (err instanceof AppError) {
    return responder(err.status, err.code, err.message, err.details);
  }

  const mapped = mapPgError(err);
  if (mapped) {
    return responder(mapped.status, mapped.code, mapped.message, mapped.details);
  }

  logger.error({ err, requisicaoId }, "erro não tratado");
  return responder(500, "internal", "Erro interno do servidor");
};
