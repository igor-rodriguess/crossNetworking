/**
 * Showcase do Crossability Reasoning com dados REAIS.
 *
 * O modelo local não tem capacidade para rodar o reasoning aqui (≈1,35 token/s;
 * ver docs/ai/15). Para não deixar a Sprint sem evidência, este showcase troca
 * APENAS a redação do modelo por respostas controladas — todo o resto é real:
 *
 *   · perfil real da AI-03 (Converse, 12 fatos com proveniência)
 *   · retrieval real de Cross Knowledge (embeddings, versão, top-k, limiar)
 *   · validação real de referências (E… e K… conferidas contra o disponível)
 *   · regra real de dupla sustentação e tetos de confiança
 *   · guardrails reais
 *
 * Os cenários são escolhidos para exercitar o que a Sprint exige provar:
 * conclusão sustentada, contra-evidência, referência inventada, conclusão sem
 * âncora e dimensão sem sustentação.
 *
 * Uso: npx tsx scripts/showcase-crossability.ts
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
// Perfil reprocessado com a reclassificação corrigida: público e ativos saíram
// de `movimentos` para as seções certas. Sem isso, o Crossability nem recebe
// esses fatos nas dimensões Públicos e Ativos.
const PERFIL = join(SAIDA, "input-profile.json");

const METODOLOGIA_V2 = readFileSync(
  join(RAIZ, "docs", "ai", "validation", "raw", "crossability-reasoning", "metodologia-v2.md"),
  "utf8"
);

/**
 * Respostas controladas por dimensão.
 *
 * Cada uma existe para exercitar um requisito específico da Sprint. As
 * referências E… apontam para fatos que EXISTEM no perfil real — exceto onde o
 * cenário quer justamente provar a rejeição.
 */
const RESPOSTAS: Record<string, unknown> = {
  // Conclusão sustentada + contra-evidência real.
  publicos: {
    assessment: "media",
    reasoning:
      "O perfil traz um sinal direto de público: a marca declara engajar jovens da sua comunidade, e o programa All Stars é dirigido a criadores emergentes. Pela metodologia, isso caracteriza um público identificável, mas a leitura de sobreposição depende de conhecer o público da outra parte, que não está nesta análise.",
    supporting_points: [
      {
        texto: "A marca declara engajar jovens da sua própria comunidade.",
        evidence_refs: ["E2"],
        knowledge_refs: ["K1"],
      },
      {
        texto: "A comunidade global de artistas participou da ação, o que delimita um público criativo.",
        evidence_refs: ["E1"],
        knowledge_refs: ["K1"],
      },
    ],
    counterpoints: [
      {
        texto:
          "Nenhum dado demográfico verificável foi coletado: faixa etária, renda e região seguem desconhecidas, então a sobreposição não é mensurável.",
        evidence_refs: ["E2"],
        knowledge_refs: ["K1"],
      },
    ],
    gaps: [
      "Não há dado demográfico estruturado sobre o público.",
      "O público da contraparte não faz parte desta análise.",
    ],
    confidence: 45,
  },

  // Território: distinção entre escopo de campanha e presença estruturada.
  territorios: {
    assessment: "baixa",
    reasoning:
      "Os fatos disponíveis descrevem uma ação global e murais em várias cidades. Pela metodologia, escopo de campanha não é território de atuação: uma ação pontual não prova presença estruturada. Não há evidência de praças ou mercados onde a marca opera de forma continuada.",
    supporting_points: [
      {
        texto: "Há registro de uma ação global com murais em várias cidades do mundo.",
        evidence_refs: ["E12"],
        knowledge_refs: ["K1"],
      },
    ],
    counterpoints: [
      {
        texto:
          "A metodologia separa escopo de campanha de território de atuação; o fato disponível é escopo de campanha, não presença estruturada.",
        evidence_refs: ["E12"],
        knowledge_refs: ["K1"],
      },
    ],
    gaps: ["Nenhum território geográfico ou simbólico de atuação continuada foi confirmado."],
    confidence: 30,
  },

  // Ativos: separa "existe" de "tem valor estratégico".
  ativos: {
    assessment: "media",
    reasoning:
      "O programa All Stars e a rede global de talentos são ativos que EXISTEM segundo a evidência. A metodologia exige separar existência de valor estratégico: o valor depende de contrapartida possível para um objetivo, e a contrapartida não está descrita.",
    supporting_points: [
      {
        texto: "O programa All Stars é um ativo próprio da marca, voltado a apoiar criadores emergentes.",
        evidence_refs: ["E3"],
        knowledge_refs: ["K1"],
      },
      {
        texto: "A rede global de talentos associada ao programa é um ativo acionável em parceria.",
        evidence_refs: ["E4"],
        knowledge_refs: ["K1"],
      },
    ],
    counterpoints: [
      {
        texto:
          "Existir não implica valor estratégico: não há evidência de que esses ativos estejam disponíveis para parceria externa nem em que condições.",
        evidence_refs: ["E3"],
        knowledge_refs: ["K1"],
      },
    ],
    gaps: ["Condições de acesso e exclusividade dos ativos não são conhecidas."],
    confidence: 50,
  },

  // Sinergia: exige cruzamento explícito; aqui um ponto cita fonte inventada.
  sinergias: {
    assessment: "baixa",
    reasoning:
      "A metodologia exige que a sinergia emerja do cruzamento entre públicos, territórios e ativos. Há público e ativo identificados, mas território não sustentado, então o cruzamento fica incompleto.",
    supporting_points: [
      {
        texto: "Público criativo e programa próprio formam um par acionável.",
        evidence_refs: ["E2", "E3"],
        knowledge_refs: ["K1"],
      },
      {
        // Cenário deliberado: referência que NÃO existe. Deve ser rejeitada.
        texto: "A marca já opera parcerias formais de co-branding com grandes varejistas.",
        evidence_refs: ["E99"],
        knowledge_refs: ["K1"],
      },
    ],
    counterpoints: [
      {
        texto: "Sem território sustentado, o cruzamento exigido pela metodologia fica incompleto.",
        evidence_refs: ["E12"],
        knowledge_refs: ["K1"],
      },
    ],
    gaps: ["Território não sustentado impede afirmar sinergia."],
    confidence: 30,
  },

  // Fit: depende do objetivo declarado.
  fit_estrategico: {
    assessment: "media",
    reasoning:
      "Para o objetivo declarado — ativação cultural conjunta com marcas de música e moda — há aderência: a marca mantém programa cultural próprio e engaja comunidade criativa. A metodologia lembra que não existe fit absoluto; esta leitura vale para este objetivo e não se transfere para outro.",
    supporting_points: [
      {
        texto: "O programa próprio de apoio a criadores conversa diretamente com ativação cultural.",
        evidence_refs: ["E3"],
        knowledge_refs: ["K1"],
      },
    ],
    counterpoints: [
      {
        // Cenário deliberado: sem nenhuma âncora. Deve ser rejeitado.
        texto: "A marca provavelmente prioriza performance comercial sobre cultura.",
        evidence_refs: [],
        knowledge_refs: [],
      },
    ],
    gaps: ["Objetivos declarados pela própria marca não são conhecidos."],
    confidence: 40,
  },

  // Momento: nenhum fato tem data — a confiança precisa cair.
  momento: {
    assessment: "indeterminado",
    reasoning:
      "A metodologia condiciona momento a sinais recentes e datados. Nenhum dos fatos disponíveis possui data de publicação, portanto não é possível afirmar janela de oportunidade. Fato histórico não sustenta momento.",
    supporting_points: [],
    counterpoints: [
      {
        texto: "Nenhum fato do perfil possui data de publicação verificável.",
        evidence_refs: ["E11"],
        knowledge_refs: ["K1"],
      },
    ],
    gaps: ["Nenhuma evidência datada; a recência não pode ser avaliada."],
    confidence: 15,
  },
};

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const perfil = JSON.parse(readFileSync(PERFIL, "utf8")) as EntityIntelligenceProfile;

  const orcamento = new OrcamentoExecucao(
    {
      custoMaximoUsd: 0.5,
      maxChamadasLlm: 6,
      operacoesLlmPermitidas: new Set([OPERACAO_LLM]),
    },
    { agente: "crossability_reasoning", jornada: "prospeccao" }
  );

  await withTransaction(async (client) => {
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
    console.log(`Metodologia v${idx.versao} indexada (${idx.chunks} chunks)`);

    const analise = await analisarCrossability({
      perfil,
      contexto: {
        objetivo: "identificar potencial de ativação cultural conjunta com marcas de música e moda",
      },
      orcamento,
      topK: 3,
      client,
      // Só a redação do modelo é controlada; retrieval, guardrails e validação
      // de referências continuam sendo os reais.
      chamarModelo: async ({ dimensao }) => ({
        dados: RESPOSTAS[dimensao] ?? {},
        origem: "showcase_controlado",
        modelo: "resposta-controlada",
        tokens: { entrada: 900, saida: 320 },
      }),
    });

    writeFileSync(join(SAIDA, "validated-analysis.json"), JSON.stringify(analise, null, 2));
    writeFileSync(join(SAIDA, "telemetry.json"), JSON.stringify(analise.telemetria, null, 2));
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

    console.log("\n=== ANÁLISE CROSSABILITY (Converse) ===\n");
    for (const d of analise.dimensions) {
      console.log(
        `${d.dimensao.padEnd(16)} ${d.assessment.padEnd(14)} conf=${String(d.confidence).padStart(3)} ${d.status.padEnd(26)} sup=${d.supporting_points.length} contra=${d.counterpoints.length} K=${d.knowledge_refs.length}`
      );
    }
    console.log(`\nmethodology: ${analise.methodology_version.map((m) => `${m.codigo} v${m.versao}`).join(", ")}`);
    console.log(`confidence global: ${analise.confidence}`);
    console.log(`\nREJEITADOS (${analise.rejeitados.length}):`);
    for (const r of analise.rejeitados) {
      console.log(`  [${r.motivo}] ${r.dimensao}/${r.tipo}: ${r.texto.slice(0, 70)}…`);
    }
    console.log(`\ncontexto: ${analise.telemetria.contexto_caracteres} chars`);
    console.log(`llm_calls: ${analise.telemetria.llm_calls} | retrieval: ${analise.telemetria.retrieval_calls}`);
    console.log(`\nsíntese: ${analise.overall_synthesis}`);

    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__ROLLBACK__") {
      console.log("\n(transação revertida — nada persistido)");
      return;
    }
    throw e;
  });
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
