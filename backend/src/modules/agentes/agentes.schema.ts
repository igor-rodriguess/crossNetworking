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
