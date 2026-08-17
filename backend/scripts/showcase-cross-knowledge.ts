/**
 * Gera os cenários de validação do Cross Knowledge.
 *
 * Indexa conhecimento REAL do repositório (metodologia Crossability extraída do
 * prompt do agente e do WAD), executa consultas e grava a saída bruta em
 * docs/ai/validation/raw/cross-knowledge/.
 *
 * Roda contra o banco de TESTE. Nenhum provider pago é acionado: com
 * AI_PAID_PROVIDERS_ENABLED=false os embeddings são determinísticos.
 *
 * Uso: npx tsx scripts/showcase-cross-knowledge.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pool, withTransaction } from "../src/shared/db";
import * as conhecimento from "../src/modules/agentes/conhecimento/conhecimento.service";

const SAIDA = join(process.cwd(), "..", "docs", "ai", "validation", "raw", "cross-knowledge");

// -----------------------------------------------------------------------------
// Conhecimento REAL da Cross, extraído do repositório.
//
// Fonte das seis dimensões: o SYSTEM prompt de
// backend/src/modules/agentes/crossability-reasoning.agent.ts (linhas 25-49),
// que é hoje a definição operativa da metodologia. Nada foi inventado: o texto
// abaixo reorganiza o mesmo conteúdo em seções recuperáveis.
// -----------------------------------------------------------------------------

const METODOLOGIA_CROSSABILITY = `# Metodologia Crossability

A Crossability avalia o encaixe entre um CLIENTE (quem busca a parceria) e um
PARCEIRO candidato. A avaliação percorre seis dimensões; nenhuma dimensão
isolada sustenta uma recomendação.

Para cada dimensão atribui-se um nível — alta, média ou baixa — acompanhado de
justificativa textual. A confiança declarada deve ser honesta: pouca evidência
significa confiança baixa. Não se inventa fato que não foi fornecido.

## Compatibilidade de públicos

Avalia se os públicos do cliente e do parceiro casam ou se complementam.
Complementaridade costuma gerar mais valor do que sobreposição total: públicos
idênticos somam alcance, públicos complementares abrem alcance novo.

## Compatibilidade de territórios

Avalia se os territórios e praças de atuação são comuns ou complementares.
Territórios em comum facilitam a ativação conjunta; territórios complementares
podem abrir mercado novo para ambas as partes.

## Complementaridade de ativos

Avalia se os ativos do parceiro somam ao que falta ao cliente. Ativos incluem
propriedades, canais próprios, patrocínios e presença em eventos. A pergunta é
sempre o que o parceiro entrega que o cliente ainda não tem.

## Sinergias

Avalia os ganhos mútuos de mídia, canais e distribuição. Uma sinergia real
beneficia as duas partes; vantagem unilateral não é sinergia.

## Fit estratégico

Avalia o alinhamento de posicionamento e objetivos entre as organizações. Duas
marcas podem ter públicos compatíveis e ainda assim divergir em posicionamento.

## Momento estratégico

Avalia se existe uma janela de oportunidade agora — lançamentos, eventos,
expansão de mercado. Um encaixe estrutural bom no momento errado não se
converte em parceria.
`;

const PRINCIPIOS_AGENTES = `# Princípios de operação dos agentes Cross

Regras globais que todo agente da plataforma respeita.

## Agente propõe, humano promove

O agente produz rascunhos. Nenhum resultado de IA é automaticamente uma verdade
validada. Nenhuma escrita definitiva ocorre antes do Human Gate.

## Evidência rastreável

Toda afirmação factual relevante possui evidência rastreável. Fatos, inferências
e recomendações são mantidos separados — misturá-los impede a auditoria da
conclusão.

## Não inventar o ausente

O agente não inventa informações que faltam: declara a lacuna e a incerteza.
Rascunhos de execução não são conhecimento validado.
`;

// Versão anterior da metodologia — usada só no cenário de versionamento.
const CROSSABILITY_V1 = `# Metodologia Crossability

Versão inicial da metodologia. A avaliação de encaixe considerava quatro
dimensões: públicos, territórios, ativos e fit estratégico.

## Dimensões avaliadas

Nesta versão não havia avaliação separada de sinergias nem de momento
estratégico. Esses aspectos eram tratados dentro do fit estratégico.
`;

interface Cenario {
  id: string;
  titulo: string;
  descricao: string;
  resultado: unknown;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const cenarios: Cenario[] = [];

  await withTransaction(async (client) => {
    // ---------------------------------------------------------------- setup
    const crossability = await conhecimento.indexar(
      {
        codigo: "crossability-metodologia",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability",
        conteudo: METODOLOGIA_CROSSABILITY,
        versao: 2,
        status: "validado",
        documentoOrigem: "backend/src/modules/agentes/crossability-reasoning.agent.ts (SYSTEM prompt)",
        descricao: "Seis dimensões da avaliação de encaixe cliente↔parceiro.",
      },
      null,
      client
    );

    const principios = await conhecimento.indexar(
      {
        codigo: "principios-agentes",
        titulo: "Princípios de operação dos agentes Cross",
        categoria: "principio",
        conteudo: PRINCIPIOS_AGENTES,
        versao: 1,
        status: "validado",
        documentoOrigem: "docs/agents/AGENT_RUNTIME_CONTEXT.md",
      },
      null,
      client
    );

    const contagem = await conhecimento.contar(client);

    cenarios.push({
      id: "run-000-setup",
      titulo: "Indexação",
      descricao: "Conhecimento real do repositório indexado no banco de teste.",
      resultado: {
        documentos: [
          { codigo: "crossability-metodologia", versao: crossability.versao, chunks: crossability.chunks },
          { codigo: "principios-agentes", versao: principios.versao, chunks: principios.chunks },
        ],
        embedding_origem: crossability.embeddingOrigem,
        base: contagem,
      },
    });

    // ------------------------------------------------- 1 · recuperação forte
    const forte = await conhecimento.buscar(
      { consulta: "Como avaliar se os públicos do cliente e do parceiro são compatíveis?" },
      client
    );
    cenarios.push({
      id: "run-001-recuperacao-forte",
      titulo: "Recuperação forte",
      descricao: "Consulta claramente sustentada pelo conhecimento indexado.",
      resultado: forte,
    });

    // -------------------------------------- 2 · duas partes da metodologia
    //
    // Executado com DOIS limiares para separar o que é mecanismo do que é
    // qualidade do embedding. Com o limiar padrão (0.35) o stub lexical não
    // alcança as duas seções; com limiar 0.25 elas aparecem, na ordem correta.
    // Isso mostra que o RANKING funciona e que a magnitude do score é
    // limitação do stub — exatamente o que só a chave real resolverá.
    const duasPartesPadrao = await conhecimento.buscar(
      { consulta: "públicos e territórios do parceiro na avaliação de encaixe", topK: 4 },
      client
    );
    const duasPartesLimiarBaixo = await conhecimento.buscar(
      { consulta: "públicos e territórios do parceiro na avaliação de encaixe", topK: 4, limiarRelevancia: 0.25 },
      client
    );
    cenarios.push({
      id: "run-002-conhecimento-complementar",
      titulo: "Conhecimento complementar",
      descricao:
        "Consulta que exige trechos de seções diferentes. Comparação entre o limiar padrão e um limiar mais baixo, para separar mecanismo de qualidade semântica do stub.",
      resultado: {
        com_limiar_padrao: {
          limiar: duasPartesPadrao.filtros.limiarRelevancia,
          referencias: duasPartesPadrao.referencias.map((r) => ({ ref: r.ref, secao: r.secao, relevancia: r.relevancia })),
          conhecimento_insuficiente: duasPartesPadrao.conhecimentoInsuficiente,
          nota: "O stub determinístico não alcança 0.35 nesta consulta.",
        },
        com_limiar_025: {
          limiar: duasPartesLimiarBaixo.filtros.limiarRelevancia,
          referencias: duasPartesLimiarBaixo.referencias.map((r) => ({ ref: r.ref, secao: r.secao, relevancia: r.relevancia })),
          conhecimento_insuficiente: duasPartesLimiarBaixo.conhecimentoInsuficiente,
          nota: "As duas seções aparecem, e na ordem correta: o ranking funciona.",
        },
      },
    });

    // ------------------------------------------------- 3 · baixa relevância
    const fraca = await conhecimento.buscar(
      {
        consulta: "qual o procedimento de importação de nota fiscal eletrônica no SPED",
        limiarRelevancia: 0.45,
      },
      client
    );
    cenarios.push({
      id: "run-003-baixa-relevancia",
      titulo: "Baixa relevância",
      descricao: "Consulta sem sustentação na base. Esperado: conhecimentoInsuficiente.",
      resultado: fraca,
    });

    // ------------------------------------------- 4 · conhecimento não validado
    await conhecimento.indexar(
      {
        codigo: "playbook-rascunho",
        titulo: "Playbook de abordagem (em elaboração)",
        categoria: "playbook",
        conteudo:
          "# Playbook de abordagem\n\n## Primeiro contato\n\nRascunho: sequência de abordagem para marcas de moda masculina, ainda em discussão interna.",
        status: "rascunho",
      },
      null,
      client
    );

    const comRascunho = await conhecimento.buscar(
      { consulta: "sequência de abordagem para marcas de moda masculina", incluirNaoValidados: true, limiarRelevancia: 0 },
      client
    );
    const semRascunho = await conhecimento.buscar(
      { consulta: "sequência de abordagem para marcas de moda masculina", limiarRelevancia: 0 },
      client
    );
    cenarios.push({
      id: "run-004-nao-validado",
      titulo: "Conhecimento não validado",
      descricao: "Rascunho existe no banco mas não é entregue ao agente.",
      resultado: {
        producao: { referencias: semRascunho.referencias.map((r) => r.codigo) },
        diagnostico: {
          descartados: comRascunho.descartados.filter((d) => d.motivo === "nao_validado"),
        },
      },
    });

    // ------------------------------------------------------ 5 · versionamento
    await conhecimento.indexar(
      {
        codigo: "crossability-metodologia",
        titulo: "Metodologia Crossability",
        categoria: "metodologia_crossability",
        conteudo: CROSSABILITY_V1,
        versao: 1,
        status: "obsoleto",
      },
      null,
      client
    );

    const versionado = await conhecimento.buscar(
      { consulta: "quantas dimensões a Crossability avalia", topK: 3, limiarRelevancia: 0 },
      client
    );
    const versoes = await client.query(
      `SELECT v.versao, v.status::text AS status
         FROM cross_ai.conhecimento_versao v
         JOIN cross_ai.conhecimento_documento d ON d.id = v.documento_id
        WHERE d.codigo = 'crossability-metodologia' ORDER BY v.versao`
    );
    cenarios.push({
      id: "run-005-versionamento",
      titulo: "Versionamento",
      descricao: "v2 ativa; v1 preservada como histórico, fora do retrieval.",
      resultado: {
        versoes_no_banco: versoes.rows,
        versoes_recuperadas: [...new Set(versionado.referencias.map((r) => r.versao))],
        referencias: versionado.referencias.map((r) => ({ ref: r.ref, versao: r.versao, secao: r.secao })),
      },
    });

    // ------------------------------------------- 6 · isolamento por cliente
    const statusParte = await client.query<{ id: string }>(
      `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
    );
    const statusCliente = await client.query<{ id: string }>(
      `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`
    );
    const criarCliente = async (nome: string) => {
      const p = await client.query<{ id: string }>(
        `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
         VALUES ('organizacao', $1, $2) RETURNING id`,
        [nome, statusParte.rows[0].id]
      );
      const c = await client.query<{ id: string }>(
        `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
         VALUES ($1, $2) RETURNING id`,
        [p.rows[0].id, statusCliente.rows[0].id]
      );
      return c.rows[0].id;
    };

    const clienteA = await criarCliente("Cliente A (showcase)");
    const clienteB = await criarCliente("Cliente B (showcase)");

    await conhecimento.indexar(
      {
        codigo: "criterio-cliente-a",
        titulo: "Critério específico do Cliente A",
        categoria: "criterio_cliente",
        conteudo: "# Critério do Cliente A\n\nEste cliente prioriza parceiros com presença em território Sudeste e ativo de mídia próprio.",
        status: "validado",
        escopo: "cliente",
        clienteCrossId: clienteA,
      },
      null,
      client
    );
    await conhecimento.indexar(
      {
        codigo: "criterio-cliente-b",
        titulo: "Critério específico do Cliente B",
        categoria: "criterio_cliente",
        conteudo: "# Critério do Cliente B\n\nEste cliente prioriza parceiros com presença em território Nordeste e forte base digital.",
        status: "validado",
        escopo: "cliente",
        clienteCrossId: clienteB,
      },
      null,
      client
    );

    const noContextoA = await conhecimento.buscar(
      { consulta: "critério de priorização de parceiros por território", clienteCrossId: clienteA, topK: 6, limiarRelevancia: 0 },
      client
    );
    cenarios.push({
      id: "run-006-isolamento-cliente",
      titulo: "Isolamento por cliente",
      descricao: "Análise no contexto do Cliente A. Conhecimento do Cliente B não pode aparecer.",
      resultado: {
        contexto: "Cliente A",
        entregues: noContextoA.referencias.map((r) => ({ ref: r.ref, codigo: r.codigo, escopo: r.escopo })),
        cliente_b_vazou: noContextoA.referencias.some((r) => r.codigo === "criterio-cliente-b"),
      },
    });

    // ------------------------------------------------ 7 · descarte detalhado
    const comDescarte = await conhecimento.buscar(
      { consulta: "avaliação de encaixe entre cliente e parceiro", topK: 2, limiarRelevancia: 0.3, incluirNaoValidados: true },
      client
    );
    cenarios.push({
      id: "run-007-descartados",
      titulo: "Conhecimento descartado",
      descricao: "O que o retrieval encontrou e NÃO entregou, com o motivo de cada descarte.",
      resultado: {
        total_considerados: comDescarte.totalConsiderados,
        entregues: comDescarte.referencias.length,
        descartados_por_motivo: comDescarte.descartados.reduce<Record<string, number>>((acc, d) => {
          acc[d.motivo] = (acc[d.motivo] ?? 0) + 1;
          return acc;
        }, {}),
        amostra: comDescarte.descartados.slice(0, 8),
      },
    });

    // ------------------------------- 8 · payload para o futuro Crossability
    const paraCrossability = await conhecimento.buscar(
      { consulta: "compatibilidade de públicos e momento estratégico", topK: 3 },
      client
    );
    cenarios.push({
      id: "run-008-payload-crossability",
      titulo: "Contexto para o futuro Crossability",
      descricao: "Evidence e Knowledge como estruturas SEPARADAS. Nenhum reasoning é executado.",
      resultado: {
        verified_evidence: [
          {
            _nota: "PLACEHOLDER — fixture de Evidence, não produzida por esta sprint.",
            claim: "A marca X anunciou coleção cápsula com presença em São Paulo.",
            source_url: "https://exemplo-fixture.com/materia",
            published_at: null,
            collected_at: new Date().toISOString(),
            verification_status: "fonte_unica",
          },
        ],
        cross_knowledge: {
          embedding_origem: paraCrossability.embeddingOrigem,
          referencias: paraCrossability.referencias,
          conhecimento_insuficiente: paraCrossability.conhecimentoInsuficiente,
        },
      },
    });

    // Rollback deliberado: o showcase não deixa resíduo no banco de teste.
    throw new Error("__ROLLBACK_SHOWCASE__");
  }).catch((e) => {
    if (!(e instanceof Error) || e.message !== "__ROLLBACK_SHOWCASE__") throw e;
  });

  for (const c of cenarios) {
    writeFileSync(join(SAIDA, `${c.id}.json`), JSON.stringify(c, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-console
    console.log(`gravado: ${c.id}.json`);
  }

  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
