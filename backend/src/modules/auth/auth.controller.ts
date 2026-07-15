import { Request, Response } from "express";
import { AppError } from "../../shared/errors";
import * as service from "./auth.service";
import { loginSchema, refreshSchema } from "./auth.schema";

function contexto(req: Request) {
  return {
    userAgent: req.header("user-agent") ?? null,
    ip: req.ip ?? null,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, senha } = loginSchema.parse(req.body);
  res.json(await service.login(email, senha, contexto(req)));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refresh_token } = refreshSchema.parse(req.body);
  res.json(await service.refresh(refresh_token, contexto(req)));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refresh_token } = refreshSchema.parse(req.body);
  await service.logout(refresh_token);
  res.status(204).send();
}

export async function logoutTodos(req: Request, res: Response): Promise<void> {
  if (!req.usuario?.id) throw new AppError(401, "Autenticação obrigatória", "unauthorized");
  const revogadas = await service.logoutTodos(req.usuario.id);
  res.json({ sessoes_revogadas: revogadas });
}

export async function sessao(req: Request, res: Response): Promise<void> {
  if (!req.usuario?.id) throw new AppError(401, "Autenticação obrigatória", "unauthorized");
  res.json(await service.sessaoAtual(req.usuario.id));
}
