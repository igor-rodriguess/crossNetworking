import { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { Paginacao, envelopePaginado } from "../../shared/pagination";
import * as repo from "./metodologias.repository";
import {
  AplicarAvaliacaoInput,
  CriarAnaliseInput,
  CriarPaperInput,
  CriarValidacaoInput,
  CriarVersaoPaperInput,
  DefinirCriteriosInput,
  RecomendarCandidaturaInput,
  RegistrarDecisaoInput,
} from "./metodologias.schema";

const T = {
  statusCrossability: "cross_methodologies.status_crossability",
  statusPaper: "cross_methodologies.status_paper",
  tipoValidacao: "cross_methodologies.tipo_validacao",
  statusValidacao: "cross_methodologies.status_validacao",
  statusAvaliacao: "cross_methodologies.status_avaliacao_score_card",
  tipoDecisao: "cross_methodologies.tipo_decisao",
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

async function garantirCandidatura(client: PoolClient, id: string): Promise<void> {
  if (!(await repo.existeCandidatura(client, id))) {
    throw new NotFoundError("Candidatura não encontrada");
  }
}

async function garantirPaper(client: PoolClient, id: string) {
  const paper = await repo.buscarPaper(client, id);
  if (!paper) throw new NotFoundError("Paper não encontrado");
  return paper;
}

async function garantirVersaoPaper(client: PoolClient, id: string) {
  const versao = await repo.buscarVersaoPaper(client, id);
  if (!versao) throw new NotFoundError("Versão de Paper não encontrada");
  return versao;
}

async function garantirVersaoModelo(client: PoolClient, id: string) {
  const versao = await repo.buscarVersaoModelo(client, id);
  if (!versao) throw new NotFoundError("Versão de modelo de Score Card não encontrada");
  return versao;
}

// --- Análise Crossability (RF027 — RN019) ----------------------------------

export async function criarAnalise(
  candidaturaId: string,
  input: CriarAnaliseInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    const statusId = await exigirCodigo(
      client,
      T.statusCrossability,
      input.status_crossability_codigo,
      "status_crossability"
    );
    const id = await repo.inserirAnalise(client, candidaturaId, input, statusId, usuarioId);
    return repo.buscarAnalise(client, id);
  }, { usuarioId });
}

export async function listarAnalises(candidaturaId: string) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    return repo.listarAnalises(client, candidaturaId);
  });
}

export async function obterAnalise(id: string) {
  const analise = await withTransaction((client) => repo.buscarAnalise(client, id));
  if (!analise) throw new NotFoundError("Análise Crossability não encontrada");
  return analise;
}

// --- Paper e versões (RF028 — RN021) ---------------------------------------

export async function criarPaper(
  frenteId: string,
  input: CriarPaperInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    if (!(await repo.existeFrente(client, frenteId))) {
      throw new NotFoundError("Frente não encontrada");
    }
    const statusId = await exigirCodigo(client, T.statusPaper, input.status_paper_codigo, "status_paper");
    const id = await repo.inserirPaper(client, frenteId, input, statusId, usuarioId);
    return repo.buscarPaper(client, id);
  }, { usuarioId });
}

export async function listarPapers(frenteId: string) {
  return withTransaction(async (client) => {
    if (!(await repo.existeFrente(client, frenteId))) {
      throw new NotFoundError("Frente não encontrada");
    }
    return repo.listarPapersDaFrente(client, frenteId);
  });
}

export async function obterPaper(id: string) {
  return withTransaction((client) => garantirPaper(client, id));
}

export async function criarVersaoPaper(
  paperId: string,
  input: CriarVersaoPaperInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirPaper(client, paperId);
    const id = await repo.inserirVersaoPaper(client, paperId, input, usuarioId);
    return repo.buscarVersaoPaper(client, id);
  }, { usuarioId });
}

export async function listarVersoesPaper(paperId: string) {
  return withTransaction(async (client) => {
    await garantirPaper(client, paperId);
    return repo.listarVersoesPaper(client, paperId);
  });
}

/** Promove a versão a vigente — no máximo uma por Paper (RN021). */
export async function publicarVersaoPaper(versaoId: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const versao = await garantirVersaoPaper(client, versaoId);
    const publicada = await repo.publicarVersaoPaper(client, versaoId, versao.paper_id);
    if (!publicada) throw new NotFoundError("Versão de Paper não encontrada");
    return publicada;
  }, { usuarioId });
}

// --- Recomendações do Paper (RF029) ----------------------------------------

export async function recomendarCandidatura(
  paperId: string,
  input: RecomendarCandidaturaInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirPaper(client, paperId);
    await garantirCandidatura(client, input.candidatura_parceiro_id);
    await repo.recomendarCandidatura(client, paperId, input);
    return repo.listarRecomendacoes(client, paperId);
  }, { usuarioId });
}

export async function listarRecomendacoes(paperId: string) {
  return withTransaction(async (client) => {
    await garantirPaper(client, paperId);
    return repo.listarRecomendacoes(client, paperId);
  });
}

export async function removerRecomendacao(
  paperId: string,
  candidaturaId: string,
  usuarioId: string | null
): Promise<void> {
  await withTransaction(async (client) => {
    if ((await repo.removerRecomendacao(client, paperId, candidaturaId)) === 0) {
      throw new NotFoundError("Recomendação não encontrada");
    }
  }, { usuarioId });
}

// --- Validação do Paper (RF030 — RN020) ------------------------------------

export async function criarValidacao(
  versaoPaperId: string,
  input: CriarValidacaoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const versao = await garantirVersaoPaper(client, versaoPaperId);

    const tipoId = await exigirCodigo(client, T.tipoValidacao, input.tipo_validacao_codigo, "tipo_validacao");
    const statusId = await exigirCodigo(client, T.statusValidacao, input.status_validacao_codigo, "status_validacao");

    const id = await repo.inserirValidacao(client, versaoPaperId, input, { tipoId, statusId }, usuarioId);

    // Uma validação aprovada promove o Paper a 'validado' — habilita o Score
    // Card (RN022) e a formalização da parceria (RN026).
    if (
      input.status_validacao_codigo === "aprovada" ||
      input.status_validacao_codigo === "aprovada_com_ajustes"
    ) {
      const validado = await exigirCodigo(client, T.statusPaper, "validado", "status_paper");
      await repo.atualizarStatusPaper(client, versao.paper_id, validado, usuarioId);
    } else if (input.status_validacao_codigo === "reprovada") {
      const reprovado = await exigirCodigo(client, T.statusPaper, "reprovado", "status_paper");
      await repo.atualizarStatusPaper(client, versao.paper_id, reprovado, usuarioId);
    }

    return repo.buscarValidacao(client, id);
  }, { usuarioId });
}

export async function listarValidacoes(versaoPaperId: string) {
  return withTransaction(async (client) => {
    await garantirVersaoPaper(client, versaoPaperId);
    return repo.listarValidacoes(client, versaoPaperId);
  });
}

// --- Modelo de Score Card (RF031) ------------------------------------------

export async function criarModelo(
  input: { nome: string; descricao?: string },
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const id = await repo.inserirModelo(client, input.nome, input.descricao ?? null, usuarioId);
    return repo.buscarModelo(client, id);
  }, { usuarioId });
}

export async function listarModelos(p: Paginacao) {
  return withTransaction(async (client) => {
    const { itens, total } = await repo.listarModelos(client, p.limit, p.offset);
    return envelopePaginado(itens, total, p);
  });
}

export async function obterModelo(id: string) {
  return withTransaction(async (client) => {
    const modelo = await repo.buscarModelo(client, id);
    if (!modelo) throw new NotFoundError("Modelo de Score Card não encontrado");
    return { ...modelo, versoes: await repo.listarVersoesModelo(client, id) };
  });
}

export async function criarVersaoModelo(modeloId: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    if (!(await repo.buscarModelo(client, modeloId))) {
      throw new NotFoundError("Modelo de Score Card não encontrado");
    }
    const id = await repo.inserirVersaoModelo(client, modeloId, usuarioId);
    return repo.buscarVersaoModelo(client, id);
  }, { usuarioId });
}

export async function publicarVersaoModelo(versaoId: string, usuarioId: string | null) {
  return withTransaction(async (client) => {
    const versao = await garantirVersaoModelo(client, versaoId);
    if ((await repo.listarCriterios(client, versaoId)).length === 0) {
      throw new ValidationError("A versão precisa de ao menos um critério para entrar em vigência");
    }
    const publicada = await repo.publicarVersaoModelo(client, versaoId, versao.modelo_score_card_id);
    if (!publicada) throw new NotFoundError("Versão de modelo não encontrada");
    return publicada;
  }, { usuarioId });
}

/** Substitui integralmente os critérios da versão — só enquanto em rascunho. */
export async function definirCriterios(
  versaoModeloId: string,
  input: DefinirCriteriosInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    const versao = await garantirVersaoModelo(client, versaoModeloId);
    if (versao.status_versao !== "rascunho") {
      throw new ValidationError(
        "Os critérios só podem ser alterados enquanto a versão está em rascunho; crie uma nova versão"
      );
    }
    const ordens = new Set(input.criterios.map((c) => c.ordem));
    if (ordens.size !== input.criterios.length) {
      throw new ValidationError("Cada critério precisa de uma ordem única");
    }
    return repo.substituirCriterios(client, versaoModeloId, input);
  }, { usuarioId });
}

export async function listarCriterios(versaoModeloId: string) {
  return withTransaction(async (client) => {
    await garantirVersaoModelo(client, versaoModeloId);
    return repo.listarCriterios(client, versaoModeloId);
  });
}

// --- Avaliação Score Card (RF032 — RN022, RN023, RN024) --------------------

/**
 * Motor determinístico do Cross Score Card (RN023): a pontuação de cada
 * critério vem do peso versionado (sim/não/0) e o score total é a soma das
 * pontuações mais o potencial disruptivo. O banco reconfere ambos.
 */
export async function aplicarAvaliacao(
  candidaturaId: string,
  input: AplicarAvaliacaoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    await garantirVersaoModelo(client, input.versao_modelo_score_card_id);

    const validacao = await repo.buscarValidacao(client, input.validacao_paper_id);
    if (!validacao) throw new NotFoundError("Validação de Paper não encontrada");
    if (validacao.status !== "aprovada" && validacao.status !== "aprovada_com_ajustes") {
      throw new ValidationError(
        `A avaliação exige uma validação de Paper aprovada (status atual: ${validacao.status}) — RN022`
      );
    }

    const criterios = await repo.listarCriterios(client, input.versao_modelo_score_card_id);
    if (criterios.length === 0) {
      throw new ValidationError("A versão do modelo não tem critérios definidos");
    }
    const porId = new Map(criterios.map((c) => [c.id, c]));

    // RN024 — exatamente uma resposta por critério
    const respondidos = new Set(input.respostas.map((r) => r.criterio_id));
    if (respondidos.size !== input.respostas.length) {
      throw new ValidationError("Cada critério admite uma única resposta (RN024)");
    }
    for (const r of input.respostas) {
      if (!porId.has(r.criterio_id)) {
        throw new ValidationError(`Critério não pertence à versão do modelo: ${r.criterio_id}`);
      }
    }
    const obrigatoriosFaltando = criterios
      .filter((c) => c.obrigatorio && !respondidos.has(c.id))
      .map((c) => c.nome);
    if (obrigatoriosFaltando.length > 0) {
      throw new ValidationError(
        `Critérios obrigatórios sem resposta: ${obrigatoriosFaltando.join(", ")}`
      );
    }

    const calculadas: repo.RespostaCalculada[] = input.respostas.map((r) => {
      const c = porId.get(r.criterio_id)!;
      const pontuacao = r.valor === "sim" ? c.peso_sim : r.valor === "nao" ? c.peso_nao : 0;
      return {
        criterioId: c.id,
        valor: r.valor,
        pesoSim: c.peso_sim,
        pesoNao: c.peso_nao,
        pontuacao,
        justificativa: r.justificativa ?? null,
      };
    });

    const scoreTotal =
      calculadas.reduce((soma, r) => soma + r.pontuacao, 0) + input.potencial_disruptivo;

    const statusId = await exigirCodigo(
      client,
      T.statusAvaliacao,
      input.status_avaliacao_codigo,
      "status_avaliacao_score_card"
    );

    const id = await repo.inserirAvaliacao(client, candidaturaId, input, scoreTotal, statusId, usuarioId);
    await repo.inserirRespostas(client, id, calculadas);

    return repo.buscarAvaliacao(client, id);
  }, { usuarioId });
}

export async function listarAvaliacoes(candidaturaId: string) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    return repo.listarAvaliacoesDaCandidatura(client, candidaturaId);
  });
}

export async function obterAvaliacao(id: string) {
  const avaliacao = await withTransaction((client) => repo.buscarAvaliacao(client, id));
  if (!avaliacao) throw new NotFoundError("Avaliação de Score Card não encontrada");
  return avaliacao;
}

// --- Decisão (RF033 — RN025) -----------------------------------------------

export async function registrarDecisao(
  candidaturaId: string,
  input: RegistrarDecisaoInput,
  usuarioId: string | null
) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    const tipoId = await exigirCodigo(client, T.tipoDecisao, input.tipo_decisao_codigo, "tipo_decisao");
    const id = await repo.inserirDecisao(client, candidaturaId, input, tipoId, usuarioId);
    return repo.buscarDecisao(client, id);
  }, { usuarioId });
}

export async function listarDecisoes(candidaturaId: string) {
  return withTransaction(async (client) => {
    await garantirCandidatura(client, candidaturaId);
    return repo.listarDecisoes(client, candidaturaId);
  });
}
