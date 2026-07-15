import { withTransaction } from "../../shared/db";
import { NotFoundError, ValidationError } from "../../shared/errors";
import * as r from "./resultados.repository";
import type { CalcularRoiInput, CriarAcompanhamentoInput, CriarIndicadorInput, EncerrarParceriaInput, EncerrarProjetoInput, RegistrarMedicaoInput, RegistrarResultadoInput, VincularIndicadorInput } from "./resultados.schema";

async function exigirParceria(c: Parameters<Parameters<typeof withTransaction>[0]>[0], id: string) { if (!await r.existeParceria(c,id)) throw new NotFoundError("Parceria não encontrada"); }
async function exigirProjeto(c: Parameters<Parameters<typeof withTransaction>[0]>[0], id: string) { if (!await r.existeProjeto(c,id)) throw new NotFoundError("Projeto não encontrado"); }

export const criarAcompanhamento = (id:string,i:CriarAcompanhamentoInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);return r.inserirAcompanhamento(c,id,i,u);},{usuarioId:u});
export const listarAcompanhamentos = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);return r.listarAcompanhamentos(c,id);});
export const criarIndicador = (i:CriarIndicadorInput,u:string|null) => withTransaction(async c=>{const tipo=await r.resolverTipoMetrica(c,i.tipo_metrica_codigo);if(!tipo)throw new ValidationError(`tipo_metrica inexistente: ${i.tipo_metrica_codigo}`);return r.inserirIndicador(c,i,tipo);},{usuarioId:u});
export const listarIndicadores = () => withTransaction(r.listarIndicadores);
export const vincularIndicador = (id:string,i:VincularIndicadorInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);if(!await r.existeIndicador(c,i.indicador_id))throw new NotFoundError("Indicador não encontrado");return r.vincularIndicador(c,id,i);},{usuarioId:u});
export const listarIndicadoresParceria = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);return r.listarIndicadoresParceria(c,id);});
export const desvincularIndicador = (id:string,indicadorId:string,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);if(!await r.desvincularIndicador(c,id,indicadorId))throw new NotFoundError("Vínculo de indicador não encontrado");},{usuarioId:u});
export const registrarMedicao = (id:string,i:RegistrarMedicaoInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);const vinculados=await r.listarIndicadoresParceria(c,id);if(!vinculados.some(x=>x.indicador_id===i.indicador_id))throw new ValidationError("Indicador não está vinculado à parceria");return r.inserirMedicao(c,id,i,u);},{usuarioId:u});
export const listarMedicoes = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);return r.listarMedicoes(c,id);});
export const registrarResultado = (id:string,i:RegistrarResultadoInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);return r.inserirResultado(c,id,i,u);},{usuarioId:u});
export const listarResultados = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);return r.listarResultados(c,id);});
export const calcularRoi = (id:string,i:CalcularRoiInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);const investimento=i.investimento_realizado ?? i.investimento_estimado!;const retorno=i.retorno_realizado ?? i.retorno_estimado!;const roi=investimento===0?null:(retorno-investimento)/investimento;return r.inserirRoi(c,id,i,roi,u);},{usuarioId:u});
export const listarRois = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);return r.listarRois(c,id);});
export const obterRoi = (id:string) => withTransaction(async c=>{const x=await r.buscarRoi(c,id);if(!x)throw new NotFoundError("Cálculo de ROI não encontrado");return x;});
export const encerrarProjeto = (id:string,i:EncerrarProjetoInput,u:string|null) => withTransaction(async c=>{await exigirProjeto(c,id);return r.encerrarProjeto(c,id,i,u);},{usuarioId:u});
export const obterEncerramentoProjeto = (id:string) => withTransaction(async c=>{await exigirProjeto(c,id);const x=await r.buscarEncerramentoProjeto(c,id);if(!x)throw new NotFoundError("Encerramento do projeto não encontrado");return x;});
export const encerrarParceria = (id:string,i:EncerrarParceriaInput,u:string|null) => withTransaction(async c=>{await exigirParceria(c,id);return r.encerrarParceria(c,id,i,u);},{usuarioId:u});
export const obterEncerramentoParceria = (id:string) => withTransaction(async c=>{await exigirParceria(c,id);const x=await r.buscarEncerramentoParceria(c,id);if(!x)throw new NotFoundError("Encerramento da parceria não encontrado");return x;});
