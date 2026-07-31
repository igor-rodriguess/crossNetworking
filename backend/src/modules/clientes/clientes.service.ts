import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./clientes.repository";
import {
  AtualizarClienteInput,
  AtualizarContratoInput,
  CriarClienteInput,
  CriarComponenteInput,
  CriarContratoInput,
  DefinirModelosInput,
} from "./clientes.schema";

const T = {
  statusCliente: "cross_commercial.status_cliente",
  statusContrato: "cross_commercial.status_contrato",
  modelo: "cross_commercial.modelo_contratacao",
  tipoRemuneracao: "cross_commercial.tipo_remuneracao",
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

async function garantirClienteAtivo(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeClienteAtivo(client, id))) throw new NotFoundError("Cliente não encontrado");
}

async function garantirContratoAtivo(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeContratoAtivo(client, id))) throw new NotFoundError("Contrato não encontrado");
}

// --- Cliente (RF016 — RN007: um vínculo ativo por Parte) -------------------

export async function criarCliente(input: CriarClienteInput, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const statusId = await exigirCodigo(client, T.statusCliente, input.status_cliente_codigo, "status_cliente");
    const id = await repo.inserirCliente(client, input, statusId, usuarioId);
    // A promoção comercial e o papel "cliente" precisam acontecer juntos.
    // Se qualquer etapa falhar, a transação preserva a Parte como ela estava.
    await repo.garantirPapelCliente(client, input.parte_id, usuarioId);
    const criado = await repo.buscarClientePorId(client, id);
    if (!criado) throw new NotFoundError("Falha ao carregar o cliente recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarClientes(filtros: { busca: string | null; limit: number; offset: number }) {
  return withTransaction((client) => repo.listarClientes(client, filtros));
}

export async function obterCliente(id: string) {
  const row = await withTransaction((client) => repo.buscarClientePorId(client, id));
  if (!row) throw new NotFoundError("Cliente não encontrado");
  return row;
}

export async function atualizarCliente(
  id: string,
  patch: AtualizarClienteInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_cliente_codigo
      ? await exigirCodigo(client, T.statusCliente, patch.status_cliente_codigo, "status_cliente")
      : undefined;

    const afetadas = await repo.atualizarCliente(
      client,
      id,
      { ...patch, status_cliente_id: statusId },
      versao
    );
    if (afetadas === 0) {
      await garantirClienteAtivo(client, id);
      throw new ConflictError("O cliente foi modificado por outra operação; recarregue e tente de novo");
    }

    const atualizado = await repo.buscarClientePorId(client, id);
    if (!atualizado) throw new NotFoundError("Cliente não encontrado");
    return atualizado;
  }, { usuarioId });
}

export async function arquivarCliente(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarCliente(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Cliente não encontrado");
    }
  }, { usuarioId });
}

// --- Contratos (RF017 — RN008, RN011, RN030) -------------------------------

export async function criarContrato(
  clienteId: string,
  input: CriarContratoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirClienteAtivo(client, clienteId);
    const statusId = await exigirCodigo(client, T.statusContrato, input.status_contrato_codigo, "status_contrato");
    const id = await repo.inserirContrato(client, clienteId, input, statusId, usuarioId);
    const criado = await repo.buscarContratoPorId(client, id);
    if (!criado) throw new NotFoundError("Falha ao carregar o contrato recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarContratos(clienteId: string) {
  return withTransaction(async (client) => {
    await garantirClienteAtivo(client, clienteId);
    return repo.listarContratosDoCliente(client, clienteId);
  });
}

export async function obterContrato(id: string) {
  return withTransaction(async (client) => {
    const contrato = await repo.buscarContratoPorId(client, id);
    if (!contrato) throw new NotFoundError("Contrato não encontrado");
    return { ...contrato, modelos: await repo.listarModelos(client, id) };
  });
}

export async function atualizarContrato(
  id: string,
  patch: AtualizarContratoInput,
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
      versao
    );
    if (afetadas === 0) {
      await garantirContratoAtivo(client, id);
      throw new ConflictError("O contrato foi modificado por outra operação; recarregue e tente de novo");
    }

    const atualizado = await repo.buscarContratoPorId(client, id);
    if (!atualizado) throw new NotFoundError("Contrato não encontrado");
    return atualizado;
  }, { usuarioId });
}

// --- Modelos de contratação (RF018 — RN009) --------------------------------

export async function definirModelos(
  contratoId: string,
  input: DefinirModelosInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirContratoAtivo(client, contratoId);

    const ids: string[] = [];
    for (const codigo of input.modelos) {
      ids.push(await exigirCodigo(client, T.modelo, codigo, "modelo_contratacao"));
    }

    await repo.substituirModelos(client, contratoId, ids);
    return { modelos: await repo.listarModelos(client, contratoId) };
  }, { usuarioId });
}

// --- Componentes de remuneração (RF018 — RN010) ----------------------------

export async function adicionarComponente(
  contratoId: string,
  input: CriarComponenteInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirContratoAtivo(client, contratoId);
    const tipoId = await exigirCodigo(client, T.tipoRemuneracao, input.tipo_remuneracao_codigo, "tipo_remuneracao");
    const id = await repo.inserirComponente(client, contratoId, input, tipoId, usuarioId);

    const componentes = await repo.listarComponentes(client, contratoId);
    const criado = componentes.find((c) => c.id === id);
    if (!criado) throw new NotFoundError("Falha ao carregar o componente recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarComponentes(contratoId: string) {
  return withTransaction(async (client) => {
    await garantirContratoAtivo(client, contratoId);
    return repo.listarComponentes(client, contratoId);
  });
}

export async function removerComponente(
  contratoId: string,
  componenteId: string,
  usuarioId: string | null
): Promise<void> {
  await withTransaction(async (client) => {
    await garantirContratoAtivo(client, contratoId);
    if ((await repo.arquivarComponente(client, contratoId, componenteId, usuarioId)) === 0) {
      throw new NotFoundError("Componente não encontrado neste contrato");
    }
  }, { usuarioId });
}
