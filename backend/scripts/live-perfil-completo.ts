/**
 * Pesquisa DIRIGIDA às dimensões da Crossability e consolidação do perfil.
 *
 * O caso Converse da AI-03 produziu 5 fatos, todos sobre situação financeira, e
 * deixou publicos/territorios/ativos vazios — as tres dimensões que o
 * Crossability mais precisa. A causa: uma unica pesquisa de "contexto geral"
 * sobre 2 paginas.
 *
 * Aqui rodamos VARIOS objetivos por entidade, cada um com suas consultas e suas
 * paginas, e consolidamos tudo num unico Entity Intelligence Profile.
 *
 * Provider: Ollama LOCAL. Firecrawl para conteudo. Nenhuma API paga de LLM.
 * Guardrails ativos e recontados por objetivo.
 *
 * Uso: npx tsx scripts/live-perfil-completo.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../src/config/env";
import { pesquisarEvidencias } from "../src/modules/agentes/evidencia/research-evidence.agent";
import { extrairClaimsComLlm } from "../src/modules/agentes/evidencia/extracao-llm";
import { buscarConteudo } from "../src/modules/agentes/shared/firecrawl";
import { OrcamentoExecucao } from "../src/modules/agentes/shared/budget";
import { validarConteudoPosScrape, extrairDataPublicacao } from "../src/modules/agentes/evidencia/qualidade-fonte";
import { coletarFontes } from "../src/modules/agentes/source-collector.agent";
import { construirPerfil } from "../src/modules/agentes/entidade/entity-intelligence.agent";
import type { EvidencePackage, Fato, ObjetivoPesquisa } from "../src/modules/agentes/evidencia/evidencia.schema";
import type { FatoBruto } from "../src/modules/agentes/evidencia/research-evidence.agent";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "perfil-completo");

/** Limites por OBJETIVO. Conservadores; o total escala com o nº de objetivos.
 *
 * Elevados em relação à rodada anterior: com 3 buscas e 2 scrapes, o objetivo
 * `territorios_atuacao` terminou com ZERO fontes aceitas — as poucas consultas
 * caíam todas em domínio não catalogado. Mais consultas e mais páginas dão
 * chance real aos veículos que agora se qualificam por sinais editoriais.
 *
 * Continua tudo local: Ollama + Firecrawl, nenhuma API paga de LLM.
 */
const LIMITES = {
  custoMaximoUsd: 0.5,
  maxBuscasWeb: 6,
  maxScrapes: 4,
  maxChamadasLlm: 4,
  maxCandidatosReasoning: 5,
  maxTentativasPorEtapa: 1,
  operacoesLlmPermitidas: new Set(["fact_extraction"]),
};

/** Objetivos dirigidos às dimensões da Crossability. */
const OBJETIVOS: ObjetivoPesquisa[] = [
  "publico_alvo",
  "territorios_atuacao",
  "ativos_marca",
  "movimentos_recentes",
];

interface Alvo {
  id: string;
  entidade: string;
  siteOficial?: string;
  aliases?: string[];
}

const ALVOS: Alvo[] = [
  { id: "converse", entidade: "Converse", siteOficial: "https://www.converse.com" },
];

/** Executa UM objetivo e devolve o Evidence Package. */
async function pesquisarObjetivo(alvo: Alvo, objetivo: ObjetivoPesquisa) {
  const orcamento = new OrcamentoExecucao(LIMITES, { agente: "research_evidence", jornada: "perfil_completo" });
  const paginas: unknown[] = [];

  const pacote = await pesquisarEvidencias(
    {
      entidade: alvo.entidade,
      objetivo,
      aliases: alvo.aliases,
      site_oficial: alvo.siteOficial,
      limite_consultas: 5,
      limite_resultados_por_consulta: 4,
      limite_urls: 2,
    },
    {
      buscar: coletarFontes,
      orcamento,
      extrairFatos: async (fontes): Promise<FatoBruto[]> => {
        const fatos: FatoBruto[] = [];

        for (const fonte of fontes.slice(0, 2)) {
          if (!orcamento.autorizarFerramenta("firecrawl_scrape", { agente: "research_evidence" }).permitido) break;

          let markdown = "";
          try {
            const r = await buscarConteudo(fonte.url);
            markdown = r.markdown;
            orcamento.registrarUsoFerramenta("firecrawl_scrape", 1);
          } catch (e) {
            paginas.push({ url: fonte.url, status: "erro", erro: e instanceof Error ? e.message : String(e) });
            continue;
          }

          const val = validarConteudoPosScrape({
            markdown, entidade: alvo.entidade, aliases: alvo.aliases,
            url: fonte.url, siteOficial: alvo.siteOficial,
          });
          if (!val.valido) {
            paginas.push({ url: fonte.url, status: "descartada_pos_scrape", motivo: val.motivo });
            continue;
          }

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

          const t0 = Date.now();
          const saida = await extrairClaimsComLlm({
            entidade: alvo.entidade, aliases: alvo.aliases, conteudo: markdown, limiteConteudo: 5000,
          });
          orcamento.registrarConsumoLlm(saida.modelo, saida.tokens ?? { entrada: 0, saida: 0 }, true);
          const data = extrairDataPublicacao(markdown);

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
            url: fonte.url, status: "ok", objetivo,
            caracteres: markdown.length,
            claims: saida.claims.length,
            aceitos: saida.claims.filter((c) => c.aceito).length,
            duracao_llm_ms: Date.now() - t0,
            tokens: saida.tokens,
          });
        }
        return fatos;
      },
    }
  );

  return { pacote, paginas, orcamento };
}

/** Une vários Evidence Packages num só, deduplicando por fact_id. */
function unirPacotes(pacotes: EvidencePackage[]): EvidencePackage {
  const base = pacotes[0];
  const fatos = new Map<string, Fato>();
  const fontes = new Map<string, EvidencePackage["sources"][number]>();
  const lacunas: EvidencePackage["lacunas"] = [];
  const descartados: EvidencePackage["descartados"] = [];
  const conflitos: Fato[] = [];

  for (const p of pacotes) {
    for (const f of p.facts) if (!fatos.has(f.fact_id)) fatos.set(f.fact_id, f);
    for (const s of p.sources) if (!fontes.has(s.source_id)) fontes.set(s.source_id, s);
    descartados.push(...p.descartados);
    conflitos.push(...p.conflitos);
    // Só mantém lacunas que nenhum objetivo conseguiu preencher.
    for (const l of p.lacunas) {
      if (!lacunas.some((x) => x.descricao === l.descricao)) lacunas.push(l);
    }
  }

  return {
    ...base,
    objetivo: "contexto_geral",
    facts: [...fatos.values()],
    sources: [...fontes.values()],
    descartados,
    conflitos,
    lacunas,
    telemetria: {
      ...base.telemetria,
      fatos_extraidos: fatos.size,
      fontes_coletadas: fontes.size,
    },
  };
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    provider: env.aiProvider, modelo: env.ollamaModel,
    firecrawl_ativo: !env.extracaoMock,
    objetivos: OBJETIVOS, limites_por_objetivo: { ...LIMITES, operacoesLlmPermitidas: [...LIMITES.operacoesLlmPermitidas] },
  }, null, 2));

  for (const alvo of ALVOS) {
    const dir = join(SAIDA, alvo.id);
    mkdirSync(dir, { recursive: true });
    const gravar = (n: string, d: unknown) =>
      writeFileSync(join(dir, `${n}.json`), JSON.stringify(d, null, 2) + "\n", "utf8");

    const pacotes: EvidencePackage[] = [];
    const porObjetivo: unknown[] = [];
    const todasPaginas: unknown[] = [];
    let llmCalls = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    const t0 = Date.now();

    for (const objetivo of OBJETIVOS) {
      // eslint-disable-next-line no-console
      console.log(`\n--- ${alvo.entidade} · ${objetivo} ---`);
      try {
        const { pacote, paginas, orcamento } = await pesquisarObjetivo(alvo, objetivo);
        pacotes.push(pacote);
        todasPaginas.push(...paginas);

        const chamadas = orcamento.totalChamadasLlm;
        llmCalls += chamadas;
        for (const p of paginas as Array<{ tokens?: { entrada: number; saida: number } }>) {
          tokensIn += p.tokens?.entrada ?? 0;
          tokensOut += p.tokens?.saida ?? 0;
        }

        const linha = {
          objetivo,
          status: pacote.status,
          fontes_aceitas: pacote.sources.length,
          paginas_ok: (paginas as Array<{ status: string }>).filter((p) => p.status === "ok").length,
          fatos: pacote.facts.length,
          llm_calls: chamadas,
          categorias: [...new Set(pacote.facts.map((f) => f.categoria))],
        };
        porObjetivo.push(linha);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(linha));
      } catch (e) {
        const erro = { objetivo, erro: e instanceof Error ? e.message : String(e) };
        porObjetivo.push(erro);
        // eslint-disable-next-line no-console
        console.error("FALHOU:", erro.erro);
      }
    }

    if (pacotes.length === 0) continue;

    const unido = unirPacotes(pacotes);
    const perfil = construirPerfil({
      entidade: alvo.entidade,
      dominio_oficial: alvo.siteOficial?.replace(/^https?:\/\/(www\.)?/, "") ?? null,
      internos: { parte_id: null, eh_cliente_cross: false },
      evidencia: unido,
    });

    gravar("por-objetivo", porObjetivo);
    gravar("paginas", todasPaginas);
    gravar("evidence-package-unido", unido);
    gravar("perfil", perfil);
    gravar("telemetria", {
      objetivos_executados: OBJETIVOS.length,
      llm_calls: llmCalls,
      input_tokens: tokensIn,
      output_tokens: tokensOut,
      duracao_total_ms: Date.now() - t0,
      custo_total_usd: 0,
      provider: "ollama_local",
      llm_paga_utilizada: false,
    });

    // eslint-disable-next-line no-console
    console.log(`\n=== PERFIL CONSOLIDADO: ${alvo.entidade} ===`);
    for (const secao of ["contexto_empresa", "posicionamento", "publicos", "territorios", "ativos", "produtos", "relacionamentos", "movimentos"] as const) {
      // eslint-disable-next-line no-console
      console.log(`  ${secao.padEnd(20)} ${perfil[secao].length}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  lacunas: ${perfil.lacunas.length} | fatos: ${perfil.telemetria.fatos_consolidados} | llm: ${llmCalls} | custo: US$ 0`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
