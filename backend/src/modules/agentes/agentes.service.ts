import { withTransaction } from "../../shared/db";
import { Paginacao } from "../../shared/pagination";
import * as repo from "./agentes.repository";
import { planejarPesquisa } from "./search-planning.agent";
import type { PlanejarPesquisaInput, PlanoPesquisa } from "./agentes.schema";

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

/** Lista o histórico de execuções de agentes (auditoria). */
export async function listarExecucoes(filtros: { agente?: string }, p: Paginacao) {
  return withTransaction((client) =>
    repo.listarExecucoes(client, { agente: filtros.agente, limit: p.limit, offset: p.offset })
  );
}
