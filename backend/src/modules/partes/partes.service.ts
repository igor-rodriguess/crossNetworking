import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./partes.repository";
import {
  AtualizarContatoInput,
  AtualizarParteInput,
  CriarContatoInput,
  CriarPapelInput,
  CriarParteInput,
} from "./partes.schema";

/** Monta a resposta pública da Parte com a especialização aninhada. */
function formatar(row: repo.ParteRow) {
  const especializacao =
    row.tipo === "organizacao"
      ? {
          nome_fantasia: row.nome_fantasia,
          razao_social: row.razao_social,
          cnpj: row.cnpj,
          segmento_principal: row.segmento_principal,
          site: row.site,
        }
      : {
          nome_completo: row.nome_completo,
          nome_artistico: row.nome_artistico,
          cpf: row.cpf,
          nacionalidade: row.nacionalidade,
        };

  return {
    id: row.id,
    tipo: row.tipo,
    nome_exibicao: row.nome_exibicao,
    status: row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    versao: row.versao,
    especializacao,
  };
}

export type ParteResposta = ReturnType<typeof formatar>;

/** Cria a Parte e sua especialização em uma única transação (RF004/RF005; RN001). */
export async function criarParte(input: CriarParteInput, usuarioId: string | null): Promise<ParteResposta> {
  const row = await withTransaction(async (client) => {
    const statusId = await repo.resolverStatusParteId(client, input.status_parte_codigo);
    if (!statusId) throw new ValidationError(`status_parte inexistente: ${input.status_parte_codigo}`);

    const parteId = await repo.inserirParte(client, {
      tipo: input.tipo,
      nome_exibicao: input.nome_exibicao,
      status_parte_id: statusId,
      criado_por_id: usuarioId,
    });

    if (input.tipo === "organizacao") {
      await repo.inserirOrganizacao(client, parteId, input.organizacao);
    } else {
      await repo.inserirPessoa(client, parteId, input.pessoa);
    }

    const created = await repo.buscarPorId(client, parteId);
    if (!created) throw new NotFoundError("Falha ao carregar a Parte recém-criada");
    return created;
  }, { usuarioId });

  return formatar(row);
}

/** Retorna uma Parte ativa pelo id (RF004). */
export async function obterParte(id: string): Promise<ParteResposta> {
  const row = await withTransaction((client) => repo.buscarPorId(client, id));
  if (!row) throw new NotFoundError("Parte não encontrada");
  return formatar(row);
}

/** Lista as marcas/unidades que pertencem a uma empresa-grupo. */
export async function listarMarcasDoGrupo(parteId: string) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    return repo.listarMarcasDoGrupo(client, parteId);
  });
}

/** Lista Partes com busca e paginação (RF004/RF008). */
export async function listarPartes(filtros: {
  busca: string | null;
  tipo: string | null;
  limit: number;
  offset: number;
}) {
  return withTransaction((client) => repo.listarPartes(client, filtros));
}

/** Atualiza campos base da Parte com controle de concorrência otimista (RF004). */
export async function atualizarParte(
  id: string,
  patch: AtualizarParteInput,
  versaoEsperada: string,
  usuarioId: string | null
): Promise<ParteResposta> {
  const row = await withTransaction(async (client) => {
    let statusId: string | undefined;
    if (patch.status_parte_codigo) {
      const resolved = await repo.resolverStatusParteId(client, patch.status_parte_codigo);
      if (!resolved) throw new ValidationError(`status_parte inexistente: ${patch.status_parte_codigo}`);
      statusId = resolved;
    }

    const afetadas = await repo.atualizarParteBase(
      client,
      id,
      { nome_exibicao: patch.nome_exibicao, status_parte_id: statusId },
      versaoEsperada
    );

    if (afetadas === 0) {
      const existe = await repo.existeParteAtiva(client, id);
      if (!existe) throw new NotFoundError("Parte não encontrada");
      throw new ConflictError("O recurso foi modificado por outra operação; recarregue e tente de novo");
    }

    // Especialização (RF005): só pode tocar a que corresponde ao tipo da Parte.
    if (patch.organizacao || patch.pessoa) {
      const tipo = await repo.tipoDaParte(client, id);
      if (patch.organizacao) {
        if (tipo !== "organizacao") throw new ValidationError("Esta Parte não é uma organização");
        await repo.atualizarOrganizacao(client, id, patch.organizacao);
      }
      if (patch.pessoa) {
        if (tipo !== "pessoa") throw new ValidationError("Esta Parte não é uma pessoa");
        await repo.atualizarPessoa(client, id, patch.pessoa);
      }
    }

    const updated = await repo.buscarPorId(client, id);
    if (!updated) throw new NotFoundError("Parte não encontrada");
    return updated;
  }, { usuarioId });

  return formatar(row);
}

/** Arquivamento lógico da Parte — preserva o histórico (RN035). */
export async function arquivarParte(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const afetadas = await repo.arquivarParte(client, id, usuarioId);
    if (afetadas === 0) throw new NotFoundError("Parte não encontrada");
  }, { usuarioId });
}

async function garantirParteAtiva(client: PoolClient, parteId: string) {
  if (!(await repo.existeParteAtiva(client, parteId))) {
    throw new NotFoundError("Parte não encontrada");
  }
}

// ---------------------------------------------------------------------------
// Papéis (RF006 — RN005: um papel ativo por Parte; RN030: vigências)
// ---------------------------------------------------------------------------

export async function adicionarPapel(
  parteId: string,
  input: CriarPapelInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);

    const papelId = await repo.resolverPapelId(client, input.papel_codigo);
    if (!papelId) throw new ValidationError(`papel inexistente: ${input.papel_codigo}`);

    const vinculoId = await repo.inserirPapelDaParte(client, {
      parte_id: parteId,
      papel_id: papelId,
      vigente_desde: input.vigente_desde ?? null,
      vigente_ate: input.vigente_ate ?? null,
      criado_por_id: usuarioId,
    });

    const criado = await repo.buscarPapelDaParte(client, parteId, vinculoId);
    if (!criado) throw new NotFoundError("Falha ao carregar o papel recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarPapeis(parteId: string) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    return repo.listarPapeisDaParte(client, parteId);
  });
}

export async function removerPapel(parteId: string, vinculoId: string, usuarioId: string | null) {
  await withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    const afetadas = await repo.arquivarPapelDaParte(client, parteId, vinculoId, usuarioId);
    if (afetadas === 0) throw new NotFoundError("Papel não encontrado nesta Parte");
  }, { usuarioId });
}

// ---------------------------------------------------------------------------
// Contatos (RF007 — RN004: no máximo um contato principal ativo)
// ---------------------------------------------------------------------------

export async function adicionarContato(
  parteId: string,
  input: CriarContatoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    const contatoId = await repo.inserirContato(client, parteId, input, usuarioId);
    const criado = await repo.buscarContato(client, parteId, contatoId);
    if (!criado) throw new NotFoundError("Falha ao carregar o contato recém-criado");
    return criado;
  }, { usuarioId });
}

export async function listarContatos(parteId: string) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    return repo.listarContatos(client, parteId);
  });
}

export async function atualizarContato(
  parteId: string,
  contatoId: string,
  patch: AtualizarContatoInput,
  versaoEsperada: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);

    const afetadas = await repo.atualizarContato(client, parteId, contatoId, patch, versaoEsperada);
    if (afetadas === 0) {
      const atual = await repo.buscarContato(client, parteId, contatoId);
      if (!atual) throw new NotFoundError("Contato não encontrado nesta Parte");
      throw new ConflictError("O contato foi modificado por outra operação; recarregue e tente de novo");
    }

    const atualizado = await repo.buscarContato(client, parteId, contatoId);
    if (!atualizado) throw new NotFoundError("Contato não encontrado nesta Parte");
    return atualizado;
  }, { usuarioId });
}

export async function removerContato(parteId: string, contatoId: string, usuarioId: string | null) {
  await withTransaction(async (client) => {
    await garantirParteAtiva(client, parteId);
    const afetadas = await repo.arquivarContato(client, parteId, contatoId, usuarioId);
    if (afetadas === 0) throw new NotFoundError("Contato não encontrado nesta Parte");
  }, { usuarioId });
}
