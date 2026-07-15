import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, mapPgError } from "../errors";
import { logger } from "../logger";
import { env } from "../../config/env";

// Envelope padrão: { codigo (HTTP), erro (identificador), mensagem, detalhes, requisicao_id }
// — o front lê o código e o identificador para tratar cada caso.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requisicaoId = (req as { id?: string }).id;

  const responder = (status: number, erro: string, mensagem: string, detalhes?: unknown) =>
    res.status(status).json({ codigo: status, erro, mensagem, detalhes, requisicao_id: requisicaoId });

  // Detalhes de validação (zod) são úteis e seguros; metadados internos do
  // Postgres (nomes de constraint/coluna) só saem fora de produção.
  const detalheSeguro = (detalhes: unknown) => (env.isProd ? undefined : detalhes);

  if (err instanceof ZodError) {
    return responder(422, "validation", "Dados inválidos", err.issues);
  }
  if (err instanceof AppError) {
    return responder(err.status, err.code, err.message, detalheSeguro(err.details));
  }

  const mapped = mapPgError(err);
  if (mapped) {
    return responder(mapped.status, mapped.code, mapped.message, detalheSeguro(mapped.details));
  }

  logger.error({ err, requisicaoId }, "erro não tratado");
  return responder(500, "internal", "Erro interno do servidor");
};
