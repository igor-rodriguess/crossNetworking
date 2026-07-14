import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./frentes.repository";
import {
  AtualizarFrenteInput,
  CriarCandidaturaInput,
  CriarFrenteInput,
  MovimentarCandidaturaInput,
} from "./frentes.schema";

const T = {
  statusFrente: "cross_projects.status_frente",
  statusCandidatura: "cross_projects.status_candidatura",
  nivelInteresse: "cross_projects.nivel_interesse",
  prioridade: "cross_projects.prioridade",
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

async function garantirFrente(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeFrenteAtiva(client, id))) throw new NotFoundError("Frente não encontrada");
}

async function existeProjeto(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_projects.projeto WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Frente (RF024 — RN014) ------------------------------------------------

export async function criarFrente(
  projetoId: string,
  input: CriarFrenteInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    if (!(await existeProjeto(client, projetoId))) throw new NotFoundError("Projeto não encontrado");

    const statusId = await exigirCodigo(client, T.statusFrente, input.status_frente_codigo, "status_frente");
    const id = await repo.inserirFrente(client, projetoId, input, statusId, usuarioId);

    const criada = await repo.buscarFrentePorId(client, id);
    if (!criada) throw new NotFoundError("Falha ao carregar a frente recém-criada");
    return criada;
  }, { usuarioId });
}

export async function listarFrentes(projetoId: string) {
  return withTransaction(async (client) => {
    if (!(await existeProjeto(client, projetoId))) throw new NotFoundError("Projeto não encontrado");
    return repo.listarFrentesDoProjeto(client, projetoId);
  });
}

export async function obterFrente(id: string) {
  const row = await withTransaction((client) => repo.buscarFrentePorId(client, id));
  if (!row) throw new NotFoundError("Frente não encontrada");
  return row;
}

export async function atualizarFrente(
  id: string,
  patch: AtualizarFrenteInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_frente_codigo
      ? await exigirCodigo(client, T.statusFrente, patch.status_frente_codigo, "status_frente")
      : undefined;

    const afetadas = await repo.atualizarFrente(
      client,
      id,
      { ...patch, status_frente_id: statusId },
      versao
    );
    if (afetadas === 0) {
      await garantirFrente(client, id);
      throw new ConflictError("A frente foi modificada por outra operação; recarregue e tente de novo");
    }

    const atualizada = await repo.buscarFrentePorId(client, id);
    if (!atualizada) throw new NotFoundError("Frente não encontrada");
    return atualizada;
  }, { usuarioId });
}

/** Reabre a frente preservando o histórico (RN014). */
export async function reabrirFrente(id: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    await garantirFrente(client, id);
    const statusId = await exigirCodigo(client, T.statusFrente, "reaberta", "status_frente");
    await repo.reabrirFrente(client, id, statusId);

    const frente = await repo.buscarFrentePorId(client, id);
    if (!frente) throw new NotFoundError("Frente não encontrada");
    return frente;
  }, { usuarioId });
}

// --- Candidatura (RF025 — RN015, RN016) ------------------------------------

export async function criarCandidatura(
  frenteId: string,
  input: CriarCandidaturaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirFrente(client, frenteId);

    const status = await exigirCodigo(client, T.statusCandidatura, input.status_candidatura_codigo, "status_candidatura");
    const interesseCliente = input.interesse_cliente_codigo
      ? await exigirCodigo(client, T.nivelInteresse, input.interesse_cliente_codigo, "nivel_interesse")
      : null;
    const interesseParceiro = input.interesse_parceiro_codigo
      ? await exigirCodigo(client, T.nivelInteresse, input.interesse_parceiro_codigo, "nivel_interesse")
      : null;
    const prioridade = input.prioridade_codigo
      ? await exigirCodigo(client, T.prioridade, input.prioridade_codigo, "prioridade")
      : null;

    const id = await repo.inserirCandidatura(
      client,
      frenteId,
      input,
      { status, interesseCliente, interesseParceiro, prioridade },
      usuarioId
    );

    const criada = await repo.buscarCandidaturaPorId(client, id);
    if (!criada) throw new NotFoundError("Falha ao carregar a candidatura recém-criada");
    return criada;
  }, { usuarioId });
}

export async function listarCandidaturas(frenteId: string) {
  return withTransaction(async (client) => {
    await garantirFrente(client, frenteId);
    return repo.listarCandidaturasDaFrente(client, frenteId);
  });
}

export async function obterCandidatura(id: string) {
  const row = await withTransaction((client) => repo.buscarCandidaturaPorId(client, id));
  if (!row) throw new NotFoundError("Candidatura não encontrada");
  return row;
}

export async function arquivarCandidatura(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarCandidatura(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Candidatura não encontrada");
    }
  }, { usuarioId });
}

// --- Movimentação com histórico (RF026 — RN017) ----------------------------

export async function movimentarCandidatura(
  id: string,
  input: MovimentarCandidaturaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusAnteriorId = await repo.statusAtualDaCandidatura(client, id);
    if (!statusAnteriorId) throw new NotFoundError("Candidatura não encontrada");

    const statusNovoId = await exigirCodigo(client, T.statusCandidatura, input.status_codigo, "status_candidatura");

    await repo.movimentarCandidatura(client, id, {
      statusAnteriorId,
      statusNovoId,
      responsavelId: usuarioId,
      justificativa: input.justificativa ?? null,
      motivoRecusa: input.motivo_recusa ?? null,
      contexto: input.contexto ?? null,
    });

    const atualizada = await repo.buscarCandidaturaPorId(client, id);
    if (!atualizada) throw new NotFoundError("Candidatura não encontrada");
    return atualizada;
  }, { usuarioId });
}

export async function listarMovimentacoes(candidaturaId: string) {
  return withTransaction(async (client) => {
    if (!(await repo.statusAtualDaCandidatura(client, candidaturaId))) {
      throw new NotFoundError("Candidatura não encontrada");
    }
    return repo.listarMovimentacoes(client, candidaturaId);
  });
}
