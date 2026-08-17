import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { gerarEmbeddings } from "../shared/embeddings";
import { dividirEmChunks } from "./chunking";
import * as repo from "./conhecimento.repository";
import type {
  CategoriaConhecimento,
  EscopoConhecimento,
  StatusConhecimento,
} from "./conhecimento.repository";

// -----------------------------------------------------------------------------
// Cross Knowledge Service — capacidade compartilhada de recuperação.
//
// Responde "como a Cross interpreta isso?" a partir de conhecimento VALIDADO.
// Nunca responde "o que aconteceu no mundo" — isso é Evidence, e vive em outra
// estrutura (ADR-009). Misturar os dois faria o RAG virar prova de fato externo.
//
// O serviço devolve KnowledgeReferences estruturadas, não uma string grande: o
// agente precisa poder citar "esta conclusão usou K1 e K3", e um blob de texto
// não permite isso.
// -----------------------------------------------------------------------------

/** Uma referência recuperada, com a proveniência necessária para ser citada. */
export interface KnowledgeReference {
  /** Rótulo curto e estável dentro desta consulta (K1, K2…). */
  ref: string;
  chunkId: string;
  documentoId: string;
  codigo: string;
  documento: string;
  secao: string | null;
  categoria: CategoriaConhecimento;
  versao: number;
  escopo: EscopoConhecimento;
  status: StatusConhecimento;
  relevancia: number;
  conteudo: string;
  aprovadoEm: string | null;
}

/** Um chunk que o retrieval encontrou mas NÃO entregou, com o motivo. */
export interface ConhecimentoDescartado {
  chunkId: string;
  documento: string;
  secao: string | null;
  versao: number;
  relevancia: number;
  motivo:
    | "baixa_relevancia"
    | "nao_validado"
    | "obsoleto"
    | "cliente_diferente"
    | "duplicado"
    | "excedeu_top_k";
}

export interface ContextoConhecimento {
  consulta: string;
  filtros: {
    categorias: CategoriaConhecimento[] | null;
    clienteCrossId: string | null;
    topK: number;
    limiarRelevancia: number;
  };
  /** "openai" (real) ou "mock" (determinístico). */
  embeddingOrigem: string;
  referencias: KnowledgeReference[];
  descartados: ConhecimentoDescartado[];
  /**
   * True quando nada suficientemente relevante foi encontrado. É resposta
   * CORRETA: o agente deve declarar a lacuna, não preencher com conhecimento
   * geral do modelo.
   */
  conhecimentoInsuficiente: boolean;
  totalConsiderados: number;
  duracaoMs: number;
}

export interface OpcoesBusca {
  consulta: string;
  categorias?: CategoriaConhecimento[];
  clienteCrossId?: string | null;
  topK?: number;
  /** Relevância mínima (0..1) para uma referência ser entregue ao agente. */
  limiarRelevancia?: number;
  /** Diagnóstico: traz rascunho/obsoleto para MOSTRAR o descarte. Nunca em produção. */
  incluirNaoValidados?: boolean;
}

/** Defaults conservadores: poucos trechos, com relevância exigida. */
const TOP_K_PADRAO = 5;
const LIMIAR_PADRAO = 0.35;

// -----------------------------------------------------------------------------
// Indexação
// -----------------------------------------------------------------------------

export interface EntradaIndexacao {
  codigo: string;
  titulo: string;
  categoria: CategoriaConhecimento;
  conteudo: string;
  versao?: number;
  status?: StatusConhecimento;
  escopo?: EscopoConhecimento;
  clienteCrossId?: string | null;
  documentoOrigem?: string | null;
  descricao?: string | null;
  aprovadoPorId?: string | null;
  /** Ao validar, aposenta as demais versões validadas do documento. */
  obsoletarAnteriores?: boolean;
}

export interface ResultadoIndexacao {
  documentoId: string;
  versaoId: string;
  versao: number;
  status: StatusConhecimento;
  chunks: number;
  embeddingOrigem: string;
  versoesObsoletadas: number;
}

/**
 * Indexa (ou reindexa) uma versão de conhecimento.
 *
 * Idempotente por (codigo, versao): rodar duas vezes atualiza a mesma linha e
 * substitui os chunks, em vez de acumular duplicatas.
 */
export async function indexar(
  entrada: EntradaIndexacao,
  usuarioId: string | null = null,
  clientExterno?: PoolClient
): Promise<ResultadoIndexacao> {
  const executar = async (client: PoolClient): Promise<ResultadoIndexacao> => {
    const documento = await repo.upsertDocumento(client, {
      codigo: entrada.codigo,
      titulo: entrada.titulo,
      categoria: entrada.categoria,
      escopo: entrada.escopo,
      clienteCrossId: entrada.clienteCrossId,
      documentoOrigem: entrada.documentoOrigem,
      descricao: entrada.descricao,
      criadoPorId: usuarioId,
    });

    const statusDesejado = entrada.status ?? "rascunho";
    const numeroVersao = entrada.versao ?? 1;

    // Aposentar as anteriores ANTES de gravar esta como validada. O índice
    // parcial único (uq_conhecimento_versao_validada) admite uma só versão
    // validada por documento: inserir primeiro e limpar depois falha, porque a
    // restrição é avaliada no INSERT.
    let versoesObsoletadas = 0;
    if (entrada.obsoletarAnteriores && statusDesejado === "validado") {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM cross_ai.conhecimento_versao
          WHERE documento_id = $1 AND versao = $2`,
        [documento.id, numeroVersao]
      );
      // Passa o id da própria versão quando ela já existe, para não se
      // obsoletar a si mesma numa reindexação.
      versoesObsoletadas = await repo.obsoletarOutrasVersoes(
        client,
        documento.id,
        rows[0]?.id ?? "00000000-0000-0000-0000-000000000000"
      );
    }

    const versao = await repo.upsertVersao(client, {
      documentoId: documento.id,
      versao: numeroVersao,
      conteudo: entrada.conteudo,
      status: statusDesejado,
      aprovadoPorId: entrada.aprovadoPorId ?? null,
    });

    const pedacos = dividirEmChunks(entrada.conteudo);
    if (pedacos.length === 0) {
      return {
        documentoId: documento.id,
        versaoId: versao.id,
        versao: versao.versao,
        status: versao.status,
        chunks: 0,
        embeddingOrigem: "mock",
        versoesObsoletadas,
      };
    }

    const { vetores, origem } = await gerarEmbeddings(pedacos.map((p) => p.conteudo));

    const total = await repo.substituirChunks(
      client,
      versao.id,
      pedacos.map((p, i) => ({
        ordem: p.ordem,
        secao: p.secao,
        conteudo: p.conteudo,
        embedding: vetores[i],
        embeddingOrigem: origem,
        metadados: {
          codigo: entrada.codigo,
          categoria: entrada.categoria,
          documento_origem: entrada.documentoOrigem ?? null,
        },
      }))
    );

    return {
      documentoId: documento.id,
      versaoId: versao.id,
      versao: versao.versao,
      status: versao.status,
      chunks: total,
      embeddingOrigem: origem,
      versoesObsoletadas,
    };
  };

  return clientExterno ? executar(clientExterno) : withTransaction(executar);
}

// -----------------------------------------------------------------------------
// Retrieval
// -----------------------------------------------------------------------------

/**
 * Recupera conhecimento Cross validado para uma consulta.
 *
 * Ordem das decisões: o banco filtra status e escopo; aqui aplicamos limiar de
 * relevância, deduplicação e top-k — nessa ordem, para que o corte final não
 * descarte um trecho bom por causa de um duplicado que vinha antes.
 */
export async function buscar(
  opcoes: OpcoesBusca,
  clientExterno?: PoolClient
): Promise<ContextoConhecimento> {
  const inicio = Date.now();
  const topK = opcoes.topK ?? TOP_K_PADRAO;
  const limiar = opcoes.limiarRelevancia ?? LIMIAR_PADRAO;

  const { vetores, origem } = await gerarEmbeddings([opcoes.consulta]);

  const executar = (client: PoolClient) =>
    repo.buscarChunksSimilares(client, vetores[0], {
      categorias: opcoes.categorias,
      clienteCrossId: opcoes.clienteCrossId ?? null,
      incluirNaoValidados: opcoes.incluirNaoValidados,
      // Busca mais do que o top-k: a deduplicação e o limiar cortam depois, e
      // sem folga o resultado final viria menor que o pedido.
      limite: Math.max(topK * 4, 20),
    });

  const candidatos = clientExterno
    ? await executar(clientExterno)
    : await withTransaction(executar);

  const referencias: KnowledgeReference[] = [];
  const descartados: ConhecimentoDescartado[] = [];
  const secoesVistas = new Set<string>();

  for (const c of candidatos) {
    const base = {
      chunkId: c.chunk_id,
      documento: c.titulo,
      secao: c.secao,
      versao: c.versao,
      relevancia: Math.round(c.relevancia * 1000) / 1000,
    };

    if (c.status !== "validado") {
      descartados.push({ ...base, motivo: c.status === "rascunho" ? "nao_validado" : "obsoleto" });
      continue;
    }
    if (c.relevancia < limiar) {
      descartados.push({ ...base, motivo: "baixa_relevancia" });
      continue;
    }

    // Diversidade: um segundo trecho da MESMA seção do mesmo documento raramente
    // acrescenta — ocupa a vaga de um conhecimento complementar.
    const chaveSecao = `${c.documento_id}::${c.secao ?? ""}`;
    if (secoesVistas.has(chaveSecao)) {
      descartados.push({ ...base, motivo: "duplicado" });
      continue;
    }

    if (referencias.length >= topK) {
      descartados.push({ ...base, motivo: "excedeu_top_k" });
      continue;
    }

    secoesVistas.add(chaveSecao);
    referencias.push({
      ref: `K${referencias.length + 1}`,
      chunkId: c.chunk_id,
      documentoId: c.documento_id,
      codigo: c.codigo,
      documento: c.titulo,
      secao: c.secao,
      categoria: c.categoria,
      versao: c.versao,
      escopo: c.escopo,
      status: c.status,
      relevancia: base.relevancia,
      conteudo: c.conteudo,
      aprovadoEm: c.aprovado_em,
    });
  }

  return {
    consulta: opcoes.consulta,
    filtros: {
      categorias: opcoes.categorias ?? null,
      clienteCrossId: opcoes.clienteCrossId ?? null,
      topK,
      limiarRelevancia: limiar,
    },
    embeddingOrigem: origem,
    referencias,
    descartados,
    conhecimentoInsuficiente: referencias.length === 0,
    totalConsiderados: candidatos.length,
    duracaoMs: Date.now() - inicio,
  };
}

/** Contagens da base de conhecimento. */
export function contar(clientExterno?: PoolClient) {
  return clientExterno
    ? repo.contarConhecimento(clientExterno)
    : withTransaction(repo.contarConhecimento);
}
