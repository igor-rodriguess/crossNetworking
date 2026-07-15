import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../shared/http";
import { autenticar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import { env } from "../../config/env";
import * as c from "./auth.controller";
import { loginSchema, refreshSchema } from "./auth.schema";

export const authRouter = Router();

// Limite estrito nas rotas sensíveis a força-bruta (login/refresh).
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { codigo: 429, erro: "rate_limited", mensagem: "Muitas tentativas; tente novamente mais tarde" },
});

authRouter.post("/auth/login", limiteAuth, asyncHandler(c.login));
authRouter.post("/auth/refresh", limiteAuth, asyncHandler(c.refresh));
authRouter.post("/auth/logout", asyncHandler(c.logout));
authRouter.post("/auth/logout-todos", autenticar, asyncHandler(c.logoutTodos));
authRouter.get("/auth/sessao", autenticar, asyncHandler(c.sessao));

// -------------------------- Documentação OpenAPI --------------------------

registrarRota({
  method: "POST", path: "/v1/auth/login", tag: "Autenticação",
  summary: "Autenticar por e-mail e senha; retorna access + refresh token (RF001)",
  body: loginSchema,
  responses: { "200": "Sessão aberta", "401": "Credenciais inválidas", "429": "Excesso de tentativas" },
});
registrarRota({
  method: "POST", path: "/v1/auth/refresh", tag: "Autenticação",
  summary: "Renovar o access token via refresh token (rotação + detecção de reúso)",
  body: refreshSchema,
  responses: { "200": "Novo par de tokens", "401": "Sessão inválida/expirada" },
});
registrarRota({
  method: "POST", path: "/v1/auth/logout", tag: "Autenticação",
  summary: "Encerrar a sessão do refresh token informado (dispositivo atual)",
  body: refreshSchema,
  responses: { "204": "Sessão encerrada" },
});
registrarRota({
  method: "POST", path: "/v1/auth/logout-todos", tag: "Autenticação",
  summary: "Encerrar todas as sessões do usuário autenticado (offboarding)",
  responses: { "200": "Sessões revogadas", "401": "Não autenticado" },
});
registrarRota({
  method: "GET", path: "/v1/auth/sessao", tag: "Autenticação",
  summary: "Dados do usuário autenticado",
  responses: { "200": "Usuário atual", "401": "Não autenticado" },
});
