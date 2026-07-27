import { withTransaction } from "../../shared/db";
import { Paginacao } from "../../shared/pagination";
import * as repo from "./agentes.repository";
import { planejarPesquisa } from "./search-planning.agent";
import { coletarFontes } from "./source-collector.agent";
import { avaliarCredibilidade } from "./source-credibility.agent";
import { verificarFatos } from "./fact-verifier.agent";
import { resolverEntidades } from "./entity-resolver.agent";
import { extrairInformacoes } from "./information-extractor.agent";
import { raciocinarCrossability } from "./crossability-reasoning.agent";
import { recomendarParceiros } from "./recommendation.agent";
import { criarAnalise } from "../metodologias/metodologias.service";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { analiseCrossabilitySchema } from "./agentes.schema";
import type {
  AnaliseCrossabilitySaida,
  AvaliarCredibilidadeInput,
  DecidirHumanGateInput,
  HumanGateSaida,
  ColetaFontesSaida,
  ColetarFontesInput,
  CredibilidadeSaida,
  EntidadesSaida,
  ExtracaoSaida,
  ExtrairInformacoesInput,
  PlanejarPesquisaInput,
  PlanoPesquisa,
  RaciocinarCrossabilityInput,
  RecomendacaoSaida,
  RecomendarParceirosInput,
  ResolverEntidadesInput,
  VerificacaoSaida,
  VerificarFatosInput,
} from "./agentes.schema";

export interface RespostaPlanejamento {
  execucao_id: string;
  origem: "openai" | "mock";
  plano: PlanoPesquisa;
}

/**
 * Executa o Search Planning Agent e registra a execução para auditoria.
 * Grava tanto o sucesso quanto o erro — nenhuma rodada de IA fica sem rastro.
 */
export async function executarPlanejamento(
  input: PlanejarPesquisaInput,
  usuarioId: string | null
): Promise<RespostaPlanejamento> {
  const inicio = Date.now();
  try {
    const { plano, origem, tokens } = await planejarPesquisa(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "search_planning",
        status: "sucesso",
        origem,
        entrada: input,
        saida: plano,
        tokensEntrada: tokens?.entrada ?? 0,
        tokensSaida: tokens?.saida ?? 0,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, origem, plano };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    // Registra o erro (best-effort — não deixa a falha de auditoria mascarar a original).
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "search_planning",
        status: "erro",
        origem: "mock",
        entrada: input,
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaColeta {
  execucao_id: string;
  origem: "firecrawl" | "mock";
  coleta: ColetaFontesSaida;
}

/**
 * Executa o Source Collector e registra a execução para auditoria.
 * Grava sucesso e erro — nenhuma rodada de coleta fica sem rastro.
 */
export async function executarColeta(
  input: ColetarFontesInput,
  usuarioId: string | null
): Promise<RespostaColeta> {
  const inicio = Date.now();
  try {
    const { saida, origem } = await coletarFontes(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "source_collector",
        status: "sucesso",
        origem,
        // Não guardamos o plano inteiro na entrada — só o essencial (evita
        // duplicar dados volumosos). A saída carrega o conteúdo coletado.
        entrada: {
          tem_plano: Boolean(input.plano),
          num_consultas_soltas: input.consultas?.length ?? 0,
          limite_por_consulta: input.limite_por_consulta,
        },
        saida,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, origem, coleta: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "source_collector",
        status: "erro",
        origem: "mock",
        entrada: { tem_plano: Boolean(input.plano), num_consultas_soltas: input.consultas?.length ?? 0 },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaCredibilidade {
  execucao_id: string;
  credibilidade: CredibilidadeSaida;
}

/** Executa o Source Credibility (heurística) e registra para auditoria. */
export async function executarCredibilidade(
  input: AvaliarCredibilidadeInput,
  usuarioId: string | null
): Promise<RespostaCredibilidade> {
  const inicio = Date.now();
  try {
    const { saida } = avaliarCredibilidade(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "source_credibility",
        status: "sucesso",
        origem: "heuristica",
        entrada: {
          tem_coleta: Boolean(input.coleta),
          num_resultados_soltos: input.resultados?.length ?? 0,
        },
        saida,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, credibilidade: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "source_credibility",
        status: "erro",
        origem: "heuristica",
        entrada: { tem_coleta: Boolean(input.coleta) },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaVerificacao {
  execucao_id: string;
  verificacao: VerificacaoSaida;
}

/** Executa o Fact Verifier (heurística) e registra para auditoria. */
export async function executarVerificacao(
  input: VerificarFatosInput,
  usuarioId: string | null
): Promise<RespostaVerificacao> {
  const inicio = Date.now();
  try {
    const { saida } = verificarFatos(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "fact_verifier",
        status: "sucesso",
        origem: "heuristica",
        entrada: { num_afirmacoes: input.afirmacoes.length },
        saida,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, verificacao: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "fact_verifier",
        status: "erro",
        origem: "heuristica",
        entrada: { num_afirmacoes: input.afirmacoes.length },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaEntidades {
  execucao_id: string;
  entidades: EntidadesSaida;
}

/**
 * Executa o Entity Resolver (consulta a base de Partes) e registra para
 * auditoria — tudo na mesma transação, já que o agente lê o banco.
 */
export async function executarResolucaoEntidades(
  input: ResolverEntidadesInput,
  usuarioId: string | null
): Promise<RespostaEntidades> {
  const inicio = Date.now();
  try {
    return await withTransaction(async (client) => {
      const { saida } = await resolverEntidades(client, input);
      const duracaoMs = Date.now() - inicio;
      const execucaoId = await repo.registrarExecucao(client, {
        agente: "entity_resolver",
        status: "sucesso",
        origem: "heuristica",
        entrada: { num_entidades: input.entidades.length, tipo: input.tipo ?? null },
        saida,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      });
      return { execucao_id: execucaoId, entidades: saida };
    });
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "entity_resolver",
        status: "erro",
        origem: "heuristica",
        entrada: { num_entidades: input.entidades.length },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaExtracao {
  execucao_id: string;
  origem: "openai" | "mock";
  extracao: ExtracaoSaida;
}

/** Executa o Information Extractor e registra para auditoria. */
export async function executarExtracao(
  input: ExtrairInformacoesInput,
  usuarioId: string | null
): Promise<RespostaExtracao> {
  const inicio = Date.now();
  try {
    const { saida, origem, tokens } = await extrairInformacoes(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "information_extractor",
        status: "sucesso",
        origem,
        entrada: { num_conteudos: input.conteudos.length, foco: input.foco ?? null },
        saida,
        tokensEntrada: tokens?.entrada ?? 0,
        tokensSaida: tokens?.saida ?? 0,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, origem, extracao: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "information_extractor",
        status: "erro",
        origem: "mock",
        entrada: { num_conteudos: input.conteudos.length },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaReasoning {
  execucao_id: string;
  origem: "openai" | "mock";
  analise: AnaliseCrossabilitySaida;
}

/** Executa o Crossability Reasoning e registra para auditoria. */
export async function executarReasoning(
  input: RaciocinarCrossabilityInput,
  usuarioId: string | null
): Promise<RespostaReasoning> {
  const inicio = Date.now();
  try {
    const { saida, origem, tokens } = await raciocinarCrossability(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "crossability_reasoning",
        status: "sucesso",
        origem,
        entrada: {
          cliente: input.cliente,
          parceiro: input.parceiro,
          objetivo: input.objetivo ?? null,
          candidatura_id: input.candidatura_id ?? null,
        },
        saida,
        tokensEntrada: tokens?.entrada ?? 0,
        tokensSaida: tokens?.saida ?? 0,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, origem, analise: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "crossability_reasoning",
        status: "erro",
        origem: "mock",
        entrada: { cliente: input.cliente, parceiro: input.parceiro },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaRecomendacao {
  execucao_id: string;
  recomendacao: RecomendacaoSaida;
}

/** Executa o Recommendation (heurística de ranking) e registra para auditoria. */
export async function executarRecomendacao(
  input: RecomendarParceirosInput,
  usuarioId: string | null
): Promise<RespostaRecomendacao> {
  const inicio = Date.now();
  try {
    const { saida } = recomendarParceiros(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "recommendation",
        status: "sucesso",
        origem: "heuristica",
        entrada: { num_candidatos: input.candidatos.length },
        saida,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    );

    return { execucao_id: execucaoId, recomendacao: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "recommendation",
        status: "erro",
        origem: "heuristica",
        entrada: { num_candidatos: input.candidatos.length },
        erro: mensagem,
        duracaoMs,
        criadoPorId: usuarioId,
        projetoId: input.projeto_id ?? null,
        frenteId: input.frente_id ?? null,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

/** Converte a análise Crossability do agente (6 dimensões niveladas) no texto
 * que o backend de metodologias persiste (um campo de texto por dimensão). */
function analiseParaTexto(a: AnaliseCrossabilitySaida) {
  const linha = (d: { nivel: string; texto: string }) => `[${d.nivel.toUpperCase()}] ${d.texto}`;
  return {
    compatibilidade_publicos: linha(a.compatibilidade_publicos),
    compatibilidade_territorios: linha(a.compatibilidade_territorios),
    complementaridade_ativos: linha(a.complementaridade_ativos),
    sinergias: linha(a.sinergias),
    fit_estrategico: linha(a.fit_estrategico),
    momento_estrategico: linha(a.momento_estrategico),
    racional_recomendacao: `Recomendação: ${a.recomendacao} (confiança ${a.confianca}%). ${a.racional_recomendacao}`,
    status_crossability_codigo: "em_elaboracao" as const,
  };
}

/**
 * Human Gate — promove (ou rejeita) uma saída de agente para a base real, com
 * decisão humana. Só aqui a IA vira dado de domínio, sempre como RASCUNHO
 * (status em_elaboracao) no fluxo humano existente. Hoje: promove uma análise
 * Crossability para uma candidatura.
 */
export async function decidirHumanGate(
  input: DecidirHumanGateInput,
  usuarioId: string | null
): Promise<HumanGateSaida> {
  const inicio = Date.now();

  // Rejeição: registra a decisão e não escreve nada na base.
  if (input.decisao === "rejeitar") {
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "human_gate",
        status: "sucesso",
        origem: "humano",
        entrada: { execucao_id: input.execucao_id, decisao: "rejeitar", justificativa: input.justificativa ?? null },
        saida: { decisao: "rejeitar", artefato_id: null },
        duracaoMs: Date.now() - inicio,
        criadoPorId: usuarioId,
      })
    );
    return { decisao: "rejeitar", artefato_id: null, mensagem: "Rascunho rejeitado — nada foi escrito na base." };
  }

  // Aprovação: busca a execução, valida e promove.
  if (!input.candidatura_id) {
    throw new ValidationError("candidatura_id é obrigatório para aprovar uma análise.");
  }

  const execucao = await withTransaction((client) => repo.buscarExecucao(client, input.execucao_id));
  if (!execucao) throw new NotFoundError("Execução de agente não encontrada.");
  if (execucao.agente !== "crossability_reasoning") {
    throw new ValidationError(`O Human Gate hoje só promove análises Crossability (execução é '${execucao.agente}').`);
  }

  // A saída da execução é a análise; valida o formato antes de promover.
  const analise = analiseCrossabilitySchema.parse(execucao.saida);
  const artefato = await criarAnalise(input.candidatura_id, analiseParaTexto(analise), usuarioId);
  const artefatoId = (artefato as { id?: string })?.id ?? null;

  // Auditoria da promoção.
  await withTransaction((client) =>
    repo.registrarExecucao(client, {
      agente: "human_gate",
      status: "sucesso",
      origem: "humano",
      entrada: { execucao_id: input.execucao_id, decisao: "aprovar", candidatura_id: input.candidatura_id, justificativa: input.justificativa ?? null },
      saida: { decisao: "aprovar", artefato_id: artefatoId },
      duracaoMs: Date.now() - inicio,
      criadoPorId: usuarioId,
    })
  ).catch(() => undefined);

  return {
    decisao: "aprovar",
    artefato_id: artefatoId,
    mensagem: "Análise Crossability promovida à base como rascunho (em_elaboracao).",
  };
}

/** Lista o histórico de execuções de agentes (auditoria). */
export async function listarExecucoes(filtros: { agente?: string }, p: Paginacao) {
  return withTransaction((client) =>
    repo.listarExecucoes(client, { agente: filtros.agente, limit: p.limit, offset: p.offset })
  );
}
