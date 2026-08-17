/**
 * VALIDAÇÃO LIVE do Research & Evidence Agent (Sprint AI-02.1).
 *
 * Executa contra fontes públicas REAIS:
 *   · busca: DuckDuckGo (gratuito, sem chave)
 *   · conteúdo: Firecrawl (pago por página — habilitado só para esta validação)
 *   · extração: determinística, sem LLM (frase literal da página)
 *
 * LLM pago e embeddings pagos permanecem DESLIGADOS. Os Cost Guardrails
 * continuam ativos: cada busca e cada scrape passa por autorização.
 *
 * Limites deliberadamente pequenos — o objetivo é qualidade, não volume.
 *
 * Uso: npx tsx scripts/live-research-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../src/config/env";
import { pesquisarEvidencias } from "../src/modules/agentes/evidencia/research-evidence.agent";
import { extrairFatosReais, type ResultadoExtracaoReal } from "../src/modules/agentes/evidencia/extracao-deterministica";
import { OrcamentoExecucao } from "../src/modules/agentes/shared/budget";
import { coletarFontes } from "../src/modules/agentes/source-collector.agent";
import type { ObjetivoPesquisa } from "../src/modules/agentes/evidencia/evidencia.schema";

// Diretório de saída configurável, para que a rodada AFTER não sobrescreva a
// baseline BEFORE preservada da AI-02.1.
const BASE = join(
  process.cwd(), "..", "docs", "ai", "validation", "raw",
  process.env.LIVE_OUT_DIR ?? "research-evidence-live"
);

// Limites conservadores para a validação.
const LIMITES = {
  custoMaximoUsd: 0.5,
  maxBuscasWeb: 3,
  maxScrapes: 3,
  maxChamadasLlm: 0,
  maxCandidatosReasoning: 5,
  maxTentativasPorEtapa: 1,
};

interface Caso {
  id: string;
  descricao: string;
  entidade: string;
  objetivo: ObjetivoPesquisa;
  aliases?: string[];
  siteOficial?: string;
  janelaMeses?: number;
}

const CASOS: Caso[] = [
  {
    id: "caso-a-converse",
    descricao: "Marca com presença pública forte",
    entidade: "Converse",
    objetivo: "movimentos_recentes",
    siteOficial: "https://www.converse.com",
    janelaMeses: 24,
  },
  {
    id: "caso-b-cobertura-menor",
    descricao: "Empresa com menos cobertura de imprensa",
    entidade: "Insider Store",
    objetivo: "contexto_geral",
  },
  {
    id: "caso-c-ambiguo",
    descricao: "Nome potencialmente ambíguo (marca × palavra comum)",
    entidade: "Reserva",
    objetivo: "contexto_geral",
    aliases: ["Reserva moda"],
  },
];

async function executarCaso(caso: Caso) {
  const dir = join(BASE, caso.id);
  mkdirSync(dir, { recursive: true });
  const gravar = (nome: string, dados: unknown) =>
    writeFileSync(join(dir, `${nome}.json`), JSON.stringify(dados, null, 2) + "\n", "utf8");

  const orcamento = new OrcamentoExecucao(LIMITES, {
    agente: "research_evidence",
    jornada: "prospeccao_live",
  });

  // Captura o resultado bruto da busca para o showcase — inclusive o ruído.
  type ResultadoColeta = Awaited<ReturnType<typeof coletarFontes>>;
  const capturas: ResultadoColeta[] = [];
  const buscarComCaptura: typeof coletarFontes = async (input) => {
    const r = await coletarFontes(input);
    capturas.push(r);
    return r;
  };

  let extracao: ResultadoExtracaoReal = { fatos: [], paginas: [] };

  const t0 = Date.now();
  const pacote = await pesquisarEvidencias(
    {
      entidade: caso.entidade,
      objetivo: caso.objetivo,
      aliases: caso.aliases,
      site_oficial: caso.siteOficial,
      janela_meses: caso.janelaMeses,
      limite_consultas: 3,
      limite_resultados_por_consulta: 4,
      limite_urls: 3,
    },
    {
      buscar: buscarComCaptura,
      orcamento,
      extrairFatos: async (fontes) => {
        extracao = await extrairFatosReais(fontes, caso.entidade, {
          limiteUrls: 3,
          aliases: caso.aliases,
          siteOficial: caso.siteOficial,
          autorizarScrape: () =>
            orcamento.autorizarFerramenta("firecrawl_scrape", {
              agente: "research_evidence",
              etapa: "extraction",
            }).permitido,
          registrarScrape: () => orcamento.registrarUsoFerramenta("firecrawl_scrape", 1),
        });
        return extracao.fatos;
      },
    }
  );
  const duracao = Date.now() - t0;

  // --- artefatos ------------------------------------------------------------
  gravar("planning", {
    entidade: caso.entidade,
    objetivo: caso.objetivo,
    planning_mode: pacote.planning_mode,
    queries: pacote.plano,
  });

  const resultadosBrutos = capturas.flatMap((captura) =>
    captura.saida.coletas.flatMap((c) =>
      c.resultados.map((r) => ({
        query: c.termo,
        titulo: r.titulo,
        url: r.url,
        dominio: r.fonte,
        snippet: (r.trecho ?? "").slice(0, 240),
        publicado_em: r.publicado_em ?? null,
        coletado_em: r.coletado_em ?? null,
      }))
    )
  );
  gravar("search-results", {
    origem_busca: capturas[0]?.origem ?? null,
    total: resultadosBrutos.length,
    resultados: resultadosBrutos,
  });

  gravar("sources-selected", {
    utilizadas: pacote.sources,
    descartadas: pacote.descartados.filter((d) => d.tipo === "fonte"),
  });

  gravar("content-collected", {
    paginas: extracao.paginas,
    // Trecho literal que sustenta cada fato — a prova de proveniência.
    trechos: extracao.fatos.map((f) => ({
      url: f.url_fonte,
      trecho: f.trecho_fonte.slice(0, 400),
    })),
  });

  gravar("facts", {
    total: pacote.facts.length,
    fatos: pacote.facts.map((f) => {
      const origem = extracao.fatos.find((x) => x.claim === f.claim);
      return {
        ...f,
        trecho_fonte: origem?.trecho_fonte.slice(0, 400) ?? null,
        url_fonte: origem?.url_fonte ?? null,
      };
    }),
  });

  gravar("evidence-package", pacote);
  gravar("telemetry", {
    ...pacote.telemetria,
    duracao_total_ms: duracao,
    limites_aplicados: LIMITES,
    orcamento: orcamento.resumo(),
    embedding_mode: env.embeddingMock ? "stub" : "real",
    llm_pago_utilizado: false,
    firecrawl_utilizado: !env.extracaoMock,
  });

  return { caso, pacote, extracao, duracao, orcamento };
}

async function main() {
  mkdirSync(BASE, { recursive: true });

  // eslint-disable-next-line no-console
  console.log("=== CONFIGURAÇÃO ===");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    paid_providers_enabled: env.paidProvidersEnabled,
    firecrawl_ativo: !env.extracaoMock,
    embeddings_pagos: !env.embeddingMock,
    llm_key_definida: Boolean(env.llmApiKey),
    ai_provider: env.aiProvider,
    limites: LIMITES,
  }, null, 2));

  const resumos: unknown[] = [];

  for (const caso of CASOS) {
    // eslint-disable-next-line no-console
    console.log(`\n=== ${caso.id} — ${caso.entidade} (${caso.objetivo}) ===`);
    try {
      const { pacote, extracao, duracao, orcamento } = await executarCaso(caso);
      const linha = {
        caso: caso.id,
        entidade: caso.entidade,
        status: pacote.status,
        queries: pacote.plano.length,
        fontes_encontradas: pacote.sources.length + pacote.descartados.filter((d) => d.tipo === "fonte").length,
        fontes_usadas: pacote.sources.length,
        fontes_descartadas: pacote.descartados.filter((d) => d.tipo === "fonte").length,
        paginas_raspadas: extracao.paginas.filter((p) => p.status === "ok").length,
        paginas_com_erro: extracao.paginas.filter((p) => p.status === "erro").length,
        fatos: pacote.facts.length,
        corroborados: pacote.facts.filter((f) => f.verificacao === "corroborada").length,
        fonte_unica: pacote.facts.filter((f) => f.verificacao === "fonte_unica").length,
        conflitantes: pacote.facts.filter((f) => f.verificacao === "conflitante").length,
        lacunas: pacote.lacunas.length,
        duracao_ms: duracao,
        custo_usd: orcamento.custoAtual,
      };
      resumos.push(linha);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(linha, null, 2));
    } catch (e) {
      const erro = { caso: caso.id, erro: e instanceof Error ? e.message : String(e) };
      resumos.push(erro);
      // eslint-disable-next-line no-console
      console.error("FALHOU:", erro.erro);
    }
  }

  writeFileSync(join(BASE, "resumo.json"), JSON.stringify({ gerado_em: new Date().toISOString(), casos: resumos }, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log("\nresumo gravado em raw/research-evidence-live/resumo.json");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
