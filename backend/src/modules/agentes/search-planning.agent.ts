import { chamarLLMJson, type MensagemLLM, type OrigemLLM } from "./shared/llm";
import { planoPesquisaSchema, type PlanejarPesquisaInput, type PlanoPesquisa } from "./agentes.schema";
import { env } from "../../config/env";

// -----------------------------------------------------------------------------
// Search Planning Agent — o PRIMEIRO nó da espinha de descoberta.
//
// Não busca nada: recebe um objetivo (+ contexto) e produz um PLANO DE PESQUISA
// estruturado — perguntas decompostas, consultas de busca e tipos de fonte —
// que os agentes de coleta (Firecrawl/web) vão consumir na sequência. Separar
// planejamento de coleta torna a busca auditável e barata de reexecutar.
//
// Roda com LLM real (OpenAI) quando há chave; senão, um stub determinístico
// gera um plano plausível a partir do próprio objetivo — todo o pipeline fica
// exercitável sem chave nem custo.
// -----------------------------------------------------------------------------

const SYSTEM = `Você é o Agente de Planejamento de Pesquisa da plataforma Cross, uma empresa de estratégia de parcerias.
Sua função é transformar um objetivo de pesquisa em um PLANO estruturado — você NÃO executa buscas, apenas planeja.

Decomponha o objetivo em perguntas de pesquisa específicas e respondíveis. Para cada pergunta, proponha consultas de busca concretas (o texto que iria num buscador) e o tipo de fonte mais adequado.

Tipos de fonte válidos: "web", "noticias", "redes_sociais", "base_setorial", "documento_interno".

Responda SOMENTE com um objeto JSON válido, sem markdown, exatamente neste formato:
{
  "objetivo_interpretado": "string — o objetivo como você o entendeu",
  "perguntas": [
    {
      "pergunta": "string",
      "prioridade": 1,
      "consultas": [
        { "termo": "string", "tipo_fonte": "web", "justificativa": "string" }
      ]
    }
  ],
  "fontes_recomendadas": ["web"],
  "observacoes": "string opcional com riscos/limitações"
}
prioridade é um inteiro de 1 (mais importante) a 5.`;

function montarMensagens(input: PlanejarPesquisaInput): MensagemLLM[] {
  const partesContexto = [
    `Objetivo da pesquisa: ${input.objetivo}`,
    input.contexto ? `Contexto adicional: ${input.contexto}` : null,
  ].filter(Boolean);
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: partesContexto.join("\n\n") },
  ];
}

// --- Stub determinístico (modo mock, sem chave) ------------------------------
// Gera um plano coerente derivado do objetivo, para exercitar o pipeline todo.
// Não é "inteligente" — é previsível de propósito, o que torna os testes estáveis.
function planoMock(input: PlanejarPesquisaInput): PlanoPesquisa {
  const alvo = input.objetivo.trim();
  const base = alvo.length > 80 ? `${alvo.slice(0, 77)}…` : alvo;
  return {
    objetivo_interpretado: `Pesquisar: ${base}`,
    perguntas: [
      {
        pergunta: `Quem são os principais players relacionados a "${base}"?`,
        prioridade: 1,
        consultas: [
          { termo: `${base} principais empresas`, tipo_fonte: "web", justificativa: "Mapear os atores relevantes." },
          { termo: `${base} líderes de mercado`, tipo_fonte: "base_setorial", justificativa: "Referência setorial confiável." },
        ],
      },
      {
        pergunta: `Quais movimentos e notícias recentes cercam "${base}"?`,
        prioridade: 2,
        consultas: [
          { termo: `${base} notícias 2026`, tipo_fonte: "noticias", justificativa: "Capturar o momento atual." },
          { termo: `${base} lançamento OR parceria`, tipo_fonte: "web", justificativa: "Sinais de oportunidade de parceria." },
        ],
      },
      {
        pergunta: `Como o público percebe "${base}"?`,
        prioridade: 3,
        consultas: [
          { termo: `${base} opinião público`, tipo_fonte: "redes_sociais", justificativa: "Percepção e sentimento do público." },
        ],
      },
    ],
    fontes_recomendadas: ["web", "noticias", "base_setorial"],
    observacoes: input.contexto
      ? "Plano gerado em MODO MOCK (sem chave de IA). Contexto considerado no escopo."
      : "Plano gerado em MODO MOCK (sem chave de IA). Sem contexto adicional informado.",
  };
}

export interface ResultadoPlanejamento {
  plano: PlanoPesquisa;
  origem: OrigemLLM;
  tokens?: { entrada: number; saida: number; cache?: number };
  /** Modelo que atendeu; ausente no modo mock/heurístico. */
  modelo?: string;
}

/** Executa o planejamento de pesquisa e devolve o plano validado. */
export async function planejarPesquisa(input: PlanejarPesquisaInput): Promise<ResultadoPlanejamento> {
  // Planejamento é uma transformação previsível de texto em consultas. No
  // Ollama local, gastar uma inferência inteira nisso atrasava a descoberta sem
  // acrescentar evidência. Reservamos o modelo para extrair e sintetizar dados
  // que já passaram pelos gates de fonte e entidade.
  if (env.aiProvider === "ollama") {
    return { plano: planoMock(input), origem: "mock" };
  }
  const resultado = await chamarLLMJson<unknown>({
    mensagens: montarMensagens(input),
    mock: () => planoMock(input),
    temperatura: 0.2,
    timeoutMs: 25_000,
    formatoJson: planoPesquisaSchema,
  });

  // A saída do LLM (real ou mock) é validada pelo mesmo schema — o modelo pode
  // errar o formato; aqui garantimos que o resto do pipeline recebe algo válido.
  const plano = planoPesquisaSchema.parse(resultado.dados);
  return { plano, origem: resultado.origem, tokens: resultado.tokens, modelo: resultado.modelo };
}
