import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import * as s from "./inteligencia.service";
import {
  atualizarAtivoSchema,
  criarAtivoSchema,
  criarBigMomentSchema,
  criarCanalSchema,
  criarDisponibilidadeSchema,
  criarEventoAgendaSchema,
  criarEventoTurneSchema,
  criarPerfilSchema,
  criarPracaSchema,
  criarPublicoSchema,
  criarRepresentacaoSchema,
  criarTerritorioSchema,
  criarTurneSchema,
  registrarMedicaoMidiaSchema,
  vincularPracaSchema,
  vincularPublicoSchema,
  vincularTerritorioSchema,
} from "./inteligencia.schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(v: string, m = "Recurso não encontrado") {
  if (!UUID.test(v)) throw new NotFoundError(m);
  return v;
}
function etag(res: Response, corpo: { versao?: string }) {
  if (corpo?.versao) res.setHeader("ETag", `"${corpo.versao}"`);
  return corpo;
}

// RF010
export async function criarPerfil(q: Request, p: Response) { p.status(201).json(await s.criarPerfil(id(q.params.id, "Parte não encontrada"), criarPerfilSchema.parse(q.body), q.usuarioId)); }
export async function listarPerfis(q: Request, p: Response) { p.json({ itens: await s.listarPerfis(id(q.params.id, "Parte não encontrada")) }); }
export async function obterPerfil(q: Request, p: Response) { p.json(await s.obterPerfil(id(q.params.id, "Perfil estratégico não encontrado"))); }
export async function publicarPerfil(q: Request, p: Response) { p.json(await s.publicarPerfil(id(q.params.id, "Perfil estratégico não encontrado"), q.usuarioId)); }

// RF011 catálogos
export async function criarPublico(q: Request, p: Response) { p.status(201).json(await s.criarPublico(criarPublicoSchema.parse(q.body), q.usuarioId)); }
export async function listarPublicos(_q: Request, p: Response) { p.json({ itens: await s.listarPublicos() }); }
export async function criarPraca(q: Request, p: Response) { p.status(201).json(await s.criarPraca(criarPracaSchema.parse(q.body), q.usuarioId)); }
export async function listarPracas(_q: Request, p: Response) { p.json({ itens: await s.listarPracas() }); }
export async function criarTerritorio(q: Request, p: Response) { p.status(201).json(await s.criarTerritorio(criarTerritorioSchema.parse(q.body), q.usuarioId)); }
export async function listarTerritorios(_q: Request, p: Response) { p.json({ itens: await s.listarTerritorios() }); }

// RF011 associações
export async function vincularPublico(q: Request, p: Response) { p.status(201).json(await s.vincularPublico(id(q.params.id, "Parte não encontrada"), vincularPublicoSchema.parse(q.body), q.usuarioId)); }
export async function vincularPraca(q: Request, p: Response) { p.status(201).json(await s.vincularPraca(id(q.params.id, "Parte não encontrada"), vincularPracaSchema.parse(q.body), q.usuarioId)); }
export async function vincularTerritorio(q: Request, p: Response) { p.status(201).json(await s.vincularTerritorio(id(q.params.id, "Parte não encontrada"), vincularTerritorioSchema.parse(q.body), q.usuarioId)); }
export async function listarAssociacoes(q: Request, p: Response) { p.json(await s.listarAssociacoes(id(q.params.id, "Parte não encontrada"))); }
export async function desvincularPublico(q: Request, p: Response) { await s.desvincularPublico(id(q.params.id), id(q.params.publicoId), q.usuarioId); p.status(204).send(); }
export async function desvincularPraca(q: Request, p: Response) { await s.desvincularPraca(id(q.params.id), id(q.params.pracaId), q.usuarioId); p.status(204).send(); }
export async function desvincularTerritorio(q: Request, p: Response) { await s.desvincularTerritorio(id(q.params.id), id(q.params.territorioId), q.usuarioId); p.status(204).send(); }

// RF012
export async function criarAtivo(q: Request, p: Response) { p.status(201).json(etag(p, await s.criarAtivo(id(q.params.id, "Parte não encontrada"), criarAtivoSchema.parse(q.body), q.usuarioId))); }
export async function listarAtivos(q: Request, p: Response) { p.json({ itens: await s.listarAtivos(id(q.params.id, "Parte não encontrada")) }); }
export async function obterAtivo(q: Request, p: Response) { p.json(etag(p, await s.obterAtivo(id(q.params.id, "Ativo não encontrado")))); }
export async function atualizarAtivo(q: Request, p: Response) { p.json(etag(p, await s.atualizarAtivo(id(q.params.id, "Ativo não encontrado"), atualizarAtivoSchema.parse(q.body), exigirIfMatch(q.header("if-match")), q.usuarioId))); }

// RF013
export async function criarCanal(q: Request, p: Response) { p.status(201).json(await s.criarCanal(id(q.params.id, "Parte não encontrada"), criarCanalSchema.parse(q.body), q.usuarioId)); }
export async function listarCanais(q: Request, p: Response) { p.json({ itens: await s.listarCanais(id(q.params.id, "Parte não encontrada")) }); }
export async function registrarMedicaoMidia(q: Request, p: Response) { p.status(201).json(await s.registrarMedicaoMidia(id(q.params.id, "Canal de mídia não encontrado"), registrarMedicaoMidiaSchema.parse(q.body), q.usuarioId)); }
export async function listarMedicoesMidia(q: Request, p: Response) { p.json({ itens: await s.listarMedicoesMidia(id(q.params.id, "Canal de mídia não encontrado")) }); }

// RF014
export async function criarDisponibilidade(q: Request, p: Response) { p.status(201).json(await s.criarDisponibilidade(criarDisponibilidadeSchema.parse(q.body), q.usuarioId)); }
export async function listarDisponibilidadesParte(q: Request, p: Response) { p.json({ itens: await s.listarDisponibilidadesParte(id(q.params.id, "Parte não encontrada")) }); }
export async function listarDisponibilidadesAtivo(q: Request, p: Response) { p.json({ itens: await s.listarDisponibilidadesAtivo(id(q.params.id, "Ativo não encontrado")) }); }

// RF015
export async function criarRepresentacao(q: Request, p: Response) { p.status(201).json(await s.criarRepresentacao(id(q.params.id, "Pessoa não encontrada"), criarRepresentacaoSchema.parse(q.body), q.usuarioId)); }
export async function listarRepresentacoes(q: Request, p: Response) { p.json({ itens: await s.listarRepresentacoes(id(q.params.id, "Pessoa não encontrada")) }); }
export async function criarTurne(q: Request, p: Response) { p.status(201).json(await s.criarTurne(id(q.params.id, "Pessoa não encontrada"), criarTurneSchema.parse(q.body), q.usuarioId)); }
export async function listarTurnes(q: Request, p: Response) { p.json({ itens: await s.listarTurnes(id(q.params.id, "Pessoa não encontrada")) }); }
export async function criarEventoTurne(q: Request, p: Response) { p.status(201).json(await s.criarEventoTurne(id(q.params.id, "Turnê não encontrada"), criarEventoTurneSchema.parse(q.body), q.usuarioId)); }
export async function listarEventosTurne(q: Request, p: Response) { p.json({ itens: await s.listarEventosTurne(id(q.params.id, "Turnê não encontrada")) }); }
export async function criarBigMoment(q: Request, p: Response) { p.status(201).json(await s.criarBigMoment(id(q.params.id, "Pessoa não encontrada"), criarBigMomentSchema.parse(q.body), q.usuarioId)); }
export async function listarBigMoments(q: Request, p: Response) { p.json({ itens: await s.listarBigMoments(id(q.params.id, "Pessoa não encontrada")) }); }
export async function criarEventoAgenda(q: Request, p: Response) { p.status(201).json(await s.criarEventoAgenda(id(q.params.id, "Pessoa não encontrada"), criarEventoAgendaSchema.parse(q.body), q.usuarioId)); }
export async function listarAgenda(q: Request, p: Response) { p.json({ itens: await s.listarAgenda(id(q.params.id, "Pessoa não encontrada")) }); }
