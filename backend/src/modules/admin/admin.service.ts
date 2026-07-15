import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import { hashSenha } from "../../shared/security/password";
import * as repo from "./admin.repository";
import { AtualizarUsuarioInput, CATALOGOS, CriarUsuarioInput } from "./admin.schema";

// --- Usuários (RF002 — RN006: e-mail único, case-insensitive) --------------

export async function criarUsuario(input: CriarUsuarioInput, usuarioId: string | null) {
  const senhaHash = input.senha ? await hashSenha(input.senha) : null;
  return withTransaction(async (client) => {
    const id = await repo.inserirUsuario(client, input, usuarioId);
    if (senhaHash) await repo.definirCredencial(client, id, senhaHash);
    const criado = await repo.buscarUsuarioPorId(client, id);
    if (!criado) throw new NotFoundError("Falha ao carregar o usuário recém-criado");
    return criado;
  }, { usuarioId });
}

/** Define/redefine a senha do usuário (administrador). */
export async function definirSenha(id: string, senha: string, usuarioId: string | null): Promise<void> {
  const senhaHash = await hashSenha(senha);
  await withTransaction(async (client) => {
    if (!(await repo.existeUsuarioAtivo(client, id))) throw new NotFoundError("Usuário não encontrado");
    await repo.definirCredencial(client, id, senhaHash);
  }, { usuarioId });
}

export async function listarUsuarios(filtros: { busca: string | null; limit: number; offset: number }) {
  return withTransaction((client) => repo.listarUsuarios(client, filtros));
}

export async function obterUsuario(id: string) {
  const row = await withTransaction((client) => repo.buscarUsuarioPorId(client, id));
  if (!row) throw new NotFoundError("Usuário não encontrado");
  return row;
}

export async function atualizarUsuario(
  id: string,
  patch: AtualizarUsuarioInput,
  versao: string,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const afetadas = await repo.atualizarUsuario(client, id, patch, versao);
    if (afetadas === 0) {
      if (!(await repo.existeUsuarioAtivo(client, id))) throw new NotFoundError("Usuário não encontrado");
      throw new ConflictError("O usuário foi modificado por outra operação; recarregue e tente de novo");
    }
    const atualizado = await repo.buscarUsuarioPorId(client, id);
    if (!atualizado) throw new NotFoundError("Usuário não encontrado");
    return atualizado;
  }, { usuarioId });
}

export async function inativarUsuario(id: string, usuarioId: string | null): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.arquivarUsuario(client, id, usuarioId)) === 0) {
      throw new NotFoundError("Usuário não encontrado");
    }
  }, { usuarioId });
}

// --- Catálogos (RN018) -----------------------------------------------------

export async function listarCatalogo(nome: string) {
  const tabela = CATALOGOS[nome];
  if (!tabela) {
    throw new ValidationError(
      `catálogo desconhecido: ${nome}. Disponíveis: ${Object.keys(CATALOGOS).join(", ")}`
    );
  }
  return withTransaction((client) => repo.listarCatalogo(client, tabela));
}
