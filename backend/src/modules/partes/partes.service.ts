import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as repo from "./partes.repository";
import { AtualizarParteInput, CriarParteInput } from "./partes.schema";

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

    const updated = await repo.buscarPorId(client, id);
    if (!updated) throw new NotFoundError("Parte não encontrada");
    return updated;
  }, { usuarioId });

  return formatar(row);
}
