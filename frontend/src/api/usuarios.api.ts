// API REST de Usuários internos / Equipe & acessos (RF002).
//
// Contrato quase alinhado com a UI: persona tem o mesmo vocabulário
// (estrategista, gestor_contas, coordenador, administrador). Criar/editar
// exige persona administrador no backend.

import { requisitar, requisitarPagina, requisitarVazio, type Pagina } from './client';
import type { Persona, UsuarioInterno } from '../types';

interface UsuarioBackend {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  persona: string | null;
  ativo: boolean;
  criado_em: string;
  versao?: string;
}

const versaoPorId = new Map<string, string>();
export function versaoConhecida(id: string): string | undefined {
  return versaoPorId.get(id);
}

function deBackend(u: UsuarioBackend): UsuarioInterno {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    persona: (u.persona ?? 'estrategista') as Persona,
    ativo: u.ativo,
    criadoEm: u.criado_em?.slice(0, 10) ?? '',
  };
}

export async function listarUsuarios(): Promise<UsuarioInterno[]> {
  const pag: Pagina<UsuarioBackend> = await requisitarPagina('/usuarios', { query: { por_pagina: 100 } });
  for (const u of pag.itens) if (u.versao) versaoPorId.set(u.id, u.versao);
  return pag.itens.map(deBackend);
}

/** Cria um usuário. `senha` é opcional (sem ela, o usuário só loga após definição). */
export async function criarUsuario(dados: {
  nome: string;
  email: string;
  persona: Persona;
  senha?: string;
}): Promise<UsuarioInterno> {
  const criado = await requisitar<UsuarioBackend>('/usuarios', {
    metodo: 'POST',
    corpo: { nome: dados.nome, email: dados.email, persona: dados.persona, senha: dados.senha || undefined },
  });
  if (criado.versao) versaoPorId.set(criado.id, criado.versao);
  return deBackend(criado);
}

/** Atualiza campos do usuário (persona, ativo…) com trava otimista. */
export async function atualizarUsuario(
  id: string,
  mudancas: { persona?: Persona; ativo?: boolean; nome?: string },
): Promise<UsuarioInterno> {
  const versao = versaoPorId.get(id);
  const atualizado = await requisitar<UsuarioBackend>(`/usuarios/${id}`, {
    metodo: 'PATCH',
    corpo: mudancas,
    cabecalhos: versao ? { 'If-Match': `"${versao}"` } : undefined,
  });
  if (atualizado.versao) versaoPorId.set(atualizado.id, atualizado.versao);
  return deBackend(atualizado);
}

/** Inativa (exclusão lógica) um usuário. */
export async function inativarUsuario(id: string): Promise<void> {
  await requisitarVazio(`/usuarios/${id}`, { metodo: 'DELETE' });
  versaoPorId.delete(id);
}
