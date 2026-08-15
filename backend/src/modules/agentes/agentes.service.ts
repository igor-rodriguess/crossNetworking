import { withTransaction } from "../../shared/db";
import type { PoolClient } from "pg";
import { Paginacao } from "../../shared/pagination";
import * as repo from "./agentes.repository";
import { planejarPesquisa } from "./search-planning.agent";
import { planejarDescobertaDeMercado } from "./market-discovery-planning.agent";
import { coletarFontes } from "./source-collector.agent";
import { avaliarCredibilidade } from "./source-credibility.agent";
import { verificarFatos } from "./fact-verifier.agent";
import { resolverEntidades } from "./entity-resolver.agent";
import { extrairCandidatasExternas, extrairInformacoes } from "./information-extractor.agent";
import { raciocinarCrossability, raciocinarCrossabilityComEvidenciaExterna } from "./crossability-reasoning.agent";
import { recomendarParceiros } from "./recommendation.agent";
import { mapearCsvComIA } from "./csv-mapping.agent";
import { frenteDaLinhaHistorica, lerFunilHistorico, type LinhaFunilHistorico } from "./historical-funnel.agent";
import { enriquecerParteComPesquisa } from "./part-enrichment.agent";
import {
  analisarCandidataDaBase,
  qualificarCandidaturasDaBase,
  validarCandidataExterna,
  type QualificacaoDaBase,
} from "./opportunity-qualification.agent";
import * as ragService from "./rag.service";
import { mapearComLimite } from "./shared/concorrencia";
import { estimarCusto } from "./shared/custo";
import { OrcamentoExecucao } from "./shared/budget";
import { env } from "../../config/env";
import { logger } from "../../shared/logger";
import type { OrigemLLM } from "./shared/llm";
import { criarAnalise } from "../metodologias/metodologias.service";
import { criarParte, adicionarContato, adicionarPapel, obterParte } from "../partes/partes.service";
import { criarCliente } from "../clientes/clientes.service";
import { criarProjeto } from "../projetos/projetos.service";
import { criarFrente, criarCandidatura } from "../frentes/frentes.service";
import { criarAtivo, criarCanal, criarPerfil } from "../inteligencia/inteligencia.service";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { analiseCrossabilitySchema, pipelineSaidaSchema } from "./agentes.schema";
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
  ExecutarPartnerDiscoveryInput,
  ExecutarMarketIntelligenceInput,
  GerarOportunidadesInput,
  PipelineSaida,
  PersistirOportunidadesInput,
  AnalisarImportacaoCsvInput,
  ConfirmarImportacaoCsvInput,
  AnalisarFunilHistoricoInput,
  ConfirmarFunilHistoricoInput,
  EnriquecerParteInput,
  EntidadeImportacaoCsv,
} from "./agentes.schema";

export interface RespostaPlanejamento {
  execucao_id: string;
  origem: OrigemLLM;
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
  origem: "duckduckgo" | "firecrawl" | "mock";
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
  origem: OrigemLLM;
  fonteConteudo?: "firecrawl" | "mock";
  extracao: ExtracaoSaida;
}

/** Executa o Information Extractor e registra para auditoria. */
export async function executarExtracao(
  input: ExtrairInformacoesInput,
  usuarioId: string | null
): Promise<RespostaExtracao> {
  const inicio = Date.now();
  try {
    const { saida, origem, tokens, fonteConteudo } = await extrairInformacoes(input);
    const duracaoMs = Date.now() - inicio;

    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "information_extractor",
        status: "sucesso",
        origem,
        entrada: {
          num_conteudos: input.conteudos?.length ?? 0,
          num_urls: input.urls?.length ?? 0,
          tem_coleta: Boolean(input.coleta),
          fonte_conteudo: fonteConteudo ?? null,
          foco: input.foco ?? null,
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

    return { execucao_id: execucaoId, origem, fonteConteudo, extracao: saida };
  } catch (erro) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "information_extractor",
        status: "erro",
        origem: "mock",
        entrada: { num_conteudos: input.conteudos?.length ?? 0, num_urls: input.urls?.length ?? 0 },
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

/** Pesquisa uma Parte específica e devolve apenas uma sugestão curável. */
export async function enriquecerParte(
  parteId: string,
  input: EnriquecerParteInput,
  usuarioId: string | null
) {
  const inicio = Date.now();
  const parte = await obterParte(parteId);
  try {
    const resultado = await enriquecerParteComPesquisa(parte.nome_exibicao, input.limite_fontes);
    const execucaoId = await withTransaction((client) => repo.registrarExecucao(client, {
      agente: "part_enrichment",
      status: "sucesso",
      origem: resultado.origem_busca,
      entrada: { parte_id: parteId, nome: parte.nome_exibicao, limite_fontes: input.limite_fontes },
      saida: resultado,
      duracaoMs: Date.now() - inicio,
      criadoPorId: usuarioId,
    }));
    return { execucao_id: execucaoId, ...resultado };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await withTransaction((client) => repo.registrarExecucao(client, {
      agente: "part_enrichment",
      status: "erro",
      origem: "mock",
      entrada: { parte_id: parteId, nome: parte.nome_exibicao, limite_fontes: input.limite_fontes },
      erro: mensagem,
      duracaoMs: Date.now() - inicio,
      criadoPorId: usuarioId,
    })).catch(() => undefined);
    throw erro;
  }
}

export interface RespostaReasoning {
  execucao_id: string;
  origem: OrigemLLM;
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

// --- Importação assistida de CSV --------------------------------------------

export async function analisarImportacaoCsv(input: AnalisarImportacaoCsvInput, usuarioId: string | null) {
  const inicio = Date.now();
  try {
    const resultado = await mapearCsvComIA(input);
    const execucaoId = await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "csv_mapping",
        status: "sucesso",
        origem: resultado.origem,
        entrada: { entidade: input.entidade, cabecalhos: input.cabecalhos, linhas_amostra: input.amostra.length },
        saida: resultado.mapeamento,
        tokensEntrada: resultado.tokens?.entrada ?? 0,
        tokensSaida: resultado.tokens?.saida ?? 0,
        duracaoMs: Date.now() - inicio,
        criadoPorId: usuarioId,
      })
    );
    return { execucao_id: execucaoId, origem: resultado.origem, mapeamento: resultado.mapeamento };
  } catch (erro) {
    await withTransaction((client) =>
      repo.registrarExecucao(client, {
        agente: "csv_mapping",
        status: "erro",
        origem: "mock",
        entrada: { entidade: input.entidade, cabecalhos: input.cabecalhos, linhas_amostra: input.amostra.length },
        erro: erro instanceof Error ? erro.message : String(erro),
        duracaoMs: Date.now() - inicio,
        criadoPorId: usuarioId,
      })
    ).catch(() => undefined);
    throw erro;
  }
}

type LinhaImportada = { linha: number; id?: string; mensagem?: string };

function valor(linha: Record<string, string>, mapeamento: Map<string, string>, campo: string): string {
  const coluna = mapeamento.get(campo);
  return coluna ? (linha[coluna] ?? "").trim() : "";
}

function tipoDaLinha(valorBruto: string): "organizacao" | "pessoa" | null {
  const v = valorBruto.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!v || ["organizacao", "empresa", "marca", "organizacao"].includes(v)) return "organizacao";
  if (["pessoa", "pf", "talento", "artista", "atleta"].includes(v)) return "pessoa";
  return null;
}

function papelDaLinha(valorBruto: string): string | null {
  const v = valorBruto.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
  if (!v) return null;
  const apelidos: Record<string, string> = {
    parceiro_potencial: "parceiro",
    parceiro: "parceiro",
    veiculo_de_midia: "veiculo_midia",
    veiculo_midia: "veiculo_midia",
  };
  const codigo = apelidos[v] ?? v;
  return ["cliente", "parceiro", "patrocinador", "fornecedor", "agencia", "produtora", "gravadora", "veiculo_midia", "artista", "influenciador", "atleta", "especialista", "personalidade"].includes(codigo)
    ? codigo
    : null;
}

function dataCsv(valorBruto: string): string | undefined {
  const v = valorBruto.trim();
  if (!v) return undefined;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  throw new ValidationError("data inválida; use DD/MM/AAAA ou AAAA-MM-DD");
}

function numeroCsv(valorBruto: string, rotulo: string): number | undefined {
  const bruto = valorBruto.trim();
  if (!bruto) return undefined;
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const numero = Number(normalizado.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numero)) throw new ValidationError(`${rotulo} deve ser numérico`);
  return numero;
}

function booleanoCsv(valorBruto: string): boolean | undefined {
  const v = valorBruto.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!v) return undefined;
  if (["sim", "s", "true", "1", "yes", "y"].includes(v)) return true;
  if (["nao", "n", "false", "0", "no"].includes(v)) return false;
  throw new ValidationError("disponibilidade_confirmada deve ser sim ou não");
}

async function jaExisteParte(nome: string): Promise<boolean> {
  return withTransaction((client) => repo.existePartePorNomeExato(client, nome));
}

async function importarParte(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const nome = valor(linha, mapa, "nome");
  if (!nome) throw new ValidationError("nome é obrigatório");
  if (await jaExisteParte(nome)) throw new ValidationError("já existe uma Parte ativa com este nome");
  const tipo = tipoDaLinha(valor(linha, mapa, "tipo"));
  if (!tipo) throw new ValidationError("tipo inválido; use organização ou pessoa");
  const categoria = valor(linha, mapa, "categoria");
  const criada = await criarParte(
    tipo === "organizacao"
      ? {
          tipo,
          nome_exibicao: nome,
          status_parte_codigo: "ativa",
          organizacao: {
            nome_fantasia: nome,
            razao_social: valor(linha, mapa, "razao_social") || undefined,
            cnpj: valor(linha, mapa, "cnpj").replace(/\D/g, "") || undefined,
            segmento_principal: categoria || undefined,
            site: valor(linha, mapa, "site") || undefined,
          },
        }
      : {
          tipo,
          nome_exibicao: nome,
          status_parte_codigo: "ativa",
          pessoa: {
            nome_completo: nome,
            nome_artistico: valor(linha, mapa, "nome_artistico") || undefined,
            cpf: valor(linha, mapa, "cpf").replace(/\D/g, "") || undefined,
            nacionalidade: valor(linha, mapa, "nacionalidade") || categoria || undefined,
          },
        },
    usuarioId
  );
  const papel = papelDaLinha(valor(linha, mapa, "papel"));
  if (valor(linha, mapa, "papel") && !papel) throw new ValidationError("papel não reconhecido");
  if (papel) await adicionarPapel(criada.id, { papel_codigo: papel }, usuarioId);
  const nomeContato = valor(linha, mapa, "contato_nome");
  if (nomeContato) {
    await adicionarContato(criada.id, {
      nome: nomeContato,
      cargo: valor(linha, mapa, "contato_cargo") || undefined,
      email: valor(linha, mapa, "contato_email") || undefined,
      telefone: valor(linha, mapa, "contato_telefone") || undefined,
      principal: true,
    }, usuarioId);
  }
  return criada.id;
}

async function importarCliente(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const nome = valor(linha, mapa, "nome");
  if (!nome) throw new ValidationError("nome é obrigatório");
  if (await jaExisteParte(nome)) throw new ValidationError("já existe uma Parte ativa com este nome");
  const criada = await criarParte({
    tipo: "organizacao",
    nome_exibicao: nome,
    status_parte_codigo: "ativa",
    organizacao: {
      nome_fantasia: nome,
      segmento_principal: valor(linha, mapa, "segmento") || undefined,
      site: valor(linha, mapa, "site") || undefined,
    },
  }, usuarioId);
  const cliente = await criarCliente({
    parte_id: criada.id,
    status_cliente_codigo: "ativo",
    inicio_relacionamento: dataCsv(valor(linha, mapa, "inicio_relacionamento")),
    observacoes: valor(linha, mapa, "observacoes") || undefined,
  }, usuarioId);
  await adicionarPapel(criada.id, { papel_codigo: "cliente" }, usuarioId);
  return cliente.id;
}

async function importarProjeto(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const clienteNome = valor(linha, mapa, "cliente");
  const nome = valor(linha, mapa, "nome");
  const objetivo = valor(linha, mapa, "objetivo");
  if (!clienteNome) throw new ValidationError("cliente é obrigatório");
  if (!nome) throw new ValidationError("nome é obrigatório");
  if (!objetivo) throw new ValidationError("objetivo é obrigatório");
  const clienteId = await withTransaction((client) => repo.buscarClienteIdPorNomeExato(client, clienteNome));
  if (!clienteId) throw new ValidationError(`cliente '${clienteNome}' não encontrado na plataforma`);
  const projeto = await criarProjeto({
    cliente_cross_id: clienteId,
    nome,
    objetivo,
    descricao: valor(linha, mapa, "descricao") || undefined,
    produto: valor(linha, mapa, "produto") || undefined,
    data_inicio: dataCsv(valor(linha, mapa, "data_inicio")),
    data_previsao_fim: dataCsv(valor(linha, mapa, "data_previsao_fim")),
    prioridade_codigo: valor(linha, mapa, "prioridade") || undefined,
    status_projeto_codigo: valor(linha, mapa, "status") || "rascunho",
  }, usuarioId);
  return projeto.id;
}

async function importarFrente(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const cliente = valor(linha, mapa, "cliente");
  const projeto = valor(linha, mapa, "projeto");
  const nome = valor(linha, mapa, "nome");
  const objetivo = valor(linha, mapa, "objetivo");
  if (!cliente || !projeto || !nome || !objetivo) throw new ValidationError("cliente, projeto, nome e objetivo são obrigatórios");
  const projetoId = await withTransaction((c) => repo.buscarProjetoIdPorNomes(c, cliente, projeto));
  if (!projetoId) throw new ValidationError(`projeto '${projeto}' do cliente '${cliente}' não encontrado`);
  const criada = await criarFrente(projetoId, {
    nome,
    objetivo,
    descricao: valor(linha, mapa, "descricao") || undefined,
    categoria: valor(linha, mapa, "categoria") || undefined,
    data_abertura: dataCsv(valor(linha, mapa, "data_abertura")),
    data_encerramento: dataCsv(valor(linha, mapa, "data_encerramento")),
    status_frente_codigo: valor(linha, mapa, "status") || "aberta",
  }, usuarioId);
  return criada.id;
}

async function importarCandidatura(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const cliente = valor(linha, mapa, "cliente");
  const projeto = valor(linha, mapa, "projeto");
  const frente = valor(linha, mapa, "frente");
  const parte = valor(linha, mapa, "parte");
  if (!cliente || !projeto || !frente || !parte) throw new ValidationError("cliente, projeto, frente e parte são obrigatórios");
  const [frenteId, parteId] = await withTransaction(async (c) => Promise.all([
    repo.buscarFrenteIdPorNomes(c, cliente, projeto, frente),
    repo.buscarParteIdPorNomeExato(c, parte),
  ]));
  if (!frenteId) throw new ValidationError(`frente '${frente}' do projeto '${projeto}' não encontrada`);
  if (!parteId) throw new ValidationError(`Parte '${parte}' não encontrada`);
  const criada = await criarCandidatura(frenteId, {
    parte_id: parteId,
    interesse_cliente_codigo: valor(linha, mapa, "interesse_cliente") || undefined,
    interesse_parceiro_codigo: valor(linha, mapa, "interesse_parceiro") || undefined,
    prioridade_codigo: valor(linha, mapa, "prioridade") || undefined,
    disponibilidade_confirmada: booleanoCsv(valor(linha, mapa, "disponibilidade_confirmada")),
    observacoes: valor(linha, mapa, "observacoes") || undefined,
    status_candidatura_codigo: valor(linha, mapa, "status") || "identificada",
  }, usuarioId);
  return criada.id;
}

async function importarAtivo(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const parte = valor(linha, mapa, "parte");
  const nome = valor(linha, mapa, "nome");
  if (!parte || !nome) throw new ValidationError("parte e nome são obrigatórios");
  const parteId = await withTransaction((c) => repo.buscarParteIdPorNomeExato(c, parte));
  if (!parteId) throw new ValidationError(`Parte '${parte}' não encontrada`);
  const valorReferencia = numeroCsv(valor(linha, mapa, "valor_referencia"), "valor_referencia");
  const moeda = valor(linha, mapa, "moeda").toUpperCase();
  if (valorReferencia !== undefined && !moeda) throw new ValidationError("moeda é obrigatória quando houver valor de referência");
  const criado = await criarAtivo(parteId, {
    nome,
    categoria: valor(linha, mapa, "categoria") || undefined,
    descricao: valor(linha, mapa, "descricao") || undefined,
    valor_referencia: valorReferencia,
    moeda: moeda || undefined,
  }, usuarioId);
  return criado.id;
}

async function importarCanal(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const parte = valor(linha, mapa, "parte");
  const plataforma = valor(linha, mapa, "plataforma");
  if (!parte || !plataforma) throw new ValidationError("parte e plataforma são obrigatórios");
  const parteId = await withTransaction((c) => repo.buscarParteIdPorNomeExato(c, parte));
  if (!parteId) throw new ValidationError(`Parte '${parte}' não encontrada`);
  const criado = await criarCanal(parteId, {
    plataforma,
    identificador: valor(linha, mapa, "identificador") || undefined,
    url: valor(linha, mapa, "url") || undefined,
  }, usuarioId);
  return criado.id;
}

async function importarPerfilEstrategico(linha: Record<string, string>, mapa: Map<string, string>, usuarioId: string | null) {
  const parte = valor(linha, mapa, "parte");
  if (!parte) throw new ValidationError("parte é obrigatória");
  const parteId = await withTransaction((c) => repo.buscarParteIdPorNomeExato(c, parte));
  if (!parteId) throw new ValidationError(`Parte '${parte}' não encontrada`);
  const criado = await criarPerfil(parteId, {
    resumo: valor(linha, mapa, "resumo") || undefined,
    posicionamento: valor(linha, mapa, "posicionamento") || undefined,
    objetivos: valor(linha, mapa, "objetivos") || undefined,
    desafios: valor(linha, mapa, "desafios") || undefined,
  }, usuarioId);
  return criado.id;
}

/** Confirma a prévia e cria somente linhas válidas. Erros por linha não anulam
 * as demais, retornam para correção e ficam explícitos no resultado. */
export async function confirmarImportacaoCsv(input: ConfirmarImportacaoCsvInput, usuarioId: string | null) {
  const mapeamento = new Map<string, string>(input.mapeamento.campos.map((item) => [item.campo_destino, item.coluna_origem]));
  const obrigatorios: Record<EntidadeImportacaoCsv, string[]> = {
    partes: ["nome"],
    clientes: ["nome"],
    projetos: ["cliente", "nome", "objetivo"],
    frentes: ["cliente", "projeto", "nome", "objetivo"],
    candidaturas: ["cliente", "projeto", "frente", "parte"],
    ativos: ["parte", "nome"],
    canais: ["parte", "plataforma"],
    perfis_estrategicos: ["parte"],
  };
  const faltando = obrigatorios[input.entidade].filter((campo) => !mapeamento.has(campo));
  if (faltando.length) throw new ValidationError(`Mapeie os campos obrigatórios: ${faltando.join(", ")}`);

  const criadas: LinhaImportada[] = [];
  const erros: LinhaImportada[] = [];
  for (const [indice, linha] of input.linhas.entries()) {
    try {
      const id = input.entidade === "partes"
        ? await importarParte(linha, mapeamento, usuarioId)
        : input.entidade === "clientes"
          ? await importarCliente(linha, mapeamento, usuarioId)
          : input.entidade === "projetos"
            ? await importarProjeto(linha, mapeamento, usuarioId)
            : input.entidade === "frentes"
              ? await importarFrente(linha, mapeamento, usuarioId)
              : input.entidade === "candidaturas"
                ? await importarCandidatura(linha, mapeamento, usuarioId)
                : input.entidade === "ativos"
                  ? await importarAtivo(linha, mapeamento, usuarioId)
                  : input.entidade === "canais"
                    ? await importarCanal(linha, mapeamento, usuarioId)
                    : await importarPerfilEstrategico(linha, mapeamento, usuarioId);
      criadas.push({ linha: indice + 2, id });
    } catch (erro) {
      erros.push({ linha: indice + 2, mensagem: erro instanceof Error ? erro.message : String(erro) });
    }
  }
  return { entidade: input.entidade, criadas, erros, total: input.linhas.length };
}

// --- Importação de funil histórico -----------------------------------------
// Diferente do CSV tabular, esta carga cria toda a árvore operacional. A fonte
// permanece registrada nas observações de cada candidatura para que nenhuma
// informação da planilha seja perdida ou convertida em inferência silenciosa.

type ContagemImportacaoHistorica = { criados: number; existentes: number };

function novaContagem(): ContagemImportacaoHistorica {
  return { criados: 0, existentes: 0 };
}

function chaveHistorica(...valores: string[]): string {
  return valores.map((valor) => valor.trim().toLocaleLowerCase("pt-BR")).join("|");
}

function statusHistoricoParaCandidatura(status: string): string {
  const valor = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
  if (valor.includes("negoci")) return "em_negociacao";
  if (valor.includes("declinad")) return "encerrada";
  if (valor.includes("stand by") || valor.includes("stand-by")) return "stand_by";
  if (valor.includes("validar")) return "em_analise";
  if (valor.includes("aprovad")) return "aprovada";
  // "frente aberta", "abrir frente" e "sem retorno" são oportunidades
  // existentes, mas não confirmam negociação. Mantemos como identificadas.
  return "identificada";
}

function observacoesDaLinhaHistorica(linha: LinhaFunilHistorico): string {
  const campos: Array<[string, string]> = [
    ["Status de origem", linha.status_origem],
    ["Observações", linha.observacoes],
    ["Objetivo", linha.objetivo],
    ["Modelo de parceria", linha.modelo_parceria],
    ["Histórico", linha.historico],
    ["Seção", linha.secao],
    ["Território", linha.territorio],
    ["Setor", linha.setor],
  ];
  return ["Importado da planilha histórica de parcerias.", ...campos.filter(([, valor]) => valor).map(([rotulo, valor]) => `${rotulo}: ${valor}`)].join("\n");
}

function objetivoDaFrenteHistorica(linha: LinhaFunilHistorico): string {
  return linha.objetivo || `Desenvolver oportunidades de parceria em ${frenteDaLinhaHistorica(linha)}.`;
}

type ReferenciasFunilHistorico = {
  statusParte: string;
  statusCliente: string;
  statusProjeto: string;
  statusFrente: string;
  papelCliente: string;
  papelParceiro: string;
  statusCandidatura: Map<string, string>;
};

async function referenciasFunilHistorico(client: PoolClient): Promise<ReferenciasFunilHistorico> {
  const buscar = async (tabela: string, codigo: string) => {
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM ${tabela} WHERE codigo = $1`, [codigo]);
    const id = rows[0]?.id;
    if (!id) throw new ValidationError(`Referência obrigatória não encontrada: ${tabela}.${codigo}`);
    return id;
  };
  const status = await client.query<{ id: string; codigo: string }>(
    `SELECT id, codigo FROM cross_projects.status_candidatura
      WHERE codigo = ANY($1::text[])`,
    [["identificada", "em_analise", "aprovada", "em_negociacao", "stand_by", "encerrada"]]
  );
  return {
    statusParte: await buscar("cross_core.status_parte", "ativa"),
    statusCliente: await buscar("cross_commercial.status_cliente", "ativo"),
    statusProjeto: await buscar("cross_projects.status_projeto", "rascunho"),
    statusFrente: await buscar("cross_projects.status_frente", "aberta"),
    papelCliente: await buscar("cross_core.papel", "cliente"),
    papelParceiro: await buscar("cross_core.papel", "parceiro"),
    statusCandidatura: new Map(status.rows.map((item) => [item.codigo, item.id])),
  };
}

async function inserirParteHistorica(
  client: PoolClient,
  nome: string,
  categoria: string | null,
  statusParteId: string,
  papelId: string,
  usuarioId: string | null
): Promise<string> {
  const parte = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id, criado_por_id)
     VALUES ('organizacao', $1, $2, $3)
     RETURNING id`,
    [nome, statusParteId, usuarioId]
  );
  const parteId = parte.rows[0]?.id;
  if (!parteId) throw new ValidationError("Não foi possível criar a Parte da importação.");
  await client.query(
    `INSERT INTO cross_core.organizacao (parte_id, nome_fantasia, segmento_principal)
     VALUES ($1, $2, $3)`,
    [parteId, nome, categoria]
  );
  await client.query(
    `INSERT INTO cross_core.parte_papel (parte_id, papel_id, vigente_desde, criado_por_id)
     VALUES ($1, $2, CURRENT_DATE, $3)`,
    [parteId, papelId, usuarioId]
  );
  return parteId;
}

async function inserirClienteHistorico(
  client: PoolClient,
  parteId: string,
  statusClienteId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross
       (parte_id, status_cliente_id, observacoes, criado_por_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [parteId, statusClienteId, "Cliente criado pela importação de funil histórico de parcerias.", usuarioId]
  );
  const id = rows[0]?.id;
  if (!id) throw new ValidationError("Não foi possível criar o cliente da importação.");
  return id;
}

function resumoDoFunilHistorico(conteudo: string) {
  const leitura = lerFunilHistorico(conteudo);
  const projetos = new Map<string, Set<string>>();
  const marcas = new Set<string>();
  for (const linha of leitura.linhas) {
    const chaveProjeto = chaveHistorica(linha.projeto);
    const frentes = projetos.get(chaveProjeto) ?? new Set<string>();
    frentes.add(chaveHistorica(frenteDaLinhaHistorica(linha)));
    projetos.set(chaveProjeto, frentes);
    marcas.add(chaveHistorica(linha.marca));
  }
  return {
    leitura,
    resumo: {
      cliente: leitura.cliente,
      projetos: projetos.size,
      frentes: [...projetos.values()].reduce((total, frentes) => total + frentes.size, 0),
      marcas: marcas.size,
      candidaturas: leitura.linhas.length,
    },
  };
}

/** Gera uma prévia auditável sem alterar a base. */
export async function analisarFunilHistorico(input: AnalisarFunilHistoricoInput, usuarioId: string | null) {
  const inicio = Date.now();
  const { leitura, resumo } = resumoDoFunilHistorico(input.conteudo);
  if (!leitura.cliente || !leitura.linhas.length) {
    throw new ValidationError(leitura.avisos[leitura.avisos.length - 1] ?? "Não foi possível identificar dados do funil.");
  }
  const saida = {
    ...resumo,
    avisos: leitura.avisos,
    amostra: leitura.linhas.slice(0, 12).map((linha) => ({
      linha: linha.linha,
      projeto: linha.projeto,
      frente: frenteDaLinhaHistorica(linha),
      marca: linha.marca,
      status_origem: linha.status_origem,
      status_plataforma: statusHistoricoParaCandidatura(linha.status_origem),
    })),
  };
  const execucaoId = await withTransaction((client) => repo.registrarExecucao(client, {
    agente: "historical_funnel_import",
    status: "sucesso",
    // Leitura determinística local: segue a mesma convenção de auditoria dos
    // demais agentes sem chamada a um provedor externo.
    origem: "mock",
    entrada: { caracteres: input.conteudo.length },
    saida,
    duracaoMs: Date.now() - inicio,
    criadoPorId: usuarioId,
  }));
  return { execucao_id: execucaoId, ...saida };
}

/**
 * Materializa a prévia como cliente, projetos, frentes, Partes e candidaturas.
 * A operação é idempotente: registros já existentes não são duplicados nem
 * sobrescritos; entram na contagem de "existentes".
 */
export async function confirmarFunilHistorico(input: ConfirmarFunilHistoricoInput, usuarioId: string | null) {
  const { leitura } = resumoDoFunilHistorico(input.conteudo);
  if (!leitura.cliente || !leitura.linhas.length) {
    throw new ValidationError(leitura.avisos[leitura.avisos.length - 1] ?? "Não foi possível identificar dados do funil.");
  }
  // Uma única transação torna a carga rápida e atômica: ou toda a árvore é
  // criada, ou nada é alterado. Isso evita um funil incompleto por queda de
  // conexão no meio da planilha.
  return withTransaction(async (client) => {
    const referencias = await referenciasFunilHistorico(client);
    let clienteId = await repo.buscarClienteIdPorNomeExato(client, leitura.cliente);
    let clienteCriado = false;
    if (!clienteId) {
      let parteClienteId = await repo.buscarParteIdPorNomeExato(client, leitura.cliente);
      if (!parteClienteId) {
        parteClienteId = await inserirParteHistorica(
          client, leitura.cliente, null, referencias.statusParte, referencias.papelCliente, usuarioId
        );
      }
      clienteId = await inserirClienteHistorico(client, parteClienteId, referencias.statusCliente, usuarioId);
      clienteCriado = true;
    }

    const projetos = novaContagem();
    const frentes = novaContagem();
    const partes = novaContagem();
    const candidaturas = novaContagem();
    const cacheProjetos = new Map<string, string>();
    const cacheFrentes = new Map<string, string>();
    const cachePartes = new Map<string, string>();

    for (const linha of leitura.linhas) {
      const chaveProjeto = chaveHistorica(linha.projeto);
      let projetoId = cacheProjetos.get(chaveProjeto);
      if (!projetoId) {
        projetoId = await repo.buscarProjetoIdPorNomes(client, leitura.cliente, linha.projeto) ?? undefined;
        if (projetoId) {
          projetos.existentes++;
        } else {
          const criado = await client.query<{ id: string }>(
            `INSERT INTO cross_projects.projeto
               (cliente_cross_id, nome, descricao, objetivo, produto, status_projeto_id, criado_por_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              clienteId,
              linha.projeto,
              "Projeto criado pela importação de funil histórico de parcerias.",
              `Centralizar e acompanhar as oportunidades de parceria do eixo ${linha.projeto}.`,
              "Parcerias e cross networking",
              referencias.statusProjeto,
              usuarioId,
            ]
          );
          projetoId = criado.rows[0]?.id;
          if (!projetoId) throw new ValidationError(`Não foi possível criar o projeto '${linha.projeto}'.`);
          projetos.criados++;
        }
        cacheProjetos.set(chaveProjeto, projetoId);
      }

      const nomeFrente = frenteDaLinhaHistorica(linha);
      const chaveFrente = chaveHistorica(linha.projeto, nomeFrente);
      let frenteId = cacheFrentes.get(chaveFrente);
      if (!frenteId) {
        frenteId = await repo.buscarFrenteIdPorNomes(client, leitura.cliente, linha.projeto, nomeFrente) ?? undefined;
        if (frenteId) {
          frentes.existentes++;
        } else {
          const descricao = [
            "Frente criada pela importação de funil histórico.",
            linha.secao && `Seção: ${linha.secao}.`,
            linha.territorio && `Território: ${linha.territorio}.`,
            linha.setor && `Setor: ${linha.setor}.`,
          ].filter(Boolean).join(" ");
          const criada = await client.query<{ id: string }>(
            `INSERT INTO cross_projects.frente_oportunidade
               (projeto_id, nome, descricao, categoria, objetivo, data_abertura, status_frente_id, criado_por_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7)
             RETURNING id`,
            [
              projetoId,
              nomeFrente,
              descricao,
              [linha.secao, linha.territorio, linha.setor].filter(Boolean).join(" · ") || null,
              objetivoDaFrenteHistorica(linha),
              referencias.statusFrente,
              usuarioId,
            ]
          );
          frenteId = criada.rows[0]?.id;
          if (!frenteId) throw new ValidationError(`Não foi possível criar a frente '${nomeFrente}'.`);
          frentes.criados++;
        }
        cacheFrentes.set(chaveFrente, frenteId);
      }

      const chaveParte = chaveHistorica(linha.marca);
      let parteId = cachePartes.get(chaveParte);
      if (!parteId) {
        parteId = await repo.buscarParteIdPorNomeExato(client, linha.marca) ?? undefined;
        if (parteId) {
          partes.existentes++;
        } else {
          parteId = await inserirParteHistorica(
            client,
            linha.marca,
            linha.setor || linha.territorio || null,
            referencias.statusParte,
            referencias.papelParceiro,
            usuarioId
          );
          partes.criados++;
        }
        cachePartes.set(chaveParte, parteId);
      }

      if (await repo.buscarCandidaturaIdPorFrenteEParte(client, frenteId, parteId)) {
        candidaturas.existentes++;
        continue;
      }
      const codigoStatus = statusHistoricoParaCandidatura(linha.status_origem);
      const statusId = referencias.statusCandidatura.get(codigoStatus) ?? referencias.statusCandidatura.get("identificada");
      if (!statusId) throw new ValidationError("Status 'identificada' não está configurado na plataforma.");
      await client.query(
        `INSERT INTO cross_projects.candidatura_parceiro
           (frente_oportunidade_id, parte_id, status_candidatura_id, observacoes, criado_por_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [frenteId, parteId, statusId, observacoesDaLinhaHistorica(linha), usuarioId]
      );
      candidaturas.criados++;
    }

    return {
      cliente: { nome: leitura.cliente, criado: clienteCriado },
      projetos,
      frentes,
      partes,
      candidaturas,
      total_linhas: leitura.linhas.length,
      erros: [] as LinhaImportada[],
      avisos: leitura.avisos,
    };
  }, { usuarioId });
}

function scoreFitDaAnalise(analise: AnaliseCrossabilitySaida): number {
  const niveis = [
    analise.compatibilidade_publicos.nivel,
    analise.compatibilidade_territorios.nivel,
    analise.complementaridade_ativos.nivel,
    analise.sinergias.nivel,
    analise.fit_estrategico.nivel,
    analise.momento_estrategico.nivel,
  ];
  const pontos = niveis.reduce((total, nivel) => total + (nivel === "alta" ? 3 : nivel === "media" ? 2 : 1), 0);
  const aderenciaDasDimensoes = (pontos / 18) * 100;
  // O cartão de oportunidade precisa refletir também a solidez da evidência.
  // Sem isso, duas candidatas com os mesmos níveis declarados, porém uma com
  // fonte única e outra corroborada, apareciam empatadas para a curadoria.
  return Math.round(aderenciaDasDimensoes * 0.7 + analise.confianca * 0.3);
}

function normalizarNomeParaComparacao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Impede que títulos de login, páginas internas ou o próprio cliente virem parceiro. */
function parceiroValidoParaSugestao(cliente: string, parceiro: string): boolean {
  const clienteNormalizado = normalizarNomeParaComparacao(cliente);
  const parceiroNormalizado = normalizarNomeParaComparacao(parceiro);
  if (!parceiroNormalizado || parceiroNormalizado === clienteNormalizado) return false;
  if (parceiroNormalizado.startsWith(`${clienteNormalizado} inc`)) return false;
  return !/^(aceite e cadastre|nossos fornecedores|portal de gestao multimarcas|portal multimarcas|login|sign in)$/.test(parceiroNormalizado);
}

function fontesDaOportunidade(input: PersistirOportunidadesInput): Record<string, unknown>[] {
  const fontes: Record<string, unknown>[] = [];
  const urls = new Set<string>();

  for (const coleta of input.coleta?.coletas ?? []) {
    for (const resultado of coleta.resultados) {
      if (urls.has(resultado.url)) continue;
      urls.add(resultado.url);
      fontes.push({
        nome: resultado.titulo || resultado.fonte,
        tipo: `Pesquisa externa · ${coleta.tipo_fonte}`,
        detalhe: resultado.trecho.slice(0, 700),
        url: resultado.url,
      });
      if (fontes.length >= 10) return fontes;
    }
  }

  for (const trecho of input.rag?.trechos ?? []) {
    fontes.push({
      nome: `RAG interno · ${trecho.origem}`,
      tipo: "Base de conhecimento Cross",
      detalhe: trecho.conteudo.slice(0, 700),
      similaridade: trecho.similaridade,
    });
    if (fontes.length >= 10) break;
  }

  return fontes;
}

/** Retorna apenas matérias/fontes externas que citam a candidata em questão. */
function fontesExternasDaOportunidade(
  input: PersistirOportunidadesInput,
  parceiro: string,
): Array<{ nome: string; tipo: string; detalhe: string; url: string }> {
  const nomeNormalizado = normalizarNomeParaComparacao(parceiro);
  const perfil = input.extracao?.perfis.find((item) =>
    normalizarNomeParaComparacao(item.nome) === nomeNormalizado
  );
  const evidenciasPorUrl = new Map(
    (perfil?.fontes ?? [])
      .filter((fonte) => normalizarNomeParaComparacao(fonte.evidencia).includes(nomeNormalizado))
      .map((fonte) => [fonte.url, fonte.evidencia]),
  );
  const fontesConfiaveis = new Set(
    (input.credibilidade?.avaliacoes ?? [])
      // A validação da candidata usa 50 como corte de fonte aceitável. Manter
      // o mesmo gate aqui evita uma contradição silenciosa: a análise aprova
      // uma fonte, mas a tela termina sem sugestão por exigir 70 apenas na
      // persistência. A recomendação segue limitada a "em estudo" quando há
      // uma única fonte.
      .filter((avaliacao) => avaliacao.score >= 50)
      .map((avaliacao) => avaliacao.url),
  );
  const urls = new Set<string>();
  const fontes: Array<{ nome: string; tipo: string; detalhe: string; url: string }> = [];

  for (const coleta of input.coleta?.coletas ?? []) {
    for (const resultado of coleta.resultados) {
      const texto = normalizarNomeParaComparacao(`${resultado.titulo} ${resultado.trecho}`);
      const evidencia = evidenciasPorUrl.get(resultado.url);
      if (!fontesConfiaveis.has(resultado.url) || (!texto.includes(nomeNormalizado) && !evidencia) || urls.has(resultado.url)) continue;
      urls.add(resultado.url);
      fontes.push({
        nome: resultado.titulo || resultado.fonte,
        tipo: `Pesquisa externa verificada · ${coleta.tipo_fonte}`,
        detalhe: (evidencia ?? resultado.trecho).slice(0, 700),
        url: resultado.url,
      });
    }
  }
  return fontes.slice(0, 5);
}

/** Uma matéria abre hipótese; duas fontes independentes permitem recomendação. */
function limitarAnalisePorEvidenciaExterna(
  analise: AnaliseCrossabilitySaida,
  fontes: Array<{ url: string }>,
): AnaliseCrossabilitySaida {
  const corroboracoes = fontes.length;
  const recomendacao = analise.recomendacao === "nao_recomendada"
    ? "nao_recomendada"
    : corroboracoes >= 2 ? analise.recomendacao : "em_estudo";
  const confiancaMaxima = corroboracoes >= 2 ? 78 : 58;
  return {
    ...analise,
    recomendacao,
    confianca: Math.min(analise.confianca, confiancaMaxima),
    racional_recomendacao: `${analise.racional_recomendacao} Base externa: ${corroboracoes} fonte(s) verificável(is) citando a marca.`,
  };
}

function briefingDaOportunidade(
  cliente: string,
  objetivo: string,
  parceiro: string,
  analise: AnaliseCrossabilitySaida,
  perfil: { publicos?: string[]; territorios?: string[]; ativos?: string[] } | undefined
) {
  const publicos = perfil?.publicos?.slice(0, 3).join(" · ") || "Públicos a confirmar na curadoria";
  const territorios = perfil?.territorios?.slice(0, 3).join(" · ") || "Territórios a confirmar na curadoria";
  const ativos = perfil?.ativos?.slice(0, 3) ?? [];
  return {
    objetivo: `Conectar ${cliente} e ${parceiro} para ${objetivo}`,
    ideia: `${analise.racional_recomendacao} A proposta deve criar uma entrega clara para os dois lados, antes de qualquer negociação comercial.`,
    publico: `${publicos}. Territórios: ${territorios}.`,
    ativacoes: [
      ...ativos.map((ativo) => `Explorar o ativo: ${ativo}`),
      "Definir uma experiência ou conteúdo co-criado com benefício recíproco.",
      "Acordar métricas de marca e de negócio antes da apresentação.",
    ].slice(0, 4),
    proxima_validacao: "Validar fontes, disponibilidade dos ativos, exclusividade de categoria e interesse comercial antes de promover a oportunidade.",
  };
}

function valorDaObservacao(observacoes: string | null, rotulo: string): string | null {
  const encontrada = new RegExp(`^${rotulo}:\\s*(.+)$`, "im").exec(observacoes ?? "");
  return encontrada?.[1]?.trim() || null;
}

function analiseDaCandidaturaDaBase(
  cliente: string,
  candidato: repo.CandidatoBaseParaSugestao,
): AnaliseCrossabilitySaida {
  const status = valorDaObservacao(candidato.observacoes, "Status de origem") ?? "A validar";
  const objetivo = valorDaObservacao(candidato.observacoes, "Objetivo") ?? "Parceria estratégica";
  const territorio = valorDaObservacao(candidato.observacoes, "Território");
  const contatoEmAndamento = /EM NEGOCIAÇÃO|FRENTE ABERTA|ABRIR FRENTE|REUNIÃO FEITA|CONTATO COM A MARCA/i.test(`${status}\n${candidato.observacoes ?? ""}`);
  const negociacao = /EM NEGOCIAÇÃO/i.test(status);
  const nivelMomento = negociacao ? "alta" : contatoEmAndamento ? "media" : "baixa";
  const nivelFit = /collab|experiência de marca|produto/i.test(objetivo) ? "alta" : "media";
  const recomendacao = negociacao ? "recomendada" : "em_estudo";
  const confianca = negociacao ? 70 : contatoEmAndamento ? 62 : 50;
  const segmento = candidato.segmento ?? "segmento a validar";

  return {
    compatibilidade_publicos: {
      nivel: "media",
      texto: `A base ainda não detalha os públicos de ${candidato.parceiro_nome}; a aderência deve ser validada no briefing conjunto.`,
    },
    compatibilidade_territorios: {
      nivel: territorio ? "alta" : "media",
      texto: territorio
        ? `A candidatura está posicionada no território ${territorio}, já associado à frente ${candidato.frente_nome}.`
        : "Território específico ainda precisa ser confirmado com a marca.",
    },
    complementaridade_ativos: {
      nivel: "alta",
      texto: `${candidato.parceiro_nome} está mapeada na frente ${candidato.frente_nome}, que já define um ativo/oportunidade para investigação.`,
    },
    sinergias: {
      nivel: "media",
      texto: `Há uma hipótese de conexão entre o lifestyle da ${cliente} e o segmento ${segmento}; validar entrega, contrapartidas e exclusividade.`,
    },
    fit_estrategico: {
      nivel: nivelFit,
      texto: `A base registra o objetivo “${objetivo}” para ${candidato.parceiro_nome}, alinhado à frente aberta pela Cross.`,
    },
    momento_estrategico: {
      nivel: nivelMomento,
      texto: `Status operacional importado: ${status}. ${contatoEmAndamento ? "Há sinal de movimentação e a próxima validação deve ser comercial." : "Ainda exige validação de timing e disponibilidade."}`,
    },
    recomendacao,
    racional_recomendacao: `${candidato.parceiro_nome} já é uma oportunidade mapeada pela Cross para ${cliente} na frente ${candidato.frente_nome}. A sugestão usa o histórico operacional importado e deve ser curada antes de qualquer abordagem.`,
    confianca,
  };
}

function perfilDaCandidaturaDaBase(candidato: repo.CandidatoBaseParaSugestao) {
  const territorio = valorDaObservacao(candidato.observacoes, "Território");
  const status = valorDaObservacao(candidato.observacoes, "Status de origem") ?? "A validar";
  return {
    setor: candidato.segmento ?? "Não informado",
    publicos: [],
    territorios: territorio ? [territorio] : [],
    ativos: [candidato.frente_nome],
    sinais_parceria: [`Status no funil Cross: ${status}`],
  };
}

async function gerarOportunidadesDaBase(
  input: GerarOportunidadesInput,
  usuarioId: string | null,
  qualificacoes: QualificacaoDaBase[],
) {
  const inicio = Date.now();
  const analises = qualificacoes.map((qualificacao) => ({
    qualificacao,
    candidato: qualificacao.candidata,
    perfil: perfilDaCandidaturaDaBase(qualificacao.candidata),
    analise: analisarCandidataDaBase(input.cliente, qualificacao),
  }));

  return withTransaction(async (client) => {
    const execucaoId = await repo.registrarExecucao(client, {
      agente: "partner_discovery",
      status: "sucesso",
      origem: "base_cross",
      entrada: { ...input, estrategia: "candidaturas_existentes" },
      saida: {
        status: "sucesso",
        total_candidatos_base: qualificacoes.length,
        parceiros: qualificacoes.map(({ candidata }) => candidata.parceiro_nome),
        observacao: "Sugestões geradas a partir das candidaturas e do histórico já importados na Cross.",
      },
      duracaoMs: Date.now() - inicio,
      criadoPorId: usuarioId,
      projetoId: input.projeto_id ?? null,
      frenteId: input.frente_id ?? null,
    });
    const oportunidades = [];
    for (const { qualificacao, candidato, perfil, analise } of analises) {
      oportunidades.push(await repo.inserirOportunidadeIa(client, {
        execucaoPipelineId: execucaoId,
        pipeline: "partner_discovery",
        clienteNome: input.cliente,
        objetivo: input.objetivo,
        parceiroNome: candidato.parceiro_nome,
        perfilParceiro: perfil,
        analise,
        scoreFit: scoreFitDaAnalise(analise),
        confianca: analise.confianca,
        fontes: [{
          nome: `Base Cross · ${candidato.projeto_nome}`,
          tipo: "Funil histórico importado",
          detalhe: `${candidato.frente_nome}. ${candidato.observacoes?.replace(/\s+/g, " ").slice(0, 900) ?? "Sem observações adicionais."}`,
        }],
        briefing: briefingDaOportunidade(input.cliente, input.objetivo, candidato.parceiro_nome, analise, perfil),
        projetoId: candidato.projeto_id,
        frenteId: candidato.frente_id,
        criadoPorId: usuarioId,
      }));
    }
    return {
      pipeline: {
        pipeline: "partner_discovery" as const,
        status: "sucesso" as const,
        execucao_id: execucaoId,
        observacoes: [
          `${oportunidades.length} sugestão(ões) criada(s) a partir do funil existente da Cross.`,
          "Toda sugestão permanece em rascunho até a curadoria humana.",
        ],
      },
      oportunidades,
    };
  }, { usuarioId });
}

/** Materializa as análises de um pipeline como oportunidades de leitura e curadoria. */
export async function persistirOportunidades(
  input: PersistirOportunidadesInput,
  usuarioId: string | null
) {
  const perfisPorNome = new Map(
    (input.extracao?.perfis ?? []).map((perfil) => [perfil.nome.trim().toLocaleLowerCase(), perfil])
  );
  const analisesValidas = input.analises.flatMap(({ parceiro, analise }) => {
    if (!parceiroValidoParaSugestao(input.cliente, parceiro)) return [];
    const validacao = validarCandidataExterna({
      cliente: input.cliente,
      parceiro,
      objetivo: input.objetivo,
      contexto: input.contexto,
      extracao: input.extracao,
      coleta: input.coleta,
      credibilidade: input.credibilidade,
    });
    const fontes = fontesExternasDaOportunidade(input, parceiro);
    if (!validacao.aprovada || fontes.length === 0) return [];
    return [{ parceiro, analise: limitarAnalisePorEvidenciaExterna(analise, fontes), fontes }];
  });
  return withTransaction(async (client) => {
    const oportunidades = [];
    for (const { parceiro, analise, fontes } of analisesValidas) {
      const perfil = perfisPorNome.get(parceiro.trim().toLocaleLowerCase());
      oportunidades.push(await repo.inserirOportunidadeIa(client, {
          execucaoPipelineId: input.execucao_pipeline_id ?? null,
          pipeline: input.pipeline,
          clienteNome: input.cliente,
          objetivo: input.objetivo,
          parceiroNome: parceiro,
          perfilParceiro: perfil,
          analise,
          scoreFit: scoreFitDaAnalise(analise),
          confianca: analise.confianca,
          fontes,
          briefing: briefingDaOportunidade(input.cliente, input.objetivo, parceiro, analise, perfil),
          projetoId: input.projeto_id ?? null,
          frenteId: input.frente_id ?? null,
          criadoPorId: usuarioId,
      }));
    }
    return oportunidades;
  }, { usuarioId });
}

async function gerarOportunidadesDaBaseExistente(input: GerarOportunidadesInput, usuarioId: string | null) {
  const candidatosDaBase = await withTransaction(async (client) => {
    const [candidatos, parceirosComRascunho] = await Promise.all([
      repo.listarCandidatosDaBaseParaSugestao(client, input.cliente, input.projeto_id ?? null, Math.min(input.limite_candidatos * 4, 30)),
      repo.listarParceirosComOportunidadeAtiva(client, input.cliente),
    ]);
    const existentes = new Set(parceirosComRascunho);
    return candidatos.filter((candidato) => !existentes.has(candidato.parceiro_nome.trim().toLocaleLowerCase()));
  }, { usuarioId });
  const qualificadas = qualificarCandidaturasDaBase(candidatosDaBase, input.limite_candidatos);
  if (qualificadas.length > 0) {
    return gerarOportunidadesDaBase(input, usuarioId, qualificadas);
  }

  const execucaoId = await withTransaction((client) => repo.registrarExecucao(client, {
    agente: "partner_discovery",
    status: "sucesso",
    origem: "base_cross",
    entrada: { ...input, estrategia: "radar_base_cross" },
    saida: { status: "insufficient_evidence", total_candidatos_base: candidatosDaBase.length },
    duracaoMs: 0,
    criadoPorId: usuarioId,
    projetoId: input.projeto_id ?? null,
    frenteId: input.frente_id ?? null,
  }), { usuarioId });
  return {
    pipeline: {
      pipeline: "partner_discovery" as const,
      status: "insufficient_evidence" as const,
      execucao_id: execucaoId,
      observacoes: [
        "O radar não encontrou novas candidatas com status ativo e evidência operacional suficiente na Base Cross.",
        "A descoberta externa é uma etapa separada e só cria rascunho após validação de fonte e entidade.",
      ],
    },
    oportunidades: [],
  };
}

/**
 * Mapeia oportunidades novas no mercado. A Base Cross fornece frentes e nomes
 * já trabalhados para orientar e deduplicar a pesquisa, mas nunca é a fonte das
 * candidatas retornadas por este fluxo.
 */
export async function gerarOportunidades(
  input: GerarOportunidadesInput,
  usuarioId: string | null,
  reportar?: ReportarProgresso,
  checkpoint?: Checkpoint,
) {
  const pipeline = await executarPipeline(input, "partner_discovery", usuarioId, reportar, checkpoint);
  const nomesJaMapeados = await withTransaction(async (client) => {
    const [funil, oportunidades] = await Promise.all([
      repo.listarParceirosJaMapeadosNoFunil(client, input.cliente),
      repo.listarParceirosComOportunidadeAtiva(client, input.cliente),
    ]);
    return new Set([...funil, ...oportunidades]);
  }, { usuarioId });

  const analisesNovas = pipeline.analises.filter(({ parceiro }) =>
    !nomesJaMapeados.has(parceiro.trim().toLocaleLowerCase("pt-BR"))
  );
  const oportunidades = await persistirOportunidades({
    pipeline: "partner_discovery",
    execucao_pipeline_id: pipeline.execucao_id,
    cliente: input.cliente,
    objetivo: input.objetivo,
    contexto: input.contexto,
    projeto_id: input.projeto_id,
    frente_id: input.frente_id,
    analises: analisesNovas,
    coleta: pipeline.coleta,
    credibilidade: pipeline.credibilidade,
    rag: pipeline.rag,
    extracao: pipeline.extracao,
  }, usuarioId);

  const semNovidades = oportunidades.length === 0;
  return {
    pipeline: semNovidades
      ? {
          ...pipeline,
          status: "insufficient_evidence" as const,
          observacoes: [
            ...pipeline.observacoes,
            "Nenhuma marca nova atingiu simultaneamente os critérios de fonte, identidade e deduplicação do funil.",
          ],
        }
      : pipeline,
    oportunidades,
  };
}

export async function listarOportunidades(filtros: { cliente?: string }, p: Paginacao) {
  return withTransaction((client) =>
    repo.listarOportunidadesIa(client, { cliente: filtros.cliente, limit: p.limit, offset: p.offset })
  );
}

// -----------------------------------------------------------------------------
// Agentes de tarefa: Partner Discovery e Market Intelligence
// -----------------------------------------------------------------------------

type PipelineInput = ExecutarPartnerDiscoveryInput | ExecutarMarketIntelligenceInput;
type PipelineCodigo = "partner_discovery" | "market_intelligence";

/** Entrada de checkpoint de uma etapa já concluída. */
export interface EtapaCheckpoint<T = unknown> {
  saida: T;
  execucao_id?: string;
  origem?: string;
  concluida_em: string;
}

/**
 * Contrato mínimo de checkpoint. Deliberadamente pequeno: ler e gravar por
 * nome de etapa. Quem implementa decide onde persistir (hoje, o JSONB de
 * `tarefa_pipeline`); o pipeline não conhece o meio de armazenamento.
 */
export interface Checkpoint {
  ler<T>(etapa: string): EtapaCheckpoint<T> | undefined;
  gravar(etapa: string, dados: EtapaCheckpoint): Promise<void>;
  tentativa?: number;
}

interface AuditoriaAgenteInput {
  agente: string;
  origem: string;
  entrada: unknown;
  saida?: unknown;
  status?: "sucesso" | "erro";
  erro?: string;
  usuarioId: string | null;
  projetoId?: string;
  frenteId?: string;
  /** Modelo que atendeu; ausente nas etapas determinísticas. */
  modelo?: string;
  /** Tokens consumidos; ausente nas etapas sem LLM. */
  tokens?: { entrada: number; saida: number; cache?: number };
  /** Instante em que a etapa começou — para latência real, não de gravação. */
  iniciadoEm?: Date;
  /** Execução-pai do pipeline, quando a etapa roda dentro de um. */
  execucaoPaiId?: string | null;
  tentativa?: number;
  /** Uso de ferramentas externas a registrar junto (mesma transação). */
  ferramentas?: Omit<repo.RegistroUsoFerramenta, "execucaoId">[];
}

/**
 * Persiste a execução de uma etapa com sua telemetria.
 *
 * Antes, esta função descartava tokens e duração (`duracaoMs: undefined`, sem
 * campos de token): toda execução de pipeline gravava consumo zero, mesmo com
 * provedor real. Agora recebe e grava o que o cliente LLM já capturava.
 *
 * O uso de ferramenta é gravado na MESMA transação da execução: se a execução
 * não for registrada, seu consumo também não deve ficar órfão.
 */
async function auditarAgente(input: AuditoriaAgenteInput): Promise<string> {
  const finalizadoEm = new Date();
  const duracaoMs = input.iniciadoEm
    ? Math.max(0, finalizadoEm.getTime() - input.iniciadoEm.getTime())
    : undefined;

  return withTransaction(async (client) => {
    const id = await repo.registrarExecucao(client, {
      agente: input.agente,
      status: input.status ?? "sucesso",
      origem: input.origem,
      entrada: input.entrada,
      saida: input.saida,
      erro: input.erro,
      tokensEntrada: input.tokens?.entrada ?? 0,
      tokensSaida: input.tokens?.saida ?? 0,
      tokensCache: input.tokens?.cache ?? 0,
      duracaoMs,
      modelo: input.modelo ?? null,
      custoEstimado: estimarCusto(input.modelo, input.tokens),
      iniciadoEm: input.iniciadoEm ?? null,
      finalizadoEm,
      execucaoPaiId: input.execucaoPaiId ?? null,
      tentativa: input.tentativa ?? 1,
      criadoPorId: input.usuarioId,
      projetoId: input.projetoId ?? null,
      frenteId: input.frenteId ?? null,
    });

    for (const uso of input.ferramentas ?? []) {
      await repo.registrarUsoFerramenta(client, { ...uso, execucaoId: id });
    }

    return id;
  });
}

/**
 * Deriva afirmações verificáveis dos perfis extraídos.
 *
 * O Fact Verifier corrobora uma afirmação contando DOMÍNIOS DISTINTOS entre
 * suas fontes. Para alimentá-lo sem inventar nada, transformamos cada campo do
 * perfil ("público X", "atua em Y") numa afirmação e anexamos as URLs que a
 * extração já registrou como evidência daquele perfil.
 *
 * Quando o perfil não trouxe fontes próprias, caímos nas URLs da coleta que
 * mencionam a entidade — é uma aproximação, e por isso a afirmação tende a
 * cair em `fonte_unica`, que é a leitura honesta de "só um lugar diz isso".
 *
 * Nada aqui altera o perfil nem descarta candidata: apenas produz o material
 * que a etapa de verificação classifica.
 */
export function afirmacoesDosPerfis(
  extracao: ExtracaoSaida,
  coleta: ColetaFontesSaida
): Array<{ texto: string; fontes: string[] }> {
  const urlsDaColeta = coleta.coletas.flatMap((c) => c.resultados.map((r) => r.url)).filter(Boolean);
  const afirmacoes: Array<{ texto: string; fontes: string[] }> = [];

  for (const perfil of extracao.perfis) {
    const fontesDoPerfil = (perfil.fontes ?? []).map((f) => f.url).filter(Boolean);
    const fontes = fontesDoPerfil.length ? fontesDoPerfil : urlsDaColeta;
    if (!fontes.length) continue;

    const campos: Array<[string, string[] | undefined]> = [
      ["atua no setor", perfil.setor ? [perfil.setor] : []],
      ["tem como público", perfil.publicos],
      ["atua nos territórios", perfil.territorios],
      ["dispõe dos ativos", perfil.ativos],
      ["apresenta sinais de parceria", perfil.sinais_parceria],
    ];

    for (const [predicado, valores] of campos) {
      for (const valor of (valores ?? []).slice(0, 3)) {
        if (!valor?.trim()) continue;
        afirmacoes.push({ texto: `${perfil.nome} ${predicado}: ${valor.trim()}`, fontes });
      }
    }
  }

  // Teto defensivo: a verificação é barata, mas o JSONB da auditoria não deve
  // crescer sem limite numa execução com muitos perfis.
  return afirmacoes.slice(0, 60);
}

function consultasLimitadas(plano: PlanoPesquisa, limite: number) {
  const perguntas = plano.perguntas
    .slice()
    .sort((a, b) => a.prioridade - b.prioridade);
  const consultas: PlanoPesquisa["perguntas"][number]["consultas"] = [];
  // Alterna entre os eixos antes de usar a segunda fonte do mesmo eixo. Assim,
  // uma rodada curta cobre beleza, acessórios, calçados e fitness em vez de
  // concentrar todo o orçamento na primeira categoria do projeto.
  for (let indiceConsulta = 0; consultas.length < limite; indiceConsulta += 1) {
    let adicionou = false;
    for (const pergunta of perguntas) {
      const consulta = pergunta.consultas[indiceConsulta];
      if (!consulta) continue;
      consultas.push(consulta);
      adicionou = true;
      if (consultas.length >= limite) break;
    }
    if (!adicionou) break;
  }
  return consultas;
}

function entidadeInput(input: PipelineInput, entidades: string[]) {
  return {
    entidades,
    tipo: "organizacao" as const,
    projeto_id: input.projeto_id,
    frente_id: input.frente_id,
  };
}

// Peso de cada etapa no progresso (0..100). As etapas de LLM dominam o tempo
// real, então carregam a maior fatia — é o que faz a barra andar de forma
// honesta em vez de saltar de 0 a 100 no fim.
const PESO_ETAPA: Record<string, number> = {
  search_planning: 15,
  source_collector: 10,
  source_credibility: 3,
  fact_verifier: 2,
  information_extractor: 30,
  entity_resolver: 5,
  rag_retrieval: 5,
  crossability_reasoning: 25,
  recommendation: 5,
};

/** Callback de progresso: o orquestrador assíncrono grava; o síncrono ignora. */
export type ReportarProgresso = (dados: {
  etapaAtual: string | null;
  etapas: Array<{ nome: string; status: string; origem?: string; observacao?: string }>;
  progresso: number;
}) => Promise<void>;

/**
 * Executa o fluxo compartilhado dos dois agentes de tarefa.
 *
 * Pode rodar de forma síncrona (resposta direta) ou dirigida pela tarefa
 * assíncrona, que passa `reportar` para acompanhar o progresso etapa a etapa.
 * Cada etapa permanece isolada e o resultado final é sempre rascunho.
 */
async function executarPipeline(
  input: PipelineInput,
  pipeline: PipelineCodigo,
  usuarioId: string | null,
  reportar?: ReportarProgresso,
  checkpoint?: Checkpoint
): Promise<PipelineSaida> {
  const inicio = Date.now();
  // Orçamento desta execução. Vive por execução (não global), então duas
  // rodadas simultâneas não contaminam o consumo uma da outra. O contexto é
  // herdado por cada decisão, para a telemetria responder depois
  // "por que esta execução foi interrompida?".
  const orcamento = new OrcamentoExecucao(undefined, {
    jornada: pipeline,
    provedor: env.aiProvider,
    tentativa: checkpoint?.tentativa ?? 1,
  });
  const etapas: Array<{
    nome: string;
    status: "sucesso" | "parcial" | "ignorada";
    execucao_id?: string;
    origem?: string;
    observacao?: string;
  }> = [];
  const entradaAuditoria = {
    cliente: input.cliente,
    objetivo: input.objetivo,
    contexto: input.contexto ?? null,
    limites: {
      consultas: input.limite_consultas,
      resultados_por_consulta: input.limite_resultados_por_consulta,
      urls: input.limite_urls,
      candidatos: input.limite_candidatos,
    },
    projeto_id: input.projeto_id ?? null,
    frente_id: input.frente_id ?? null,
  };

  // Execução-pai criada ANTES das etapas, para que cada uma nasça já apontando
  // para ela (execucao_pai_id). Sem isso, agregar custo por pipeline exigiria
  // varrer o JSONB de tarefa_pipeline.etapas. A saída é preenchida no fecho.
  const execucaoPaiId = await auditarAgente({
    agente: pipeline,
    origem: "pipeline",
    entrada: entradaAuditoria,
    saida: { status: "executando" },
    usuarioId,
    projetoId: input.projeto_id,
    frenteId: input.frente_id,
    iniciadoEm: new Date(inicio),
    tentativa: checkpoint?.tentativa ?? 1,
  });

  /**
   * Executa uma etapa, ou devolve o resultado já gravado no checkpoint.
   *
   * É o mecanismo mínimo pedido: uma etapa concluída não roda de novo só
   * porque uma posterior falhou — nem refaz a chamada externa, nem recobra.
   * Sem fila e sem processo separado; o estado vive na própria tarefa.
   */
  async function comCheckpoint<T>(
    nome: string,
    executar: () => Promise<{ saida: T; execucaoId?: string; origem?: string }>
  ): Promise<{ saida: T; execucaoId?: string; origem?: string; retomada: boolean }> {
    const salvo = checkpoint?.ler<T>(nome);
    if (salvo) {
      etapas.push({
        nome,
        status: "sucesso",
        execucao_id: salvo.execucao_id,
        origem: salvo.origem,
        observacao: "Retomada do checkpoint — etapa não foi reexecutada.",
      });
      return { saida: salvo.saida, execucaoId: salvo.execucao_id, origem: salvo.origem, retomada: true };
    }
    const resultado = await executar();
    await checkpoint?.gravar(nome, {
      saida: resultado.saida,
      execucao_id: resultado.execucaoId,
      origem: resultado.origem,
      concluida_em: new Date().toISOString(),
    });
    return { ...resultado, retomada: false };
  }

  // Progresso: soma dos pesos das etapas já concluídas. Falhar ao reportar
  // nunca derruba o pipeline — é informação de acompanhamento, não resultado.
  const somarProgresso = () =>
    Math.min(100, etapas.reduce((s, e) => s + (PESO_ETAPA[e.nome] ?? 0), 0));

  async function anunciar(etapaAtual: string | null): Promise<void> {
    if (!reportar) return;
    try {
      await reportar({
        etapaAtual,
        etapas: etapas.map((e) => ({ nome: e.nome, status: e.status, origem: e.origem, observacao: e.observacao })),
        progresso: somarProgresso(),
      });
    } catch {
      /* progresso é best-effort — o pipeline continua */
    }
  }

  try {
    await anunciar("search_planning");
    const contextoPipeline = [
      `Pipeline: ${pipeline}`,
      input.contexto,
      "Os resultados são propostas de parceria e devem permanecer como rascunho até validação humana.",
      "Não invente fatos; priorize evidências públicas e sinais de oportunidade.",
      "entidade_foco" in input && input.entidade_foco ? `Entidade foco: ${input.entidade_foco}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const planoCheckpoint = await comCheckpoint<PlanoPesquisa>("search_planning", async () => {
      const iniciadoEm = new Date();
      const planejamento = pipeline === "partner_discovery"
        ? await withTransaction(async (client) => ({
            plano: planejarDescobertaDeMercado({
              cliente: input.cliente,
              objetivo: input.objetivo,
              contexto: input.contexto,
              frentes: await repo.listarFrentesParaDescoberta(
                client,
                input.cliente,
                input.projeto_id ?? null,
                input.frente_id ?? null,
              ),
            }),
            origem: "heuristica" as const,
            modelo: undefined,
            tokens: undefined,
          }))
        : await planejarPesquisa({
            objetivo: input.objetivo,
            contexto: contextoPipeline,
            projeto_id: input.projeto_id,
            frente_id: input.frente_id,
          });
      const execucaoId = await auditarAgente({
        agente: "search_planning",
        origem: planejamento.origem,
        entrada: { objetivo: input.objetivo, contexto: contextoPipeline },
        saida: planejamento.plano,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        modelo: planejamento.modelo,
        tokens: planejamento.tokens,
        iniciadoEm,
        execucaoPaiId,
      });
      return { saida: planejamento.plano, execucaoId, origem: planejamento.origem };
    });
    if (!planoCheckpoint.retomada) {
      etapas.push({
        nome: "search_planning",
        status: "sucesso",
        execucao_id: planoCheckpoint.execucaoId,
        origem: planoCheckpoint.origem,
      });
    }
    const planejamento = { plano: planoCheckpoint.saida, origem: planoCheckpoint.origem ?? "heuristica" };
    await anunciar("source_collector");

    // Guardrail de ferramenta: a coleta faz uma busca por consulta. Cortamos a
    // lista ao que o orçamento ainda permite ANTES de disparar qualquer busca —
    // bloquear depois não devolveria a chamada já feita.
    const consultasPlanejadas = consultasLimitadas(planejamento.plano, input.limite_consultas);
    const buscasDisponiveis = Math.max(
      0,
      orcamento.limites.maxBuscasWeb - orcamento.chamadasDe("web_search")
    );
    const consultas = consultasPlanejadas.slice(0, buscasDisponiveis);
    const consultasBloqueadas = consultasPlanejadas.length - consultas.length;
    if (consultasBloqueadas > 0) {
      orcamento.autorizarFerramenta("web_search", { agente: "source_collector", etapa: "source_collector" });
      logger.warn(
        { bloqueadas: consultasBloqueadas, teto: orcamento.limites.maxBuscasWeb },
        "Consultas de busca cortadas pelo guardrail de custo"
      );
    }

    const coletaCheckpoint = await comCheckpoint<ColetaFontesSaida>("source_collector", async () => {
      const iniciadoEm = new Date();
      const resultado = await coletarFontes({
        consultas,
        limite_por_consulta: input.limite_resultados_por_consulta,
        projeto_id: input.projeto_id,
        frente_id: input.frente_id,
      });
      orcamento.registrarUsoFerramenta("web_search", consultas.length);
      const execucaoId = await auditarAgente({
        agente: "source_collector",
        origem: resultado.origem,
        entrada: { consultas: consultas.length, limite_por_consulta: input.limite_resultados_por_consulta },
        saida: resultado.saida,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        iniciadoEm,
        execucaoPaiId,
        // A busca externa é cobrada por chamada quando atendida pelo Firecrawl.
        // Registramos sempre: em DuckDuckGo o custo é zero, mas o volume de
        // chamadas continua sendo o dado que explica latência e rate limit.
        ferramentas: [{
          ferramenta: resultado.origem === "firecrawl" ? "firecrawl_search" : "web_search",
          chamadas: consultas.length,
          unidades: resultado.saida.total_resultados,
          detalhe: { origem: resultado.origem },
        }],
      });
      return { saida: resultado.saida, execucaoId, origem: resultado.origem };
    });
    const coleta = { saida: coletaCheckpoint.saida, origem: coletaCheckpoint.origem ?? "mock" };
    if (!coletaCheckpoint.retomada) {
      etapas.push({
        nome: "source_collector",
        status: coleta.saida.total_resultados ? "sucesso" : "parcial",
        execucao_id: coletaCheckpoint.execucaoId,
        origem: coleta.origem,
      });
    }

    const credibilidadeCheckpoint = await comCheckpoint<CredibilidadeSaida>("source_credibility", async () => {
      const iniciadoEm = new Date();
      const resultado = avaliarCredibilidade({ coleta: coleta.saida, projeto_id: input.projeto_id, frente_id: input.frente_id });
      const execucaoId = await auditarAgente({
        agente: "source_credibility",
        origem: "heuristica",
        entrada: { total_resultados: coleta.saida.total_resultados },
        saida: resultado.saida,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        iniciadoEm,
        execucaoPaiId,
      });
      return { saida: resultado.saida, execucaoId, origem: "heuristica" };
    });
    const credibilidade = { saida: credibilidadeCheckpoint.saida };
    if (!credibilidadeCheckpoint.retomada) {
      etapas.push({
        nome: "source_credibility",
        status: "sucesso",
        execucao_id: credibilidadeCheckpoint.execucaoId,
        origem: "heuristica",
      });
    }
    await anunciar("information_extractor");
    // Não vale acionar Firecrawl/Ollama sobre links sem uma fonte minimamente
    // confiável. Esta é a primeira barreira contra títulos de login, cookies e
    // páginas genéricas que antes viravam falsas "marcas" no radar.
    const haFonteConfiavel = credibilidade.saida.avaliacoes.some((avaliacao) => avaliacao.score >= 70);

    const entradaExtracao = {
      coleta: coleta.saida,
      limite_urls: input.limite_urls,
      foco: input.objetivo,
      projeto_id: input.projeto_id,
      frente_id: input.frente_id,
    };
    const inicioExtracao = new Date();
    // Guardrail de scraping: a extração busca conteúdo de página pelo Firecrawl,
    // cobrado por página. Autorizamos antes; negado, a extração não roda.
    const scrapeAutorizado = orcamento.autorizarFerramenta("firecrawl_scrape", {
      agente: "information_extractor",
      etapa: "information_extractor",
      paga: !env.extracaoMock,
    });
    const extracao = coleta.saida.total_resultados && haFonteConfiavel && scrapeAutorizado.permitido
      ? pipeline === "partner_discovery"
        ? await extrairCandidatasExternas(entradaExtracao)
        : await extrairInformacoes(entradaExtracao)
      : { saida: { total_conteudos: 0, perfis: [] }, origem: "mock" as const, fonteConteudo: undefined };
    if (extracao.saida.total_conteudos) {
      orcamento.registrarUsoFerramenta("firecrawl_scrape", extracao.saida.total_conteudos);
    }
    const extracaoId = await auditarAgente({
      agente: "information_extractor",
      origem: extracao.origem,
      entrada: { total_resultados: coleta.saida.total_resultados, limite_urls: input.limite_urls, ha_fonte_confiavel: haFonteConfiavel },
      saida: extracao.saida,
      usuarioId,
      projetoId: input.projeto_id,
      frenteId: input.frente_id,
      modelo: extracao.modelo,
      tokens: extracao.tokens,
      iniciadoEm: inicioExtracao,
      execucaoPaiId,
      // O extractor busca o conteúdo das páginas pelo Firecrawl — cobrado por
      // página. Sem este registro, o scraping é a parte invisível da conta.
      ferramentas: extracao.saida.total_conteudos
        ? [{
            ferramenta: "firecrawl_scrape" as const,
            chamadas: extracao.saida.total_conteudos,
            unidades: extracao.saida.total_conteudos,
            detalhe: { origem: extracao.origem },
          }]
        : undefined,
    });
    etapas.push({
      nome: "information_extractor",
      status: extracao.saida.perfis.length ? "sucesso" : "parcial",
      execucao_id: extracaoId,
      origem: extracao.origem,
      observacao: haFonteConfiavel ? undefined : "Nenhuma fonte atingiu a credibilidade mínima; extração e LLM foram poupados.",
    });
    await anunciar("fact_verifier");

    // -------------------------------------------------------------------------
    // Fact Verifier — agora dentro do fluxo real.
    //
    // Antes, esta etapa só rodava se o CHAMADOR enviasse `afirmacoes`, o que
    // nunca acontece numa execução automática: a etapa era sempre "ignorada" e
    // nenhum fato chegava verificado ao Crossability. Agora derivamos as
    // afirmações dos próprios perfis extraídos e as corroboramos contra as
    // fontes coletadas, ANTES do reasoning.
    //
    // A verificação não descarta perfil: ela ANOTA o status de cada afirmação
    // (corroborada / fonte_unica / nao_confirmada). Quem decide o peso disso é
    // o reasoning, que já trata evidência fraca de forma conservadora. Descartar
    // aqui mudaria a lógica de negócio do Crossability, que está fora do escopo.
    // -------------------------------------------------------------------------
    const afirmacoesDerivadas = afirmacoesDosPerfis(extracao.saida, coleta.saida);
    const afirmacoesParaVerificar = [...(input.afirmacoes ?? []), ...afirmacoesDerivadas];

    let verificacao: VerificacaoSaida | null = null;
    if (afirmacoesParaVerificar.length) {
      const inicioVerificacao = new Date();
      const verificada = verificarFatos({
        afirmacoes: afirmacoesParaVerificar,
        projeto_id: input.projeto_id,
        frente_id: input.frente_id,
      });
      const verificacaoId = await auditarAgente({
        agente: "fact_verifier",
        origem: "heuristica",
        entrada: {
          afirmacoes: afirmacoesParaVerificar.length,
          do_chamador: input.afirmacoes?.length ?? 0,
          derivadas_da_extracao: afirmacoesDerivadas.length,
        },
        saida: verificada.saida,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        iniciadoEm: inicioVerificacao,
        execucaoPaiId,
      });
      verificacao = verificada.saida;
      etapas.push({
        nome: "fact_verifier",
        status: "sucesso",
        execucao_id: verificacaoId,
        origem: "heuristica",
        observacao:
          `${verificada.saida.resumo.corroborada} corroborada(s), ` +
          `${verificada.saida.resumo.fonte_unica} de fonte única, ` +
          `${verificada.saida.resumo.nao_confirmada} não confirmada(s).`,
      });
    } else {
      etapas.push({
        nome: "fact_verifier",
        status: "ignorada",
        observacao: "Não houve perfil extraído nem afirmação do chamador para verificar.",
      });
    }
    await anunciar("entity_resolver");

    let entidades: EntidadesSaida | null = null;
    if (extracao.saida.perfis.length) {
      const nomes = [...new Set(extracao.saida.perfis.map((p) => p.nome).filter(Boolean))];
      const inicioEntidades = new Date();
      const resolucao = await withTransaction(async (client) => {
        const resultado = await resolverEntidades(client, entidadeInput(input, nomes));
        const fim = new Date();
        const id = await repo.registrarExecucao(client, {
          agente: "entity_resolver",
          status: "sucesso",
          origem: "heuristica",
          entrada: { num_entidades: nomes.length, tipo: "organizacao" },
          saida: resultado.saida,
          duracaoMs: fim.getTime() - inicioEntidades.getTime(),
          iniciadoEm: inicioEntidades,
          finalizadoEm: fim,
          execucaoPaiId,
          criadoPorId: usuarioId,
          projetoId: input.projeto_id ?? null,
          frenteId: input.frente_id ?? null,
        });
        return { ...resultado, id };
      });
      entidades = resolucao.saida;
      etapas.push({ nome: "entity_resolver", status: "sucesso", execucao_id: resolucao.id, origem: "heuristica" });
    } else {
      etapas.push({ nome: "entity_resolver", status: "ignorada", observacao: "Nenhum perfil foi extraído." });
    }

    let rag: Awaited<ReturnType<typeof ragService.buscar>> | null = null;
    if (pipeline === "partner_discovery") {
      // A Base Cross contextualiza o planejamento e a deduplicação, mas não
      // participa da descoberta nem do fit. Não a consultamos neste pipeline.
      etapas.push({
        nome: "rag_retrieval",
        status: "ignorada",
        observacao: "Partner Discovery usa exclusivamente evidências externas verificáveis.",
      });
    } else {
    const consultaRag = [
      input.cliente,
      input.objetivo,
      "entidade_foco" in input ? input.entidade_foco : null,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2000);
    const inicioRag = new Date();
    try {
      rag = await ragService.buscar({ consulta: consultaRag, limite: 5 });
      const ragId = await auditarAgente({
        agente: "rag_retrieval",
        origem: rag.embedding_origem,
        entrada: { consulta: consultaRag, limite: 5 },
        saida: rag,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        iniciadoEm: inicioRag,
        execucaoPaiId,
        // Embeddings são cobrados por uso quando servidos pela OpenAI: uma
        // chamada por busca. Em modo mock o custo é zero, mas o volume fica
        // registrado para dimensionar o gasto antes de ligar a chave.
        modelo: rag.embedding_origem === "openai" ? env.openaiEmbedModel : undefined,
        ferramentas: [{
          ferramenta: "embeddings" as const,
          chamadas: 1,
          unidades: 1,
          detalhe: { origem: rag.embedding_origem, operacao: "busca" },
        }],
      });
      etapas.push({
        nome: "rag_retrieval",
        status: rag.total ? "sucesso" : "parcial",
        execucao_id: ragId,
        origem: rag.embedding_origem,
        observacao: rag.total ? `${rag.total} trecho(s) recuperado(s).` : "A base RAG ainda não possui trechos relevantes.",
      });
    } catch (erro) {
      etapas.push({
        nome: "rag_retrieval",
        status: "parcial",
        observacao: `RAG indisponível; pipeline continuou sem contexto: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }
    }

    await anunciar("crossability_reasoning");
    // Só uma entidade que também aparece em fonte confiável segue para a LLM.
    // A resolução e a extração continuam auditadas acima; esta porta decide se
    // há material suficiente para consumir inferência e produzir um rascunho.
    const aprovados = extracao.saida.perfis
      .filter((perfil) => validarCandidataExterna({
        cliente: input.cliente,
        parceiro: perfil.nome,
        objetivo: pipeline === "partner_discovery" ? planejamento.plano.objetivo_interpretado : input.objetivo,
        contexto: input.contexto,
        extracao: extracao.saida,
        coleta: coleta.saida,
        credibilidade: credibilidade.saida,
      }).aprovada)
      .slice(0, input.limite_candidatos);

    // Guardrail de "candidate explosion": o reasoning gasta UMA chamada de LLM
    // por candidato. O limite do chamador (`limite_candidatos`) é uma
    // preferência; o teto do orçamento é uma proteção — vale mesmo que o
    // chamador peça mais, e não depende do pré-filtro ter funcionado bem.
    const corte = orcamento.limitarCandidatos(aprovados);
    const perfis = corte.selecionados;
    const cortados = corte.cortados;
    if (cortados > 0) {
      logger.warn(
        {
          candidatos_recebidos: corte.recebidos,
          candidatos_permitidos: corte.permitidos,
          candidatos_descartados_por_limite: cortados,
          limite: corte.limite,
        },
        "Candidatos cortados pelo guardrail de custo antes do reasoning"
      );
    }
    // Uma chamada de LLM por candidato. Com modelo local, dispará-las todas de
    // uma vez faz elas competirem pela mesma CPU e ficarem mais lentas cada uma;
    // por isso a janela limitada em vez de Promise.all direto.
    const analisesBrutas = await mapearComLimite(
      perfis,
      env.aiProvider === "ollama" ? 1 : 4,
      async (perfil) => {
        const entradaReasoning = {
          cliente: input.cliente,
          parceiro: perfil.nome,
          objetivo: pipeline === "partner_discovery" ? planejamento.plano.objetivo_interpretado : input.objetivo,
          perfil_parceiro: perfil,
          // Partner Discovery avalia a candidata a partir das fontes externas
          // coletadas. O RAG interno serve a outros fluxos, mas não fundamenta
          // nem aparece como evidência de uma nova oportunidade de mercado.
          contexto_rag: pipeline === "partner_discovery" ? undefined : rag?.trechos.map((trecho) => trecho.conteudo),
          projeto_id: input.projeto_id,
          frente_id: input.frente_id,
        };
        const inicioReasoning = new Date();
        // A variante heurística não consome LLM; só a de market_intelligence
        // consome. Pedimos autorização ANTES da chamada — nunca depois.
        const usaLlm = pipeline !== "partner_discovery";
        if (usaLlm) {
          const modeloPrevisto =
            env.aiProvider === "ollama" ? env.ollamaModel
              : env.aiProvider === "deepseek" ? env.deepseekModel
                : env.openaiModel;
          const autorizacao = orcamento.autorizarLlm({
            modelo: modeloPrevisto,
            // Estimativa conservadora por candidato; o consumo real é debitado
            // depois, com os tokens que o provedor efetivamente reportar.
            tokens: { entrada: 4_000, saida: 1_200 },
            local: env.aiProvider === "ollama",
            agente: "crossability_reasoning",
            etapa: "crossability_reasoning",
          });
          if (!autorizacao.permitido) {
            // Não lança: interrompe ESTE candidato e deixa os anteriores
            // intactos. Preservar o trabalho já feito é requisito do guardrail.
            logger.warn(
              { motivo: autorizacao.motivo, parceiro: perfil.nome, custoAtual: autorizacao.custoAtual },
              "Reasoning bloqueado pelo guardrail de custo"
            );
            return null;
          }
        }
        const reasoning = pipeline === "partner_discovery"
          ? raciocinarCrossabilityComEvidenciaExterna(entradaReasoning)
          : await raciocinarCrossability(entradaReasoning);
        if (usaLlm) {
          orcamento.registrarConsumoLlm(
            reasoning.modelo,
            reasoning.tokens ?? { entrada: 0, saida: 0 },
            reasoning.origem === "mock" || reasoning.origem === "ollama"
          );
        }
        const id = await auditarAgente({
          agente: "crossability_reasoning",
          origem: reasoning.origem,
          entrada: { cliente: input.cliente, parceiro: perfil.nome, objetivo: input.objetivo },
          saida: reasoning.saida,
          usuarioId,
          projetoId: input.projeto_id,
          frenteId: input.frente_id,
          modelo: reasoning.modelo,
          tokens: reasoning.tokens,
          iniciadoEm: inicioReasoning,
          execucaoPaiId,
        });
        return { parceiro: perfil.nome, execucao_id: id, origem: reasoning.origem, analise: reasoning.saida };
      }
    );
    // Candidatos bloqueados pelo guardrail voltam como null e são descartados —
    // os já analisados seguem normalmente.
    const analises = analisesBrutas.filter((a): a is NonNullable<typeof a> => a !== null);
    const bloqueadosNoReasoning = analisesBrutas.length - analises.length;

    const observacaoReasoning = [
      analises.length ? `${analises.length} candidato(s) analisado(s).` : "Sem candidatos para analisar.",
      cortados > 0 ? `${cortados} candidato(s) cortado(s) pelo teto de ${orcamento.limites.maxCandidatosReasoning}.` : null,
      bloqueadosNoReasoning > 0 ? `${bloqueadosNoReasoning} bloqueado(s) por orçamento.` : null,
    ].filter(Boolean).join(" ");

    etapas.push({
      nome: "crossability_reasoning",
      status: analises.length ? "sucesso" : "parcial",
      origem: analises[0]?.origem,
      observacao: observacaoReasoning,
    });

    await anunciar("recommendation");
    let recomendacao: RecomendacaoSaida | null = null;
    const inicioRecomendacao = new Date();
    if (analises.length) {
      const ranked = recomendarParceiros({
        candidatos: analises.map((a) => ({ parceiro: a.parceiro, analise: a.analise })),
        projeto_id: input.projeto_id,
        frente_id: input.frente_id,
      });
      const recomendacaoId = await auditarAgente({
        agente: "recommendation",
        origem: "heuristica",
        entrada: { num_candidatos: analises.length },
        saida: ranked.saida,
        usuarioId,
        projetoId: input.projeto_id,
        frenteId: input.frente_id,
        iniciadoEm: inicioRecomendacao,
        execucaoPaiId,
      });
      recomendacao = ranked.saida;
      etapas.push({ nome: "recommendation", status: "sucesso", execucao_id: recomendacaoId, origem: "heuristica" });
    } else {
      etapas.push({ nome: "recommendation", status: "ignorada", observacao: "A recomendação exige ao menos um candidato analisado." });
    }

    // Uma execução interrompida por orçamento NÃO é erro técnico: distinguir os
    // dois é o que permite ao usuário saber que faltou verba, não que quebrou.
    const status = orcamento.foiBloqueada && !analises.length
      ? (orcamento.motivoPrincipal === "cost_unknown" ? "cost_unknown" : "budget_blocked")
      : analises.length ? "sucesso" : "insufficient_evidence";

    const observacoes = [
      `Pipeline ${pipeline} executado em ${Date.now() - inicio}ms.`,
      "Toda análise permanece como rascunho até o Human Gate.",
    ];
    if (!coleta.saida.total_resultados) observacoes.push("A coleta não retornou resultados; forneça fontes ou ajuste o provedor.");
    if (!analises.length && !orcamento.foiBloqueada) observacoes.push("Não houve evidência suficiente para gerar recomendação.");
    for (const bloqueio of orcamento.historicoBloqueios) {
      observacoes.push(`Guardrail (${bloqueio.motivo}): ${bloqueio.detalhe}`);
    }

    const semExecucaoId = {
      pipeline,
      status,
      execucao_id: "00000000-0000-0000-0000-000000000000",
      etapas,
      plano: planejamento.plano,
      coleta: coleta.saida,
      credibilidade: credibilidade.saida,
      verificacao,
      rag,
      entidades,
      extracao: extracao.saida,
      analises,
      recomendacao,
      observacoes,
    } as const;
    // O pai já existe (criado antes das etapas). Aqui ele é FECHADO, e os
    // totais de token e custo são somados das filhas em SQL.
    await withTransaction((client) =>
      repo.finalizarExecucaoPai(client, {
        id: execucaoPaiId,
        status: "sucesso",
        saida: {
          status,
          etapas: etapas.map((e) => ({ nome: e.nome, status: e.status, origem: e.origem })),
          total_resultados: coleta.saida.total_resultados,
          total_perfis: extracao.saida.perfis.length,
          total_analises: analises.length,
          recomendacao: recomendacao?.ranking[0]?.parceiro ?? null,
          // Telemetria do guardrail: consumo, limites e cada bloqueio com seu
          // motivo estruturado — o pai reflete o desfecho financeiro real.
          orcamento: orcamento.resumo(),
          bloqueios: orcamento.historicoBloqueios,
        },
        iniciadoEm: new Date(inicio),
      })
    ).catch((causa) => logger.warn({ causa, execucaoPaiId }, "Falha ao fechar a execução-pai do pipeline"));

    return pipelineSaidaSchema.parse({ ...semExecucaoId, execucao_id: execucaoPaiId });
  } catch (erro) {
    // Fecha o mesmo pai com erro, preservando o vínculo com as etapas que já
    // rodaram. Antes, o catch criava um registro novo e solto — as etapas
    // concluídas ficavam órfãs de qualquer execução com status de falha.
    await withTransaction((client) =>
      repo.finalizarExecucaoPai(client, {
        id: execucaoPaiId,
        status: "erro",
        erro: erro instanceof Error ? erro.message : String(erro),
        iniciadoEm: new Date(inicio),
      })
    ).catch(() => undefined);
    throw erro;
  }
}

export function executarPartnerDiscovery(input: ExecutarPartnerDiscoveryInput, usuarioId: string | null) {
  return executarPipeline(input, "partner_discovery", usuarioId);
}

export function executarMarketIntelligence(input: ExecutarMarketIntelligenceInput, usuarioId: string | null) {
  return executarPipeline(input, "market_intelligence", usuarioId);
}

// --- Execução assíncrona com progresso ----------------------------------------
//
// O pipeline encadeia várias chamadas de LLM; com modelo local isso passa de
// qualquer timeout HTTP razoável. Aqui a rota só CRIA a tarefa e devolve o id na
// hora — a execução segue em segundo plano gravando o progresso, e o front
// acompanha por polling. É o que faz a tela mostrar o carregamento em vez de
// esperar em branco até estourar.

/** Cria a tarefa e dispara a execução em segundo plano. Retorna de imediato. */
export async function agendarPipeline(
  input: PipelineInput,
  pipeline: PipelineCodigo,
  usuarioId: string | null
): Promise<repo.TarefaPipelineRow> {
  const tarefa = await withTransaction((client) =>
    repo.criarTarefaPipeline(client, {
      pipeline,
      entrada: input,
      projetoId: input.projeto_id ?? null,
      frenteId: input.frente_id ?? null,
      criadoPorId: usuarioId,
    })
  );

  // Dispara sem aguardar: o erro é gravado na própria tarefa, então um
  // `catch` vazio aqui não esconde nada — o estado fica visível na consulta.
  void executarTarefaEmSegundoPlano(tarefa.id, input, pipeline, usuarioId);

  return tarefa;
}

async function executarTarefaEmSegundoPlano(
  tarefaId: string,
  input: PipelineInput,
  pipeline: PipelineCodigo,
  usuarioId: string | null
): Promise<void> {
  try {
    await withTransaction((client) =>
      repo.atualizarProgressoTarefa(client, tarefaId, { status: "executando", progresso: 0 })
    );

    const reportarProgresso: ReportarProgresso = async (dados) => {
      await withTransaction((client) =>
        repo.atualizarProgressoTarefa(client, tarefaId, {
          etapaAtual: dados.etapaAtual,
          etapas: dados.etapas as repo.EtapaTarefa[],
          progresso: dados.progresso,
        })
      );
    };

    // Checkpoint desta tarefa. Numa primeira execução vem vazio; numa retomada
    // traz as etapas já concluídas, que não serão refeitas nem recobradas.
    const salvo = await withTransaction((client) => repo.lerCheckpoint(client, tarefaId));
    const checkpoint: Checkpoint = {
      ler: <T,>(etapa: string) => salvo[etapa] as EtapaCheckpoint<T> | undefined,
      gravar: async (etapa, dados) => {
        // Falhar ao gravar checkpoint não derruba a execução: perde-se a
        // retomada daquela etapa, não o resultado em andamento.
        await withTransaction((client) =>
          repo.gravarCheckpointEtapa(client, tarefaId, etapa, dados as repo.EtapaCheckpointRow)
        ).catch((causa) => logger.warn({ causa, tarefaId, etapa }, "Falha ao gravar checkpoint da etapa"));
      },
    };

    const saida = pipeline === "partner_discovery"
      ? (await gerarOportunidades(input, usuarioId, reportarProgresso, checkpoint)).pipeline
      : await executarPipeline(input, pipeline, usuarioId, reportarProgresso, checkpoint);

    await withTransaction((client) =>
      repo.finalizarTarefa(client, tarefaId, {
        status: "concluida",
        resultado: saida,
        execucaoPipelineId: saida.execucao_id,
      })
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error({ erro, tarefaId, pipeline }, "Tarefa de pipeline falhou");
    await withTransaction((client) =>
      repo.finalizarTarefa(client, tarefaId, { status: "erro", erro: mensagem })
    ).catch(() => undefined);
  }
}

export function consultarTarefa(id: string): Promise<repo.TarefaPipelineRow | null> {
  return withTransaction((client) => repo.buscarTarefaPipeline(client, id));
}

/** Recupera tarefas que ficaram presas após uma queda/reinício do processo. */
export function recuperarTarefasInterrompidas(): Promise<number> {
  return withTransaction((client) => repo.encerrarTarefasInterrompidas(client));
}

export function listarTarefas(filtros: { status?: string; pagina: number; porPagina: number }) {
  const limit = filtros.porPagina;
  const offset = (filtros.pagina - 1) * filtros.porPagina;
  return withTransaction((client) =>
    repo.listarTarefasPipeline(client, { status: filtros.status, limit, offset })
  );
}
