import type { PoolClient } from "pg";
import { env } from "../../../config/env";
import {
  buscarPool,
  buscarOrigem,
  buscarRelacionamentos,
  contarPoolTotal,
  type ParteCandidata,
} from "./matching.repository";
import {
  internalMatchingResultSchema,
  PESOS_RETRIEVAL,
  PESOS_VERSAO,
  type CandidatoMatching,
  type EntradaMatching,
  type ForcaSinal,
  type InternalMatchingResult,
  type SinalMatching,
  type StatusPerfil,
  type TipoSinal,
} from "./matching.schema";

// -----------------------------------------------------------------------------
// Internal Matching Agent.
//
// Produz uma SHORTLIST RASTREÁVEL de candidatos para análise. Não decide
// parceria, não cria oportunidade, não move funil, não gera Score Card.
//
// Totalmente determinístico: zero LLM, zero embedding pago. Rodar duas vezes
// sobre a mesma base devolve exatamente o mesmo ranking — inclusive nos empates,
// resolvidos por critério estável.
//
// A estratégia obrigatória contra explosão de candidatos:
//
//   UNIVERSO → FILTROS DUROS (SQL) → DEDUPLICAÇÃO → PONTUAÇÃO → SHORTLIST
//
// Em nenhum ponto se dispara pesquisa externa ou raciocínio por candidato. Quem
// precisaria de pesquisa é marcado `necessita_enriquecimento`, e a decisão de
// enriquecer é de outro componente.
// -----------------------------------------------------------------------------

/** Normaliza para comparar termos entre perfis. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sobreposição de Jaccard entre dois conjuntos de termos.
 *
 * Devolve `null` quando QUALQUER lado está vazio — e essa distinção é o ponto:
 * conjunto vazio não significa incompatibilidade, significa que não dá para
 * saber. Devolver 0 aqui transformaria ausência de cadastro em prova de
 * desencaixe.
 */
function sobreposicao(a: string[], b: string[]): number | null {
  if (!a.length || !b.length) return null;
  const na = new Set(a.map(normalizar).filter(Boolean));
  const nb = new Set(b.map(normalizar).filter(Boolean));
  if (!na.size || !nb.size) return null;
  let inter = 0;
  for (const t of na) if (nb.has(t)) inter++;
  return inter / new Set([...na, ...nb]).size;
}

function forcaDe(valor: number | null): ForcaSinal {
  if (valor === null) return "desconhecido";
  if (valor >= 0.5) return "forte";
  if (valor >= 0.25) return "moderado";
  if (valor > 0) return "fraco";
  return "nenhum";
}

/** Constrói um sinal comparando duas listas, com proveniência obrigatória. */
function sinalDeListas(
  tipo: TipoSinal,
  origem: string[],
  candidato: string[],
  descricaoBase: string,
  proveniencia: string
): SinalMatching {
  const valor = sobreposicao(origem, candidato);
  const comuns =
    valor === null
      ? []
      : origem.filter((o) => candidato.some((c) => normalizar(c) === normalizar(o)));

  return {
    tipo,
    forca: forcaDe(valor),
    valor,
    descricao:
      valor === null
        ? `${descricaoBase}: não avaliável — um dos lados não possui dados cadastrados.`
        : comuns.length
          ? `${descricaoBase}: ${comuns.length} em comum (${comuns.slice(0, 3).join(", ")}).`
          : `${descricaoBase}: nenhum item em comum entre os cadastrados.`,
    origem_refs: origem.slice(0, 8),
    candidato_refs: candidato.slice(0, 8),
    proveniencia,
    nivel_validacao: "estrutural",
  };
}

/** Perfil do candidato conforme o que existe cadastrado. */
function classificarPerfil(c: ParteCandidata): StatusPerfil {
  const dimensoes = [c.publicos.length, c.territorios.length, c.ativos.length];
  const preenchidas = dimensoes.filter((d) => d > 0).length;
  if (preenchidas === 0 && !c.tem_perfil_estrategico) return "ausente";
  if (preenchidas < 3) return "parcial";
  return "completo";
}

/**
 * Pontua um candidato.
 *
 * Sinais desconhecidos são EXCLUÍDOS do denominador em vez de contarem zero.
 * Com denominador fixo, um candidato sem cadastro seria empurrado para o fim da
 * lista como se fosse incompatível — quando na verdade ele apenas não foi
 * preenchido ainda. Renormalizar mede o que se sabe, e o que não se sabe vira
 * `necessita_enriquecimento`.
 */
function pontuar(sinais: SinalMatching[]): {
  score: number;
  componentes: CandidatoMatching["componentes"];
} {
  const componentes: CandidatoMatching["componentes"] = [];
  let soma = 0;
  let pesoConhecido = 0;

  for (const s of sinais) {
    const peso = PESOS_RETRIEVAL[s.tipo] ?? 0;
    const contribuicao = s.valor === null ? 0 : s.valor * peso;
    if (s.valor !== null && peso > 0) {
      soma += contribuicao;
      pesoConhecido += peso;
    }
    componentes.push({ tipo: s.tipo, peso, valor: s.valor, contribuicao });
  }

  // Sem nenhum sinal conhecido não há score: 0 aqui significa "nada avaliado",
  // e o candidato é sinalizado para enriquecimento em vez de ser descartado.
  const score = pesoConhecido > 0 ? (soma / pesoConhecido) * 100 : 0;
  return { score: Math.round(score * 100) / 100, componentes };
}

export async function executarMatching(
  client: PoolClient,
  entrada: EntradaMatching
): Promise<InternalMatchingResult> {
  const inicio = Date.now();

  const maxCandidatos = entrada.maxCandidatos ?? env.matchingMaxCandidatos;
  const tamanhoShortlist = entrada.tamanhoShortlist ?? env.matchingTamanhoShortlist;

  const excluidos: InternalMatchingResult["excluidos"] = [];
  const naoResolvidos: InternalMatchingResult["nao_resolvidos"] = [];

  // ---------------------------------------------------------------- origem
  const origem = entrada.parteOrigemId
    ? await buscarOrigem(client, entrada.parteOrigemId)
    : null;

  // Prospecção do zero: a entidade externa NÃO é criada como Parte. Fica
  // registrada como não vinculada, aguardando decisão humana.
  const origemVinculada = Boolean(origem);
  const nomeOrigem = origem?.nome ?? entrada.nomeOrigem ?? "(entidade externa)";

  // ------------------------------------------------------------- universo
  const inicioSql = Date.now();
  const totalPool = await contarPoolTotal(client, entrada.direcao);
  // Busca um pouco além do teto para conseguir REGISTRAR o que foi cortado por
  // limite — cortar em silêncio esconderia a explosão em vez de contê-la.
  const pool = await buscarPool(client, {
    direcao: entrada.direcao,
    parteOrigemId: entrada.parteOrigemId ?? null,
    excluidos: entrada.excluidos ?? [],
    limite: maxCandidatos + 1,
  });
  const duracaoSql = Date.now() - inicioSql;

  // Exclusões que o SQL já aplicou, registradas para o funil ficar auditável.
  if (entrada.parteOrigemId) {
    excluidos.push({
      parte_id: entrada.parteOrigemId,
      nome: nomeOrigem,
      motivo: "auto_match",
      etapa: "sql",
      detalhe: "A entidade de origem não pode ser candidata de si mesma.",
    });
  }
  for (const id of entrada.excluidos ?? []) {
    excluidos.push({
      parte_id: id,
      nome: "(excluído pelo chamador)",
      motivo: "excluido_explicitamente",
      etapa: "sql",
      detalhe: "Informado em `excluidos` na requisição.",
    });
  }

  let considerados = pool;
  if (pool.length > maxCandidatos) {
    for (const c of pool.slice(maxCandidatos)) {
      excluidos.push({
        parte_id: c.parte_id,
        nome: c.nome,
        motivo: "excedeu_limite_candidatos",
        etapa: "filtro_duro",
        detalhe: `Teto de ${maxCandidatos} candidatos considerados por execução.`,
      });
    }
    considerados = pool.slice(0, maxCandidatos);
  }

  // -------------------------------------------------------- deduplicação
  // Marcas do mesmo grupo representam a mesma entidade consolidada; deixá-las
  // entrar separadas encheria a shortlist com o mesmo candidato três vezes.
  const porGrupo = new Map<string, ParteCandidata>();
  const deduplicados: ParteCandidata[] = [];
  for (const c of considerados) {
    const chave = c.grupo_parte_id ?? c.parte_id;
    const jaVisto = porGrupo.get(chave);
    if (jaVisto) {
      excluidos.push({
        parte_id: c.parte_id,
        nome: c.nome,
        motivo: "duplicado",
        etapa: "deduplicacao",
        detalhe: `Mesma entidade consolidada de "${jaVisto.nome}" (grupo de marca).`,
      });
      continue;
    }
    porGrupo.set(chave, c);
    deduplicados.push(c);
  }

  // ------------------------------------------------------ relacionamentos
  const relacionamentos = entrada.parteOrigemId
    ? await buscarRelacionamentos(client, entrada.parteOrigemId)
    : new Map<string, "relacionamento_ativo" | "relacionamento_historico">();

  // ------------------------------------------------------------ pontuação
  const pontuados: CandidatoMatching[] = [];

  for (const c of deduplicados) {
    const sinais: SinalMatching[] = [
      sinalDeListas(
        "publico",
        origem?.publicos ?? [],
        c.publicos,
        "Públicos",
        `cross_intelligence.parte_publico(parte_id=${c.parte_id})`
      ),
      sinalDeListas(
        "territorio",
        origem?.territorios ?? [],
        c.territorios,
        "Territórios",
        `cross_intelligence.parte_territorio(parte_id=${c.parte_id})`
      ),
      sinalDeListas(
        "ativo",
        origem?.ativos ?? [],
        c.ativos,
        "Ativos",
        `cross_intelligence.ativo(parte_id=${c.parte_id})`
      ),
      sinalDeListas(
        "geografico",
        origem?.pracas ?? [],
        c.pracas,
        "Praças",
        `cross_intelligence.parte_praca(parte_id=${c.parte_id})`
      ),
    ];

    // Segmento: comparação de um valor só, não de conjuntos.
    const segOrigem = origem?.segmento ?? null;
    const segCandidato = c.segmento ?? null;
    const segValor =
      segOrigem && segCandidato
        ? normalizar(segOrigem) === normalizar(segCandidato)
          ? 1
          : 0
        : null;
    sinais.push({
      tipo: "segmento",
      forca: forcaDe(segValor),
      valor: segValor,
      descricao:
        segValor === null
          ? "Segmento: não avaliável — segmento ausente em um dos lados."
          : segValor === 1
            ? `Segmento: ambos em "${segCandidato}".`
            : `Segmento: "${segOrigem}" vs "${segCandidato}".`,
      origem_refs: segOrigem ? [segOrigem] : [],
      candidato_refs: segCandidato ? [segCandidato] : [],
      proveniencia: `cross_core.organizacao(parte_id=${c.parte_id}).segmento_principal`,
      nivel_validacao: "estrutural",
    });

    // Relacionamento é CONTEXTO, não filtro: já ter histórico não desqualifica
    // nem promove automaticamente. A metodologia futura decide o peso disso.
    const rel = relacionamentos.get(c.parte_id) ?? "sem_relacionamento_conhecido";
    sinais.push({
      tipo: "relacionamento",
      forca: rel === "sem_relacionamento_conhecido" ? "nenhum" : "moderado",
      valor: rel === "sem_relacionamento_conhecido" ? 0 : 0.5,
      descricao:
        rel === "relacionamento_ativo"
          ? "Há relacionamento ativo registrado com esta entidade."
          : rel === "relacionamento_historico"
            ? "Há relacionamento histórico registrado com esta entidade."
            : "Nenhum relacionamento conhecido na base.",
      origem_refs: [],
      candidato_refs: [],
      proveniencia: `cross_projects.candidatura_parceiro(parte_id=${c.parte_id})`,
      nivel_validacao: "estrutural",
    });

    const { score, componentes } = pontuar(sinais);
    const statusPerfil = classificarPerfil(c);
    const faltante = sinais
      .filter((s) => s.forca === "desconhecido")
      .map((s) => `${s.tipo}: sem dados cadastrados em um dos lados.`);

    const candidato: CandidatoMatching = {
      parte_id: c.parte_id,
      nome: c.nome,
      papeis: c.papeis,
      tipo: c.tipo,
      eh_cliente_cross: c.eh_cliente_cross,
      elegibilidade: statusPerfil === "ausente" ? "elegivel_com_ressalva" : "elegivel",
      pre_match_score: score,
      componentes,
      sinais,
      informacao_faltante: faltante,
      status_perfil: statusPerfil,
      // Perfil incompleto não elimina: sinaliza que pesquisa externa poderia
      // melhorar a avaliação. Eliminar aqui seria confundir lacuna com desencaixe.
      necessita_enriquecimento: statusPerfil !== "completo",
      relacionamento: rel,
      nivel_validacao: "estrutural",
    };

    if (statusPerfil === "ausente") {
      naoResolvidos.push({
        parte_id: c.parte_id,
        nome: c.nome,
        motivo: "Sem perfil estratégico e sem dimensões cadastradas; requer enriquecimento.",
      });
    }

    pontuados.push(candidato);
  }

  // --------------------------------------------------------------- ranking
  // Desempate determinístico em três níveis: score → nome → parte_id. Sem o
  // último, duas execuções idênticas poderiam devolver ordens diferentes, e a
  // reprodutibilidade do resultado se perderia.
  pontuados.sort((a, b) => {
    if (b.pre_match_score !== a.pre_match_score) return b.pre_match_score - a.pre_match_score;
    const nome = a.nome.localeCompare(b.nome, "pt-BR");
    if (nome !== 0) return nome;
    return a.parte_id.localeCompare(b.parte_id);
  });

  const shortlist = pontuados.slice(0, tamanhoShortlist);

  return internalMatchingResultSchema.parse({
    direcao: entrada.direcao,
    origem: {
      parte_id: origem?.parte_id ?? null,
      nome: nomeOrigem,
      vinculo: origemVinculada ? "vinculada" : "nao_vinculada",
      // O agente NUNCA cria Parte: origem não vinculada aguarda decisão humana.
      requer_resolucao_humana: !origemVinculada,
      papeis: origem?.papeis ?? [],
    },
    objetivo: entrada.objetivo ?? null,
    universo: {
      total_no_pool_sql: totalPool,
      considerados: considerados.length,
      pontuados: pontuados.length,
      shortlist: shortlist.length,
    },
    shortlist,
    excluidos,
    nao_resolvidos: naoResolvidos,
    nivel_validacao: "estrutural",
    // Enquanto embeddings reais não forem homologados, isto é permanente e
    // explícito: quem consumir precisa saber que não houve avaliação semântica.
    validacao_semantica: "pendente_embedding_real",
    telemetria: {
      duracao_ms: Date.now() - inicio,
      duracao_sql_ms: duracaoSql,
      llm_calls: 0,
      embedding_calls: 0,
      custo_estimado_usd: 0,
      pesos_versao: PESOS_VERSAO,
    },
  });
}
