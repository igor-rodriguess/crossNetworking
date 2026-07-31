import { z } from "zod";
import { extrairPerfil } from "./shared/firecrawl";
import { chamarLLMJson } from "./shared/llm";
import { buscar, type ResultadoBusca } from "./shared/web-search";

export interface FonteEnriquecimentoParte {
  titulo: string;
  url: string;
  fonte: string;
  trecho: string;
}

export interface SugestaoEnriquecimentoParte {
  categoria: string;
  resumo: string;
  posicionamento: string;
  objetivos: string;
  desafios: string;
  publicos: string[];
  territorios: string[];
  pracas: string[];
  ativos: string[];
  confianca: number;
}

export interface ResultadoEnriquecimentoParte {
  origem_busca: "duckduckgo" | "firecrawl" | "mock";
  origem_extracao: "firecrawl" | "mock";
  origem_analise: "ollama" | "mock";
  sugestao: SugestaoEnriquecimentoParte;
  fontes: FonteEnriquecimentoParte[];
}

const perfilConsolidadoSchema = z.object({
  categoria: z.string().max(120).optional(),
  resumo: z.string().max(1200).optional(),
  posicionamento: z.string().max(1200).optional(),
  objetivos: z.string().max(1200).optional(),
  desafios: z.string().max(1200).optional(),
  publicos: z.array(z.string().max(160)).max(12).default([]),
  territorios: z.array(z.string().max(160)).max(12).default([]),
  ativos: z.array(z.string().max(220)).max(12).default([]),
  confianca: z.number().min(0).max(100).default(0),
});

type PerfilConsolidado = z.infer<typeof perfilConsolidadoSchema>;

function distintos(valores: Array<string | undefined>): string[] {
  const vistos = new Set<string>();
  return valores.flatMap((valor) => valor ? [valor.trim()] : []).filter((valor) => {
    const chave = valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    if (!valor || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function setorMaisFrequente(setores: string[]): string {
  const contagem = new Map<string, number>();
  for (const setor of setores.filter(Boolean)) contagem.set(setor, (contagem.get(setor) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Não identificado";
}

function sugestaoConservadora(nome: string, fontes: FonteEnriquecimentoParte[], categoria: string): PerfilConsolidado {
  const haFontes = fontes.length > 0;
  const resumoPublico = fontes.find((fonte) => fonte.trecho.trim())?.trecho.trim().slice(0, 1200);
  return {
    categoria: categoria === "Não identificado" ? undefined : categoria,
    resumo: haFontes
      ? (resumoPublico || `Perfil público de ${nome} identificado em ${fontes.length} fonte(s).`)
      : `Nenhuma fonte pública foi localizada para ${nome}; complete o perfil manualmente ou tente uma nova busca.`,
    posicionamento: haFontes ? "Posicionamento a validar nos trechos e fontes indicados." : "Posicionamento ainda não identificado.",
    objetivos: "Validar objetivos de negócio e prioridades de parceria com fonte oficial ou contato da marca.",
    desafios: "Mapear exclusividades de categoria, disponibilidade de ativos e aderência ao briefing da Aramis.",
    publicos: [],
    territorios: [],
    ativos: [],
    confianca: haFontes ? 20 : 0,
  };
}

async function consolidarComOllama(
  nome: string,
  fontes: FonteEnriquecimentoParte[],
  perfisExtraidos: unknown,
  categoria: string,
): Promise<{ perfil: PerfilConsolidado; origem: "ollama" | "mock" }> {
  const fallback = sugestaoConservadora(nome, fontes, categoria);
  if (fontes.length === 0) return { perfil: fallback, origem: "mock" };

  const contexto = fontes.map((fonte, indice) =>
    `Fonte ${indice + 1}\nTítulo: ${fonte.titulo}\nURL: ${fonte.url}\nTrecho: ${fonte.trecho || "(sem trecho)"}`,
  ).join("\n\n");
  try {
    const resposta = await chamarLLMJson<unknown>({
      provedor: "ollama",
      temperatura: 0.1,
      // Qwen local pode levar alguns segundos para estruturar um conjunto de
      // fontes; preferimos concluir a curadoria a devolver um falso fallback.
      timeoutMs: 60_000,
      formatoJson: perfilConsolidadoSchema,
      mock: () => fallback,
      mensagens: [
        {
          role: "system",
          content: "Você consolida perfil estratégico para a plataforma Cross. Use somente evidências presentes nas fontes. Não invente: quando a fonte não sustentar um campo, use texto de validação ou uma lista vazia. Responda somente JSON válido.",
        },
        {
          role: "user",
          content: `Entidade: ${nome}\n\nFontes públicas:\n${contexto}\n\nExtrações estruturadas já obtidas (podem estar vazias):\n${JSON.stringify(perfisExtraidos)}\n\nProduza categoria, resumo, posicionamento, objetivos, desafios, públicos, territórios, ativos e confiança.`,
        },
      ],
    });
    const perfil = perfilConsolidadoSchema.parse(resposta.dados);
    return { perfil, origem: resposta.origem === "ollama" ? "ollama" : "mock" };
  } catch {
    // A pesquisa continua útil mesmo se a instância local estiver desligada:
    // devolvemos as fontes e exigimos curadoria, sem fabricar atributos.
    return { perfil: fallback, origem: "mock" };
  }
}

/**
 * Pesquisa e extrai um perfil sugerido. Não persiste nada: a curadoria humana
 * decide se a sugestão vira perfil, territórios, públicos ou ativos da Parte.
 */
export async function enriquecerParteComPesquisa(nome: string, limiteFontes = 3): Promise<ResultadoEnriquecimentoParte> {
  const busca = await buscar(`${nome} site oficial marca público produtos parcerias`, limiteFontes);
  const fontes: FonteEnriquecimentoParte[] = busca.resultados.map((resultado: ResultadoBusca) => ({
    titulo: resultado.titulo,
    url: resultado.url,
    fonte: resultado.fonte,
    trecho: resultado.trecho,
  }));
  const extracoes = await Promise.all(fontes.map(async (fonte) => {
    try {
      return await extrairPerfil(fonte.url);
    } catch {
      // Uma fonte indisponível não inviabiliza as demais; ela continua listada
      // para a pessoa usuária avaliar, sem gerar uma afirmação dela.
      return { perfil: {}, origem: "mock" as const };
    }
  }));

  // O extrator em modo simulado explicita que o setor é desconhecido. Isso não
  // pode virar categoria persistida por engano quando a pessoa usar a sugestão.
  const setores = extracoes
    .map((item) => item.perfil.setor)
    .filter((setor): setor is string => Boolean(setor && !setor.startsWith("(")));
  const publicos = distintos(extracoes.flatMap((item) => item.perfil.publicos ?? []));
  const territorios = distintos(extracoes.flatMap((item) => item.perfil.territorios ?? []));
  const ativos = distintos(extracoes.flatMap((item) => item.perfil.ativos ?? []));
  const sinais = distintos(extracoes.flatMap((item) => item.perfil.sinais_parceria ?? []));
  const categoriaExtraida = setorMaisFrequente(setores);
  const houveFirecrawl = extracoes.some((item) => item.origem === "firecrawl");
  // Quando o Firecrawl respondeu, os dados vêm diretamente da fonte e não
  // dependem de um modelo local para produzir texto genérico.
  const consolidacao = houveFirecrawl
    ? { perfil: sugestaoConservadora(nome, fontes, categoriaExtraida), origem: "mock" as const }
    : await consolidarComOllama(nome, fontes, [], categoriaExtraida);
  const categoria = consolidacao.perfil.categoria || categoriaExtraida;
  const confiancaExtracao = houveFirecrawl && fontes.length ? Math.min(85, 45 + fontes.length * 12) : fontes.length ? 30 : 0;
  const confianca = Math.max(confiancaExtracao, consolidacao.perfil.confianca);

  return {
    origem_busca: busca.origem,
    origem_extracao: houveFirecrawl ? "firecrawl" : "mock",
    origem_analise: consolidacao.origem,
    sugestao: {
      categoria,
      resumo: consolidacao.perfil.resumo || sugestaoConservadora(nome, fontes, categoria).resumo || "",
      posicionamento: consolidacao.perfil.posicionamento || (sinais.length ? sinais.join(" · ") : "Posicionamento a validar nas fontes públicas."),
      objetivos: consolidacao.perfil.objetivos || "Validar objetivos de negócio e prioridades de parceria com fonte oficial ou contato da marca.",
      desafios: consolidacao.perfil.desafios || "Mapear exclusividades de categoria, disponibilidade de ativos e aderência ao briefing da Aramis.",
      publicos: distintos([...consolidacao.perfil.publicos, ...publicos]),
      territorios: distintos([...consolidacao.perfil.territorios, ...territorios]),
      pracas: [],
      ativos: distintos([...consolidacao.perfil.ativos, ...ativos]),
      confianca,
    },
    fontes,
  };
}
