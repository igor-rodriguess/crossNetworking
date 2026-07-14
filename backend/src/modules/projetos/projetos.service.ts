import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./projetos.repository";
import {
  AtualizarProjetoInput,
  CriarBriefingInput,
  CriarOrigemDemandaInput,
  CriarPlanejamentoInput,
  CriarProjetoInput,
  CriarResponsavelInput,
} from "./projetos.schema";

const T = {
  statusProjeto: "cross_projects.status_projeto",
  prioridade: "cross_projects.prioridade",
  tipoOrigem: "cross_projects.tipo_origem_demanda",
  briefing: "cross_projects.briefing",
  planejamento: "cross_projects.planejamento_estrategico",
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

async function garantirProjeto(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeProjetoAtivo(client, id))) throw new NotFoundError("Projeto não encontrado");
}

// --- Projeto (RF019 — RN012) -----------------------------------------------

export async function criarProjeto(input: CriarProjetoInput, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const statusId = await exigirCodigo(client, T.statusProjeto, input.status_projeto_codigo, "status_projeto");
    const prioridadeId = input.prioridade_codigo
      ? await exigirCodigo(client, T.prioridade, input.prioridade_codigo, "prioridade")
      : null;

    const id = await repo.inserirProjeto(client, input, statusId, prioridadeId, usuarioId);
    const criado = await repo.buscarProjetoPorId(client, id);
    if (!criado) throw new NotFoundError("Falha ao carregar o projeto recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarProjetos(filtros: {
  busca: string | null;
  clienteId: string | null;
  limit: number;
  offset: number;
}) {
  return withTransaction((client) => repo.listarProjetos(client, filtros));
}

export async function obterProjeto(id: string) {
  const row = await withTransaction((client) => repo.buscarProjetoPorId(client, id));
  if (!row) throw new NotFoundError("Projeto não encontrado");
  return row;
}

export async function atualizarProjeto(
  id: string,
  patch: AtualizarProjetoInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const statusId = patch.status_projeto_codigo
      ? await exigirCodigo(client, T.statusProjeto, patch.status_projeto_codigo, "status_projeto")
      : undefined;
    const prioridadeId = patch.prioridade_codigo
      ? await exigirCodigo(client, T.prioridade, patch.prioridade_codigo, "prioridade")
      : undefined;

    const afetadas = await repo.atualizarProjeto(
      client,
      id,
      { ...patch, status_projeto_id: statusId, prioridade_id: prioridadeId },
      versao
    );
    if (afetadas === 0) {
      await garantirProjeto(client, id);
      throw new ConflictError("O projeto foi modificado por outra operação; recarregue e tente de novo");
    }

    const atualizado = await repo.buscarProjetoPorId(client, id);
    if (!atualizado) throw new NotFoundError("Projeto não encontrado");
    return atualizado;
  }, { usuarioId });
}

export async function arquivarProjeto(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarProjeto(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Projeto não encontrado");
    }
  }, { usuarioId });
}

// --- Origem da demanda (RF020) ---------------------------------------------

export async function registrarOrigem(
  projetoId: string,
  input: CriarOrigemDemandaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    const tipoId = await exigirCodigo(client, T.tipoOrigem, input.tipo_origem_demanda_codigo, "tipo_origem_demanda");
    const id = await repo.inserirOrigem(client, projetoId, input, tipoId, usuarioId);

    const origens = await repo.listarOrigens(client, projetoId);
    const criada = origens.find((o) => o.id === id);
    if (!criada) throw new NotFoundError("Falha ao carregar a origem recém-criada");
    return criada;
  }, { usuarioId });
}

export async function listarOrigens(projetoId: string) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    return repo.listarOrigens(client, projetoId);
  });
}

// --- Briefing e planejamento versionados (RF021/RF022 — RN021) -------------

export async function criarBriefing(
  projetoId: string,
  input: CriarBriefingInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    const id = await repo.inserirBriefing(client, projetoId, input, usuarioId);
    const versoes = await repo.listarBriefings(client, projetoId);
    const criada = versoes.find((v) => v.id === id);
    if (!criada) throw new NotFoundError("Falha ao carregar o briefing recém-criado");
    return criada;
  }, { usuarioId });
}

export async function listarBriefings(projetoId: string) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    return repo.listarBriefings(client, projetoId);
  });
}

export async function criarPlanejamento(
  projetoId: string,
  input: CriarPlanejamentoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    const id = await repo.inserirPlanejamento(client, projetoId, input, usuarioId);
    const versoes = await repo.listarPlanejamentos(client, projetoId);
    const criada = versoes.find((v) => v.id === id);
    if (!criada) throw new NotFoundError("Falha ao carregar o planejamento recém-criado");
    return criada;
  }, { usuarioId });
}

export async function listarPlanejamentos(projetoId: string) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    return repo.listarPlanejamentos(client, projetoId);
  });
}

/** Publica a versão como vigente — garante no máximo uma vigente (RN021). */
export async function publicarBriefing(id: string, usuarioId: string | null) {
  return publicarVersao(T.briefing, id, "Briefing", usuarioId);
}

export async function publicarPlanejamento(id: string, usuarioId: string | null) {
  return publicarVersao(T.planejamento, id, "Planejamento", usuarioId);
}

async function publicarVersao(tabela: string, id: string, rotulo: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const versao = await repo.publicarVersaoVigente(client, tabela, id);
    if (!versao) throw new NotFoundError(`${rotulo} não encontrado`);
    return versao;
  }, { usuarioId });
}

// --- Responsáveis (RF023 — RN013: ao menos um responsável ativo) -----------

export async function adicionarResponsavel(
  projetoId: string,
  input: CriarResponsavelInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    const id = await repo.inserirResponsavel(client, projetoId, input);
    const lista = await repo.listarResponsaveis(client, projetoId);
    const criado = lista.find((r) => r.id === id);
    if (!criado) throw new NotFoundError("Falha ao carregar o responsável recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarResponsaveis(projetoId: string) {
  return withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);
    return repo.listarResponsaveis(client, projetoId);
  });
}

export async function removerResponsavel(
  projetoId: string,
  respId: string,
  usuarioId: string | null
): Promise<void> {
  await withTransaction(async (client) => {
    await garantirProjeto(client, projetoId);

    // RN013 — o projeto deve manter ao menos um responsável ativo.
    if ((await repo.contarResponsaveisAtivos(client, projetoId)) <= 1) {
      throw new ConflictError(
        "O projeto deve manter ao menos um responsável ativo (RN013); designe outro antes de remover este"
      );
    }

    if ((await repo.arquivarResponsavel(client, projetoId, respId)) === 0) {
      throw new NotFoundError("Responsável não encontrado neste projeto");
    }
  }, { usuarioId });
}
