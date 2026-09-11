import { createHash } from "node:crypto";
import {
  PESOS_CONFIANCA,
  PESOS_CONFIANCA_VERSAO,
  recommendationProposalSchema,
  type NivelSustentacao,
  type ProximoPasso,
  type RecommendationProposal,
  type StatusRecomendacao,
} from "./recomendacao.schema";
import type { CandidatoMatching, InternalMatchingResult } from "../matching/matching.schema";
import type { EntityIntelligenceProfile, ElementoPerfil } from "../entidade/perfil.schema";
import type { CrossabilityAnalysis } from "../crossability/crossability.schema";

// -----------------------------------------------------------------------------
// Recommendation Agent.
//
// Transforma inteligência acumulada numa PROPOSTA legível e auditável:
//
//   Evidence + Entity Intelligence + Crossability + Matching + contexto
//        ↓
//   Recommendation Proposal  →  [FUTURO] Human Gate
//
// O que este agente NÃO faz, por desenho:
//   · não decide nem aprova
//   · não cria oportunidade, projeto, parceria ou reunião
//   · não altera funil
//   · não executa Score Card
//   · não pesquisa a internet nem reexecuta Crossability
//   · não reconstrói o universo de candidatos — consome a shortlist
//
// Determinístico: zero LLM, zero embedding pago. Mesmos inputs produzem a mesma
// proposta, e o hash de entrada permite provar isso.
// -----------------------------------------------------------------------------

export interface EntradaRecomendacao {
  /** Resultado do Internal Matching (AI-05). Obrigatório: sem ele não há candidato. */
  matching: InternalMatchingResult;
  /** parte_id do candidato dentro da shortlist. */
  candidatoParteId: string;
  /** Perfil da origem, quando existir. */
  perfilOrigem?: EntityIntelligenceProfile | null;
  /** Perfil do candidato, quando existir. */
  perfilCandidato?: EntityIntelligenceProfile | null;
  /** Análise Crossability existente. NUNCA é reexecutada aqui. */
  crossability?: CrossabilityAnalysis | null;
  objetivo?: string | null;
}

/** Erro de entrada — contexto insuficiente para sequer montar a proposta. */
export class EntradaRecomendacaoInvalida extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = "EntradaRecomendacaoInvalida";
  }
}

/** Catálogo de fatos do perfil, com rótulo estável para citação. */
function catalogarEvidencias(
  perfil: EntityIntelligenceProfile | null | undefined
): Map<string, { valor: string; origem: "interno" | "externo"; proveniencia: string }> {
  const catalogo = new Map<string, { valor: string; origem: "interno" | "externo"; proveniencia: string }>();
  if (!perfil) return catalogo;

  const secoes: Array<keyof EntityIntelligenceProfile> = [
    "contexto_empresa", "posicionamento", "publicos", "territorios",
    "ativos", "produtos", "relacionamentos", "movimentos",
  ];

  for (const secao of secoes) {
    const elementos = perfil[secao] as ElementoPerfil[] | undefined;
    if (!Array.isArray(elementos)) continue;
    for (const e of elementos) {
      const p = e.proveniencia;
      // A chave é o próprio fact_id quando externo: é o que o Evidence Package
      // conhece, e usar outro rótulo quebraria a rastreabilidade.
      const ref = p.origem === "externo" ? (p.evidence_refs?.[0] ?? "") : (p.registro_interno ?? "");
      if (!ref || catalogo.has(ref)) continue;
      catalogo.set(ref, {
        valor: e.valor,
        origem: p.origem,
        proveniencia:
          p.origem === "interno"
            ? (p.registro_interno ?? "registro interno")
            : `evidence:${(p.evidence_refs ?? []).join(",")} · fontes:${(p.source_refs ?? []).join(",")}`,
      });
    }
  }
  return catalogo;
}

/** Hash dos inputs — sustenta a idempotência (§38). */
function calcularHash(entrada: EntradaRecomendacao, candidato: CandidatoMatching): string {
  const material = JSON.stringify({
    direcao: entrada.matching.direcao,
    origem: entrada.matching.origem.parte_id,
    candidato: candidato.parte_id,
    objetivo: entrada.objetivo ?? null,
    score: candidato.pre_match_score,
    sinais: candidato.sinais.map((s) => `${s.tipo}:${s.forca}:${s.valor}`).sort(),
    perfil_origem: entrada.perfilOrigem?.hash_entrada ?? null,
    perfil_candidato: entrada.perfilCandidato?.hash_entrada ?? null,
    crossability: entrada.crossability?.provenance.perfil_hash ?? null,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function recomendar(entrada: EntradaRecomendacao): RecommendationProposal {
  const inicio = Date.now();

  // ------------------------------------------------------- validação de entrada
  // O candidato precisa existir na shortlist: inventar candidato aqui seria
  // refazer o Matching sem os filtros dele.
  const candidato = entrada.matching.shortlist.find((c) => c.parte_id === entrada.candidatoParteId);
  if (!candidato) {
    throw new EntradaRecomendacaoInvalida(
      `Candidato ${entrada.candidatoParteId} não está na shortlist do Matching. ` +
        "Recommendation não cria candidato do nada."
    );
  }

  const rejeitados: RecommendationProposal["rejeitados"] = [];
  const limitacoes: string[] = [];
  const lacunas: RecommendationProposal["lacunas"] = [];
  const contraEvidencias: RecommendationProposal["contra_evidencias"] = [];
  const riscos: RecommendationProposal["riscos"] = [];
  const questoes: string[] = [];

  // ---------------------------------------------------------------- evidências
  const catalogoOrigem = catalogarEvidencias(entrada.perfilOrigem);
  const catalogoCandidato = catalogarEvidencias(entrada.perfilCandidato);

  const evidencias: RecommendationProposal["evidencias_suporte"] = [];
  for (const [ref, dado] of catalogoCandidato) {
    evidencias.push({
      evidence_ref: ref,
      afirmacao: dado.valor,
      origem: dado.origem,
      proveniencia: dado.proveniencia,
    });
  }

  // ------------------------------------------------------------------- sinais
  // Só sinais efetivamente calculados sustentam a hipótese. `desconhecido` vira
  // lacuna, não argumento — foi por isso que o Matching os separou.
  const sinaisUteis = candidato.sinais.filter(
    (s) => s.forca !== "desconhecido" && s.forca !== "nenhum"
  );
  const sinaisSuporte = sinaisUteis.map((s) => ({
    tipo: s.tipo,
    forca: s.forca,
    valor: s.valor,
    descricao: s.descricao,
    proveniencia: s.proveniencia,
  }));

  for (const s of candidato.sinais) {
    if (s.forca === "desconhecido") {
      lacunas.push({
        origem: "perfil_candidato",
        descricao: `Sinal "${s.tipo}" não avaliável: dados ausentes em um dos lados.`,
      });
    }
    if (s.forca === "conflitante") {
      contraEvidencias.push({
        texto: `Sinal "${s.tipo}" apresenta informação contraditória: ${s.descricao}`,
        tipo: "conflito_factual",
        evidence_refs: [],
        proveniencia: s.proveniencia,
      });
    }
  }

  // ------------------------------------------------------------ crossability
  const crossSuporte: RecommendationProposal["crossability_suporte"] = [];
  let dimensoesSustentadas = 0;

  if (entrada.crossability) {
    for (const d of entrada.crossability.dimensions) {
      // Dimensão sem sustentação não vira argumento favorável; entra como
      // limitação. Promovê-la seria transformar lacuna em suporte.
      if (d.status === "suportado") dimensoesSustentadas++;

      crossSuporte.push({
        analise_ref: entrada.crossability.provenance.perfil_hash,
        dimensao: d.dimensao,
        assessment: d.assessment,
        status: d.status,
        confianca: d.confidence,
        evidence_refs: d.supporting_points.flatMap((p) => p.evidence_refs),
        knowledge_refs: d.knowledge_refs.map((k) => k.ref),
        // A AI-04.1 não homologou reasoning com IA real; declarar isso aqui
        // impede que o consumidor leia a análise como produção validada.
        nivel_validacao: "estrutural",
      });

      // Contra-evidência do Crossability é preservada, não filtrada.
      for (const c of d.counterpoints) {
        contraEvidencias.push({
          texto: `[${d.dimensao}] ${c.texto}`,
          tipo: "sinal_contrario",
          evidence_refs: c.evidence_refs,
          proveniencia: `crossability.${d.dimensao}`,
        });
      }
      for (const g of d.gaps) {
        lacunas.push({ origem: "crossability", descricao: `[${d.dimensao}] ${g}` });
      }
    }

    for (const c of entrada.crossability.conflicts) {
      contraEvidencias.push({
        texto: `Conflito factual não resolvido: "${c.claim_a}" vs "${c.claim_b}".`,
        tipo: "conflito_factual",
        evidence_refs: [],
        proveniencia: "entity_intelligence.conflitos",
      });
    }
    for (const g of entrada.crossability.knowledge_gaps) {
      lacunas.push({ origem: "crossability", descricao: g });
    }
    limitacoes.push("crossability_real_reasoning_pendente");
  } else {
    limitacoes.push("crossability_ausente");
  }

  // Lacunas herdadas do Entity Intelligence, com origem preservada.
  for (const l of entrada.perfilCandidato?.lacunas ?? []) {
    lacunas.push({ origem: "entity_intelligence", descricao: `${l.campo}: ${l.descricao}` });
  }
  for (const c of entrada.perfilCandidato?.conflitos ?? []) {
    contraEvidencias.push({
      texto: `Conflito no perfil do candidato: "${c.claim_a}" vs "${c.claim_b}".`,
      tipo: "conflito_factual",
      evidence_refs: [],
      proveniencia: "entity_intelligence.conflitos",
    });
  }

  limitacoes.push("semantic_matching_pendente");
  if (entrada.matching.validacao_semantica === "pendente_embedding_real") {
    limitacoes.push("embeddings_reais_pendentes");
  }

  // ------------------------------------------------------------------ riscos
  if (candidato.status_perfil === "ausente") {
    riscos.push({
      texto: "O candidato não possui perfil estruturado; não há base factual para avaliar encaixe.",
      categoria: "perfil_incompleto",
    });
  } else if (candidato.status_perfil === "parcial") {
    riscos.push({
      texto: "O perfil do candidato está incompleto; parte das dimensões não pôde ser avaliada.",
      categoria: "perfil_incompleto",
    });
  }
  if (candidato.necessita_enriquecimento) {
    riscos.push({
      texto: "Candidato marcado para enriquecimento pelo Matching.",
      categoria: "necessita_enriquecimento",
    });
  }
  riscos.push({
    texto:
      "Reasoning Crossability com IA real e embeddings semânticos ainda não homologados; " +
      "a sustentação é estrutural.",
    categoria: "validacao_pendente",
  });
  if (contraEvidencias.some((c) => c.tipo === "conflito_factual")) {
    riscos.push({
      texto: "Há conflito factual não resolvido no material que sustenta esta proposta.",
      categoria: "conflito_factual",
    });
  }

  // --------------------------------------------------------- questões abertas
  questoes.push("Confirmar interesse atual do candidato neste tipo de conexão.");
  if (candidato.necessita_enriquecimento) {
    questoes.push("Enriquecer o perfil do candidato antes de aprofundar a análise.");
  }
  if (sinaisUteis.some((s) => s.tipo === "ativo")) {
    questoes.push("Confirmar disponibilidade e condições de acesso aos ativos identificados.");
  }
  if (candidato.relacionamento !== "sem_relacionamento_conhecido") {
    questoes.push("Revisar o histórico do relacionamento existente antes de propor nova conexão.");
  }
  questoes.push("Validar restrições comerciais ou de exclusividade não registradas na base.");

  // ------------------------------------------------------------- confiança
  // Determinística e explicada. Mede SUSTENTAÇÃO, não atratividade comercial.
  const totalSinais = candidato.sinais.length || 1;
  const coberturaSinais = sinaisUteis.length / totalSinais;
  const qualidadeEvidencia = Math.min(1, evidencias.length / 5);
  const completudePerfil =
    candidato.status_perfil === "completo" ? 1 : candidato.status_perfil === "parcial" ? 0.5 : 0;
  const crossabilityFator = entrada.crossability
    ? dimensoesSustentadas / Math.max(1, entrada.crossability.dimensions.length)
    : 0;
  const ausenciaConflito = contraEvidencias.some((c) => c.tipo === "conflito_factual") ? 0 : 1;

  const fatores: Array<[string, number, number]> = [
    ["cobertura_sinais", PESOS_CONFIANCA.cobertura_sinais, coberturaSinais],
    ["qualidade_evidencia", PESOS_CONFIANCA.qualidade_evidencia, qualidadeEvidencia],
    ["completude_perfil", PESOS_CONFIANCA.completude_perfil, completudePerfil],
    ["crossability", PESOS_CONFIANCA.crossability, crossabilityFator],
    ["ausencia_conflito", PESOS_CONFIANCA.ausencia_conflito, ausenciaConflito],
  ];

  const componentes = fatores.map(([fator, peso, valor]) => ({
    fator,
    peso,
    valor: Math.round(valor * 1000) / 1000,
    contribuicao: Math.round(peso * valor * 1000) / 1000,
  }));
  const confianca = Math.round(componentes.reduce((s, c) => s + c.contribuicao, 0) * 100);

  // --------------------------------------------------- sustentação e status
  //
  // A regra central desta Sprint: score de Matching alto NÃO produz proposta
  // forte sozinho. `pre_match_score` é priorização de retrieval; sustentação
  // exige sinais reais, evidência e perfil.
  const temSinais = sinaisUteis.length > 0;
  const temEvidencia = evidencias.length > 0;
  const temCrossability = dimensoesSustentadas > 0;

  let nivelSustentacao: NivelSustentacao;
  let status: StatusRecomendacao;
  let proximo: ProximoPasso;
  let hipotese: string | null;

  if (candidato.status_perfil === "ausente") {
    // Sem perfil não se imagina contexto. Recusa explícita.
    nivelSustentacao = "sustentacao_insuficiente";
    status = "requer_enriquecimento";
    proximo = "solicitar_enriquecimento";
    hipotese = null;
  } else if (!temSinais || !temEvidencia) {
    nivelSustentacao = "sustentacao_insuficiente";
    status = "sustentacao_insuficiente";
    proximo = temSinais ? "solicitar_enriquecimento" : "revisar_candidato";
    hipotese = null;
  } else if (temSinais && temEvidencia && temCrossability) {
    nivelSustentacao = "sustentacao_forte";
    status = "pronta_para_revisao";
    proximo = "preparar_para_human_gate";
    hipotese = montarHipotese(entrada, candidato, sinaisUteis.map((s) => s.tipo));
  } else {
    nivelSustentacao = "sustentacao_parcial";
    status = "pronta_para_revisao";
    proximo = "validar_com_time_cross";
    hipotese = montarHipotese(entrada, candidato, sinaisUteis.map((s) => s.tipo));
  }

  // --------------------------------------------------------------- racional
  const racional: string[] = [];
  if (hipotese) {
    for (const s of sinaisUteis) {
      racional.push(`${s.descricao} (proveniência: ${s.proveniencia})`);
    }
    if (temCrossability) {
      const sustentadas = entrada.crossability!.dimensions
        .filter((d) => d.status === "suportado")
        .map((d) => d.dimensao);
      racional.push(
        `A análise Crossability sustenta ${sustentadas.length} dimensão(ões): ${sustentadas.join(", ")}.`
      );
    }
    racional.push(
      `Contexto de priorização: o candidato ficou com pre_match_score ${candidato.pre_match_score} ` +
        "no Internal Matching — número de retrieval, não avaliação comercial."
    );
  } else {
    racional.push(
      candidato.status_perfil === "ausente"
        ? "Nenhuma hipótese foi formulada: o candidato não possui perfil estruturado."
        : "Nenhuma hipótese foi formulada: faltam sinais calculáveis ou evidência que a sustente."
    );
  }
  if (contraEvidencias.length > 0) {
    racional.push(`${contraEvidencias.length} ponto(s) contrário(s) foram registrados e permanecem abertos.`);
  }

  return recommendationProposalSchema.parse({
    direcao: entrada.matching.direcao,
    origem: {
      parte_id: entrada.matching.origem.parte_id,
      nome: entrada.matching.origem.nome,
      vinculo: entrada.matching.origem.vinculo,
    },
    candidato: {
      parte_id: candidato.parte_id,
      nome: candidato.nome,
      eh_cliente_cross: candidato.eh_cliente_cross,
      status_perfil: candidato.status_perfil,
    },
    objetivo: entrada.objetivo ?? entrada.matching.objetivo ?? null,
    status,
    nivel_sustentacao: nivelSustentacao,
    hipotese_oportunidade: hipotese,
    racional,
    evidencias_suporte: evidencias,
    crossability_suporte: crossSuporte,
    sinais_suporte: sinaisSuporte,
    contra_evidencias: contraEvidencias,
    riscos,
    questoes_abertas: questoes,
    lacunas,
    proximo_passo: proximo,
    confianca,
    componentes_confianca: componentes,
    // Enquanto embeddings e Crossability real não forem homologados, nenhuma
    // proposta pode reivindicar produção.
    nivel_validacao: "estrutural",
    limitacoes: [...new Set(limitacoes)],
    rejeitados,
    proveniencia: {
      matching_direcao: entrada.matching.direcao,
      matching_pesos_versao: entrada.matching.telemetria.pesos_versao,
      perfil_origem_versao: entrada.perfilOrigem?.versao_perfil ?? null,
      perfil_candidato_versao: entrada.perfilCandidato?.versao_perfil ?? null,
      crossability_hash: entrada.crossability?.provenance.perfil_hash ?? null,
      hash_entrada: calcularHash(entrada, candidato),
    },
    telemetria: {
      duracao_ms: Date.now() - inicio,
      llm_calls: 0,
      embedding_calls: 0,
      custo_estimado_usd: 0,
      // O agente não escreve nada operacional; os zeros são estruturais, não
      // uma medição otimista.
      oportunidades_criadas: 0,
      projetos_criados: 0,
      parcerias_criadas: 0,
      reunioes_criadas: 0,
      mudancas_funil: 0,
      score_card_executado: false,
    },
  });
}

/**
 * Compõe a hipótese a partir do que efetivamente sustenta.
 *
 * Deliberadamente específica: cita as dimensões que casaram. Frase genérica do
 * tipo "as marcas compartilham valores e podem gerar sinergias" não diz nada e
 * não é auditável.
 *
 * A linguagem é de HIPÓTESE, nunca de certeza comercial.
 */
function montarHipotese(
  entrada: EntradaRecomendacao,
  candidato: CandidatoMatching,
  tiposSinais: string[]
): string {
  const origem = entrada.matching.origem.nome;
  const rotulo: Record<string, string> = {
    publico: "público",
    territorio: "território de atuação",
    ativo: "ativos",
    geografico: "presença geográfica",
    segmento: "segmento",
    relacionamento: "relacionamento prévio",
    momento: "momento",
  };
  const dimensoes = [...new Set(tiposSinais)].map((t) => rotulo[t] ?? t);
  const objetivo = entrada.objetivo ?? entrada.matching.objetivo;

  return (
    `Existe uma hipótese de conexão entre ${origem} e ${candidato.nome}` +
    (objetivo ? ` no contexto de "${objetivo}"` : "") +
    `, sustentada por convergência em ${dimensoes.join(", ")}. ` +
    "A hipótese requer validação humana e não constitui avaliação de encaixe comercial."
  );
}
