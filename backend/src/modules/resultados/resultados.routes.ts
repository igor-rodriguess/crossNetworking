import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./resultados.controller";
import { calcularRoiSchema, criarAcompanhamentoSchema, criarIndicadorSchema, encerrarParceriaSchema, encerrarProjetoSchema, registrarMedicaoSchema, registrarResultadoSchema, vincularIndicadorSchema } from "./resultados.schema";

export const resultadosRouter = Router();
const escrita=autorizar("gestor_contas","coordenador","administrador"), leitura=autorizar();
resultadosRouter.post("/parcerias/:id/acompanhamentos",escrita,asyncHandler(c.criarAcompanhamento));
resultadosRouter.get("/parcerias/:id/acompanhamentos",leitura,asyncHandler(c.listarAcompanhamentos));
resultadosRouter.post("/indicadores",escrita,asyncHandler(c.criarIndicador));
resultadosRouter.get("/indicadores",leitura,asyncHandler(c.listarIndicadores));
resultadosRouter.post("/parcerias/:id/indicadores",escrita,asyncHandler(c.vincularIndicador));
resultadosRouter.get("/parcerias/:id/indicadores",leitura,asyncHandler(c.listarIndicadoresParceria));
resultadosRouter.delete("/parcerias/:id/indicadores/:indicadorId",escrita,asyncHandler(c.desvincularIndicador));
resultadosRouter.post("/parcerias/:id/medicoes",escrita,asyncHandler(c.registrarMedicao));
resultadosRouter.get("/parcerias/:id/medicoes",leitura,asyncHandler(c.listarMedicoes));
resultadosRouter.post("/parcerias/:id/resultados",escrita,asyncHandler(c.registrarResultado));
resultadosRouter.get("/parcerias/:id/resultados",leitura,asyncHandler(c.listarResultados));
resultadosRouter.post("/parcerias/:id/calculos-roi",escrita,asyncHandler(c.calcularRoi));
resultadosRouter.get("/parcerias/:id/calculos-roi",leitura,asyncHandler(c.listarRois));
resultadosRouter.get("/calculos-roi/:id",leitura,asyncHandler(c.obterRoi));
resultadosRouter.post("/projetos/:id/encerramento",escrita,asyncHandler(c.encerrarProjeto));
resultadosRouter.get("/projetos/:id/encerramento",leitura,asyncHandler(c.obterEncerramentoProjeto));
resultadosRouter.post("/parcerias/:id/encerramento",escrita,asyncHandler(c.encerrarParceria));
resultadosRouter.get("/parcerias/:id/encerramento",leitura,asyncHandler(c.obterEncerramentoParceria));

const docs: Array<["GET"|"POST"|"DELETE",string,string,string,unknown?]> = [
 ["POST","/v1/parcerias/:id/acompanhamentos","Resultados · Acompanhamento","Registrar acompanhamento",criarAcompanhamentoSchema],
 ["GET","/v1/parcerias/:id/acompanhamentos","Resultados · Acompanhamento","Listar acompanhamentos"],
 ["POST","/v1/indicadores","Resultados · Indicadores","Criar indicador",criarIndicadorSchema],
 ["GET","/v1/indicadores","Resultados · Indicadores","Listar catálogo de indicadores"],
 ["POST","/v1/parcerias/:id/indicadores","Resultados · Indicadores","Vincular indicador e meta à parceria",vincularIndicadorSchema],
 ["GET","/v1/parcerias/:id/indicadores","Resultados · Indicadores","Listar indicadores da parceria"],
 ["DELETE","/v1/parcerias/:id/indicadores/:indicadorId","Resultados · Indicadores","Desvincular indicador da parceria"],
 ["POST","/v1/parcerias/:id/medicoes","Resultados · Indicadores","Registrar medição (RN030/RN036)",registrarMedicaoSchema],
 ["GET","/v1/parcerias/:id/medicoes","Resultados · Indicadores","Listar medições"],
 ["POST","/v1/parcerias/:id/resultados","Resultados","Registrar resultado (RN038)",registrarResultadoSchema],
 ["GET","/v1/parcerias/:id/resultados","Resultados","Listar resultados"],
 ["POST","/v1/parcerias/:id/calculos-roi","Resultados · ROI","Calcular e registrar ROI histórico (RN033/RN039)",calcularRoiSchema],
 ["GET","/v1/parcerias/:id/calculos-roi","Resultados · ROI","Listar histórico de ROI"],
 ["GET","/v1/calculos-roi/:id","Resultados · ROI","Obter cálculo de ROI"],
 ["POST","/v1/projetos/:id/encerramento","Resultados · Encerramento","Encerrar projeto uma única vez (RN034)",encerrarProjetoSchema],
 ["GET","/v1/projetos/:id/encerramento","Resultados · Encerramento","Obter encerramento do projeto"],
 ["POST","/v1/parcerias/:id/encerramento","Resultados · Encerramento","Encerrar parceria uma única vez (RN034)",encerrarParceriaSchema],
 ["GET","/v1/parcerias/:id/encerramento","Resultados · Encerramento","Obter encerramento da parceria"],
];
for(const [method,path,tag,summary,body] of docs) registrarRota({method,path,tag,summary,body:body as never,responses:{"200":"Sucesso","201":"Criado","204":"Removido","404":"Não encontrado","409":"Conflito","422":"Dados inválidos"}});
