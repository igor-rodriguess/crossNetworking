import { withTransaction } from "../../shared/db";
import { Paginacao } from "../../shared/pagination";
import * as repo from "./agentes.repository";
import { planejarPesquisa } from "./search-planning.agent";
import { coletarFontes } from "./source-collector.agent";
import { avaliarCredibilidade } from "./source-credibility.agent";
import { verificarFatos } from "./fact-verifier.agent";
import { resolverEntidades } from "./entity-resolver.agent";
import type {
  AvaliarCredibilidadeInput,
  ColetaFontesSaida,
  ColetarFontesInput,
  CredibilidadeSaida,
  EntidadesSaida,
  PlanejarPesquisaInput,
  PlanoPesquisa,
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

/** Lista o histórico de execuções de agentes (auditoria). */
export async function listarExecucoes(filtros: { agente?: string }, p: Paginacao) {
  return withTransaction((client) =>
    repo.listarExecucoes(client, { agente: filtros.agente, limit: p.limit, offset: p.offset })
  );
}
