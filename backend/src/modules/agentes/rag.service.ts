import { withTransaction } from "../../shared/db";
import { gerarEmbeddings } from "./shared/embeddings";
import * as ragRepo from "./rag.repository";
import {
  buscaRagSaidaSchema,
  ingestaoSaidaSchema,
  type BuscaRagSaida,
  type BuscarRagInput,
  type IngerirRagInput,
  type IngestaoSaida,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// RAG service — ingestão e busca semântica na base de conhecimento.
//
// É a camada de CONHECIMENTO (leitura por todos os agentes de reasoning). Não
// escreve dado de domínio: guarda apenas embeddings de trechos para retrieval.
// Embeddings plugáveis (OpenAI real / mock determinístico).
// -----------------------------------------------------------------------------

/** Ingere trechos: gera embeddings e os guarda na base vetorial. */
export async function ingerir(input: IngerirRagInput, usuarioId: string | null): Promise<IngestaoSaida> {
  const { vetores, origem } = await gerarEmbeddings(input.trechos);

  const inseridos = await withTransaction(async (client) => {
    let n = 0;
    for (let i = 0; i < input.trechos.length; i++) {
      await ragRepo.inserirDocumento(client, {
        origem: input.origem,
        conteudo: input.trechos[i],
        embedding: vetores[i],
        embeddingOrigem: origem,
        referenciaId: input.referencia_id ?? null,
        metadados: input.metadados ?? null,
        criadoPorId: usuarioId,
      });
      n++;
    }
    return n;
  });

  return ingestaoSaidaSchema.parse({ inseridos, embedding_origem: origem });
}

/** Busca os trechos mais relevantes para uma consulta (retrieval). */
export async function buscar(input: BuscarRagInput): Promise<BuscaRagSaida> {
  const { vetores, origem } = await gerarEmbeddings([input.consulta]);
  const embeddingConsulta = vetores[0];

  const trechos = await withTransaction((client) =>
    ragRepo.buscarSimilares(client, embeddingConsulta, {
      origem: input.origem ?? null,
      limite: input.limite ?? 5,
    })
  );

  return buscaRagSaidaSchema.parse({
    total: trechos.length,
    embedding_origem: origem,
    trechos: trechos.map((t) => ({
      id: t.id,
      origem: t.origem,
      conteudo: t.conteudo,
      similaridade: Math.round(t.similaridade * 1000) / 1000,
      metadados: t.metadados,
    })),
  });
}

/** Quantos documentos há na base (por origem, se informado). */
export async function contar(origem?: string): Promise<number> {
  return withTransaction((client) => ragRepo.contarDocumentos(client, origem ?? null));
}
