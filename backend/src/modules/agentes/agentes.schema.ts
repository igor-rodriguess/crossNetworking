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
    conteudos: z.array(z.string().trim().min(1)).min(1).optional(),
    // URLs para buscar o conteúdo completo (via Firecrawl) antes de extrair.
    urls: z.array(z.string().trim().url()).min(1).optional(),
    // Encadeamento direto com a saída do Source Collector (extrai as URLs dela).
    coleta: coletaFontesSaidaSchema.optional(),
    // Quantas URLs (de 'urls' + 'coleta') buscar conteúdo, no máximo.
    limite_urls: z.number().int().min(1).max(20).default(10),
    // Foco opcional: o que se quer extrair (ex.: "potencial de patrocínio").
    foco: z.string().trim().max(500).optional(),
    projeto_id: uuid.optional(),
    frente_id: uuid.optional(),
  })
  .refine(
    (o) => (o.conteudos?.length ?? 0) + (o.urls?.length ?? 0) + (o.coleta?.coletas.length ?? 0) > 0,
    { message: "Informe 'conteudos', 'urls' ou 'coleta'." }
  );
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
  // Fontes externas e a evidência textual específica que sustentam este perfil.
  // Assim, uma matéria não vira uma candidata sem ser possível rastrear de onde
  // veio o nome e por que ela foi associada à oportunidade.
  fontes: z.array(z.object({
    url: z.string().url(),
    evidencia: z.string().min(1).max(700),
  })).max(5).optional(),
});

export const extracaoSaidaSchema = z.object({
  total_conteudos: z.number().int(),
  perfis: z.array(perfilExtraidoSchema),
});
export type ExtracaoSaida = z.infer<typeof extracaoSaidaSchema>;

// --- Crossability Reasoning -------------------------------------------------
//
// O CORAÇÃO da metodologia: aplica a Crossability nas 6 dimensões do domínio
// (compatibilidade_publicos, compatibilidade_territorios, complementaridade_
// ativos, sinergias, fit_estrategico, momento_estrategico) — exatamente as que
// a plataforma persiste. Produz um RASCUNHO (o agente propõe; o humano promove
// no Human Gate). Usa LLM com stub mock sem chave.

export const nivelCompat = z.enum(["alta", "media", "baixa"]);
export type NivelCompat = z.infer<typeof nivelCompat>;

export const recomendacaoCross = z.enum(["recomendada", "em_estudo", "nao_recomendada"]);
export type RecomendacaoCross = z.infer<typeof recomendacaoCross>;

// Uma dimensão avaliada: nível + a justificativa textual.
const dimensaoAvaliada = z.object({
  nivel: nivelCompat,
  texto: z.string().min(1),
});

export const raciocinarCrossabilitySchema = z.object({
  // O cliente que busca a parceria (quem tem a necessidade).
  cliente: z.string().trim().min(1, "cliente é obrigatório").max(300),
  // O parceiro candidato (a marca/parte avaliada).
  parceiro: z.string().trim().min(1, "parceiro é obrigatório").max(300),
  // Objetivo/contexto da parceria buscada.
  objetivo: z.string().trim().max(2000).optional(),
  // Perfil estruturado do parceiro (idealmente vindo do Extractor).
  perfil_parceiro: perfilExtraidoSchema.partial().optional(),
  // Trechos recuperados do RAG. São contexto de apoio, nunca fatos novos por si só.
  contexto_rag: z.array(z.string().trim().min(1)).max(5).optional(),
  candidatura_id: uuid.optional(),
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
});
export type RaciocinarCrossabilityInput = z.infer<typeof raciocinarCrossabilitySchema>;

export const analiseCrossabilitySchema = z.object({
  compatibilidade_publicos: dimensaoAvaliada,
  compatibilidade_territorios: dimensaoAvaliada,
  complementaridade_ativos: dimensaoAvaliada,
  sinergias: dimensaoAvaliada,
  fit_estrategico: dimensaoAvaliada,
  momento_estrategico: dimensaoAvaliada,
  recomendacao: recomendacaoCross,
  racional_recomendacao: z.string().min(1),
  // Confiança da análise (0..100) — honestidade sobre a base de evidência.
  confianca: z.number().int().min(0).max(100),
});
export type AnaliseCrossabilitySaida = z.infer<typeof analiseCrossabilitySchema>;

// --- Recommendation ---------------------------------------------------------
//
// Ranqueia candidatos a parceiro pela análise Crossability. Recebe várias
// análises (uma por candidato) e devolve a lista ordenada por um score
// derivado das 6 dimensões + a recomendação, com justificativa. Determinístico.

export const candidatoAnaliseSchema = z.object({
  parceiro: z.string().min(1),
  analise: analiseCrossabilitySchema,
});

export const recomendarParceirosSchema = z.object({
  candidatos: z.array(candidatoAnaliseSchema).min(1),
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
});
export type RecomendarParceirosInput = z.infer<typeof recomendarParceirosSchema>;

export const candidatoRankeadoSchema = z.object({
  posicao: z.number().int().min(1),
  parceiro: z.string(),
  score: z.number().int().min(0).max(100),
  recomendacao: recomendacaoCross,
  // Dimensões fortes (nível alta) e fracas (nível baixa) — leitura rápida.
  fortalezas: z.array(z.string()),
  fraquezas: z.array(z.string()),
  justificativa: z.string(),
});

export const recomendacaoSaidaSchema = z.object({
  total: z.number().int(),
  ranking: z.array(candidatoRankeadoSchema),
});
export type RecomendacaoSaida = z.infer<typeof recomendacaoSaidaSchema>;

// --- Pipelines de tarefa ----------------------------------------------------
//
// Entradas dos dois agentes de tarefa que consolidam os componentes
// compartilhados. Os limites ficam na entrada para impedir que uma execução
// cresça sem controle de consultas, páginas, candidatos ou evidências.

const pipelineBaseSchema = z.object({
  cliente: z.string().trim().min(1, "cliente é obrigatório").max(300),
  objetivo: z.string().trim().min(1, "objetivo é obrigatório").max(2000),
  contexto: z.string().trim().max(4000).optional(),
  limite_consultas: z.number().int().min(1).max(10).default(5),
  limite_resultados_por_consulta: z.number().int().min(1).max(10).default(2),
  limite_urls: z.number().int().min(1).max(10).default(5),
  limite_candidatos: z.number().int().min(1).max(10).default(5),
  // Afirmações manuais podem ser verificadas quando o chamador já possui
  // claims; o pipeline não transforma snippets em fatos automaticamente.
  afirmacoes: z.array(afirmacaoSchema).max(20).optional(),
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
});

export const executarPartnerDiscoverySchema = pipelineBaseSchema;
export type ExecutarPartnerDiscoveryInput = z.infer<typeof executarPartnerDiscoverySchema>;

// A tela de Oportunidades usa a mesma entrada do Partner Discovery. A diferença
// é que, além da auditoria do pipeline, a saída é materializada como rascunhos
// de oportunidades para leitura e curadoria humana.
export const gerarOportunidadesSchema = pipelineBaseSchema;
export type GerarOportunidadesInput = z.infer<typeof gerarOportunidadesSchema>;

export const executarMarketIntelligenceSchema = pipelineBaseSchema.extend({
  entidade_foco: z.string().trim().max(300).optional(),
});
export type ExecutarMarketIntelligenceInput = z.infer<typeof executarMarketIntelligenceSchema>;

export const pipelineEtapaSchema = z.object({
  nome: z.string(),
  status: z.enum(["sucesso", "parcial", "ignorada"]),
  execucao_id: z.string().optional(),
  origem: z.string().optional(),
  observacao: z.string().optional(),
});

export const pipelineAnaliseSchema = z.object({
  parceiro: z.string(),
  execucao_id: z.string().optional(),
  origem: z.string(),
  analise: analiseCrossabilitySchema,
});

const pipelineRagSaidaSchema = z.object({
  total: z.number().int(),
  embedding_origem: z.enum(["openai", "mock"]),
  trechos: z.array(
    z.object({
      id: z.string(),
      origem: z.string(),
      conteudo: z.string(),
      similaridade: z.number(),
      metadados: z.unknown(),
    })
  ),
});

export const pipelineSaidaSchema = z.object({
  pipeline: z.enum(["partner_discovery", "market_intelligence"]),
  status: z.enum(["sucesso", "parcial", "insufficient_evidence"]),
  execucao_id: z.string(),
  etapas: z.array(pipelineEtapaSchema),
  plano: planoPesquisaSchema,
  coleta: coletaFontesSaidaSchema,
  credibilidade: credibilidadeSaidaSchema,
  verificacao: verificacaoSaidaSchema.nullable(),
  rag: pipelineRagSaidaSchema.nullable(),
  entidades: entidadesSaidaSchema.nullable(),
  extracao: extracaoSaidaSchema,
  analises: z.array(pipelineAnaliseSchema),
  recomendacao: recomendacaoSaidaSchema.nullable(),
  observacoes: z.array(z.string()),
});
export type PipelineSaida = z.infer<typeof pipelineSaidaSchema>;

// Contrato interno entre o worker LangGraph e a API para persistir a projeção
// de oportunidades. Não é um Human Gate: apenas guarda o rascunho com suas
// evidências para a tela consultar depois.
export const persistirOportunidadesSchema = z.object({
  pipeline: z.enum(["partner_discovery", "market_intelligence"]),
  execucao_pipeline_id: uuid.optional(),
  cliente: z.string().trim().min(1).max(300),
  objetivo: z.string().trim().min(1).max(2000),
  // Frente e direcionadores que originaram o rascunho. São usados apenas para
  // repetir o gate de aderência no momento da persistência.
  contexto: z.string().trim().max(4000).optional(),
  projeto_id: uuid.optional(),
  frente_id: uuid.optional(),
  analises: z.array(pipelineAnaliseSchema),
  coleta: coletaFontesSaidaSchema.nullable().optional(),
  credibilidade: credibilidadeSaidaSchema.nullable().optional(),
  rag: pipelineRagSaidaSchema.nullable().optional(),
  extracao: extracaoSaidaSchema.optional(),
});
export type PersistirOportunidadesInput = z.infer<typeof persistirOportunidadesSchema>;

// --- Importação assistida de CSV --------------------------------------------
// A IA só sugere o mapeamento; a confirmação explícita do usuário é obrigatória
// antes de qualquer escrita. As entidades abaixo são as três cargas iniciais
// que têm contratos completos e persistidos na plataforma.
export const entidadeImportacaoCsvSchema = z.enum([
  "partes", "clientes", "projetos", "frentes", "candidaturas", "ativos", "canais", "perfis_estrategicos",
]);
export type EntidadeImportacaoCsv = z.infer<typeof entidadeImportacaoCsvSchema>;

export const camposImportacaoCsvPorEntidade = {
  partes: [
    "nome", "tipo", "categoria", "papel", "razao_social", "cnpj", "site",
    "nome_artistico", "cpf", "nacionalidade", "contato_nome", "contato_cargo",
    "contato_email", "contato_telefone",
  ],
  clientes: ["nome", "segmento", "site", "inicio_relacionamento", "observacoes"],
  projetos: [
    "cliente", "nome", "objetivo", "descricao", "produto", "data_inicio",
    "data_previsao_fim", "prioridade", "status",
  ],
  frentes: [
    "cliente", "projeto", "nome", "objetivo", "descricao", "categoria", "data_abertura", "data_encerramento", "status",
  ],
  candidaturas: [
    "cliente", "projeto", "frente", "parte", "interesse_cliente", "interesse_parceiro", "prioridade", "disponibilidade_confirmada", "observacoes", "status",
  ],
  ativos: ["parte", "nome", "categoria", "descricao", "valor_referencia", "moeda"],
  canais: ["parte", "plataforma", "identificador", "url"],
  perfis_estrategicos: ["parte", "resumo", "posicionamento", "objetivos", "desafios"],
} as const;

const campoImportacaoCsvSchema = z.enum([
  "nome", "tipo", "categoria", "papel", "razao_social", "cnpj", "site",
  "nome_artistico", "cpf", "nacionalidade", "contato_nome", "contato_cargo",
  "contato_email", "contato_telefone", "segmento", "inicio_relacionamento",
  "observacoes", "cliente", "objetivo", "descricao", "produto", "data_inicio",
  "data_previsao_fim", "prioridade", "status", "projeto", "frente", "parte",
  "data_abertura", "data_encerramento", "interesse_cliente", "interesse_parceiro",
  "disponibilidade_confirmada", "valor_referencia", "moeda", "plataforma",
  "identificador", "url", "resumo", "posicionamento", "objetivos", "desafios",
]);

const linhaCsvSchema = z.record(z.string().min(1), z.string().max(20_000));

export const analisarImportacaoCsvSchema = z.object({
  entidade: entidadeImportacaoCsvSchema,
  cabecalhos: z.array(z.string().trim().min(1).max(160)).min(1).max(80),
  amostra: z.array(linhaCsvSchema).min(1).max(20),
});
export type AnalisarImportacaoCsvInput = z.infer<typeof analisarImportacaoCsvSchema>;

export const mapeamentoImportacaoCsvSaidaSchema = z.object({
  campos: z.array(z.object({
    campo_destino: campoImportacaoCsvSchema,
    coluna_origem: z.string().min(1),
    confianca: z.enum(["alta", "media", "baixa"]),
  })).max(30),
  observacoes: z.array(z.string()).max(20),
});
export type MapeamentoImportacaoCsvSaida = z.infer<typeof mapeamentoImportacaoCsvSaidaSchema>;

export const confirmarImportacaoCsvSchema = z.object({
  entidade: entidadeImportacaoCsvSchema,
  cabecalhos: z.array(z.string().trim().min(1).max(160)).min(1).max(80),
  linhas: z.array(linhaCsvSchema).min(1).max(1_000),
  mapeamento: mapeamentoImportacaoCsvSaidaSchema,
});
export type ConfirmarImportacaoCsvInput = z.infer<typeof confirmarImportacaoCsvSchema>;

// Planilhas de acompanhamento de parcerias normalmente são hierárquicas: elas
// trazem títulos de projeto, seções e cabeçalhos repetidos. Este contrato recebe
// o CSV bruto para preservar essa hierarquia antes de criar o funil completo.
const conteudoCsvHistoricoSchema = z.string().trim().min(20, "envie o conteúdo CSV da planilha").max(2_000_000);

export const analisarFunilHistoricoSchema = z.object({
  conteudo: conteudoCsvHistoricoSchema,
});
export type AnalisarFunilHistoricoInput = z.infer<typeof analisarFunilHistoricoSchema>;

export const confirmarFunilHistoricoSchema = z.object({
  conteudo: conteudoCsvHistoricoSchema,
});
export type ConfirmarFunilHistoricoInput = z.infer<typeof confirmarFunilHistoricoSchema>;

export const enriquecerParteSchema = z.object({
  limite_fontes: z.number().int().min(1).max(5).default(3),
});
export type EnriquecerParteInput = z.infer<typeof enriquecerParteSchema>;

// --- Human Gate -------------------------------------------------------------
//
// O portão de curadoria: promove (ou rejeita) uma saída de agente para a base
// REAL, com decisão humana obrigatória. Só aqui algo de IA vira dado de
// domínio — e sempre como rascunho no fluxo humano que já existe. Hoje
// suporta promover uma análise Crossability (execução do crossability_reasoning)
// para uma candidatura, criando a Análise Crossability via módulo metodologias.

export const decidirHumanGateSchema = z.object({
  // A execução de agente a curar (fica na auditoria cross_ai.execucao_agente).
  execucao_id: uuid,
  // Decisão do especialista.
  decisao: z.enum(["aprovar", "rejeitar"]),
  // Onde aplicar quando aprovado (obrigatório para aprovar uma análise).
  candidatura_id: uuid.optional(),
  // Justificativa da decisão (auditoria).
  justificativa: z.string().trim().max(2000).optional(),
});
export type DecidirHumanGateInput = z.infer<typeof decidirHumanGateSchema>;

export const humanGateSaidaSchema = z.object({
  decisao: z.enum(["aprovar", "rejeitar"]),
  // ID do artefato criado na base (ex.: a análise Crossability), se aprovado.
  artefato_id: z.string().nullable(),
  mensagem: z.string(),
});
export type HumanGateSaida = z.infer<typeof humanGateSaidaSchema>;

// --- RAG: ingestão e busca semântica ----------------------------------------
//
// A base de conhecimento vetorial. Ingerir = guardar trechos + embedding;
// buscar = recuperar os mais relevantes para uma consulta (o "R" do RAG).

export const origemDocumento = z.enum(["paper", "perfil_parte", "decisao", "coleta_web", "manual", "relatorio"]);
export type OrigemDocumento = z.infer<typeof origemDocumento>;

export const ingerirRagSchema = z.object({
  origem: origemDocumento,
  // Trechos de texto a indexar (cada um vira um documento com seu embedding).
  trechos: z.array(z.string().trim().min(1)).min(1).max(100),
  // Vínculo opcional à entidade de domínio de origem.
  referencia_id: uuid.optional(),
  // Metadados livres (título, url…), aplicados a todos os trechos.
  metadados: z.record(z.string(), z.unknown()).optional(),
});
export type IngerirRagInput = z.infer<typeof ingerirRagSchema>;

export const ingestaoSaidaSchema = z.object({
  inseridos: z.number().int(),
  embedding_origem: z.enum(["openai", "mock"]),
});
export type IngestaoSaida = z.infer<typeof ingestaoSaidaSchema>;

export const buscarRagSchema = z.object({
  consulta: z.string().trim().min(1, "consulta é obrigatória").max(2000),
  origem: origemDocumento.optional(),
  limite: z.number().int().min(1).max(20).default(5),
});
export type BuscarRagInput = z.infer<typeof buscarRagSchema>;

export const trechoRelevanteSchema = z.object({
  id: z.string(),
  origem: z.string(),
  conteudo: z.string(),
  similaridade: z.number(),
  metadados: z.unknown(),
});

export const buscaRagSaidaSchema = z.object({
  total: z.number().int(),
  embedding_origem: z.enum(["openai", "mock"]),
  trechos: z.array(trechoRelevanteSchema),
});
export type BuscaRagSaida = z.infer<typeof buscaRagSaidaSchema>;
