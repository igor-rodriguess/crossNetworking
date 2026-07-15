import { withTransaction } from "../../shared/db";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors";
import { parseCriarParte } from "../partes/partes.schema";
import * as partesService from "../partes/partes.service";
import * as r from "./governanca.repository";
import {
  CriarEvidenciaInput,
  CriarFonteInput,
  FiltroAuditoria,
  ImportarPartesInput,
  VincularEvidenciaInput,
} from "./governanca.schema";

// --- RF048 · Fontes e evidências -------------------------------------------

export const criarFonte = (i: CriarFonteInput, u: string | null) =>
  withTransaction((c) => r.inserirFonte(c, i), { usuarioId: u });
export const listarFontes = () => withTransaction(r.listarFontes);

export const criarEvidencia = (i: CriarEvidenciaInput, u: string | null) =>
  withTransaction(async (c) => {
    if (i.fonte_id && !(await r.existeFonte(c, i.fonte_id))) throw new NotFoundError("Fonte não encontrada");
    return r.inserirEvidencia(c, i, u);
  }, { usuarioId: u });

export const obterEvidencia = (id: string) =>
  withTransaction(async (c) => {
    const e = await r.buscarEvidencia(c, id);
    if (!e) throw new NotFoundError("Evidência não encontrada");
    return { ...e, vinculos: await r.listarVinculosEvidencia(c, id) };
  });

export const vincularEvidencia = (id: string, i: VincularEvidenciaInput, u: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.buscarEvidencia(c, id))) throw new NotFoundError("Evidência não encontrada");
    if (!(await r.existeAlvo(c, i.alvo_tipo, i.alvo_id))) {
      throw new NotFoundError(`Alvo ${i.alvo_tipo} não encontrado`);
    }
    await r.vincularEvidencia(c, i.alvo_tipo, i.alvo_id, id, i.relevancia ?? null, i.observacoes ?? null);
    return r.listarVinculosEvidencia(c, id);
  }, { usuarioId: u });

// --- RF049 · Auditoria (somente leitura) ------------------------------------

export const consultarAuditoria = (f: FiltroAuditoria) =>
  withTransaction((c) => r.consultarAuditoria(c, f));

export const auditoriaDeRegistro = (tabela: string, id: string) =>
  withTransaction((c) => r.consultarAuditoria(c, { tabela, registro_id: id, limite: 200 } as FiltroAuditoria));

// --- RF050 · Importação de planilhas ----------------------------------------

/**
 * Importa Partes linha a linha. Cada linha é validada e inserida em sua própria
 * transação, então uma linha inválida não derruba o lote — as rejeitadas são
 * reportadas com o motivo (RF050).
 */
export async function importarPartes(input: ImportarPartesInput, u: string | null) {
  const importados: Array<{ linha: number; id: string }> = [];
  const rejeitados: Array<{ linha: number; erro: string }> = [];

  for (let idx = 0; idx < input.itens.length; idx++) {
    const linha = idx + 1;
    try {
      const dados = parseCriarParte(input.itens[idx]);
      const parte = await partesService.criarParte(dados, u);
      importados.push({ linha, id: parte.id });
    } catch (e) {
      const erro =
        e instanceof ValidationError || e instanceof AppError
          ? e.message
          : e instanceof Error
            ? e.message
            : "erro desconhecido";
      rejeitados.push({ linha, erro });
    }
  }

  return {
    total: input.itens.length,
    importados: importados.length,
    rejeitados: rejeitados.length,
    detalhes_importados: importados,
    detalhes_rejeitados: rejeitados,
  };
}

// --- RF051 · Base de conhecimento para IA -----------------------------------

export const baseConhecimentoParte = (id: string) =>
  withTransaction(async (c) => {
    const base = await r.baseConhecimentoParte(c, id);
    if (!base) throw new NotFoundError("Parte não encontrada");
    return base;
  });
