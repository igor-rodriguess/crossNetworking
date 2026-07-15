import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import * as s from "./resultados.service";
import { calcularRoiSchema, criarAcompanhamentoSchema, criarIndicadorSchema, encerrarParceriaSchema, encerrarProjetoSchema, registrarMedicaoSchema, registrarResultadoSchema, vincularIndicadorSchema } from "./resultados.schema";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(v:string,m="Recurso não encontrado"){if(!UUID.test(v))throw new NotFoundError(m);return v;}
export async function criarAcompanhamento(q:Request,p:Response){p.status(201).json(await s.criarAcompanhamento(id(q.params.id,"Parceria não encontrada"),criarAcompanhamentoSchema.parse(q.body),q.usuarioId));}
export async function listarAcompanhamentos(q:Request,p:Response){p.json({itens:await s.listarAcompanhamentos(id(q.params.id,"Parceria não encontrada"))});}
export async function criarIndicador(q:Request,p:Response){p.status(201).json(await s.criarIndicador(criarIndicadorSchema.parse(q.body),q.usuarioId));}
export async function listarIndicadores(_q:Request,p:Response){p.json({itens:await s.listarIndicadores()});}
export async function vincularIndicador(q:Request,p:Response){p.status(201).json(await s.vincularIndicador(id(q.params.id,"Parceria não encontrada"),vincularIndicadorSchema.parse(q.body),q.usuarioId));}
export async function listarIndicadoresParceria(q:Request,p:Response){p.json({itens:await s.listarIndicadoresParceria(id(q.params.id,"Parceria não encontrada"))});}
export async function desvincularIndicador(q:Request,p:Response){await s.desvincularIndicador(id(q.params.id),id(q.params.indicadorId),q.usuarioId);p.status(204).send();}
export async function registrarMedicao(q:Request,p:Response){p.status(201).json(await s.registrarMedicao(id(q.params.id),registrarMedicaoSchema.parse(q.body),q.usuarioId));}
export async function listarMedicoes(q:Request,p:Response){p.json({itens:await s.listarMedicoes(id(q.params.id))});}
export async function registrarResultado(q:Request,p:Response){p.status(201).json(await s.registrarResultado(id(q.params.id),registrarResultadoSchema.parse(q.body),q.usuarioId));}
export async function listarResultados(q:Request,p:Response){p.json({itens:await s.listarResultados(id(q.params.id))});}
export async function calcularRoi(q:Request,p:Response){p.status(201).json(await s.calcularRoi(id(q.params.id),calcularRoiSchema.parse(q.body),q.usuarioId));}
export async function listarRois(q:Request,p:Response){p.json({itens:await s.listarRois(id(q.params.id))});}
export async function obterRoi(q:Request,p:Response){p.json(await s.obterRoi(id(q.params.id)));}
export async function encerrarProjeto(q:Request,p:Response){p.status(201).json(await s.encerrarProjeto(id(q.params.id),encerrarProjetoSchema.parse(q.body),q.usuarioId));}
export async function obterEncerramentoProjeto(q:Request,p:Response){p.json(await s.obterEncerramentoProjeto(id(q.params.id)));}
export async function encerrarParceria(q:Request,p:Response){p.status(201).json(await s.encerrarParceria(id(q.params.id),encerrarParceriaSchema.parse(q.body),q.usuarioId));}
export async function obterEncerramentoParceria(q:Request,p:Response){p.json(await s.obterEncerramentoParceria(id(q.params.id)));}
