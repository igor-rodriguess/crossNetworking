import { createHash } from "node:crypto";
import {
  entityIntelligenceProfileSchema,
  type DiffPerfil,
  type ElementoPerfil,
  type EntityIntelligenceProfile,
  type Proveniencia,
  type VinculoEntidade,
} from "./perfil.schema";
import type { EvidencePackage, Fato } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Entity Intelligence Agent.
//
// Consolida DADOS INTERNOS DA CROSS + EVIDÊNCIA EXTERNA VERIFICADA num perfil
// factual, versionado e rastreável.
//
// O que este agente NÃO faz, por desenho:
//   · não avalia fit nem calcula score (Crossability)
//   · não procura parceiros na base (Matching)
//   · não recomenda ação (Recommendation)
//   · não consulta Cross Knowledge — metodologia não é fato sobre o mundo
//   · não cria Parte automaticamente — vincular é decisão humana
//
// Determinístico: o Evidence Package já traz claims estruturados, então não há
// motivo para gastar inferência aqui. LLM calls = 0 é resultado positivo.
// -----------------------------------------------------------------------------

/** Dados internos da Cross sobre a entidade. Autoridade sobre a RELAÇÃO. */
export interface DadosInternos {
  parte_id: string | null;
  nome_exibicao?: string | null;
  tipo?: string | null;
  eh_cliente_cross: boolean;
  papeis?: string[];
  oportunidades?: Array<{ id: string; descricao: string }>;
  parcerias?: Array<{ id: string; descricao: string }>;
  projetos?: Array<{ id: string; descricao: string }>;
  atualizado_em?: string | null;
  /** Partes parecidas quando a resolução ficou ambígua. */
  candidatas?: Array<{ nome: string; parte_id: string | null }>;

  // --- Inteligência de entidade preenchida pela equipe -----------------------
  //
  // Vem de `cross_intelligence`, alimentada na ficha da Empresa a partir do que
  // a Cross apurou em reunião e briefing. É INTERNA: autoridade da própria
  // equipe, não evidência externa.
  //
  // Existe porque a pesquisa web não entrega estas dimensões. Público-alvo e
  // ativos de marca raramente estão publicados de forma extraível — o site
  // institucional vende produto, não descreve o próprio público. Quem sabe isso
  // é quem sentou na reunião, e é justamente o diferencial da Cross.
  publicos?: string[];
  territorios?: string[];
  pracas?: string[];
  ativos?: Array<{ id: string; descricao: string }>;
  /** Perfil estratégico vigente: posicionamento, objetivos, desafios. */
  perfil_estrategico?: {
    resumo?: string | null;
    posicionamento?: string | null;
    objetivos?: string | null;
    desafios?: string | null;
  } | null;
}

export interface EntradaPerfil {
  entidade: string;
  aliases?: string[];
  dominio_oficial?: string | null;
  internos: DadosInternos;
  evidencia: EvidencePackage | null;
  /** Versão anterior, para calcular diff e preservar fatos ausentes. */
  anterior?: EntityIntelligenceProfile | null;
}

/** Categorias do Evidence Package → seções do perfil. */
const SECAO_POR_CATEGORIA: Record<string, keyof EntityIntelligenceProfile> = {
  contexto_empresa: "contexto_empresa",
  posicionamento: "posicionamento",
  publico: "publicos",
  territorio: "territorios",
  ativo: "ativos",
  produto: "produtos",
  parceria: "relacionamentos",
  patrocinio: "relacionamentos",
  lideranca: "relacionamentos",
  campanha: "movimentos",
  evento: "movimentos",
  expansao: "movimentos",
  movimento_estrategico: "movimentos",
  sinal_cultural: "movimentos",
  sinal_mercado: "movimentos",
  outro: "contexto_empresa",
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Similaridade de Jaccard — base da deduplicação entre fontes e execuções. */
function similaridade(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((w) => w.length > 3));
  const pb = new Set(normalizar(b).split(" ").filter((w) => w.length > 3));
  if (!pa.size || !pb.size) return 0;
  let inter = 0;
  for (const w of pa) if (pb.has(w)) inter++;
  return inter / new Set([...pa, ...pb]).size;
}

/** Proveniência de dado interno — nunca carrega evidence_refs. */
function provInterna(registro: string): Proveniencia {
  return { origem: "interno", registro_interno: registro, evidence_refs: [], source_refs: [] };
}

/** Proveniência de evidência externa — nunca carrega registro_interno. */
function provExterna(fato: Fato): Proveniencia {
  return {
    origem: "externo",
    registro_interno: null,
    evidence_refs: [fato.fact_id],
    source_refs: [...fato.source_refs],
  };
}

/**
 * Hash dos inputs. Mesmos dados internos + mesma evidência = mesmo hash =
 * nenhuma versão nova. É o que impede versões idênticas se acumularem.
 */
export function calcularHashEntrada(entrada: EntradaPerfil): string {
  const material = JSON.stringify({
    entidade: normalizar(entrada.entidade),
    parte_id: entrada.internos.parte_id,
    cliente: entrada.internos.eh_cliente_cross,
    papeis: [...(entrada.internos.papeis ?? [])].sort(),
    oportunidades: (entrada.internos.oportunidades ?? []).map((o) => o.id).sort(),
    parcerias: (entrada.internos.parcerias ?? []).map((p) => p.id).sort(),
    projetos: (entrada.internos.projetos ?? []).map((p) => p.id).sort(),
    // Só os fact_ids: reordenação não deve gerar versão nova.
    fatos: (entrada.evidencia?.facts ?? []).map((f) => f.fact_id).sort(),
  });
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Consolida um fato numa seção, mesclando duplicata em vez de repetir.
 *
 * O mesmo acontecimento pode aparecer em várias fontes e em execuções
 * diferentes. Consolidar mantendo TODAS as referências preserva a corroboração
 * — que é justamente o que distingue um fato de um boato.
 */
function inserirConsolidando(
  destino: ElementoPerfil[],
  novo: ElementoPerfil
): "adicionado" | "mesclado" {
  const existente = destino.find((e) => similaridade(e.valor, novo.valor) >= 0.7);
  if (!existente) {
    destino.push(novo);
    return "adicionado";
  }

  // Une as referências sem duplicar.
  const unir = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  existente.proveniencia.evidence_refs = unir(
    existente.proveniencia.evidence_refs,
    novo.proveniencia.evidence_refs
  );
  existente.proveniencia.source_refs = unir(
    existente.proveniencia.source_refs,
    novo.proveniencia.source_refs
  );
  // Mantém a maior confiança e a verificação mais forte observadas.
  if ((novo.confianca ?? 0) > (existente.confianca ?? 0)) existente.confianca = novo.confianca;
  if (novo.verificacao === "corroborada") existente.verificacao = "corroborada";
  return "mesclado";
}

/**
 * Constrói o perfil.
 *
 * Ordem deliberada: dados internos primeiro (autoridade sobre a relação),
 * evidência externa depois (autoridade sobre o mundo). As duas nunca se
 * misturam — cada elemento declara sua origem.
 */
export function construirPerfil(entrada: EntradaPerfil): EntityIntelligenceProfile {
  const inicio = Date.now();
  const { internos, evidencia } = entrada;

  const perfil = {
    contexto_empresa: [] as ElementoPerfil[],
    posicionamento: [] as ElementoPerfil[],
    publicos: [] as ElementoPerfil[],
    territorios: [] as ElementoPerfil[],
    ativos: [] as ElementoPerfil[],
    produtos: [] as ElementoPerfil[],
    relacionamentos: [] as ElementoPerfil[],
    movimentos: [] as ElementoPerfil[],
  };

  // ------------------------------------------------------- identidade
  // O agente NUNCA cria Parte. Sem Parte correspondente, o perfil nasce
  // "não vinculada" e aguarda decisão humana.
  const vinculo: VinculoEntidade = internos.candidatas?.length
    ? "ambigua"
    : internos.parte_id
      ? "vinculada"
      : "nao_vinculada";

  const identidade = {
    nome: internos.nome_exibicao ?? entrada.entidade,
    aliases: entrada.aliases ?? [],
    dominio_oficial: entrada.dominio_oficial ?? null,
    tipo: internos.tipo ?? null,
    parte_id: internos.parte_id,
    vinculo,
    requer_resolucao_humana: vinculo !== "vinculada",
    candidatas: internos.candidatas ?? [],
  };

  // -------------------------------------------- relação interna (banco)
  const relacao_interna = {
    eh_cliente_cross: internos.eh_cliente_cross,
    papeis: (internos.papeis ?? []).map((p) => ({
      valor: p,
      proveniencia: provInterna(`parte_papel(parte_id=${internos.parte_id})`),
      verificacao: null,
      confianca: null,
      publicado_em: null,
    })),
    oportunidades: (internos.oportunidades ?? []).map((o) => ({
      valor: o.descricao,
      proveniencia: provInterna(`candidatura_parceiro.id=${o.id}`),
      verificacao: null,
      confianca: null,
      publicado_em: null,
    })),
    parcerias: (internos.parcerias ?? []).map((p) => ({
      valor: p.descricao,
      proveniencia: provInterna(`parceria.id=${p.id}`),
      verificacao: null,
      confianca: null,
      publicado_em: null,
    })),
    projetos: (internos.projetos ?? []).map((p) => ({
      valor: p.descricao,
      proveniencia: provInterna(`projeto.id=${p.id}`),
      verificacao: null,
      confianca: null,
      publicado_em: null,
    })),
  };

  const registrosInternos =
    relacao_interna.papeis.length +
    relacao_interna.oportunidades.length +
    relacao_interna.parcerias.length +
    relacao_interna.projetos.length +
    (internos.parte_id ? 1 : 0);

  // ------------------------ inteligência interna (apurada pela equipe)
  //
  // Entra ANTES da evidência externa e com proveniência interna. São as
  // dimensões que a web não entrega e que a Cross conhece de reunião —
  // exatamente o que o Crossability precisa para avaliar encaixe.
  const elementoInterno = (valor: string, registro: string): ElementoPerfil => ({
    valor,
    proveniencia: provInterna(registro),
    verificacao: null,
    confianca: null,
    publicado_em: null,
  });

  const refParte = `cross_intelligence(parte_id=${internos.parte_id})`;
  for (const p of internos.publicos ?? []) {
    perfil.publicos.push(elementoInterno(p, `${refParte}.parte_publico`));
  }
  for (const t of internos.territorios ?? []) {
    perfil.territorios.push(elementoInterno(t, `${refParte}.parte_territorio`));
  }
  for (const pr of internos.pracas ?? []) {
    perfil.territorios.push(elementoInterno(pr, `${refParte}.parte_praca`));
  }
  for (const a of internos.ativos ?? []) {
    perfil.ativos.push(elementoInterno(a.descricao, `cross_intelligence.ativo.id=${a.id}`));
  }
  const pe = internos.perfil_estrategico;
  if (pe?.posicionamento) {
    perfil.posicionamento.push(elementoInterno(pe.posicionamento, `${refParte}.perfil_estrategico`));
  }
  if (pe?.resumo) {
    perfil.contexto_empresa.push(elementoInterno(pe.resumo, `${refParte}.perfil_estrategico`));
  }
  if (pe?.objetivos) {
    perfil.contexto_empresa.push(elementoInterno(pe.objetivos, `${refParte}.perfil_estrategico`));
  }

  const itensInternosInteligencia =
    (internos.publicos?.length ?? 0) + (internos.territorios?.length ?? 0) +
    (internos.pracas?.length ?? 0) + (internos.ativos?.length ?? 0);

  // ------------------------------------------------ evidência externa
  let mescladas = 0;
  let considerados = 0;
  let evidenciaMaisRecente: string | null = null;

  for (const fato of evidencia?.facts ?? []) {
    considerados++;

    // Só fato entra no perfil. Inferência não é conhecimento factual.
    if (fato.natureza !== "fato") continue;

    const secao = SECAO_POR_CATEGORIA[fato.categoria] ?? "contexto_empresa";
    const alvo = perfil[secao as keyof typeof perfil];
    if (!alvo) continue;

    const r = inserirConsolidando(alvo, {
      valor: fato.claim,
      proveniencia: provExterna(fato),
      verificacao: fato.verificacao,
      confianca: fato.confianca,
      publicado_em: fato.publicado_em,
    });
    if (r === "mesclado") mescladas++;

    const quando = fato.publicado_em ?? fato.coletado_em;
    if (quando && (!evidenciaMaisRecente || quando > evidenciaMaisRecente)) {
      evidenciaMaisRecente = quando;
    }
  }

  // Preserva fatos da versão anterior que não reapareceram. Ausência numa nova
  // pesquisa NÃO prova que o fato deixou de existir — remover exigiria
  // evidência explícita.
  if (entrada.anterior) {
    for (const secao of Object.keys(perfil) as Array<keyof typeof perfil>) {
      for (const antigo of entrada.anterior[secao] ?? []) {
        if (antigo.proveniencia.origem !== "externo") continue;
        const jaEsta = perfil[secao].some((e) => similaridade(e.valor, antigo.valor) >= 0.7);
        if (!jaEsta) perfil[secao].push(antigo);
      }
    }
  }

  // ------------------------------------------------------ conflitos
  const conflitos = (evidencia?.conflitos ?? [])
    .filter((f) => f.conflito)
    .map((f) => ({
      claim_a: f.claim,
      fontes_a: f.source_refs,
      claim_b: f.conflito!.claim_oposta,
      fontes_b: f.conflito!.source_refs_oposta,
      observacao: "Fontes independentes divergem. Nenhuma versão foi escolhida.",
    }));

  // -------------------------------------------------------- lacunas
  const lacunas = (evidencia?.lacunas ?? []).map((l) => ({
    campo: l.categoria ?? "geral",
    descricao: l.descricao,
  }));

  // Seções vazias viram lacuna declarada — o perfil diz o que não sabe.
  const essenciais: Array<[keyof typeof perfil, string]> = [
    ["publicos", "público"],
    ["territorios", "territórios"],
    ["ativos", "ativos"],
  ];
  for (const [secao, rotulo] of essenciais) {
    if (perfil[secao].length === 0) {
      lacunas.push({ campo: secao, descricao: `Nenhum fato confirmado sobre ${rotulo}.` });
    }
  }

  // ------------------------------------------------------- timeline
  // Só itens com data. Sem data, fica fora — não se inventa sequência.
  const timeline = Object.values(perfil)
    .flat()
    .filter((e) => e.publicado_em)
    .map((e) => ({
      data: e.publicado_em!,
      descricao: e.valor,
      proveniencia: e.proveniencia,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  const consolidados = Object.values(perfil).reduce((s, arr) => s + arr.length, 0);

  return entityIntelligenceProfileSchema.parse({
    identidade,
    relacao_interna,
    ...perfil,
    timeline,
    conflitos,
    lacunas,
    frescor: {
      perfil_gerado_em: new Date().toISOString(),
      evidencia_mais_recente_em: evidenciaMaisRecente,
      atualizacao_interna_mais_recente_em: internos.atualizado_em ?? null,
    },
    versao_perfil: (entrada.anterior?.versao_perfil ?? 0) + 1,
    hash_entrada: calcularHashEntrada(entrada),
    telemetria: {
      duracao_ms: Date.now() - inicio,
      registros_internos_considerados: registrosInternos + itensInternosInteligencia,
      fatos_considerados: considerados,
      fatos_consolidados: consolidados,
      duplicatas_mescladas: mescladas,
      conflitos: conflitos.length,
      lacunas: lacunas.length,
      // Determinístico por desenho: o Evidence Package já traz claims
      // estruturados, então não há inferência a fazer aqui.
      llm_calls: 0,
      custo_estimado_usd: 0,
    },
  });
}

/**
 * Compara duas versões do perfil.
 *
 * `ausentes_nao_removidos` é deliberado: item que sumiu da nova rodada é
 * registrado como ausente, não como removido. Remoção exigiria evidência
 * explícita.
 */
export function calcularDiff(
  anterior: EntityIntelligenceProfile,
  novo: EntityIntelligenceProfile
): DiffPerfil {
  const secoes: Array<keyof EntityIntelligenceProfile> = [
    "contexto_empresa", "posicionamento", "publicos", "territorios",
    "ativos", "produtos", "relacionamentos", "movimentos",
  ];

  const adicionados: string[] = [];
  const atualizados: string[] = [];
  const ausentes: string[] = [];
  let inalterados = 0;

  for (const secao of secoes) {
    const antes = (anterior[secao] ?? []) as ElementoPerfil[];
    const depois = (novo[secao] ?? []) as ElementoPerfil[];

    for (const d of depois) {
      const par = antes.find((a) => similaridade(a.valor, d.valor) >= 0.7);
      if (!par) {
        adicionados.push(`${String(secao)}: ${d.valor.slice(0, 80)}`);
      } else if (
        par.confianca !== d.confianca ||
        par.verificacao !== d.verificacao ||
        par.proveniencia.source_refs.length !== d.proveniencia.source_refs.length
      ) {
        atualizados.push(`${String(secao)}: ${d.valor.slice(0, 80)}`);
      } else {
        inalterados++;
      }
    }

    for (const a of antes) {
      if (!depois.some((d) => similaridade(a.valor, d.valor) >= 0.7)) {
        ausentes.push(`${String(secao)}: ${a.valor.slice(0, 80)}`);
      }
    }
  }

  return {
    adicionados,
    atualizados,
    inalterados,
    conflitantes: novo.conflitos.map((c) => c.claim_a.slice(0, 80)),
    ausentes_nao_removidos: ausentes,
  };
}
