import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { construirPerfil } from "../entidade/entity-intelligence.agent";
import { analisarCrossability } from "../crossability/crossability-reasoning.agent";
import { executarMatching } from "../matching/internal-matching.agent";
import { recomendar } from "../recomendacao/recommendation.agent";
import { salvarProposta } from "../recomendacao/recomendacao.repository";
import { promover, PromocaoBloqueada } from "../recomendacao/promocao.service";
import {
  JourneyInvalida,
  POLITICA_REUSO,
  journeyResultSchema,
  type ExecutionPlan,
  type JourneyResult,
  type JourneyStatus,
  type JourneyType,
  type StepExecution,
  type StepName,
} from "./journey.schema";
import type { EntityIntelligenceProfile } from "../entidade/perfil.schema";
import type { CrossabilityAnalysis } from "../crossability/crossability.schema";
import type { InternalMatchingResult } from "../matching/matching.schema";
import type { EvidencePackage } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Cross Orchestrator.
//
// Coordena os agentes já construídos para executar as três jornadas canônicas.
//
// NÃO é uma LLM. O planejamento é determinístico: quem decide qual agente roda
// é regra em TypeScript, olhando disponibilidade de artefato, frescor, direção
// e estado humano. Pedir isso a um modelo tornaria o sistema imprevisível e
// caro sem ganho algum.
//
// Princípio central: REUSE BEFORE RERUN. Antes de chamar qualquer agente, o
// Orchestrator verifica se já existe artefato válido para aquele contexto.
//
// Os Human Gates são pausa REAL — a jornada para e devolve o controle.
// -----------------------------------------------------------------------------

/** Artefatos já existentes, oferecidos ao planejador para reuso. */
export interface ArtefatosExistentes {
  evidencia?: EvidencePackage | null;
  evidenciaEm?: Date | null;
  perfilOrigem?: EntityIntelligenceProfile | null;
  perfilOrigemEm?: Date | null;
  perfilCandidato?: EntityIntelligenceProfile | null;
  crossability?: CrossabilityAnalysis | null;
  crossabilityEm?: Date | null;
  /** Sinais opcionais — contexto, nunca reexecutados pela jornada. */
  bigMomentRefs?: string[];
  meetingIntelligenceRefs?: string[];
  monitoringAlertRef?: string | null;
}

export interface EntradaJourney {
  journeyType: JourneyType;
  triggerSource?: JourneyResult["trigger_source"];
  triggerRef?: string | null;
  parteOrigemId?: string | null;
  nomeOrigem: string;
  objetivo?: string | null;
  artefatos?: ArtefatosExistentes;
  /** Adaptador de pesquisa; ausente = Research indisponível nesta execução. */
  pesquisar?: (entidade: string) => Promise<EvidencePackage>;
  criadoPorId?: string | null;
  agora?: Date;
  maxCandidatos?: number;
  tamanhoShortlist?: number;
}

const ORDEM_STEPS: StepName[] = [
  "research", "entity_intelligence", "crossability",
  "matching", "recommendation", "human_review",
  "promotion", "paper", "score_card",
];

/** Seção do perfil correspondente a cada tipo de sinal do Matching. */
const SECAO_POR_SINAL: Record<string, "publicos" | "territorios" | "ativos"> = {
  publico: "publicos",
  territorio: "territorios",
  geografico: "territorios",
  ativo: "ativos",
};

/**
 * Monta o perfil do candidato a partir dos sinais que o Matching já calculou.
 *
 * Não é pesquisa nova nem chamada de agente: é reaproveitamento dos dados
 * internos que o Matching leu (`cross_intelligence.parte_publico` e afins),
 * reorganizados no formato que a Recommendation espera.
 *
 * Só entram sinais com `candidato_refs`: sem referência do lado do candidato,
 * o sinal não afirma nada sobre ele — e um perfil montado com afirmações sem
 * lastro seria pior do que perfil ausente.
 */
function perfilDoCandidato(
  candidato: InternalMatchingResult["shortlist"][number],
  direcao: JourneyType
): EntityIntelligenceProfile {
  const secoes: Record<string, Array<Record<string, unknown>>> = {
    contexto_empresa: [], posicionamento: [], publicos: [],
    territorios: [], ativos: [], produtos: [],
    relacionamentos: [], movimentos: [],
  };

  for (const s of candidato.sinais) {
    const secao = SECAO_POR_SINAL[s.tipo];
    if (!secao || !s.candidato_refs.length) continue;

    for (const ref of s.candidato_refs) {
      secoes[secao].push({
        valor: ref,
        confianca: s.valor === null ? 50 : Math.round(s.valor * 100),
        proveniencia: {
          // Interno: o dado veio da base da Cross, não da web.
          origem: "interno",
          registro_interno: `internal_matching.sinal(${s.tipo})`,
          evidence_refs: [],
          source_refs: [],
        },
        publicado_em: null,
      });
    }
  }

  return {
    identidade: {
      nome: candidato.nome,
      aliases: [],
      dominio_oficial: null,
      tipo: candidato.tipo,
      parte_id: candidato.parte_id,
      vinculo: "vinculada",
      requer_resolucao_humana: false,
      candidatas: [],
    },
    relacao_interna: {
      eh_cliente_cross: candidato.eh_cliente_cross,
      papeis: candidato.papeis,
    },
    ...secoes,
    timeline: [], conflitos: [],
    // A lacuna é declarada: este perfil vem de sinais internos, não de uma
    // execução do Entity Intelligence sobre evidência externa.
    lacunas: candidato.informacao_faltante.map((d) => ({
      campo: "perfil_candidato", descricao: d,
    })),
    versao_perfil: 1,
    status_perfil: candidato.status_perfil,
    hash_entrada: candidato.parte_id,
    nivel_validacao: "estrutural",
    frescor: { mais_recente_em: null, itens_datados: 0 },
    telemetria: {
      duracao_ms: 0, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      fatos_considerados: candidato.sinais.length, fatos_descartados: 0,
      origem: `internal_matching:${direcao}`,
    },
  } as unknown as EntityIntelligenceProfile;
}

function idadeDias(quando: Date | null | undefined, agora: Date): number | null {
  if (!quando) return null;
  return (agora.getTime() - quando.getTime()) / 86_400_000;
}

/**
 * Monta o plano da jornada.
 *
 * Determinístico e auditável: cada etapa recebe uma ação e um MOTIVO. Sem o
 * motivo, "reutilizada" seria um número sem explicação — e a economia
 * declarada não poderia ser conferida.
 */
export function planejar(entrada: EntradaJourney): ExecutionPlan {
  const agora = entrada.agora ?? new Date();
  const a = entrada.artefatos ?? {};
  const steps: ExecutionPlan["steps"] = [];
  const bloqueios: string[] = [];
  let externas = 0;

  const add = (
    step: StepName, acao: ExecutionPlan["steps"][0]["acao"], motivo: string
  ) => steps.push({ step, ordem: steps.length + 1, acao, motivo });

  // ------------------------------------------------------------- research
  const idadeEvidencia = idadeDias(a.evidenciaEm, agora);
  if (a.evidencia && idadeEvidencia !== null && idadeEvidencia <= POLITICA_REUSO.maxIdadePerfilDias) {
    add("research", "reutilizar",
      `Evidence existente com ${Math.round(idadeEvidencia)} dia(s); dentro da política de reuso.`);
  } else if (a.perfilOrigem && !a.evidencia) {
    // Perfil válido sem Evidence bruta: pesquisar de novo só para reconstruir o
    // que o perfil já consolidou seria trabalho desperdiçado.
    add("research", "pular", "Perfil consolidado disponível; Evidence bruta não é necessária.");
  } else if (!entrada.pesquisar) {
    add("research", "pular", "Nenhum adaptador de pesquisa disponível nesta execução.");
  } else {
    add("research", "executar", "Sem Evidence válida para a entidade.");
    externas += 1;
  }

  // -------------------------------------------------- entity intelligence
  const idadePerfil = idadeDias(a.perfilOrigemEm, agora);
  if (a.perfilOrigem && idadePerfil !== null && idadePerfil <= POLITICA_REUSO.maxIdadePerfilDias) {
    add("entity_intelligence", "reutilizar",
      `Perfil v${a.perfilOrigem.versao_perfil} com ${Math.round(idadePerfil)} dia(s).`);
  } else if (a.perfilOrigem) {
    add("entity_intelligence", "executar", "Perfil existente fora da janela de frescor.");
  } else {
    add("entity_intelligence", "executar", "Nenhum perfil consolidado para a origem.");
  }

  // ---------------------------------------------------------- crossability
  const idadeCross = idadeDias(a.crossabilityEm, agora);
  if (a.crossability && idadeCross !== null && idadeCross <= POLITICA_REUSO.maxIdadeCrossabilityDias) {
    add("crossability", "reutilizar", `Análise existente com ${Math.round(idadeCross)} dia(s).`);
  } else {
    add("crossability", "executar", "Sem análise Crossability válida para o contexto.");
  }

  // --------------------------------------------------------------- matching
  // Direção faz parte da identidade do resultado: shortlist de
  // cliente→parceiro nunca serve para parceiro→cliente.
  add("matching", "executar",
    `Matching é sempre executado por direção (${entrada.journeyType}); resultado de outra direção não é reaproveitável.`);

  add("recommendation", "executar", "Recommendation depende do par source+candidato desta jornada.");
  add("human_review", "aguardar_humano", "Human Gate: a jornada para até decisão humana.");
  add("promotion", "aguardar_humano", "Promoção exige ação humana explícita (AI-07B).");
  add("paper", "aguardar_humano", "Paper segue fluxo humano existente.");
  add("score_card", "aguardar_humano", "Score Card exige Paper aprovado (RN022).");

  // ------------------------------------------------------------ bloqueios
  if (entrada.journeyType === "prospeccao_do_zero" && !entrada.parteOrigemId) {
    bloqueios.push(
      "Entidade de origem não vinculada a uma Parte: promoção operacional bloqueada até resolução humana."
    );
  }

  return {
    journey_type: entrada.journeyType,
    steps, bloqueios,
    chamadas_externas_estimadas: externas,
  };
}

/**
 * Executa a jornada até o primeiro Human Gate.
 *
 * Para de propósito em `aguardando_revisao_humana` — não simula aprovação.
 */
export async function executarJourney(
  client: PoolClient,
  entrada: EntradaJourney
): Promise<JourneyResult> {
  const inicioMs = Date.now();
  const agora = entrada.agora ?? new Date();
  const correlationId = `jrn-${randomUUID().slice(0, 12)}`;
  const a = entrada.artefatos ?? {};
  const avisos: string[] = [];

  const plano = planejar(entrada);

  const { rows: jr } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.journey_execution
       (journey_type, trigger_source, trigger_ref, parte_origem_id, nome_origem,
        objetivo, status, correlation_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,'inteligencia_em_progresso',$7,$8)
     RETURNING id`,
    [
      entrada.journeyType, entrada.triggerSource ?? "humano", entrada.triggerRef ?? null,
      entrada.parteOrigemId ?? null, entrada.nomeOrigem, entrada.objetivo ?? null,
      correlationId, entrada.criadoPorId ?? null,
    ]
  );
  const journeyId = jr[0].id;

  const steps: StepExecution[] = [];
  let contextoTotal = 0;
  let evitadosResearch = 0;
  let evitadosPerfil = 0;
  let evitadosCross = 0;

  const registrar = async (s: StepExecution) => {
    steps.push(s);
    contextoTotal += s.contexto_caracteres;
    await client.query(
      `INSERT INTO cross_ai.journey_step
         (journey_id, ordem, step, status, motivo, execucao_agente_id,
          output_ref, output_versao, contexto_caracteres, duracao_ms, erro, finalizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
      [
        journeyId, s.ordem, s.step, s.status, s.motivo, s.execucao_agente_id,
        s.output_ref, s.output_versao, s.contexto_caracteres, s.duracao_ms, s.erro,
      ]
    );
  };

  const acaoDe = (step: StepName) => plano.steps.find((p) => p.step === step)!;
  const finalizar = async (
    status: JourneyStatus, motivo: string | null, refs: Partial<JourneyResult["refs"]> = {}
  ): Promise<JourneyResult> => {
    await client.query(
      // $2 é comparado e atribuído: sem o cast explícito o Postgres não deduz
      // um tipo único para o parâmetro ("inconsistent types deduced").
      `UPDATE cross_ai.journey_execution
          SET status = $2::varchar, motivo_parada = $3, recomendacao_id = $4,
              atualizado_em = now(),
              finalizado_em = CASE WHEN $2::varchar IN ('concluida','falha','evidencia_insuficiente')
                                   THEN now() ELSE NULL END
        WHERE id = $1`,
      [journeyId, status, motivo, refs.recomendacao_id ?? null]
    );

    return journeyResultSchema.parse({
      journey_id: journeyId,
      correlation_id: correlationId,
      journey_type: entrada.journeyType,
      trigger_source: entrada.triggerSource ?? "humano",
      origem: {
        parte_id: entrada.parteOrigemId ?? null,
        nome: entrada.nomeOrigem,
        vinculo: entrada.parteOrigemId ? "vinculada" : "nao_vinculada",
      },
      objetivo: entrada.objetivo ?? null,
      status,
      motivo_parada: motivo,
      plano,
      steps,
      refs: {
        perfil_origem_hash: refs.perfil_origem_hash ?? null,
        perfil_candidato_hash: refs.perfil_candidato_hash ?? null,
        crossability_hash: refs.crossability_hash ?? null,
        matching_direcao: refs.matching_direcao ?? null,
        candidato_parte_id: refs.candidato_parte_id ?? null,
        recomendacao_id: refs.recomendacao_id ?? null,
        revisao_id: null, promocao_id: null, candidatura_id: null,
      },
      contexto_opcional: {
        big_moment_refs: a.bigMomentRefs ?? [],
        meeting_intelligence_refs: a.meetingIntelligenceRefs ?? [],
        monitoring_alert_ref: a.monitoringAlertRef ?? null,
      },
      nivel_validacao: "estrutural_e2e",
      validacao_ia_real: "pendente",
      validacao_web_ao_vivo: "pendente",
      telemetria: {
        duracao_ms: Date.now() - inicioMs,
        steps_executados: steps.filter((s) => s.status === "concluida").length,
        steps_reutilizados: steps.filter((s) => s.status === "reutilizada").length,
        steps_pulados: steps.filter((s) => s.status === "pulada").length,
        contexto_total_caracteres: contextoTotal,
        research_evitados: evitadosResearch,
        entity_intelligence_evitados: evitadosPerfil,
        crossability_evitados: evitadosCross,
        // Sinais opcionais entram como referência; nunca são reexecutados.
        big_moment_evitados: (a.bigMomentRefs ?? []).length ? 1 : 0,
        meeting_intelligence_evitados: (a.meetingIntelligenceRefs ?? []).length ? 1 : 0,
        llm_calls: 0, embedding_calls: 0,
        web_search_calls: 0, firecrawl_calls: 0,
        custo_estimado_usd: 0,
        // O Orchestrator não cria nada operacional por conta própria.
        oportunidades_criadas: 0, avancos_de_funil: 0, projetos_criados: 0,
        parcerias_criadas: 0, reunioes_criadas: 0, papers_aprovados_por_ia: 0,
        avisos,
      },
    });
  };

  // ------------------------------------------------------------- research
  const acRes = acaoDe("research");
  let evidencia = a.evidencia ?? null;
  if (acRes.acao === "reutilizar") {
    evitadosResearch++;
    await registrar({
      step: "research", ordem: acRes.ordem, status: "reutilizada", motivo: acRes.motivo,
      execucao_agente_id: null, output_ref: "evidence-existente", output_versao: null,
      contexto_caracteres: 0, duracao_ms: 0, erro: null,
    });
  } else if (acRes.acao === "pular") {
    evitadosResearch++;
    await registrar({
      step: "research", ordem: acRes.ordem, status: "pulada", motivo: acRes.motivo,
      execucao_agente_id: null, output_ref: null, output_versao: null,
      contexto_caracteres: 0, duracao_ms: 0, erro: null,
    });
  } else {
    const t0 = Date.now();
    evidencia = await entrada.pesquisar!(entrada.nomeOrigem);
    await registrar({
      step: "research", ordem: acRes.ordem, status: "concluida", motivo: acRes.motivo,
      execucao_agente_id: null,
      output_ref: `facts:${evidencia.facts.length}`, output_versao: null,
      contexto_caracteres: 0, duracao_ms: Date.now() - t0, erro: null,
    });
  }

  // -------------------------------------------- entity intelligence
  const acEi = acaoDe("entity_intelligence");
  let perfil = a.perfilOrigem ?? null;
  if (acEi.acao === "reutilizar" && perfil) {
    evitadosPerfil++;
    await registrar({
      step: "entity_intelligence", ordem: acEi.ordem, status: "reutilizada", motivo: acEi.motivo,
      execucao_agente_id: null, output_ref: perfil.hash_entrada,
      output_versao: perfil.versao_perfil, contexto_caracteres: 0, duracao_ms: 0, erro: null,
    });
  } else {
    const t0 = Date.now();
    perfil = construirPerfil({
      entidade: entrada.nomeOrigem,
      internos: {
        parte_id: entrada.parteOrigemId ?? null,
        nome_exibicao: entrada.nomeOrigem,
        eh_cliente_cross: entrada.journeyType === "cliente_para_parceiro",
      },
      evidencia,
      anterior: a.perfilOrigem ?? null,
    });
    await registrar({
      step: "entity_intelligence", ordem: acEi.ordem, status: "concluida", motivo: acEi.motivo,
      execucao_agente_id: null, output_ref: perfil.hash_entrada,
      output_versao: perfil.versao_perfil, contexto_caracteres: 0,
      duracao_ms: Date.now() - t0, erro: null,
    });
  }

  // ---------------------------------------------------- fail-safe factual
  //
  // Perfil sem nenhum fato não sustenta Crossability nem Recommendation.
  // Continuar aqui produziria hipótese inventada — pior do que parar.
  const totalFatos = [
    perfil.publicos, perfil.territorios, perfil.ativos, perfil.produtos,
    perfil.movimentos, perfil.relacionamentos, perfil.contexto_empresa, perfil.posicionamento,
  ].reduce((s, arr) => s + arr.length, 0);

  if (totalFatos === 0) {
    for (const nome of ["crossability", "matching", "recommendation"] as StepName[]) {
      const ac = acaoDe(nome);
      await registrar({
        step: nome, ordem: ac.ordem, status: "bloqueada",
        motivo: "Perfil sem fatos: nenhuma inteligência pode ser sustentada.",
        execucao_agente_id: null, output_ref: null, output_versao: null,
        contexto_caracteres: 0, duracao_ms: null, erro: null,
      });
    }
    return finalizar(
      "evidencia_insuficiente",
      "Nenhum fato disponível sobre a entidade de origem.",
      { perfil_origem_hash: perfil.hash_entrada }
    );
  }

  // ---------------------------------------------------------- crossability
  const acCross = acaoDe("crossability");
  let crossability = a.crossability ?? null;
  if (acCross.acao === "reutilizar" && crossability) {
    evitadosCross++;
    await registrar({
      step: "crossability", ordem: acCross.ordem, status: "reutilizada", motivo: acCross.motivo,
      execucao_agente_id: null, output_ref: crossability.provenance.perfil_hash,
      output_versao: null, contexto_caracteres: 0, duracao_ms: 0, erro: null,
    });
  } else {
    const t0 = Date.now();
    crossability = await analisarCrossability({
      perfil, contexto: { objetivo: entrada.objetivo ?? null }, client,
      // Modelo real desligado: a etapa roda estruturalmente e declara isso.
      chamarModelo: async () => ({ dados: {}, origem: "estrutural" }),
    });
    await registrar({
      step: "crossability", ordem: acCross.ordem, status: "concluida", motivo: acCross.motivo,
      execucao_agente_id: null, output_ref: crossability.provenance.perfil_hash,
      output_versao: null,
      contexto_caracteres: crossability.telemetria.contexto_caracteres,
      duracao_ms: Date.now() - t0, erro: null,
    });
  }

  // --------------------------------------------------------------- matching
  const acMatch = acaoDe("matching");
  const t0Match = Date.now();
  const matching = await executarMatching(client, {
    direcao: entrada.journeyType,
    parteOrigemId: entrada.parteOrigemId ?? null,
    nomeOrigem: entrada.nomeOrigem,
    objetivo: entrada.objetivo ?? null,
    maxCandidatos: entrada.maxCandidatos,
    tamanhoShortlist: entrada.tamanhoShortlist,
  });
  await registrar({
    step: "matching", ordem: acMatch.ordem, status: "concluida", motivo: acMatch.motivo,
    execucao_agente_id: null,
    output_ref: `${matching.direcao}:${matching.shortlist.length}`,
    output_versao: null, contexto_caracteres: 0,
    duracao_ms: Date.now() - t0Match, erro: null,
  });

  if (matching.shortlist.length === 0) {
    const acRec = acaoDe("recommendation");
    await registrar({
      step: "recommendation", ordem: acRec.ordem, status: "bloqueada",
      motivo: "Nenhum candidato na shortlist.",
      execucao_agente_id: null, output_ref: null, output_versao: null,
      contexto_caracteres: 0, duracao_ms: null, erro: null,
    });
    return finalizar("requer_enriquecimento", "Matching não encontrou candidatos elegíveis.", {
      perfil_origem_hash: perfil.hash_entrada,
      crossability_hash: crossability.provenance.perfil_hash,
      matching_direcao: matching.direcao,
    });
  }

  // --------------------------------------------------------- recommendation
  const candidato = matching.shortlist[0];
  const acRec = acaoDe("recommendation");
  const t0Rec = Date.now();

  // Perfil do CANDIDATO.
  //
  // Sem ele a proposta é estruturalmente incapaz de ter evidência de suporte:
  // `evidencias_suporte` é montada a partir do perfil do candidato, então a
  // recomendação sairia sempre como `requer_enriquecimento` com confiança
  // mínima — não por falta de dados na plataforma, mas por não tê-los passado.
  //
  // Quando o chamador já traz um perfil consolidado, ele vence: é mais rico do
  // que o que o Matching carrega. Caso contrário, montamos um perfil a partir
  // dos MESMOS sinais internos que o Matching já leu, sem nova pesquisa.
  const perfilCandidato =
    a.perfilCandidato ?? perfilDoCandidato(candidato, entrada.journeyType);

  const proposta = recomendar({
    matching,
    candidatoParteId: candidato.parte_id,
    perfilOrigem: perfil,
    perfilCandidato,
    crossability,
    objetivo: entrada.objetivo ?? null,
  });

  const salva = await salvarProposta(client, {
    proposta, criadoPorId: entrada.criadoPorId ?? null,
  });

  await registrar({
    step: "recommendation", ordem: acRec.ordem, status: "concluida", motivo: acRec.motivo,
    execucao_agente_id: null, output_ref: salva.id, output_versao: salva.versao,
    contexto_caracteres: 0, duracao_ms: Date.now() - t0Rec, erro: null,
  });

  await client.query(
    `UPDATE cross_ai.journey_execution SET recomendacao_id = $2 WHERE id = $1`,
    [journeyId, salva.id]
  );

  // ------------------------------------------------------- HUMAN GATE
  //
  // A jornada PARA aqui. Não existe caminho que aprove sozinho — é o ponto
  // inteiro do gate.
  const acHuman = acaoDe("human_review");
  await registrar({
    step: "human_review", ordem: acHuman.ordem, status: "aguardando_humano",
    motivo: acHuman.motivo, execucao_agente_id: null,
    output_ref: null, output_versao: null,
    contexto_caracteres: 0, duracao_ms: null, erro: null,
  });

  return finalizar("aguardando_revisao_humana", "Aguardando decisão humana sobre a hipótese.", {
    perfil_origem_hash: perfil.hash_entrada,
    crossability_hash: crossability.provenance.perfil_hash,
    matching_direcao: matching.direcao,
    candidato_parte_id: candidato.parte_id,
    recomendacao_id: salva.id,
  });
}

/**
 * Retoma a jornada após decisão humana.
 *
 * Não reexecuta nada já concluído — as etapas anteriores continuam registradas
 * com seu estado. É isso que faz o crash/resume não repetir trabalho.
 */
export async function retomarJourney(
  client: PoolClient,
  journeyId: string,
  opcoes: {
    frenteOportunidadeId?: string;
    promotorId?: string | null;
    promotorNome?: string | null;
    versaoLida?: number;
  } = {}
): Promise<{
  status: JourneyStatus;
  motivo: string | null;
  candidaturaId: string | null;
  promocaoId: string | null;
  stepsReexecutados: number;
}> {
  const { rows } = await client.query<{
    id: string; status: string; recomendacao_id: string | null; versao: number;
  }>(
    `SELECT id, status, recomendacao_id, versao
       FROM cross_ai.journey_execution WHERE id = $1`,
    [journeyId]
  );
  if (!rows.length) throw new JourneyInvalida(`Jornada ${journeyId} não encontrada.`);
  const j = rows[0];

  if (!j.recomendacao_id) {
    throw new JourneyInvalida("Jornada sem Recommendation; nada a retomar.");
  }

  // Estado da decisão humana — a jornada não decide por conta própria.
  const { rows: rev } = await client.query<{ id: string; decisao: string }>(
    `SELECT id, decisao FROM cross_ai.recomendacao_revisao
      WHERE recomendacao_id = $1 AND decidido_em IS NOT NULL`,
    [j.recomendacao_id]
  );

  if (!rev.length) {
    return {
      status: "aguardando_revisao_humana",
      motivo: "Nenhuma decisão humana registrada ainda.",
      candidaturaId: null, promocaoId: null, stepsReexecutados: 0,
    };
  }

  const decisao = rev[0].decisao;

  // Allow-list, não deny-list: só estas duas decisões liberam avanço. Testar
  // apenas `rejeitada` deixaria `requer_mais_informacao` (e um `pendente`
  // remanescente) caírem no caminho de aprovação — exatamente o que o Human
  // Gate existe para impedir.
  const APROVACOES = new Set([
    "aprovada_para_revisao_de_oportunidade",
    "aprovada_com_edicoes",
  ]);

  if (!APROVACOES.has(decisao)) {
    const terminal = decisao === "rejeitada";
    const status: JourneyStatus = terminal
      ? "revisao_rejeitada"
      : "aguardando_revisao_humana";
    const motivo = terminal
      ? "Hipótese rejeitada por decisão humana."
      : `Decisão "${decisao}": a jornada permanece aguardando o humano.`;

    await client.query(
      `UPDATE cross_ai.journey_execution
          SET status=$2::varchar, motivo_parada=$3, revisao_id=$4, atualizado_em=now(),
              finalizado_em = CASE WHEN $5::boolean THEN now() ELSE NULL END
        WHERE id=$1`,
      [journeyId, status, motivo, rev[0].id, terminal]
    );
    return {
      status, motivo,
      candidaturaId: null, promocaoId: null, stepsReexecutados: 0,
    };
  }

  // Aprovada — mas promoção continua sendo ação humana SEPARADA.
  if (!opcoes.frenteOportunidadeId) {
    await client.query(
      `UPDATE cross_ai.journey_execution
          SET status='aguardando_promocao', motivo_parada=$2, revisao_id=$3, atualizado_em=now()
        WHERE id=$1`,
      [journeyId, "Aprovada; aguardando promoção humana explícita.", rev[0].id]
    );
    return {
      status: "aguardando_promocao",
      motivo: "Aprovada; aguardando promoção humana explícita.",
      candidaturaId: null, promocaoId: null, stepsReexecutados: 0,
    };
  }

  // Promoção explícita solicitada.
  try {
    const promo = await promover(
      client,
      { recomendacaoId: j.recomendacao_id, frenteOportunidadeId: opcoes.frenteOportunidadeId },
      { usuarioId: opcoes.promotorId ?? null, nome: opcoes.promotorNome ?? null }
    );

    await client.query(
      `UPDATE cross_ai.journey_execution
          SET status='oportunidade_criada', motivo_parada=$2, revisao_id=$3,
              promocao_id=$4, candidatura_id=$5, atualizado_em=now()
        WHERE id=$1`,
      [
        journeyId, "Oportunidade criada; aguardando Paper.",
        rev[0].id, promo.promocaoId, promo.candidaturaId,
      ]
    );

    return {
      status: "oportunidade_criada",
      motivo: "Oportunidade criada; aguardando Paper.",
      candidaturaId: promo.candidaturaId,
      promocaoId: promo.promocaoId,
      stepsReexecutados: 0,
    };
  } catch (e) {
    if (e instanceof PromocaoBloqueada) {
      // Prospecção do zero sem Parte resolvida: bloqueio legítimo, não falha.
      const status: JourneyStatus =
        e.motivo === "requer_resolucao_de_entidade"
          ? "requer_resolucao_de_entidade"
          : "aguardando_promocao";

      await client.query(
        `UPDATE cross_ai.journey_execution
            SET status=$2, motivo_parada=$3, revisao_id=$4, atualizado_em=now()
          WHERE id=$1`,
        [journeyId, status, e.detalhe, rev[0].id]
      );
      return {
        status, motivo: e.detalhe,
        candidaturaId: null, promocaoId: null, stepsReexecutados: 0,
      };
    }
    throw e;
  }
}

/** Etapas já registradas — base do resume sem repetir trabalho. */
export async function carregarSteps(
  client: PoolClient, journeyId: string
): Promise<StepExecution[]> {
  const { rows } = await client.query(
    `SELECT step, ordem, status, motivo, execucao_agente_id, output_ref,
            output_versao, contexto_caracteres, duracao_ms, erro
       FROM cross_ai.journey_step WHERE journey_id = $1 ORDER BY ordem`,
    [journeyId]
  );
  return rows as StepExecution[];
}

/** Cadeia de proveniência da jornada até a Evidence. */
export async function rastrearJourney(client: PoolClient, journeyId: string) {
  const { rows } = await client.query(
    `SELECT j.id, j.journey_type, j.nome_origem, j.status, j.correlation_id,
            r.id AS recomendacao_id, r.hipotese_oportunidade,
            r.perfil_candidato_versao, r.crossability_hash, r.matching_pesos_versao,
            rv.decisao AS decisao_humana, rv.revisor_nome,
            p.id AS promocao_id, p.promovido_por_nome,
            c.id AS candidatura_id
       FROM cross_ai.journey_execution j
       LEFT JOIN cross_ai.recomendacao r          ON r.id = j.recomendacao_id
       LEFT JOIN cross_ai.recomendacao_revisao rv ON rv.id = j.revisao_id
       LEFT JOIN cross_ai.promocao_oportunidade p ON p.id = j.promocao_id
       LEFT JOIN cross_projects.candidatura_parceiro c ON c.id = j.candidatura_id
      WHERE j.id = $1`,
    [journeyId]
  );
  return rows[0] ?? null;
}
