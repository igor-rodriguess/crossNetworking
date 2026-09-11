/**
 * Validação REAL do Crossability Reasoning com modelo local (Ollama).
 *
 * O que esta execução prova, e o que NÃO prova:
 *
 *   PROVA   — que o agente chama um modelo de verdade, que o prompt é aceito,
 *             que a resposta é parseada e validada, que as referências (E1, E2)
 *             são conferidas contra o catálogo, e que claim sem lastro é
 *             rejeitado.
 *   NÃO PROVA — qualidade de raciocínio comparável a um modelo grande.
 *             qwen3:4b é pequeno; a leitura honesta é "o caminho real funciona",
 *             não "a interpretação está boa".
 *
 * Custo: US$ 0. Nenhum provedor pago é tocado.
 *
 *   npx tsx scripts/live-reasoning-ollama.ts
 */
import { withTransaction } from "../src/shared/db";
import { construirPerfil } from "../src/modules/agentes/entidade/entity-intelligence.agent";
import { analisarCrossability } from "../src/modules/agentes/crossability/crossability-reasoning.agent";
import { fatoSchema, type EvidencePackage } from "../src/modules/agentes/evidencia/evidencia.schema";
import { env } from "../src/config/env";

const linha = (t = "─", n = 78) => t.repeat(n);

function evidencia(nome: string): EvidencePackage {
  const f = (categoria: string, claim: string, i: number) =>
    fatoSchema.parse({
      fact_id: `f${i}`, claim, entidade: nome, categoria, natureza: "fato",
      source_refs: [`s${i}`], dominios_independentes: 2,
      verificacao: "corroborada", confianca: 82,
      publicado_em: "2026-05-01", coletado_em: "2026-06-01",
    });
  return {
    entidade: nome,
    facts: [
      f("contexto_empresa", "Marca brasileira de vestuário fundada em 1992, com atuação nacional.", 1),
      f("posicionamento", "Posiciona-se como marca de moda masculina contemporânea.", 2),
      f("publico", "Público principal de homens de 25 a 45 anos das classes A e B.", 3),
      f("territorio", "Atua em todo o Brasil, com concentração no Sudeste.", 4),
      f("ativo", "Mantém programa de lojas-conceito em shoppings premium.", 5),
      f("produto", "Linha de alfaiataria e casual masculino.", 6),
      f("campanha", "Lançou campanha de verão com foco em público jovem urbano.", 7),
    ],
    fontes: [], lacunas: [], contradicoes: [],
    nivel_validacao: "estrutural",
    telemetria: {
      duracao_ms: 0, web_search_calls: 0, firecrawl_calls: 0,
      llm_calls: 0, custo_estimado_usd: 0,
    },
  } as unknown as EvidencePackage;
}

async function main() {
  console.log("VALIDAÇÃO REAL DO REASONING — Ollama local");
  console.log(`Execução: ${new Date().toISOString()}`);
  console.log(linha());
  console.log(`provedor:            ${env.aiProvider}`);
  console.log(`modelo:              ${env.ollamaModel}`);
  console.log(`kill switch (pagos): ${env.paidProvidersEnabled ? "LIGADO" : "desligado"}`);
  console.log(`operações liberadas: ${[...env.allowedLlmOperations].join(", ") || "(nenhuma)"}`);
  console.log(`aiMock:              ${env.aiMock}`);
  console.log(linha());

  if (!env.allowedLlmOperations.has("crossability_reasoning")) {
    console.log("\ncrossability_reasoning NÃO está na allowlist.");
    console.log("A execução seguiria bloqueada. Defina:");
    console.log("  AI_ALLOWED_LLM_OPERATIONS=fact_extraction,crossability_reasoning\n");
  }

  const nome = "Marca Alfa Vestuário";
  const perfil = construirPerfil({
    entidade: nome,
    internos: { parte_id: null, nome_exibicao: nome, eh_cliente_cross: false },
    evidencia: evidencia(nome),
    anterior: null,
  } as never);

  const t0 = Date.now();
  await withTransaction(async (client) => {
    // Sem `chamarModelo`: vai para o LLM de verdade.
    const analise = await analisarCrossability({
      perfil,
      contexto: { objetivo: "ativação cultural com público jovem" },
      client,
    });

    const dur = Date.now() - t0;
    console.log(`\nduração total: ${(dur / 1000).toFixed(1)}s`);
    console.log(`chamadas de LLM: ${analise.telemetria.llm_calls}`);
    console.log(`custo estimado:  US$ ${analise.telemetria.custo_estimado_usd}`);
    console.log(`contexto:        ${analise.telemetria.contexto_caracteres} caracteres`);

    console.log(`\n${linha()}`);
    console.log("DIMENSÕES");
    console.log(linha());
    for (const d of analise.dimensions) {
      console.log(`\n· ${d.dimensao.toUpperCase()}`);
      console.log(`  status:     ${d.status}`);
      console.log(`  assessment: ${d.assessment}`);
      console.log(`  confidence: ${d.confidence}`);
      console.log(`  evidência:  ${d.evidence_status}   conhecimento: ${d.knowledge_status}`);
      if (d.reasoning) console.log(`  leitura:    ${d.reasoning.slice(0, 220)}`);
      for (const p of d.supporting_points) {
        console.log(`    + ${p.texto ?? JSON.stringify(p)}`);
      }
      for (const p of d.counterpoints) {
        console.log(`    - ${p.texto ?? JSON.stringify(p)}`);
      }
      for (const g of d.gaps.slice(0, 3)) console.log(`    ? ${g}`);
    }

    console.log(`\n${linha()}`);
    console.log(`SÍNTESE: ${analise.overall_synthesis || "(vazia)"}`);
    console.log(`confiança global: ${analise.confidence}`);

    console.log(`\n${linha()}`);
    console.log("INTEGRIDADE");
    console.log(linha());
    console.log(`claims rejeitados por referência inválida: ${analise.rejeitados.length}`);
    for (const r of analise.rejeitados.slice(0, 5)) {
      console.log(`  - [${r.motivo}] ${r.texto?.slice(0, 90) ?? ""}`);
    }
    console.log(`lacunas de conhecimento: ${analise.knowledge_gaps.length}`);
    for (const g of analise.knowledge_gaps.slice(0, 4)) console.log(`  - ${g}`);

    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e?.message !== "__ROLLBACK__") throw e;
    console.log("\nTransação revertida — nada persistido.");
  });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nFALHA:", e?.message ?? e);
  process.exit(1);
});
