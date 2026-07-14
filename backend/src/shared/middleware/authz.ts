import { RequestHandler } from "express";

/**
 * Autorização por persona (WAD 5.1 — Atores). Enquanto a autenticação (RF001)
 * não existe, o middleware é permissivo, mas a estrutura já permite declarar
 * as personas exigidas por rota — quando a auth entrar, basta implementar a
 * checagem aqui, sem tocar nas rotas.
 */
export type Persona = "estrategista" | "gestor_contas" | "coordenador" | "administrador";

export function autorizar(...personas: Persona[]): RequestHandler {
  return (req, _res, next) => {
    // TODO(RF001): validar req.usuario contra as personas exigidas.
    (req as { personasExigidas?: Persona[] }).personasExigidas = personas;
    next();
  };
}
