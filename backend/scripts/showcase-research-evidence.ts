/**
 * Gera os cenários de validação do Research & Evidence Agent.
 *
 * IMPORTANTE — natureza dos dados:
 * Com AI_PAID_PROVIDERS_ENABLED=false o Firecrawl está desligado, então a
 * extração real de fatos a partir de páginas NÃO roda. Os cenários abaixo usam
 * FIXTURES CONTROLADAS de fontes e fatos, injetadas no agente.
 *
 * Isso valida o MECANISMO — credibilidade, dedupe, verificação, conflito,
 * recência, proveniência, guardrails e fail-safe. NÃO valida a qualidade da
 * pesquisa real na web, que só poderá ser avaliada com o Firecrawl ligado.
 *
 * Nenhuma chamada de rede acontece.
 *
 * Uso: npx tsx scripts/showcase-research-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pesquisarEvidencias, type FatoBruto, type OpcoesPesquisa } from "../src/modules/agentes/evidencia/research-evidence.agent";
import { OrcamentoExecucao } from "../src/modules/agentes/shared/budget";
import type { ColetaFontesSaida } from "../src/modules/agentes/agentes.schema";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "research-evidence");
const AGORA = new Date().toISOString();
const ANTIGO = new Date(Date.now() - 500 * 86_400_000).toISOString();
const RECENTE = new Date(Date.now() - 20 * 86_400_000).toISOString();

interface FonteFixture {
  titulo: string;
  url: string;
  trecho: string;
  fonte: string;
  publicado_em: string | null;
  coletado_em: string;
}

function f(titulo: string, url: string, publicado_em: string | null = null, trecho = ""): FonteFixture {
  const dominio = new URL(url).hostname.replace(/^www\./, "");
  return { titulo, url, trecho, fonte: dominio, publicado_em, coletado_em: AGORA };
}

function coletor(resultados: FonteFixture[]): OpcoesPesquisa["buscar"] {
  return async () => ({
    saida: {
      total_consultas: 1,
      total_resultados: resultados.length,
      coletas: [{ termo: "consulta", tipo_fonte: "web" as const, resultados }],
    } as ColetaFontesSaida,
    origem: "duckduckgo" as const,
  });
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const gravar = (nome: string, dados: unknown) => {
    writeFileSync(join(SAIDA, `${nome}.json`), JSON.stringify(dados, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-console
    console.log(`gravado: ${nome}.json`);
  };

  const AVISO =
    "FIXTURES CONTROLADAS. Firecrawl desligado (AI_PAID_PROVIDERS_ENABLED=false): " +
    "a extração real de fatos a partir de páginas não foi executada. Este cenário " +
    "valida o mecanismo do agente, não a qualidade da pesquisa na web.";

  // ------------------------------------------------------ 1 · caso forte
  const forte = await pesquisarEvidencias(
    {
      entidade: "Converse",
      objetivo: "movimentos_recentes",
      site_oficial: "https://www.converse.com",
      categorias_desejadas: ["produto", "parceria", "territorio"],
      janela_meses: 12,
      limite_consultas: 4,
      limite_resultados_por_consulta: 3,
      limite_urls: 5,
    },
    {
      buscar: coletor([
        f("Converse anuncia coleção cápsula com artista brasileiro", "https://www.converse.com/newsroom/capsula-br", RECENTE),
        f("Marca de tênis lança coleção com artista nacional", "https://g1.globo.com/moda/capsula", RECENTE),
        f("Converse amplia presença no varejo do Sudeste", "https://exame.com/negocios/converse-varejo", RECENTE),
        f("Confira as novidades de tênis da semana", "https://qualquer.blogspot.com/tenis", null),
      ]),
      extrairFatos: (): FatoBruto[] => [
        {
          claim: "A Converse anunciou uma coleção cápsula com um artista brasileiro.",
          categoria: "produto",
          natureza: "fato",
          fontes: ["https://www.converse.com/newsroom/capsula-br", "https://g1.globo.com/moda/capsula"],
          publicadoEm: RECENTE,
        },
        {
          claim: "A marca ampliou presença no varejo do Sudeste.",
          categoria: "territorio",
          natureza: "fato",
          fontes: ["https://exame.com/negocios/converse-varejo"],
          publicadoEm: RECENTE,
        },
        {
          claim: "O movimento indica uma aposta em colaborações culturais locais.",
          categoria: "posicionamento",
          natureza: "inferencia",
          fontes: ["https://www.converse.com/newsroom/capsula-br"],
        },
      ],
    }
  );
  gravar("strong-case", { _aviso: AVISO, cenario: "Caso forte", pacote: forte });

  // -------------------------------------------------- 2 · pouca evidência
  const pouca = await pesquisarEvidencias(
    { entidade: "Marca Pouco Conhecida", objetivo: "contexto_geral", categorias_desejadas: ["publico", "ativo"], limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    {
      buscar: coletor([f("Página institucional", "https://g1.globo.com/breve", null)]),
      extrairFatos: (): FatoBruto[] => [
        {
          claim: "A empresa atua no segmento de vestuário.",
          categoria: "contexto_empresa",
          natureza: "fato",
          fontes: ["https://g1.globo.com/breve"],
        },
      ],
    }
  );
  gravar("low-evidence", { _aviso: AVISO, cenario: "Pouca evidência", pacote: pouca });

  // ------------------------------------------------------ 3 · ambiguidade
  const clientAmbiguo = {
    query: async (sql: string) =>
      sql.includes("cross_core.parte")
        ? {
            rows: [
              { id: "11111111-1111-1111-1111-111111111111", nome: "Converse Brasil" },
              { id: "22222222-2222-2222-2222-222222222222", nome: "Converse Calçados" },
              { id: "33333333-3333-3333-3333-333333333333", nome: "Converse Store" },
            ],
          }
        : { rows: [] },
  } as never;

  const ambigua = await pesquisarEvidencias(
    { entidade: "Converse", objetivo: "contexto_geral", limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    {
      buscar: coletor([f("Notícia", "https://g1.globo.com/a", RECENTE)]),
      extrairFatos: (): FatoBruto[] => [
        { claim: "Fato que não deveria ser produzido.", categoria: "outro", fontes: ["https://g1.globo.com/a"] },
      ],
      client: clientAmbiguo,
    }
  );
  gravar("ambiguity", { _aviso: AVISO, cenario: "Entidade ambígua", pacote: ambigua });

  // --------------------------------------------------------- 4 · conflito
  const conflito = await pesquisarEvidencias(
    { entidade: "Converse", objetivo: "patrocinios", limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    {
      buscar: coletor([
        f("Marca confirma patrocínio do festival", "https://g1.globo.com/patrocinio", RECENTE),
        f("Empresa nega envolvimento com o festival", "https://exame.com/nega-festival", RECENTE),
      ]),
      extrairFatos: (): FatoBruto[] => [
        {
          claim: "A marca confirmou o patrocínio do festival de música.",
          categoria: "patrocinio",
          natureza: "fato",
          fontes: ["https://g1.globo.com/patrocinio"],
          publicadoEm: RECENTE,
        },
        {
          claim: "A marca não confirmou o patrocínio do festival de música.",
          categoria: "patrocinio",
          natureza: "fato",
          fontes: ["https://exame.com/nega-festival"],
          publicadoEm: RECENTE,
        },
      ],
    }
  );
  gravar("conflict", { _aviso: AVISO, cenario: "Fontes conflitantes", pacote: conflito });

  // ------------------------------------------------------- 5 · fonte ruim
  const fonteRuim = await pesquisarEvidencias(
    { entidade: "Converse", objetivo: "campanhas", limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    {
      buscar: coletor([
        f("Tudo sobre a campanha", "https://qualquer.blogspot.com/campanha", null),
        f("Campanha repercute nas redes", "http://sem-https.xyz/campanha", null),
      ]),
      extrairFatos: (): FatoBruto[] => [
        { claim: "Fato apoiado só por fonte fraca.", categoria: "campanha", fontes: ["https://qualquer.blogspot.com/campanha"] },
      ],
    }
  );
  gravar("bad-source", { _aviso: AVISO, cenario: "Fonte de baixa credibilidade", pacote: fonteRuim });

  // -------------------------------------------------------- 6 · fail-safe
  const failSafe = await pesquisarEvidencias(
    { entidade: "Entidade Sem Cobertura", objetivo: "movimentos_recentes", categorias_desejadas: ["produto", "parceria"], limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    { buscar: coletor([]), extrairFatos: (): FatoBruto[] => [] }
  );
  gravar("fail-safe", { _aviso: AVISO, cenario: "Evidência insuficiente", pacote: failSafe });

  // --------------------------------------------------------- 7 · recência
  const recencia = await pesquisarEvidencias(
    { entidade: "Converse", objetivo: "movimentos_recentes", janela_meses: 6, limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    {
      buscar: coletor([
        f("Novo anúncio da marca", "https://g1.globo.com/recente", RECENTE),
        f("Retrospectiva de 2024", "https://exame.com/antigo", ANTIGO),
      ]),
      extrairFatos: (): FatoBruto[] => [
        {
          claim: "A marca anunciou uma ativação neste trimestre.",
          categoria: "movimento_estrategico",
          natureza: "fato",
          fontes: ["https://g1.globo.com/recente"],
          publicadoEm: RECENTE,
        },
        {
          claim: "A marca realizou uma campanha em 2024.",
          categoria: "campanha",
          natureza: "fato",
          fontes: ["https://exame.com/antigo"],
          publicadoEm: ANTIGO,
        },
      ],
    }
  );
  gravar("recent-movements", { _aviso: AVISO, cenario: "Recência", pacote: recencia });

  // ------------------------------------------------------- 8 · guardrail
  const orcamento = new OrcamentoExecucao({ maxBuscasWeb: 2 });
  const comGuardrail = await pesquisarEvidencias(
    { entidade: "Converse", objetivo: "contexto_geral", limite_consultas: 4, limite_resultados_por_consulta: 3, limite_urls: 5 },
    { buscar: coletor([f("Notícia", "https://g1.globo.com/a", RECENTE)]), orcamento }
  );
  gravar("guardrail-blocked", { _aviso: AVISO, cenario: "Guardrail de busca", pacote: comGuardrail });

  // eslint-disable-next-line no-console
  console.log("\nresumo:");
  for (const [nome, p] of [
    ["strong-case", forte], ["low-evidence", pouca], ["ambiguity", ambigua],
    ["conflict", conflito], ["bad-source", fonteRuim], ["fail-safe", failSafe],
    ["recent-movements", recencia], ["guardrail-blocked", comGuardrail],
  ] as const) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${nome.padEnd(20)} status=${p.status.padEnd(24)} fontes=${p.sources.length} fatos=${p.facts.length} descartes=${p.descartados.length} lacunas=${p.lacunas.length}`
    );
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
