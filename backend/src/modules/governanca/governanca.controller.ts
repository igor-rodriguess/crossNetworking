import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import * as s from "./governanca.service";
import {
  criarEvidenciaSchema,
  criarFonteSchema,
  filtroAuditoriaSchema,
  importarPartesSchema,
  vincularEvidenciaSchema,
} from "./governanca.schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(v: string, m = "Recurso não encontrado") {
  if (!UUID.test(v)) throw new NotFoundError(m);
  return v;
}

// RF048
export async function criarFonte(q: Request, p: Response) { p.status(201).json(await s.criarFonte(criarFonteSchema.parse(q.body), q.usuarioId)); }
export async function listarFontes(_q: Request, p: Response) { p.json({ itens: await s.listarFontes() }); }
export async function criarEvidencia(q: Request, p: Response) { p.status(201).json(await s.criarEvidencia(criarEvidenciaSchema.parse(q.body), q.usuarioId)); }
export async function obterEvidencia(q: Request, p: Response) { p.json(await s.obterEvidencia(id(q.params.id, "Evidência não encontrada"))); }
export async function vincularEvidencia(q: Request, p: Response) { p.status(201).json({ vinculos: await s.vincularEvidencia(id(q.params.id, "Evidência não encontrada"), vincularEvidenciaSchema.parse(q.body), q.usuarioId) }); }

// RF049
export async function consultarAuditoria(q: Request, p: Response) { p.json({ itens: await s.consultarAuditoria(filtroAuditoriaSchema.parse(q.query)) }); }
export async function auditoriaDeRegistro(q: Request, p: Response) { p.json({ itens: await s.auditoriaDeRegistro(q.params.tabela, id(q.params.id)) }); }

// RF050
export async function importarPartes(q: Request, p: Response) { p.status(207).json(await s.importarPartes(importarPartesSchema.parse(q.body), q.usuarioId)); }

// RF051
export async function baseConhecimentoParte(q: Request, p: Response) { p.json(await s.baseConhecimentoParte(id(q.params.id, "Parte não encontrada"))); }
