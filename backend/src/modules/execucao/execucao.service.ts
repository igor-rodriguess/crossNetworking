import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./execucao.repository";
import {
  AdicionarParticipanteInput,
  AtribuirResponsavelInput,
  AtualizarEntregaInput,
  AtualizarEtapaInput,
  AtualizarPendenciaInput,
  AtualizarReuniaoInput,
  CriarEntregaInput,
  CriarEtapaInput,
  CriarPendenciaInput,
  CriarPlanoInput,
  CriarReuniaoInput,
  CriarTouchpointInput,
} from "./execucao.schema";

const T = {
  statusExecucao: "cross_execution.status_execucao",
  statusEntrega: "cross_execution.status_entrega",
  statusPendencia: "cross_execution.status_pendencia",
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

async function garantirParceria(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeParceria(client, id))) throw new NotFoundError("Parceria não encontrada");
}

async function garantirPlano(client: PoolClient, id: string) {
  const plano = await repo.buscarPlano(client, id);
  if (!plano) throw new NotFoundError("Plano de execução não encontrado");
  return plano;
}

async function garantirEtapa(client: PoolClient, id: string) {
  const etapa = await repo.buscarEtapa(client, id);
  if (!etapa) throw new NotFoundError("Etapa não encontrada");
  return etapa;
}

async function garantirEntrega(client: PoolClient, id: string) {
  const entrega = await repo.buscarEntrega(client, id);
  if (!entrega) throw new NotFoundError("Entrega não encontrada");
  return entrega;
}

async function garantirReuniao(client: PoolClient, id: string) {
  const reuniao = await repo.buscarReuniao(client, id);
  if (!reuniao) throw new NotFoundError("Reunião não encontrada");
  return reuniao;
}

// --- Plano de execução (RF038 — RN029) -------------------------------------

export async function criarPlano(
  parceriaId: string,
  input: CriarPlanoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const statusId = await exigirCodigo(client, T.statusExecucao, input.status_execucao_codigo, "status_execucao");
    const id = await repo.inserirPlano(client, parceriaId, input, statusId, usuarioId);
    return repo.buscarPlano(client, id);
  }, { usuarioId });
}

export async function listarPlanos(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarPlanos(client, parceriaId);
  });
}

export async function obterPlano(id: string) {
  return withTransaction(async (client) => {
    const plano = await garantirPlano(client, id);
    return { ...plano, etapas: await repo.listarEtapas(client, id) };
  });
}

export async function publicarPlano(id: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const plano = await garantirPlano(client, id);
    const publicado = await repo.publicarPlano(client, id, plano.parceria_id);
    if (!publicado) throw new NotFoundError("Plano de execução não encontrado");
    return publicado;
  }, { usuarioId });
}

// --- Etapa (RF039 — RN030) --------------------------------------------------

export async function criarEtapa(
  planoId: string,
  input: CriarEtapaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirPlano(client, planoId);
    const statusId = await exigirCodigo(client, T.statusExecucao, input.status_execucao_codigo, "status_execucao");
    const id = await repo.inserirEtapa(client, planoId, input, statusId);
    return repo.buscarEtapa(client, id);
  }, { usuarioId });
}

export async function listarEtapas(planoId: string) {
  return withTransaction(async (client) => {
    await garantirPlano(client, planoId);
    return repo.listarEtapas(client, planoId);
  });
}

export async function atualizarEtapa(
  id: string,
  patch: AtualizarEtapaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_execucao_codigo
      ? await exigirCodigo(client, T.statusExecucao, patch.status_execucao_codigo, "status_execucao")
      : undefined;

    const afetadas = await repo.atualizarEtapa(client, id, { ...patch, status_execucao_id: statusId }, versao);
    if (afetadas === 0) {
      await garantirEtapa(client, id);
      throw new ConflictError("A etapa foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarEtapa(client, id);
  }, { usuarioId });
}

export async function arquivarEtapa(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarEtapa(client, id)) === 0) throw new NotFoundError("Etapa não encontrada");
  }, { usuarioId });
}

// --- Entrega (RF040 — RN031) ------------------------------------------------

export async function criarEntrega(
  etapaId: string,
  input: CriarEntregaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirEtapa(client, etapaId);
    const statusId = await exigirCodigo(client, T.statusEntrega, input.status_entrega_codigo, "status_entrega");
    const id = await repo.inserirEntrega(client, etapaId, input, statusId, usuarioId);
    return repo.buscarEntrega(client, id);
  }, { usuarioId });
}

export async function listarEntregas(etapaId: string) {
  return withTransaction(async (client) => {
    await garantirEtapa(client, etapaId);
    return repo.listarEntregas(client, etapaId);
  });
}

export async function obterEntrega(id: string) {
  return withTransaction(async (client) => {
    const entrega = await garantirEntrega(client, id);
    return { ...entrega, responsaveis: await repo.listarResponsaveis(client, id) };
  });
}

export async function atualizarEntrega(
  id: string,
  patch: AtualizarEntregaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_entrega_codigo
      ? await exigirCodigo(client, T.statusEntrega, patch.status_entrega_codigo, "status_entrega")
      : undefined;

    const afetadas = await repo.atualizarEntrega(
      client,
      id,
      { ...patch, status_entrega_id: statusId },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      await garantirEntrega(client, id);
      throw new ConflictError("A entrega foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarEntrega(client, id);
  }, { usuarioId });
}

/** O responsável é interno OU externo — o banco reforça o XOR (RN031). */
export async function atribuirResponsavel(
  entregaId: string,
  input: AtribuirResponsavelInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirEntrega(client, entregaId);
    await repo.atribuirResponsavel(client, entregaId, input);
    return repo.listarResponsaveis(client, entregaId);
  }, { usuarioId });
}

export async function listarResponsaveis(entregaId: string) {
  return withTransaction(async (client) => {
    await garantirEntrega(client, entregaId);
    return repo.listarResponsaveis(client, entregaId);
  });
}

export async function removerResponsavel(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.removerResponsavel(client, id)) === 0) {
      throw new NotFoundError("Responsável não encontrado");
    }
  }, { usuarioId });
}

// --- Reunião, participantes e touchpoint (RF041) ---------------------------

export async function criarReuniao(
  parceriaId: string,
  input: CriarReuniaoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const id = await repo.inserirReuniao(client, parceriaId, input, usuarioId);
    return repo.buscarReuniao(client, id);
  }, { usuarioId });
}

export async function listarReunioes(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarReunioes(client, parceriaId);
  });
}

export async function obterReuniao(id: string) {
  return withTransaction((client) => garantirReuniao(client, id));
}

export async function atualizarReuniao(
  id: string,
  patch: AtualizarReuniaoInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const afetadas = await repo.atualizarReuniao(client, id, patch, versao, usuarioId);
    if (afetadas === 0) {
      await garantirReuniao(client, id);
      throw new ConflictError("A reunião foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarReuniao(client, id);
  }, { usuarioId });
}

export async function adicionarParticipante(
  reuniaoId: string,
  input: AdicionarParticipanteInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirReuniao(client, reuniaoId);
    await repo.adicionarParticipante(client, reuniaoId, input);
    return repo.listarParticipantes(client, reuniaoId);
  }, { usuarioId });
}

export async function removerParticipante(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.removerParticipante(client, id)) === 0) {
      throw new NotFoundError("Participante não encontrado");
    }
  }, { usuarioId });
}

export async function criarTouchpoint(
  parceriaId: string,
  input: CriarTouchpointInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    const id = await repo.inserirTouchpoint(client, parceriaId, input, usuarioId);
    const todos = await repo.listarTouchpoints(client, parceriaId);
    return todos.find((t) => t.id === id) ?? null;
  }, { usuarioId });
}

export async function listarTouchpoints(parceriaId: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarTouchpoints(client, parceriaId);
  });
}

// --- Pendência (RF042 — RN032) ----------------------------------------------

export async function criarPendencia(
  parceriaId: string,
  input: CriarPendenciaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    if (input.etapa_execucao_id) await garantirEtapa(client, input.etapa_execucao_id);
    if (input.entrega_id) await garantirEntrega(client, input.entrega_id);

    const statusId = await exigirCodigo(
      client,
      T.statusPendencia,
      input.status_pendencia_codigo,
      "status_pendencia"
    );
    const id = await repo.inserirPendencia(client, parceriaId, input, statusId, usuarioId);
    return repo.buscarPendencia(client, id);
  }, { usuarioId });
}

export async function listarPendencias(parceriaId: string, status?: string) {
  return withTransaction(async (client) => {
    await garantirParceria(client, parceriaId);
    return repo.listarPendencias(client, parceriaId, status);
  });
}

export async function atualizarPendencia(
  id: string,
  patch: AtualizarPendenciaInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_pendencia_codigo
      ? await exigirCodigo(client, T.statusPendencia, patch.status_pendencia_codigo, "status_pendencia")
      : undefined;

    const afetadas = await repo.atualizarPendencia(
      client,
      id,
      { ...patch, status_pendencia_id: statusId },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      if (!(await repo.buscarPendencia(client, id))) {
        throw new NotFoundError("Pendência não encontrada");
      }
      throw new ConflictError("A pendência foi modificada por outra operação; recarregue e tente de novo");
    }
    return repo.buscarPendencia(client, id);
  }, { usuarioId });
}
