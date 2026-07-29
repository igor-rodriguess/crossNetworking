import { buscar, type ResultadoColeta } from "./shared/web-search";
import { coletaFontesSaidaSchema, type ColetarFontesInput, type ColetaFontesSaida } from "./agentes.schema";
import type { TipoFonte } from "./agentes.schema";

// -----------------------------------------------------------------------------
// Source Collector — o SEGUNDO nó da espinha de descoberta.
//
// Consome o plano de pesquisa (do Search Planning) e executa as buscas de
// verdade, uma por consulta, na fonte adequada. Devolve resultados BRUTOS
// agrupados por consulta — não interpreta nem valida (isso é dos agentes
// seguintes: Source Credibility, Fact Verifier, Extractor).
//
// Paraleliza a coleta: cada consulta é independente, então todas rodam juntas
// (a arquitetura pede isso — derruba a coleta de minutos para segundos). Usa o
// cliente de busca DuckDuckGo (gratuito, sem chave), com stub em AI_MOCK.
// -----------------------------------------------------------------------------

interface ConsultaAlvo {
  termo: string;
  tipo_fonte: TipoFonte;
}

/** Extrai a lista de consultas a executar, do plano ou da lista solta. */
function consultasDaEntrada(input: ColetarFontesInput): ConsultaAlvo[] {
  if (input.consultas && input.consultas.length > 0) {
    return input.consultas.map((c) => ({ termo: c.termo, tipo_fonte: c.tipo_fonte }));
  }
  if (input.plano) {
    return input.plano.perguntas.flatMap((p) =>
      p.consultas.map((c) => ({ termo: c.termo, tipo_fonte: c.tipo_fonte }))
    );
  }
  return [];
}

export interface ResultadoColetaAgente {
  saida: ColetaFontesSaida;
  origem: "duckduckgo" | "firecrawl" | "mock";
}

/** Executa a coleta de fontes e devolve os resultados agrupados por consulta. */
export async function coletarFontes(input: ColetarFontesInput): Promise<ResultadoColetaAgente> {
  const consultas = consultasDaEntrada(input);
  const limite = input.limite_por_consulta ?? 3;

  // Paraleliza: cada consulta é independente por fonte.
  const buscas = await Promise.all(
    consultas.map(async (c) => {
      const r: ResultadoColeta = await buscar(c.termo, limite);
      return { consulta: c, r };
    })
  );

  const coletas = buscas.map(({ consulta, r }) => ({
    termo: consulta.termo,
    tipo_fonte: consulta.tipo_fonte,
    resultados: r.resultados,
  }));

  // A origem é "mock" se qualquer coleta veio do stub; senão "duckduckgo".
  const origem: "duckduckgo" | "firecrawl" | "mock" = buscas.some((b) => b.r.origem === "mock")
    ? "mock"
    : buscas.some((b) => b.r.origem === "firecrawl")
      ? "firecrawl"
      : "duckduckgo";

  const totalResultados = coletas.reduce((soma, c) => soma + c.resultados.length, 0);
  const saida = coletaFontesSaidaSchema.parse({
    total_consultas: coletas.length,
    total_resultados: totalResultados,
    coletas,
  });

  return { saida, origem };
}
