import type { PlanoPesquisa } from "./agentes.schema";

// -----------------------------------------------------------------------------
// Market Discovery Planning — transforma o funil existente em território de
// busca, sem reutilizar as marcas já conhecidas como resultado.
// -----------------------------------------------------------------------------

export interface FrenteParaDescoberta {
  frente_id: string;
  frente_nome: string;
  categoria: string | null;
  objetivo: string;
}

const PALAVRAS_GENERICAS = new Set([
  "collabs", "collab", "experiencia", "marca", "produto", "parceria",
  "parcerias", "oportunidades", "desenvolver", "frente", "lifestyle",
  "de", "do", "da", "e", "com", "para", "em", "marca",
]);

function normalizar(texto: string): string {
  return texto
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eixoDaFrente(frente: FrenteParaDescoberta, cliente: string): string | null {
  const termosDoCliente = new Set(normalizar(cliente).split(/\s+/));
  const palavrasRelevantes = (texto: string) => normalizar(texto)
    .split(/\s+/)
    .filter((palavra) => palavra.length >= 4 && !PALAVRAS_GENERICAS.has(palavra) && !termosDoCliente.has(palavra));
  // Categoria/frente são campos curados; o objetivo pode conter frases longas
  // como “segmentos complementares ao lifestyle do homem”, que piorariam a busca.
  const palavras = palavrasRelevantes(`${frente.categoria ?? ""} ${frente.frente_nome}`);
  const unicas = [...new Set(palavras.length ? palavras : palavrasRelevantes(frente.objetivo))];
  return unicas.slice(-3).join(" ") || null;
}

/** Traduz o objetivo operacional em sinais pesquisáveis de parceria. */
function intencaoDaFrente(frente: FrenteParaDescoberta): string[] {
  const texto = normalizar(`${frente.objetivo} ${frente.frente_nome}`);
  const intencoes: string[] = [];
  if (/collab|colabor/.test(texto)) intencoes.push("collab");
  if (/experiencia/.test(texto)) intencoes.push("experiência de marca");
  if (/ativacao/.test(texto)) intencoes.push("ativação");
  if (/produto/.test(texto)) intencoes.push("produto");
  if (/conteudo/.test(texto)) intencoes.push("conteúdo");
  if (/rio open/.test(texto)) intencoes.push("Rio Open");
  if (/lifestyle.*homem|homem.*lifestyle/.test(texto)) intencoes.push("lifestyle masculino");
  return [...new Set(intencoes)].slice(0, 3);
}

/**
 * Cria consultas ancoradas nas frentes reais do cliente. O resultado de busca
 * ainda passa por credibilidade, identidade e deduplicação antes de virar uma
 * oportunidade — este agente só define onde procurar novas marcas.
 */
export function planejarDescobertaDeMercado(input: {
  cliente: string;
  objetivo: string;
  frentes: FrenteParaDescoberta[];
}): PlanoPesquisa {
  const briefs = input.frentes
    .map((frente) => ({ frente, eixo: eixoDaFrente(frente, input.cliente), intencao: intencaoDaFrente(frente) }))
    .filter((brief): brief is { frente: FrenteParaDescoberta; eixo: string; intencao: string[] } => Boolean(brief.eixo))
    .filter((brief, indice, lista) => lista.findIndex((item) =>
      item.eixo === brief.eixo && item.intencao.join("|") === brief.intencao.join("|")
    ) === indice)
    .slice(0, 6);
  const perguntas = briefs.map(({ frente, eixo, intencao }, indice) => {
    const formato = intencao.join(" ") || "parceria de marca";
    return {
      pergunta: `Quais marcas novas de ${eixo} demonstram sinal externo para ${formato}, atendendo ao briefing “${frente.objetivo}”?`,
      prioridade: Math.min(indice + 1, 5),
      consultas: [
        {
          termo: `site:meioemensagem.com.br ${eixo} ${formato} marca parceria`,
          tipo_fonte: "base_setorial" as const,
          justificativa: `Buscar sinal público de ${formato} no eixo ${eixo}, definido no briefing da frente.`,
        },
        {
          termo: `marcas brasileiras ${eixo} ${formato} parceria 2026`,
          tipo_fonte: "noticias" as const,
          justificativa: `Encontrar marcas com movimento recente que atendam ao objetivo “${frente.objetivo}”.`,
        },
      ],
    };
  });

  const briefingAtivo = briefs
    .map(({ frente }) => `${frente.frente_nome} (${frente.objetivo})`)
    .join("; ");

  return {
    objetivo_interpretado: `Mapear NOVAS oportunidades para ${input.cliente} a partir do briefing ativo: ${briefingAtivo || input.objetivo}. As marcas já mapeadas no funil são apenas contexto e serão excluídas do resultado.`,
    perguntas: perguntas.length ? perguntas : [{
      pergunta: "Quais marcas têm sinal recente de parceria no território estratégico do cliente?",
      prioridade: 1,
      consultas: [{
        termo: `${input.cliente} marcas brasileiras parceria 2026`,
        tipo_fonte: "noticias",
        justificativa: "Plano de contingência quando não há frentes estruturadas.",
      }],
    }],
    fontes_recomendadas: ["noticias", "base_setorial", "web"],
    observacoes: `Planejamento determinístico baseado em ${input.frentes.length} frente(s) selecionada(s). A IA só avalia candidatas novas após os gates de evidência e de aderência ao briefing. Objetivo informado: ${input.objetivo}`,
  };
}
