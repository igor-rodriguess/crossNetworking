/**
 * Mede a distribuição REAL de similaridade do Cross Knowledge.
 *
 * Executa os cenários de retrieval da AI-01/AI-04 e registra os scores. Serve
 * para decidir sobre o threshold com DADOS, não por impressão — e para servir
 * de linha de base quando embeddings reais estiverem disponíveis.
 *
 * Registra a origem do embedding (`mock` ou `openai`) em cada medição: sem esse
 * campo, comparar duas rodadas seria comparar coisas diferentes sem saber.
 *
 * Uso: npx tsx scripts/medir-retrieval.ts [saida.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { withTransaction } from "../src/shared/db";
import * as conhecimento from "../src/modules/agentes/conhecimento/conhecimento.service";
import { embeddingEmModoMock } from "../src/modules/agentes/shared/embeddings";
import { env } from "../src/config/env";

const SAIDA = process.argv[2] ??
  join(process.cwd(), "..", "docs", "ai", "validation", "raw", "crossability-real-reasoning", "retrieval-medicao.json");

const METODOLOGIA = `# Metodologia Crossability — v2

## Públicos

Avalia-se a sobreposição e a complementaridade entre os públicos. A
complementaridade costuma gerar mais valor do que a sobreposição total, porque
abre audiência nova para as duas marcas em vez de disputar a mesma.

Público precisa ser observável em evidência. Segmento da empresa não determina
público.

## Territórios

Território tem duas naturezas: geográfico (países, regiões, praças) e simbólico
(moda, música, esporte, arte urbana). Escopo de campanha não é território de
atuação — uma ação global pontual não prova presença estruturada.

## Ativos

Ativo é o que a marca possui e pode levar para uma parceria. Distinguir sempre
o ativo EXISTE (fato) de o ativo TEM VALOR ESTRATÉGICO (interpretação).

## Sinergias

Sinergia emerge do cruzamento entre públicos, territórios e ativos, nunca da
impressão de que duas marcas combinam.

## Fit estratégico

Não existe fit absoluto. O fit é sempre relativo a um objetivo declarado.

## Momento

Momento depende de sinais recentes e datados. Fato histórico não sustenta
janela de oportunidade.
`;

/** Cenários equivalentes aos da AI-01, mais os do Crossability. */
const CENARIOS = [
  { id: "A", nome: "Públicos", consulta: "Crossability públicos sobreposição de audiência entre marcas" },
  { id: "B", nome: "Territórios", consulta: "Crossability territórios de atuação sobreposição e complementaridade" },
  { id: "C", nome: "Públicos + Territórios", consulta: "sobreposição de públicos e territórios entre duas marcas" },
  { id: "D", nome: "Consulta sem sustentação", consulta: "qual o preço das ações da empresa na bolsa de valores" },
  { id: "E", nome: "Ativos", consulta: "Crossability ativos de marca complementaridade e valor estratégico" },
  { id: "F", nome: "Momento", consulta: "Crossability momento janela de oportunidade timing" },
];

async function main() {
  mkdirSync(dirname(SAIDA), { recursive: true });

  const origem = embeddingEmModoMock() ? "mock" : "openai";
  console.log(`origem dos embeddings: ${origem}`);
  console.log(`modelo: ${origem === "openai" ? env.openaiEmbedModel : "hashing determinístico"}`);
  console.log(`limiar configurado: ${0.35}\n`);

  const medicoes: unknown[] = [];

  await withTransaction(async (client) => {
    const idx = await conhecimento.indexar(
      {
        codigo: "metodologia-crossability",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability",
        conteudo: METODOLOGIA,
        versao: 2,
        status: "validado",
        escopo: "global",
      },
      null,
      client
    );
    console.log(`indexado: ${idx.chunks} chunks (${idx.embeddingOrigem})\n`);

    for (const c of CENARIOS) {
      const inicio = Date.now();
      // Limiar 0 para OBSERVAR a distribuição inteira; o corte real continua
      // sendo o configurado. Medir só o que passa esconde a distribuição.
      const ctx = await conhecimento.buscar(
        { consulta: c.consulta, topK: 10, limiarRelevancia: 0 },
        client
      );
      const ms = Date.now() - inicio;

      const scores = ctx.referencias.map((r) => r.relevancia);
      const acimaDoLimiar = scores.filter((s) => s >= 0.35).length;

      console.log(`[${c.id}] ${c.nome}`);
      console.log(`     "${c.consulta.slice(0, 62)}"`);
      for (const r of ctx.referencias.slice(0, 4)) {
        const marca = r.relevancia >= 0.35 ? "PASSA" : "corta";
        console.log(`     ${marca} ${r.relevancia.toFixed(3)}  ${(r.secao ?? "(raiz)").slice(0, 58)}`);
      }
      console.log(`     considerados=${ctx.totalConsiderados} acima_do_limiar=${acimaDoLimiar} ${ms}ms\n`);

      medicoes.push({
        cenario: c.id,
        nome: c.nome,
        consulta: c.consulta,
        origem_embedding: origem,
        duracao_ms: ms,
        total_considerados: ctx.totalConsiderados,
        acima_do_limiar_035: acimaDoLimiar,
        scores,
        top: ctx.referencias.slice(0, 5).map((r) => ({
          secao: r.secao,
          versao: r.versao,
          relevancia: r.relevancia,
        })),
      });
    }

    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__ROLLBACK__") return;
    throw e;
  });

  const todos = medicoes.flatMap((m) => (m as { scores: number[] }).scores);
  const resumo = {
    origem_embedding: origem,
    modelo: origem === "openai" ? env.openaiEmbedModel : "hashing determinístico (sha256)",
    limiar_configurado: 0.35,
    total_medicoes: todos.length,
    minimo: todos.length ? Math.min(...todos) : null,
    maximo: todos.length ? Math.max(...todos) : null,
    media: todos.length ? todos.reduce((s, v) => s + v, 0) / todos.length : null,
    acima_do_limiar: todos.filter((s) => s >= 0.35).length,
  };

  writeFileSync(SAIDA, JSON.stringify({ resumo, medicoes }, null, 2));

  console.log("=== RESUMO ===");
  console.log(`origem: ${resumo.origem_embedding} (${resumo.modelo})`);
  console.log(`min=${resumo.minimo?.toFixed(3)} max=${resumo.maximo?.toFixed(3)} media=${resumo.media?.toFixed(3)}`);
  console.log(`acima do limiar 0.35: ${resumo.acima_do_limiar}/${resumo.total_medicoes}`);
  console.log(`\nsalvo em ${SAIDA}`);
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
