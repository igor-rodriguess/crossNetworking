import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { autorizar } from "../../shared/middleware/authz";
import { registrarRota } from "../../shared/openapi";
import * as c from "./inteligencia.controller";
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

export const inteligenciaRouter = Router();
const escrita = autorizar("estrategista", "coordenador", "administrador");
const leitura = autorizar();

// RF010 · Perfil estratégico versionado
inteligenciaRouter.post("/partes/:id/perfis-estrategicos", escrita, asyncHandler(c.criarPerfil));
inteligenciaRouter.get("/partes/:id/perfis-estrategicos", leitura, asyncHandler(c.listarPerfis));
inteligenciaRouter.get("/perfis-estrategicos/:id", leitura, asyncHandler(c.obterPerfil));
inteligenciaRouter.post("/perfis-estrategicos/:id/vigencia", escrita, asyncHandler(c.publicarPerfil));

// RF011 · Catálogos
inteligenciaRouter.post("/publicos", escrita, asyncHandler(c.criarPublico));
inteligenciaRouter.get("/publicos", leitura, asyncHandler(c.listarPublicos));
inteligenciaRouter.post("/pracas", escrita, asyncHandler(c.criarPraca));
inteligenciaRouter.get("/pracas", leitura, asyncHandler(c.listarPracas));
inteligenciaRouter.post("/territorios", escrita, asyncHandler(c.criarTerritorio));
inteligenciaRouter.get("/territorios", leitura, asyncHandler(c.listarTerritorios));

// RF011 · Associações da Parte
inteligenciaRouter.get("/partes/:id/associacoes", leitura, asyncHandler(c.listarAssociacoes));
inteligenciaRouter.post("/partes/:id/publicos", escrita, asyncHandler(c.vincularPublico));
inteligenciaRouter.delete("/partes/:id/publicos/:publicoId", escrita, asyncHandler(c.desvincularPublico));
inteligenciaRouter.post("/partes/:id/pracas", escrita, asyncHandler(c.vincularPraca));
inteligenciaRouter.delete("/partes/:id/pracas/:pracaId", escrita, asyncHandler(c.desvincularPraca));
inteligenciaRouter.post("/partes/:id/territorios", escrita, asyncHandler(c.vincularTerritorio));
inteligenciaRouter.delete("/partes/:id/territorios/:territorioId", escrita, asyncHandler(c.desvincularTerritorio));

// RF012 · Ativos
inteligenciaRouter.post("/partes/:id/ativos", escrita, asyncHandler(c.criarAtivo));
inteligenciaRouter.get("/partes/:id/ativos", leitura, asyncHandler(c.listarAtivos));
inteligenciaRouter.get("/ativos/:id", leitura, asyncHandler(c.obterAtivo));
inteligenciaRouter.patch("/ativos/:id", escrita, asyncHandler(c.atualizarAtivo));

// RF013 · Canais de mídia e medições
inteligenciaRouter.post("/partes/:id/canais-midia", escrita, asyncHandler(c.criarCanal));
inteligenciaRouter.get("/partes/:id/canais-midia", leitura, asyncHandler(c.listarCanais));
inteligenciaRouter.post("/canais-midia/:id/medicoes", escrita, asyncHandler(c.registrarMedicaoMidia));
inteligenciaRouter.get("/canais-midia/:id/medicoes", leitura, asyncHandler(c.listarMedicoesMidia));

// RF014 · Disponibilidade
inteligenciaRouter.post("/disponibilidades", escrita, asyncHandler(c.criarDisponibilidade));
inteligenciaRouter.get("/partes/:id/disponibilidades", leitura, asyncHandler(c.listarDisponibilidadesParte));
inteligenciaRouter.get("/ativos/:id/disponibilidades", leitura, asyncHandler(c.listarDisponibilidadesAtivo));

// RF015 · Artistas
inteligenciaRouter.post("/pessoas/:id/representacoes", escrita, asyncHandler(c.criarRepresentacao));
inteligenciaRouter.get("/pessoas/:id/representacoes", leitura, asyncHandler(c.listarRepresentacoes));
inteligenciaRouter.post("/pessoas/:id/turnes", escrita, asyncHandler(c.criarTurne));
inteligenciaRouter.get("/pessoas/:id/turnes", leitura, asyncHandler(c.listarTurnes));
inteligenciaRouter.post("/turnes/:id/eventos", escrita, asyncHandler(c.criarEventoTurne));
inteligenciaRouter.get("/turnes/:id/eventos", leitura, asyncHandler(c.listarEventosTurne));
inteligenciaRouter.post("/pessoas/:id/big-moments", escrita, asyncHandler(c.criarBigMoment));
inteligenciaRouter.get("/pessoas/:id/big-moments", leitura, asyncHandler(c.listarBigMoments));
inteligenciaRouter.post("/pessoas/:id/agenda", escrita, asyncHandler(c.criarEventoAgenda));
inteligenciaRouter.get("/pessoas/:id/agenda", leitura, asyncHandler(c.listarAgenda));

// -------------------------- Documentação OpenAPI --------------------------

const docs: Array<["GET" | "POST" | "PATCH" | "DELETE", string, string, string, unknown?]> = [
  ["POST", "/v1/partes/:id/perfis-estrategicos", "Inteligência · Perfil", "Registrar nova versão do perfil estratégico (RN — versionamento)", criarPerfilSchema],
  ["GET", "/v1/partes/:id/perfis-estrategicos", "Inteligência · Perfil", "Listar versões do perfil estratégico da Parte"],
  ["GET", "/v1/perfis-estrategicos/:id", "Inteligência · Perfil", "Obter versão do perfil estratégico"],
  ["POST", "/v1/perfis-estrategicos/:id/vigencia", "Inteligência · Perfil", "Promover a versão a vigente — no máximo uma por Parte (RF010)"],
  ["POST", "/v1/publicos", "Inteligência · Catálogos", "Criar público", criarPublicoSchema],
  ["GET", "/v1/publicos", "Inteligência · Catálogos", "Listar públicos"],
  ["POST", "/v1/pracas", "Inteligência · Catálogos", "Criar praça", criarPracaSchema],
  ["GET", "/v1/pracas", "Inteligência · Catálogos", "Listar praças"],
  ["POST", "/v1/territorios", "Inteligência · Catálogos", "Criar território estratégico", criarTerritorioSchema],
  ["GET", "/v1/territorios", "Inteligência · Catálogos", "Listar territórios"],
  ["GET", "/v1/partes/:id/associacoes", "Inteligência · Associações", "Listar públicos, praças e territórios da Parte"],
  ["POST", "/v1/partes/:id/publicos", "Inteligência · Associações", "Vincular público à Parte (associação ativa única — RF011)", vincularPublicoSchema],
  ["DELETE", "/v1/partes/:id/publicos/:publicoId", "Inteligência · Associações", "Arquivar associação de público (permite recriação — RF011)"],
  ["POST", "/v1/partes/:id/pracas", "Inteligência · Associações", "Vincular praça à Parte", vincularPracaSchema],
  ["DELETE", "/v1/partes/:id/pracas/:pracaId", "Inteligência · Associações", "Arquivar associação de praça"],
  ["POST", "/v1/partes/:id/territorios", "Inteligência · Associações", "Vincular território à Parte", vincularTerritorioSchema],
  ["DELETE", "/v1/partes/:id/territorios/:territorioId", "Inteligência · Associações", "Arquivar associação de território"],
  ["POST", "/v1/partes/:id/ativos", "Inteligência · Ativos", "Cadastrar ativo da Parte (valor + moeda — RN038)", criarAtivoSchema],
  ["GET", "/v1/partes/:id/ativos", "Inteligência · Ativos", "Listar ativos da Parte"],
  ["GET", "/v1/ativos/:id", "Inteligência · Ativos", "Obter ativo"],
  ["PATCH", "/v1/ativos/:id", "Inteligência · Ativos", "Atualizar ativo (exige If-Match)", atualizarAtivoSchema],
  ["POST", "/v1/partes/:id/canais-midia", "Inteligência · Mídia", "Registrar canal de mídia da Parte", criarCanalSchema],
  ["GET", "/v1/partes/:id/canais-midia", "Inteligência · Mídia", "Listar canais de mídia da Parte"],
  ["POST", "/v1/canais-midia/:id/medicoes", "Inteligência · Mídia", "Registrar medição de alcance (histórico, RN036)", registrarMedicaoMidiaSchema],
  ["GET", "/v1/canais-midia/:id/medicoes", "Inteligência · Mídia", "Listar medições do canal"],
  ["POST", "/v1/disponibilidades", "Inteligência · Disponibilidade", "Registrar disponibilidade de Parte OU ativo (nunca ambos — RF014)", criarDisponibilidadeSchema],
  ["GET", "/v1/partes/:id/disponibilidades", "Inteligência · Disponibilidade", "Listar disponibilidades da Parte"],
  ["GET", "/v1/ativos/:id/disponibilidades", "Inteligência · Disponibilidade", "Listar disponibilidades do ativo"],
  ["POST", "/v1/pessoas/:id/representacoes", "Inteligência · Artistas", "Registrar representação artística da pessoa", criarRepresentacaoSchema],
  ["GET", "/v1/pessoas/:id/representacoes", "Inteligência · Artistas", "Listar representações da pessoa"],
  ["POST", "/v1/pessoas/:id/turnes", "Inteligência · Artistas", "Registrar turnê da pessoa", criarTurneSchema],
  ["GET", "/v1/pessoas/:id/turnes", "Inteligência · Artistas", "Listar turnês da pessoa"],
  ["POST", "/v1/turnes/:id/eventos", "Inteligência · Artistas", "Registrar evento de turnê (não existe sem a turnê — RF015)", criarEventoTurneSchema],
  ["GET", "/v1/turnes/:id/eventos", "Inteligência · Artistas", "Listar eventos da turnê"],
  ["POST", "/v1/pessoas/:id/big-moments", "Inteligência · Artistas", "Registrar Big Moment da pessoa", criarBigMomentSchema],
  ["GET", "/v1/pessoas/:id/big-moments", "Inteligência · Artistas", "Listar Big Moments da pessoa"],
  ["POST", "/v1/pessoas/:id/agenda", "Inteligência · Artistas", "Registrar evento de agenda da pessoa", criarEventoAgendaSchema],
  ["GET", "/v1/pessoas/:id/agenda", "Inteligência · Artistas", "Listar a agenda da pessoa"],
];
for (const [method, path, tag, summary, body] of docs)
  registrarRota({
    method,
    path,
    tag,
    summary,
    body: body as never,
    responses: { "200": "Sucesso", "201": "Criado", "204": "Removido", "404": "Não encontrado", "409": "Conflito", "422": "Dados inválidos" },
  });
