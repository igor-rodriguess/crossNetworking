/**
 * Crossability Reasoning contra dados REAIS.
 *
 * Consome o Entity Intelligence Profile produzido na AI-03 (Converse), indexa a
 * metodologia Crossability real da Cross como Cross Knowledge e roda o
 * raciocínio nas 6 dimensões com Ollama LOCAL.
 *
 * Nenhuma API paga: provider ollama, operação declarada na allowlist do
 * orçamento passado explicitamente.
 *
 * Uso: npx tsx scripts/live-crossability.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTransaction } from "../src/shared/db";
import * as conhecimento from "../src/modules/agentes/conhecimento/conhecimento.service";
import { OrcamentoExecucao } from "../src/modules/agentes/shared/budget";
import {
  analisarCrossability,
  OPERACAO_LLM,
} from "../src/modules/agentes/crossability/crossability-reasoning.agent";
import type { EntityIntelligenceProfile } from "../src/modules/agentes/entidade/perfil.schema";

const RAIZ = join(process.cwd(), "..");
const SAIDA = join(RAIZ, "docs", "ai", "validation", "raw", "crossability-reasoning");
const PERFIL = join(RAIZ, "docs", "ai", "validation", "raw", "perfil-completo", "converse", "perfil.json");

/**
 * Metodologia Crossability da Cross, tratada como Cross Knowledge.
 *
 * Este texto NÃO está no prompt do agente: ele é indexado, versionado e
 * recuperado por similaridade. É exatamente a migração que a Sprint pede — a
 * autoridade metodológica sai do código e vira conhecimento auditável.
 */
const METODOLOGIA_V2 = `# Metodologia Crossability — v2

A Crossability avalia o encaixe estratégico entre marcas em seis dimensões.
Nenhuma dimensão isolada sustenta uma conclusão: o valor está no cruzamento.

## Públicos

Avalia-se a sobreposição e a complementaridade entre os públicos. A
complementaridade costuma gerar mais valor do que a sobreposição total, porque
abre audiência nova para as duas marcas em vez de disputar a mesma.

Público precisa ser observável em evidência. Segmento da empresa não determina
público: uma marca de calçados pode falar com skatistas, com corredores ou com
público de moda, e são leituras diferentes.

## Territórios

Território tem duas naturezas, e ambas pesam:
- geográfico: países, regiões, praças de atuação;
- simbólico: moda, música, esporte, arte urbana, tecnologia, lifestyle.

Territórios em comum facilitam ativação conjunta. Territórios complementares
abrem mercado novo. Escopo de campanha não é território de atuação — uma ação
global pontual não prova presença estruturada.

## Ativos

Ativo é o que a marca possui e pode levar para uma parceria: propriedades,
programas próprios, comunidades, canais, espaços, elenco de embaixadores,
distribuição.

Distinguir sempre duas afirmações diferentes:
- o ativo EXISTE (fato, precisa de evidência);
- o ativo TEM VALOR ESTRATÉGICO (interpretação, depende de contrapartida).

Um ativo só tem valor quando é acionável para o objetivo em questão.

## Sinergias

Sinergia emerge do cruzamento entre públicos, territórios e ativos, nunca da
impressão de que duas marcas combinam. Para afirmar sinergia é preciso apontar
quais elementos concretos a formam.

Sinergia declarada sem esses elementos é suposição, não análise.

## Fit estratégico

Não existe fit absoluto. O fit é sempre relativo a um objetivo declarado: uma
marca pode ter alto fit para uma iniciativa cultural e baixo fit para uma
expansão comercial.

Sem objetivo declarado, o fit permanece indeterminado e isso deve ser dito.

## Momento

Momento depende de sinais recentes e datados: lançamentos, campanhas, eventos,
expansões, mudanças de liderança.

Fato histórico não sustenta janela de oportunidade. Quando a evidência não tem
data, a confiança sobre momento deve cair.
`;

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  const perfil = JSON.parse(readFileSync(PERFIL, "utf8")) as EntityIntelligenceProfile;
  console.log(`Perfil carregado: ${perfil.identidade.nome} (v${perfil.versao_perfil})`);

  const orcamento = new OrcamentoExecucao(
    {
      custoMaximoUsd: 0.5,
      maxChamadasLlm: 6,
      operacoesLlmPermitidas: new Set([OPERACAO_LLM]),
    },
    { agente: "crossability_reasoning", jornada: "prospeccao" }
  );

  await withTransaction(async (client) => {
    // Indexa a metodologia como conhecimento validado v2. A v1 fica histórica
    // para provar que o retrieval usa a versão vigente.
    await conhecimento.indexar(
      {
        codigo: "metodologia-crossability",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability",
        conteudo: "# Metodologia Crossability — v1\n\nVersão inicial, superada.",
        versao: 1,
        status: "validado",
        escopo: "global",
      },
      null,
      client
    );
    const idx = await conhecimento.indexar(
      {
        codigo: "metodologia-crossability",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability",
        conteudo: METODOLOGIA_V2,
        versao: 2,
        status: "validado",
        escopo: "global",
        obsoletarAnteriores: true,
      },
      null,
      client
    );
    console.log(`Metodologia indexada: v${idx.versao}, ${idx.chunks} chunks, embeddings=${idx.embeddingOrigem}`);

    const analise = await analisarCrossability({
      perfil,
      contexto: {
        objetivo: "identificar potencial de ativação cultural conjunta com marcas de música e moda",
      },
      orcamento,
      topK: 3,
      client,
    });

    writeFileSync(join(SAIDA, "input-profile.json"), JSON.stringify(perfil, null, 2));
    writeFileSync(join(SAIDA, "validated-analysis.json"), JSON.stringify(analise, null, 2));
    writeFileSync(
      join(SAIDA, "knowledge-retrieval.json"),
      JSON.stringify(
        analise.dimensions.map((d) => ({
          dimensao: d.dimensao,
          retrieval: d.retrieval,
          knowledge_refs: d.knowledge_refs,
        })),
        null,
        2
      )
    );
    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify(analise.telemetria, null, 2));

    console.log("\n=== ANÁLISE CROSSABILITY ===");
    for (const d of analise.dimensions) {
      console.log(
        `${d.dimensao.padEnd(16)} ${d.assessment.padEnd(14)} conf=${String(d.confidence).padStart(3)} ${d.status.padEnd(26)} K=${d.knowledge_refs.length} sup=${d.supporting_points.length} contra=${d.counterpoints.length}`
      );
    }
    console.log(`\nmethodology: ${analise.methodology_version.map((m) => `${m.codigo} v${m.versao}`).join(", ")}`);
    console.log(`confidence global: ${analise.confidence}`);
    console.log(`rejeitados: ${analise.rejeitados.length}`);
    console.log(`llm_calls: ${analise.telemetria.llm_calls} | retrieval: ${analise.telemetria.retrieval_calls}`);
    console.log(`contexto: ${analise.telemetria.contexto_caracteres} chars | custo: US$ ${analise.telemetria.custo_estimado_usd}`);
    console.log(`\nsíntese: ${analise.overall_synthesis}`);

    // Rollback: o showcase não deve deixar resíduo no banco.
    throw new Error("__ROLLBACK_INTENCIONAL__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__ROLLBACK_INTENCIONAL__") {
      console.log("\n(transação revertida — nada foi persistido)");
      return;
    }
    throw e;
  });
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
