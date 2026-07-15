import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import * as r from "./inteligencia.repository";
import type {
  AtualizarAtivoInput,
  CriarAtivoInput,
  CriarBigMomentInput,
  CriarCanalInput,
  CriarDisponibilidadeInput,
  CriarEventoAgendaInput,
  CriarEventoTurneInput,
  CriarPerfilInput,
  CriarPracaInput,
  CriarPublicoInput,
  CriarRepresentacaoInput,
  CriarTerritorioInput,
  CriarTurneInput,
  RegistrarMedicaoMidiaInput,
  VincularPracaInput,
  VincularPublicoInput,
  VincularTerritorioInput,
} from "./inteligencia.schema";

type C = PoolClient;
const u = (usuarioId: string | null) => ({ usuarioId });

async function exigirParte(c: C, id: string) {
  if (!(await r.existeParte(c, id))) throw new NotFoundError("Parte não encontrada");
}
async function exigirPessoa(c: C, id: string) {
  if (!(await r.existePessoa(c, id))) throw new NotFoundError("Pessoa (artista) não encontrada");
}

// --- RF010 · Perfil estratégico --------------------------------------------

export const criarPerfil = (id: string, i: CriarPerfilInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.inserirPerfil(c, id, i, usuarioId);
  }, u(usuarioId));

export const listarPerfis = (id: string) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.listarPerfis(c, id);
  });

export const obterPerfil = (id: string) =>
  withTransaction(async (c) => {
    const p = await r.buscarPerfil(c, id);
    if (!p) throw new NotFoundError("Perfil estratégico não encontrado");
    return p;
  });

export const publicarPerfil = (id: string, usuarioId: string | null) =>
  withTransaction(async (c) => {
    const p = await r.buscarPerfil(c, id);
    if (!p) throw new NotFoundError("Perfil estratégico não encontrado");
    return r.publicarPerfil(c, id, p.parte_id);
  }, u(usuarioId));

// --- RF011 · Catálogos ------------------------------------------------------

export const criarPublico = (i: CriarPublicoInput, usuarioId: string | null) =>
  withTransaction((c) => r.inserirPublico(c, i), u(usuarioId));
export const listarPublicos = () => withTransaction(r.listarPublicos);
export const criarPraca = (i: CriarPracaInput, usuarioId: string | null) =>
  withTransaction((c) => r.inserirPraca(c, i), u(usuarioId));
export const listarPracas = () => withTransaction(r.listarPracas);
export const criarTerritorio = (i: CriarTerritorioInput, usuarioId: string | null) =>
  withTransaction((c) => r.inserirTerritorio(c, i), u(usuarioId));
export const listarTerritorios = () => withTransaction(r.listarTerritorios);

// --- RF011 · Associações ----------------------------------------------------

export const vincularPublico = (id: string, i: VincularPublicoInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.vincularPublico(c, id, i);
  }, u(usuarioId));

export const vincularPraca = (id: string, i: VincularPracaInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.vincularPraca(c, id, i);
  }, u(usuarioId));

export const vincularTerritorio = (id: string, i: VincularTerritorioInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.vincularTerritorio(c, id, i);
  }, u(usuarioId));

export const listarAssociacoes = (id: string) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.associacoesDaParte(c, id);
  });

export const desvincularPublico = (id: string, alvo: string, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.arquivarVinculo(c, "parte_publico", id, "publico_id", alvo))) {
      throw new NotFoundError("Associação de público não encontrada");
    }
  }, u(usuarioId));
export const desvincularPraca = (id: string, alvo: string, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.arquivarVinculo(c, "parte_praca", id, "praca_id", alvo))) {
      throw new NotFoundError("Associação de praça não encontrada");
    }
  }, u(usuarioId));
export const desvincularTerritorio = (id: string, alvo: string, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.arquivarVinculo(c, "parte_territorio", id, "territorio_id", alvo))) {
      throw new NotFoundError("Associação de território não encontrada");
    }
  }, u(usuarioId));

// --- RF012 · Ativos ---------------------------------------------------------

export const criarAtivo = (id: string, i: CriarAtivoInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.inserirAtivo(c, id, i, usuarioId);
  }, u(usuarioId));

export const listarAtivos = (id: string) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.listarAtivos(c, id);
  });

export const obterAtivo = (id: string) =>
  withTransaction(async (c) => {
    const a = await r.buscarAtivo(c, id);
    if (!a) throw new NotFoundError("Ativo não encontrado");
    return a;
  });

export const atualizarAtivo = (id: string, patch: AtualizarAtivoInput, versao: string, usuarioId: string | null) =>
  withTransaction(async (c) => {
    // Se veio moeda nova sem valor, ou valor sem moeda, o CHECK do banco protege.
    const afetadas = await r.atualizarAtivo(
      c,
      id,
      {
        nome: patch.nome,
        categoria: patch.categoria,
        descricao: patch.descricao,
        valor_referencia: patch.valor_referencia,
        moeda: patch.moeda,
      },
      versao,
      usuarioId
    );
    if (afetadas === 0) {
      if (!(await r.buscarAtivo(c, id))) throw new NotFoundError("Ativo não encontrado");
      throw new ConflictError("O ativo foi modificado por outra operação; recarregue e tente de novo");
    }
    return r.buscarAtivo(c, id);
  }, u(usuarioId));

// --- RF013 · Canais e medições ---------------------------------------------

export const criarCanal = (id: string, i: CriarCanalInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.inserirCanal(c, id, i);
  }, u(usuarioId));

export const listarCanais = (id: string) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.listarCanais(c, id);
  });

export const registrarMedicaoMidia = (id: string, i: RegistrarMedicaoMidiaInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.existeCanal(c, id))) throw new NotFoundError("Canal de mídia não encontrado");
    const tipo = await r.resolverTipoMetrica(c, i.tipo_metrica_codigo);
    if (!tipo) throw new ValidationError(`tipo_metrica inexistente: ${i.tipo_metrica_codigo}`);
    return r.inserirMedicaoMidia(c, id, i, tipo, usuarioId);
  }, u(usuarioId));

export const listarMedicoesMidia = (id: string) =>
  withTransaction(async (c) => {
    if (!(await r.existeCanal(c, id))) throw new NotFoundError("Canal de mídia não encontrado");
    return r.listarMedicoesMidia(c, id);
  });

// --- RF014 · Disponibilidade ------------------------------------------------

export const criarDisponibilidade = (i: CriarDisponibilidadeInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (i.parte_id && !(await r.existeParte(c, i.parte_id))) throw new NotFoundError("Parte não encontrada");
    if (i.ativo_id && !(await r.existeAtivo(c, i.ativo_id))) throw new NotFoundError("Ativo não encontrado");
    const tipo = await r.resolverTipoDisponibilidade(c, i.tipo_disponibilidade_codigo);
    if (!tipo) throw new ValidationError(`tipo_disponibilidade inexistente: ${i.tipo_disponibilidade_codigo}`);
    return r.inserirDisponibilidade(c, i, tipo);
  }, u(usuarioId));

export const listarDisponibilidadesParte = (id: string) =>
  withTransaction(async (c) => {
    await exigirParte(c, id);
    return r.listarDisponibilidades(c, "parte_id", id);
  });

export const listarDisponibilidadesAtivo = (id: string) =>
  withTransaction(async (c) => {
    if (!(await r.existeAtivo(c, id))) throw new NotFoundError("Ativo não encontrado");
    return r.listarDisponibilidades(c, "ativo_id", id);
  });

// --- RF015 · Artistas -------------------------------------------------------

export const criarRepresentacao = (id: string, i: CriarRepresentacaoInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    if (!(await r.existeParte(c, i.representante_parte_id))) throw new NotFoundError("Parte representante não encontrada");
    return r.inserirRepresentacao(c, id, i);
  }, u(usuarioId));

export const listarRepresentacoes = (id: string) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.listarRepresentacoes(c, id);
  });

export const criarTurne = (id: string, i: CriarTurneInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.inserirTurne(c, id, i);
  }, u(usuarioId));

export const listarTurnes = (id: string) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.listarTurnes(c, id);
  });

export const criarEventoTurne = (id: string, i: CriarEventoTurneInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    if (!(await r.existeTurne(c, id))) throw new NotFoundError("Turnê não encontrada");
    return r.inserirEventoTurne(c, id, i);
  }, u(usuarioId));

export const listarEventosTurne = (id: string) =>
  withTransaction(async (c) => {
    if (!(await r.existeTurne(c, id))) throw new NotFoundError("Turnê não encontrada");
    return r.listarEventosTurne(c, id);
  });

export const criarBigMoment = (id: string, i: CriarBigMomentInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.inserirBigMoment(c, id, i, usuarioId);
  }, u(usuarioId));

export const listarBigMoments = (id: string) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.listarBigMoments(c, id);
  });

export const criarEventoAgenda = (id: string, i: CriarEventoAgendaInput, usuarioId: string | null) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.inserirEventoAgenda(c, id, i);
  }, u(usuarioId));

export const listarAgenda = (id: string) =>
  withTransaction(async (c) => {
    await exigirPessoa(c, id);
    return r.listarAgenda(c, id);
  });
