import { RequestHandler } from "express";

/** Encaminha erros de handlers assíncronos ao middleware de erro do Express. */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** Extrai o usuário da requisição para a trilha de auditoria (placeholder até a autenticação). */
export function usuarioIdDaRequisicao(req: { header(name: string): string | undefined }): string | null {
  const h = req.header("x-usuario-id");
  return h && h.trim() ? h.trim() : null;
}
