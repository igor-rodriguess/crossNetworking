/**
 * VALIDAÇÃO LIVE da extração de fatos por LLM (Sprint AI-02.3).
 *
 * Provider: Ollama LOCAL (qwen3:4b) — custo zero, nenhuma API paga.
 * Conteúdo: Firecrawl real, sobre as fontes já aprovadas na AI-02.2.
 *
 * A LLM atua como EXTRATOR ESTRUTURADO. Toda afirmação precisa vir com o
 * trecho literal que a sustenta, e o backend confere esse trecho contra o
 * conteúdo — plausibilidade não basta.
 *
 * Uso: npx tsx scripts/live-extracao-llm.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../src/config/env";
import { pesquisarEvidencias } from "../src/modules/agentes/evidencia/research-evidence.agent";
import { extrairClaimsComLlm, type ClaimAvaliado } from "../src/modules/agentes/evidencia/extracao-llm";
import { buscarConteudo } from "../src/modules/agentes/shared/firecrawl";
import { OrcamentoExecucao } from "../src/modules/agentes/shared/budget";
import { validarConteudoPosScrape, extrairDataPublicacao } from "../src/modules/agentes/evidencia/qualidade-fonte";
import { coletarFontes } from "../src/modules/agentes/source-collector.agent";
import type { FatoBruto } from "../src/modules/agentes/evidencia/research-evidence.agent";
import type { ObjetivoPesquisa } from "../src/modules/agentes/evidencia/evidencia.schema";

const BASE = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "research-evidence-real-extraction");

const LIMITES = {
  custoMaximoUsd: 0.5,
  maxBuscasWeb: 3,
  maxScrapes: 3,
  maxChamadasLlm: 3,
  maxCandidatosReasoning: 5,
  maxTentativasPorEtapa: 1,
  operacoesLlmPermitidas: new Set(["fact_extraction"]),
};

interface Caso {
  id: string;
  entidade: string;
  objetivo: ObjetivoPesquisa;
  aliases?: string[];
  siteOficial?: string;
}

const CASOS: Caso[] = [
  { id: "converse", entidade: "Converse", objetivo: "movimentos_recentes", siteOficial: "https://www.converse.com" },
  { id: "insider", entidade: "Insider Store", objetivo: "contexto_geral" },
  { id: "reserva", entidade: "Reserva", objetivo: "contexto_geral", aliases: ["Reserva moda"] },
];

async function executar(caso: Caso) {
  const dir = join(BASE, caso.id);
  mkdirSync(dir, { recursive: true });
  const gravar = (n: string, d: unknown) =>
    writeFileSync(join(dir, `${n}.json`), JSON.stringify(d, null, 2) + "\n", "utf8");

  const orcamento = new OrcamentoExecucao(LIMITES, { agente: "research_evidence", jornada: "prospeccao_live" });

  const paginas: unknown[] = [];
  const claimsTodos: Array<ClaimAvaliado & { url: string }> = [];
  const telemetriaLlm: unknown[] = [];

  const t0 = Date.now();
  const pacote = await pesquisarEvidencias(
    {
      entidade: caso.entidade,
      objetivo: caso.objetivo,
      aliases: caso.aliases,
      site_oficial: caso.siteOficial,
      limite_consultas: 3,
      limite_resultados_por_consulta: 4,
      limite_urls: 3,
    },
    {
      buscar: coletarFontes,
      orcamento,
      extrairFatos: async (fontes): Promise<FatoBruto[]> => {
        const fatos: FatoBruto[] = [];

        for (const fonte of fontes.slice(0, 2)) {
          if (!orcamento.autorizarFerramenta("firecrawl_scrape", { agente: "research_evidence" }).permitido) break;

          const tScrape = Date.now();
          let markdown = "";
          try {
            const r = await buscarConteudo(fonte.url);
            markdown = r.markdown;
            orcamento.registrarUsoFerramenta("firecrawl_scrape", 1);
          } catch (e) {
            paginas.push({ url: fonte.url, status: "erro", erro: e instanceof Error ? e.message : String(e) });
            continue;
          }

          // Porta pós-scrape continua valendo antes de gastar LLM.
          const val = validarConteudoPosScrape({
            markdown, entidade: caso.entidade, aliases: caso.aliases,
            url: fonte.url, siteOficial: caso.siteOficial,
          });
          if (!val.valido) {
            paginas.push({ url: fonte.url, status: "descartada_pos_scrape", motivo: val.motivo, caracteres: markdown.length });
            continue;
          }

          // Guardrail: autorização ANTES da chamada de LLM.
          const auth = orcamento.autorizarLlm({
            operacao: "fact_extraction",
            modelo: env.ollamaModel,
            tokens: { entrada: 2500, saida: 400 },
            local: true,
            agente: "research_evidence",
            etapa: "fact_extraction",
          });
          if (!auth.permitido) {
            paginas.push({ url: fonte.url, status: "llm_bloqueada", motivo: auth.motivo });
            break;
          }

          const tLlm = Date.now();
          const saida = await extrairClaimsComLlm({
            entidade: caso.entidade, aliases: caso.aliases, conteudo: markdown, limiteConteudo: 5000,
          });
          orcamento.registrarConsumoLlm(saida.modelo, saida.tokens ?? { entrada: 0, saida: 0 }, true);

          const data = extrairDataPublicacao(markdown);

          telemetriaLlm.push({
            url: fonte.url,
            provider: saida.origem,
            model: saida.modelo ?? env.ollamaModel,
            input_tokens: saida.tokens?.entrada ?? 0,
            output_tokens: saida.tokens?.saida ?? 0,
            cached_tokens: saida.tokens?.cache ?? 0,
            caracteres_enviados: saida.caracteres_enviados,
            duracao_llm_ms: Date.now() - tLlm,
            estimated_cost_usd: 0,
          });

          gravar(`llm-response-${paginas.length}`, { url: fonte.url, bruto: saida.bruto });

          for (const c of saida.claims) claimsTodos.push({ ...c, url: fonte.url });

          for (const c of saida.claims.filter((x) => x.aceito)) {
            fatos.push({
              claim: c.claim,
              categoria: c.categoria,
              natureza: "fato",
              fontes: [fonte.url],
              publicadoEm: data.publicadoEm,
            });
          }

          paginas.push({
            url: fonte.url,
            status: "ok",
            caracteres: markdown.length,
            enviados_llm: saida.caracteres_enviados,
            claims_brutos: saida.claims.length,
            claims_aceitos: saida.claims.filter((c) => c.aceito).length,
            duracao_scrape_ms: tLlm - tScrape,
            duracao_llm_ms: Date.now() - tLlm,
            publicado_em: data.publicadoEm,
            origem_data: data.origem,
          });
        }

        return fatos;
      },
    }
  );

  gravar("input", { entidade: caso.entidade, objetivo: caso.objetivo, limites: LIMITES });
  gravar("pages", paginas);
  gravar("validation", {
    total_claims: claimsTodos.length,
    aceitos: claimsTodos.filter((c) => c.aceito).length,
    rejeitados: claimsTodos.filter((c) => !c.aceito).length,
    por_motivo: claimsTodos.filter((c) => !c.aceito).reduce<Record<string, number>>((a, c) => {
      a[c.motivo ?? "?"] = (a[c.motivo ?? "?"] ?? 0) + 1; return a;
    }, {}),
    claims: claimsTodos,
  });
  gravar("evidence-package", pacote);
  gravar("telemetry", {
    llm_calls: telemetriaLlm.length,
    chamadas: telemetriaLlm,
    duracao_total_ms: Date.now() - t0,
    orcamento: orcamento.resumo(),
    custo_total_usd: 0,
    provider: "ollama_local",
    llm_paga_utilizada: false,
  });

  return { pacote, claimsTodos, telemetriaLlm, duracao: Date.now() - t0 };
}

async function main() {
  mkdirSync(BASE, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    provider: env.aiProvider, modelo: env.ollamaModel,
    paid_providers_enabled: env.paidProvidersEnabled,
    firecrawl_ativo: !env.extracaoMock,
    operacoes_llm_permitidas: [...env.allowedLlmOperations],
  }, null, 2));

  const resumo: unknown[] = [];
  for (const caso of CASOS) {
    // eslint-disable-next-line no-console
    console.log(`\n=== ${caso.id} — ${caso.entidade} ===`);
    try {
      const { pacote, claimsTodos, telemetriaLlm, duracao } = await executar(caso);
      const linha = {
        caso: caso.id,
        status: pacote.status,
        fontes_aceitas: pacote.sources.length,
        llm_calls: telemetriaLlm.length,
        claims_produzidos: claimsTodos.length,
        claims_aceitos: claimsTodos.filter((c) => c.aceito).length,
        rejeitados: claimsTodos.filter((c) => !c.aceito).length,
        fatos_finais: pacote.facts.length,
        corroborados: pacote.facts.filter((f) => f.verificacao === "corroborada").length,
        lacunas: pacote.lacunas.length,
        duracao_ms: duracao,
        custo_usd: 0,
      };
      resumo.push(linha);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(linha, null, 2));
    } catch (e) {
      const erro = { caso: caso.id, erro: e instanceof Error ? e.message : String(e) };
      resumo.push(erro);
      // eslint-disable-next-line no-console
      console.error("FALHOU:", erro.erro);
    }
  }

  writeFileSync(join(BASE, "resumo.json"), JSON.stringify({ gerado_em: new Date().toISOString(), casos: resumo }, null, 2) + "\n", "utf8");
}

main().catch((e) => { console.error(e); process.exit(1); });
