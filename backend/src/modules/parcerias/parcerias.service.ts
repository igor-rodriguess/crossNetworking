import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import { Paginacao, envelopePaginado } from "../../shared/pagination";
import * as repo from "./parcerias.repository";
import {
  AtualizarContrapartidaInput,
  AtualizarContratoParceriaInput,
  AtualizarNegociacaoInput,
  AtualizarParceriaInput,
  CriarContrapartidaInput,
  CriarContratoParceriaInput,
  CriarNegociacaoInput,
  FormalizarParceriaInput,
} from "./parcerias.schema";

const T = {
  tipoParceria: "cross_partnerships.tipo_parceria",
  statusParceria: "cross_partnerships.status_parceria",
  statusNegociacao: "cross_partnerships.status_negociacao",
  statusContrato: "cross_commercial.status_contrato",
};

async function exigirCodigo(
  client: PoolClient,
  tabela: string,
  codigo: string,
  rotulo: string
): Promise<string> {
  const id = await repo.resolverCodigo(client, tabela, codigo);
  if (!id) throw new ValidationError(`${rotulo} inexistente: ${codigo}`);
  return id;
}

async function garantirParceria(client: PoolClient, id: string) {
  const parceria = await repo.buscarParceria(client, id);
  if (!parceria) throw new NotFoundError("Parceria não encontrada");
  return parceria;
}

// --- Parceria (RF034 — RN026) ----------------------------------------------

/**
 * Formaliza a parceria a partir da candidatura aprovada. O projeto, a frente,
 * o cliente e a Parte parceira são derivados da própria candidatura — o banco
 * ainda exige decisão aprovada e Paper validado (RN026 / trg_parceria_validar_aprovacao).
 */
export async function formalizarParceria(
  candidaturaId: string,
  input: FormalizarParceriaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const ctx = await repo.contextoDaCandidatura(client, candidaturaId);
    if (!ctx) throw new NotFoundError("Candidatura não encontrada");

    if (await repo.parceriaDaCandidatura(client, candidaturaId)) {
      throw new ConflictError("Esta candidatura já tem uma parceria formalizada");
    }

    const statusId = await exigirCodigo(
      client,
      T.statusParceria,
      input.status_parceria_codigo,
      "status_parceria"
    );
    const tipoId = input.tipo_parceria_codigo
      ? await exigirCodigo(client, T.tipoParceria, input.tipo_parceria_codigo, "tipo_parceria")
      : null;

    const id = await repo.inserirParceria(client, ctx, input, { tipoId, statusId }, usuarioId);
    return repo.buscarParceria(client, id);
  }, { usuarioId });
}

export async function listarParcerias(
  filtros: { projetoId?: string; status?: string },
  p: Paginacao
) {
  return withTransaction(async (client) => {
    const { itens, total } = await repo.listarParcerias(client, filtros, p.limit, p.offset);
    return envelopePaginado(itens, total, p);
  });
}

export async function obterParceria(id: string) {
  return withTransaction((client) => garantirParceria(client, id));
}

export async function atualizarParceria(
  id: string,
  patch: AtualizarParceriaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_parceria_codigo
      ? await exigirCodigo(client, T.statusParceria, patch.status_parceria_codigo, "status_parceria")
      : undefined;
    const tipoId = patch.tipo_parceria_codigo
      ? await exigirCodigo(client, T.tipoParceria, patch.tipo_parceria_codigo, "tipo_parceria")
      : undefined;

    const afetadas = await repo.atualizarParceria(
      client,
      id,
      { ...patch, status_parceria_id: statusId, tipo_parceria_id: tipoId },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      await garantirParceria(client, id);
      throw new ConflictError("A parceria foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarParceria(client, id);
  }, { usuarioId });
}

export async function arquivarParceria(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarParceria(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Parceria não encontrada");
    }
  }, { usuarioId });
}

// --- Negociação (RF035) -----------------------------------------------------

export async function criarNegociacao(
  parceriaId: string,
  input: CriarNegociacaoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const statusId = await exigirCodigo(
      client,
      T.statusNegociacao,
      input.status_negociacao_codigo,
      "status_negociacao"
    );
    const id = await repo.inserirNegociacao(client, parceriaId, input, statusId, usuarioId);
    return repo.buscarNegociacao(client, id);
  }, { usuarioId });
}

export async function listarNegociacoes(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarNegociacoes(client, parceriaId);
  });
}

export async function atualizarNegociacao(
  id: string,
  patch: AtualizarNegociacaoInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_negociacao_codigo
      ? await exigirCodigo(client, T.statusNegociacao, patch.status_negociacao_codigo, "status_negociacao")
      : undefined;

    const afetadas = await repo.atualizarNegociacao(
      client,
      id,
      { ...patch, status_negociacao_id: statusId },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      if (!(await repo.buscarNegociacao(client, id))) {
        throw new NotFoundError("Negociação não encontrada");
      }
      throw new ConflictError("A negociação foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarNegociacao(client, id);
  }, { usuarioId });
}

// --- Contrapartida (RF036 — RN027) -----------------------------------------

export async function criarContrapartida(
  parceriaId: string,
  input: CriarContrapartidaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const id = await repo.inserirContrapartida(client, parceriaId, input, usuarioId);
    return repo.buscarContrapartida(client, id);
  }, { usuarioId });
}

export async function listarContrapartidas(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarContrapartidas(client, parceriaId);
  });
}

export async function atualizarContrapartida(
  id: string,
  patch: AtualizarContrapartidaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const afetadas = await repo.atualizarContrapartida(client, id, patch, versao, usuarioId);
    if (afetadas === 0) {
      if (!(await repo.buscarContrapartida(client, id))) {
        throw new NotFoundError("Contrapartida não encontrada");
      }
      throw new ConflictError("A contrapartida foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarContrapartida(client, id);
  }, { usuarioId });
}

export async function arquivarContrapartida(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarContrapartida(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Contrapartida não encontrada");
    }
  }, { usuarioId });
}

// --- Contrato de parceria (RF037) ------------------------------------------

export async function criarContrato(
  parceriaId: string,
  input: CriarContratoParceriaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const statusId = await exigirCodigo(
      client,
      T.statusContrato,
      input.status_contrato_codigo,
      "status_contrato"
    );
    const id = await repo.inserirContrato(client, parceriaId, input, statusId, usuarioId);
    return repo.buscarContrato(client, id);
  }, { usuarioId });
}

export async function listarContratos(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarContratos(client, parceriaId);
  });
}

export async function atualizarContrato(
  id: string,
  patch: AtualizarContratoParceriaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_contrato_codigo
      ? await exigirCodigo(client, T.statusContrato, patch.status_contrato_codigo, "status_contrato")
      : undefined;

    const afetadas = await repo.atualizarContrato(
      client,
      id,
      { ...patch, status_contrato_id: statusId },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      if (!(await repo.buscarContrato(client, id))) {
        throw new NotFoundError("Contrato de parceria não encontrado");
      }
      throw new ConflictError("O contrato foi modificado por outra operação; recarregue e tente de novo");
    }
    return repo.buscarContrato(client, id);
  }, { usuarioId });
}
