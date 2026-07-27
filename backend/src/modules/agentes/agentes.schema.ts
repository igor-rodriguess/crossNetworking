import { z } from "zod";

const uuid = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "deve ser um UUID"
  );

// --- Entrada do Search Planning Agent --------------------------------------
//
// Contexto do que se quer pesquisar. Pode nascer de um projeto/frente reais
// (vínculo opcional, para auditoria) ou de um objetivo digitado à mão.

export const planejarPesquisaSchema = z.object({
  // O que se quer descobrir (obrigatório): o objetivo estratégico da busca.
  objetivo: z.string().trim().min(1, "objetivo é obrigatório").max(2000),
  // Contexto extra livre: setor, público-alvo, restrições, cliente…
  contexto: z.string().trim().max(4000).optional(),
  // Vínculos opcionais ao domínio (auditoria e futura escrita pós-Human Gate).
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
});
export type PlanejarPesquisaInput = z.infer<typeof planejarPesquisaSchema>;

// --- Saída do Search Planning Agent (o "plano de pesquisa") -----------------
//
// Estrutura que os agentes de coleta (Firecrawl/web) vão consumir depois.
// Cada pergunta gera consultas; cada consulta aponta um tipo de fonte.

export const tipoFonte = z.enum(["web", "noticias", "redes_sociais", "base_setorial", "documento_interno"]);
export type TipoFonte = z.infer<typeof tipoFonte>;

export const consultaBuscaSchema = z.object({
  termo: z.string().min(1),
  tipo_fonte: tipoFonte,
  // Por que esta consulta ajuda a responder a pergunta.
  justificativa: z.string().min(1),
});

export const perguntaPesquisaSchema = z.object({
  pergunta: z.string().min(1),
  // Prioridade relativa (1 = mais importante).
  prioridade: z.number().int().min(1).max(5),
  consultas: z.array(consultaBuscaSchema).min(1),
});

export const planoPesquisaSchema = z.object({
  // Reformulação clara do objetivo, como o agente o entendeu.
  objetivo_interpretado: z.string().min(1),
  // Perguntas de pesquisa decompostas, com suas consultas.
  perguntas: z.array(perguntaPesquisaSchema).min(1),
  // Fontes recomendadas no geral (visão macro).
  fontes_recomendadas: z.array(tipoFonte).min(1),
  // Riscos/limitações da pesquisa (ex.: dado pode estar desatualizado).
  observacoes: z.string().optional(),
});
export type PlanoPesquisa = z.infer<typeof planoPesquisaSchema>;

// --- Entrada do Source Collector -------------------------------------------
//
// Coleta a partir do plano de pesquisa (a saída do Search Planning). Aceita o
// plano completo, ou uma lista solta de consultas (uso avulso/testes).

export const coletarFontesSchema = z
  .object({
    // Opção A: passar o plano inteiro (encadeamento com o Search Planning).
    plano: planoPesquisaSchema.optional(),
    // Opção B: consultas soltas (uso direto).
    consultas: z.array(consultaBuscaSchema).min(1).optional(),
    // Quantos resultados por consulta (custo/tempo). Padrão 3.
    limite_por_consulta: z.number().int().min(1).max(10).default(3),
    // Vínculos opcionais ao domínio (auditoria).
    projeto_id: uuid.optional(),
    frente_id: uuid.optional(),
  })
  .refine((o) => o.plano || o.consultas, {
    message: "Informe 'plano' ou 'consultas'.",
  });
export type ColetarFontesInput = z.infer<typeof coletarFontesSchema>;

// --- Saída do Source Collector ----------------------------------------------
// Resultados agrupados por consulta. Conteúdo BRUTO — sem validação nem
// interpretação (isso é dos próximos agentes).

export const resultadoBuscaSchema = z.object({
  titulo: z.string(),
  url: z.string(),
  trecho: z.string(),
  fonte: z.string(),
});

export const coletaPorConsultaSchema = z.object({
  termo: z.string(),
  tipo_fonte: tipoFonte,
  resultados: z.array(resultadoBuscaSchema),
});

export const coletaFontesSaidaSchema = z.object({
  total_consultas: z.number().int(),
  total_resultados: z.number().int(),
  coletas: z.array(coletaPorConsultaSchema),
});
export type ColetaFontesSaida = z.infer<typeof coletaFontesSaidaSchema>;

// --- Source Credibility -----------------------------------------------------
//
// Avalia a REPUTABILIDADE da origem de cada resultado coletado (a fonte é
// confiável?) — separado de "o fato é verdade" (Fact Verifier) e de "é a mesma
// entidade" (Entity Resolver). Heurística barata e determinística.

// Aceita a saída do Collector (para encadear) ou uma lista solta de resultados.
export const avaliarCredibilidadeSchema = z
  .object({
    coleta: coletaFontesSaidaSchema.optional(),
    resultados: z.array(resultadoBuscaSchema).min(1).optional(),
    projeto_id: uuid.optional(),
    frente_id: uuid.optional(),
  })
  .refine((o) => o.coleta || o.resultados, {
    message: "Informe 'coleta' ou 'resultados'.",
  });
export type AvaliarCredibilidadeInput = z.infer<typeof avaliarCredibilidadeSchema>;

export const nivelCredibilidade = z.enum(["alta", "media", "baixa"]);
export type NivelCredibilidade = z.infer<typeof nivelCredibilidade>;

export const resultadoAvaliadoSchema = z.object({
  titulo: z.string(),
  url: z.string(),
  fonte: z.string(),
  // Score 0..100 e nível derivado.
  score: z.number().int().min(0).max(100),
  nivel: nivelCredibilidade,
  // Por que recebeu esse score (sinais que pesaram).
  sinais: z.array(z.string()),
});

export const credibilidadeSaidaSchema = z.object({
  total: z.number().int(),
  // Distribuição por nível, para leitura rápida.
  resumo: z.object({ alta: z.number().int(), media: z.number().int(), baixa: z.number().int() }),
  avaliacoes: z.array(resultadoAvaliadoSchema),
});
export type CredibilidadeSaida = z.infer<typeof credibilidadeSaidaSchema>;

// --- Fact Verifier ----------------------------------------------------------
//
// Parte 2 da validação: uma afirmação confere em 2+ fontes INDEPENDENTES?
// Corrobora (mais de um domínio distinto), não-confirmada (só uma fonte) ou
// conflitante. Núcleo heurístico por sobreposição de domínios; sem LLM/custo.

export const afirmacaoSchema = z.object({
  texto: z.string().min(1),
  // Fontes (domínios/urls) que sustentam a afirmação.
  fontes: z.array(z.string().min(1)).min(1),
});

export const verificarFatosSchema = z
  .object({
    // Afirmações a verificar (tipicamente extraídas do conteúdo coletado).
    afirmacoes: z.array(afirmacaoSchema).min(1),
    projeto_id: uuid.optional(),
    frente_id: uuid.optional(),
  });
export type VerificarFatosInput = z.infer<typeof verificarFatosSchema>;

export const statusVerificacao = z.enum(["corroborada", "nao_confirmada", "fonte_unica"]);
export type StatusVerificacao = z.infer<typeof statusVerificacao>;

export const afirmacaoVerificadaSchema = z.object({
  texto: z.string(),
  status: statusVerificacao,
  // Nº de fontes independentes (domínios distintos) que sustentam.
  fontes_independentes: z.number().int(),
  fontes: z.array(z.string()),
  observacao: z.string(),
});

export const verificacaoSaidaSchema = z.object({
  total: z.number().int(),
  resumo: z.object({
    corroborada: z.number().int(),
    nao_confirmada: z.number().int(),
    fonte_unica: z.number().int(),
  }),
  verificacoes: z.array(afirmacaoVerificadaSchema),
});
export type VerificacaoSaida = z.infer<typeof verificacaoSaidaSchema>;

// --- Entity Resolver --------------------------------------------------------
//
// Parte 3 da validação: dedupe das entidades encontradas na pesquisa e
// casamento com as Partes JÁ cadastradas na plataforma. É o primeiro agente
// que consulta a base real — evita cadastrar duplicata de algo que já existe.

export const resolverEntidadesSchema = z.object({
  // Nomes de entidades (empresas/marcas/pessoas) encontradas na pesquisa.
  entidades: z.array(z.string().trim().min(1)).min(1),
  // Tipo esperado, para filtrar a busca na base (opcional).
  tipo: z.enum(["organizacao", "pessoa"]).optional(),
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
});
export type ResolverEntidadesInput = z.infer<typeof resolverEntidadesSchema>;

export const statusEntidade = z.enum(["nova", "possivel_duplicata", "ambigua"]);
export type StatusEntidade = z.infer<typeof statusEntidade>;

export const parteCandidataSchema = z.object({
  parte_id: z.string(),
  nome: z.string(),
  // Similaridade 0..100 entre o nome buscado e o nome da Parte.
  similaridade: z.number().int().min(0).max(100),
});

export const entidadeResolvidaSchema = z.object({
  entidade: z.string(),
  status: statusEntidade,
  // Partes existentes que podem ser a mesma entidade (ordenadas por similaridade).
  candidatas: z.array(parteCandidataSchema),
  observacao: z.string(),
});

export const entidadesSaidaSchema = z.object({
  total: z.number().int(),
  resumo: z.object({
    nova: z.number().int(),
    possivel_duplicata: z.number().int(),
    ambigua: z.number().int(),
  }),
  resolucoes: z.array(entidadeResolvidaSchema),
});
export type EntidadesSaida = z.infer<typeof entidadesSaidaSchema>;

// --- Information Extractor ---------------------------------------------------
//
// Transforma conteúdo BRUTO coletado (texto de páginas) em campos ESTRUTURADOS
// que o Crossability Reasoning consegue usar. Alinha com o domínio: setor,
// públicos, territórios, ativos e sinais de parceria — o vocabulário das Partes
// e da metodologia. Usa LLM (extração estruturada) com stub mock sem chave.

export const extrairInformacoesSchema = z
  .object({
    // Texto(s) brutos a estruturar. Pode vir dos trechos coletados.
    conteudos: z.array(z.string().trim().min(1)).min(1),
    // Foco opcional: o que se quer extrair (ex.: "potencial de patrocínio").
    foco: z.string().trim().max(500).optional(),
    projeto_id: uuid.optional(),
    frente_id: uuid.optional(),
  });
export type ExtrairInformacoesInput = z.infer<typeof extrairInformacoesSchema>;

export const perfilExtraidoSchema = z.object({
  // Nome da entidade principal identificada no conteúdo.
  nome: z.string(),
  // Setor/segmento de atuação.
  setor: z.string(),
  // Públicos-alvo mencionados ou inferidos.
  publicos: z.array(z.string()),
  // Territórios/praças de atuação.
  territorios: z.array(z.string()),
  // Ativos relevantes (propriedades, canais, patrocínios, etc.).
  ativos: z.array(z.string()),
  // Sinais de interesse/potencial de parceria.
  sinais_parceria: z.array(z.string()),
  // Confiança da extração (0..100) — o quanto o conteúdo sustentou os campos.
  confianca: z.number().int().min(0).max(100),
});

export const extracaoSaidaSchema = z.object({
  total_conteudos: z.number().int(),
  perfis: z.array(perfilExtraidoSchema),
});
export type ExtracaoSaida = z.infer<typeof extracaoSaidaSchema>;
