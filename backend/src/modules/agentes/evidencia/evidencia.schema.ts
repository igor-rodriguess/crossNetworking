import { z } from "zod";

// -----------------------------------------------------------------------------
// Contratos do Research & Evidence Agent.
//
// Este agente responde "o que conseguimos AFIRMAR sobre esta entidade com base
// em fontes rastreáveis?". Ele NÃO responde se a entidade combina com a Cross
// (Crossability) nem que parceria fazer (Recommendation).
//
// Tudo aqui é EVIDENCE — fato sobre o mundo. Cross Knowledge (como a Cross
// interpreta) vive noutra estrutura e não pode entrar aqui: um trecho de
// metodologia jamais vira prova de que um fato externo aconteceu (ADR-009).
// -----------------------------------------------------------------------------

/** Objetivo da pesquisa. Evita coleta genérica sem propósito. */
export const objetivoPesquisa = z.enum([
  "contexto_geral",
  "movimentos_recentes",
  "campanhas",
  "patrocinios",
  "produtos",
  "expansao_mercado",
  "movimentos_culturais",
  "liderancas",
  "eventos",
  "parcerias",
  "sinais_estrategicos",
  // Objetivos dirigidos às dimensões da Crossability. Acrescentados na AI-03.1
  // porque a pesquisa por "contexto geral" trazia situação financeira e deixava
  // público, território e ativo vazios — justamente o que o Crossability avalia.
  "publico_alvo",
  "territorios_atuacao",
  "ativos_marca",
]);
export type ObjetivoPesquisa = z.infer<typeof objetivoPesquisa>;

/** Categoria do fato extraído. */
export const categoriaFato = z.enum([
  "contexto_empresa",
  "posicionamento",
  "publico",
  "territorio",
  "ativo",
  "campanha",
  "produto",
  "parceria",
  "patrocinio",
  "evento",
  "expansao",
  "lideranca",
  "movimento_estrategico",
  "sinal_cultural",
  "sinal_mercado",
  "outro",
]);
export type CategoriaFato = z.infer<typeof categoriaFato>;

/** Tipo da fonte — sustenta a hierarquia de credibilidade. */
export const tipoFonte = z.enum([
  "oficial",
  "imprensa",
  "setorial",
  "agregador",
  "blog",
  "desconhecido",
]);
export type TipoFonte = z.infer<typeof tipoFonte>;

/**
 * Natureza da afirmação.
 *
 * A distinção é obrigatória: "a marca lançou X" é fato; "esse lançamento indica
 * mudança de posicionamento" é inferência. Inferência nunca recebe status de
 * fato verificado nem entra no pacote como comprovada.
 */
export const naturezaAfirmacao = z.enum(["fato", "inferencia"]);
export type NaturezaAfirmacao = z.infer<typeof naturezaAfirmacao>;

export const motivoDescarte = z.enum([
  "baixa_credibilidade",
  "duplicado",
  "entidade_divergente",
  "desatualizado_para_objetivo",
  "afirmacao_sem_suporte",
  "conflitante",
  "falha_extracao",
  "irrelevante",
  "limite_guardrail",
  // Acrescentados na AI-02.2, a partir de defeitos observados em dado real:
  // resultado patrocinado do buscador e dado pessoal de terceiro em frase
  // de exemplo (dicionário) sendo promovido a fato da empresa.
  "anuncio",
  "pii_incidental",
]);
export type MotivoDescarte = z.infer<typeof motivoDescarte>;

/** Uma fonte coletada, com tudo que permite reconstruir sua origem. */
export const fonteEvidenciaSchema = z.object({
  source_id: z.string(),
  url: z.string(),
  titulo: z.string(),
  dominio: z.string(),
  tipo_fonte: tipoFonte,
  credibilidade_score: z.number().int().min(0).max(100),
  credibilidade_nivel: z.enum(["alta", "media", "baixa"]),
  credibilidade_sinais: z.array(z.string()),
  /** `null` quando o provedor não informa — nunca inventado. */
  publicado_em: z.string().nullable(),
  coletado_em: z.string(),
  query_origem: z.string(),
});
export type FonteEvidencia = z.infer<typeof fonteEvidenciaSchema>;

/** Um fato estruturado, sempre com proveniência. */
export const fatoSchema = z.object({
  fact_id: z.string(),
  claim: z.string(),
  entidade: z.string(),
  categoria: categoriaFato,
  natureza: naturezaAfirmacao,
  /** Ids das fontes que sustentam. Nenhum fato entra sem ao menos uma. */
  source_refs: z.array(z.string()).min(1),
  /** Domínios independentes — base da corroboração. */
  dominios_independentes: z.number().int(),
  verificacao: z.enum(["corroborada", "fonte_unica", "nao_confirmada", "conflitante"]),
  confianca: z.number().int().min(0).max(100),
  publicado_em: z.string().nullable(),
  coletado_em: z.string(),
  /** Preenchido quando `verificacao = conflitante`. */
  conflito: z
    .object({
      claim_oposta: z.string(),
      source_refs_oposta: z.array(z.string()),
    })
    .nullable()
    .optional(),
});
export type Fato = z.infer<typeof fatoSchema>;

export const descarteSchema = z.object({
  tipo: z.enum(["fonte", "afirmacao"]),
  referencia: z.string(),
  motivo: motivoDescarte,
  detalhe: z.string(),
});
export type Descarte = z.infer<typeof descarteSchema>;

/** Uma lacuna: o que o agente NÃO conseguiu confirmar. */
export const lacunaSchema = z.object({
  descricao: z.string(),
  categoria: categoriaFato.nullable(),
});
export type Lacuna = z.infer<typeof lacunaSchema>;

export const statusPesquisa = z.enum([
  "sucesso",
  "evidencia_insuficiente",
  "entidade_ambigua",
  "bloqueado_por_guardrail",
]);
export type StatusPesquisa = z.infer<typeof statusPesquisa>;

/** Entrada do agente. Só `entidade` e `objetivo` são obrigatórios. */
export const pesquisarEvidenciasSchema = z.object({
  entidade: z.string().trim().min(1, "entidade é obrigatória").max(300),
  objetivo: objetivoPesquisa.default("contexto_geral"),
  aliases: z.array(z.string().trim().min(1)).max(10).optional(),
  site_oficial: z.string().trim().optional(),
  pais: z.string().trim().max(80).optional(),
  categorias_desejadas: z.array(categoriaFato).optional(),
  /** Janela temporal em meses; fora dela o fato vira contexto histórico. */
  janela_meses: z.number().int().min(1).max(120).optional(),
  limite_consultas: z.number().int().min(1).max(10).default(4),
  limite_resultados_por_consulta: z.number().int().min(1).max(10).default(3),
  limite_urls: z.number().int().min(1).max(10).default(5),
  projeto_id: z.string().uuid().optional(),
  frente_id: z.string().uuid().optional(),
});
export type PesquisarEvidenciasInput = z.infer<typeof pesquisarEvidenciasSchema>;

/** O pacote entregue ao próximo agente (Entity Intelligence). */
export const evidencePackageSchema = z.object({
  entidade: z.string(),
  objetivo: objetivoPesquisa,
  status: statusPesquisa,
  /** Consultas efetivamente executadas. */
  plano: z.array(z.string()),
  planning_mode: z.enum(["llm", "heuristica", "mock"]),
  extraction_mode: z.enum(["llm", "firecrawl", "mock"]),
  facts: z.array(fatoSchema),
  sources: z.array(fonteEvidenciaSchema),
  descartados: z.array(descarteSchema),
  conflitos: z.array(fatoSchema),
  lacunas: z.array(lacunaSchema),
  /** Entidades candidatas quando a identidade ficou ambígua. */
  ambiguidade: z
    .object({
      motivo: z.string(),
      candidatas: z.array(z.object({ nome: z.string(), parte_id: z.string().nullable() })),
    })
    .nullable(),
  telemetria: z.object({
    duracao_ms: z.number().int(),
    consultas: z.number().int(),
    buscas_web: z.number().int(),
    scrapes: z.number().int(),
    fontes_coletadas: z.number().int(),
    fontes_descartadas: z.number().int(),
    fatos_extraidos: z.number().int(),
    fatos_verificados: z.number().int(),
    custo_estimado_usd: z.number().nullable(),
    bloqueios_guardrail: z.array(z.string()),
  }),
});
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;
