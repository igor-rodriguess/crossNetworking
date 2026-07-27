import { PoolClient } from "pg";
import { vetorParaSql } from "./shared/embeddings";

// Persistência da base de conhecimento vetorial (cross_ai.documento_rag).
// Inserção guarda o embedding; a busca usa distância de cosseno (operador <=>).

export interface DocumentoIngestao {
  origem: string;
  conteudo: string;
  embedding: number[];
  embeddingOrigem: string;
  referenciaId?: string | null;
  metadados?: unknown;
  criadoPorId?: string | null;
}

export async function inserirDocumento(client: PoolClient, doc: DocumentoIngestao): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.documento_rag
       (origem, conteudo, embedding, embedding_origem, referencia_id, metadados, criado_por_id)
     VALUES ($1, $2, $3::vector, $4, $5, $6, $7)
     RETURNING id`,
    [
      doc.origem,
      doc.conteudo,
      vetorParaSql(doc.embedding),
      doc.embeddingOrigem,
      doc.referenciaId ?? null,
      doc.metadados !== undefined ? JSON.stringify(doc.metadados) : null,
      doc.criadoPorId ?? null,
    ]
  );
  return rows[0].id;
}

export interface TrechoRelevante {
  id: string;
  origem: string;
  conteudo: string;
  metadados: unknown;
  // Similaridade 0..1 (1 = idêntico) — derivada da distância de cosseno.
  similaridade: number;
}

/**
 * Busca os N trechos mais próximos de um embedding de consulta (distância de
 * cosseno `<=>`). Filtra por origem quando informado. É o "R" (retrieval) do RAG.
 */
export async function buscarSimilares(
  client: PoolClient,
  embeddingConsulta: number[],
  filtros: { origem?: string | null; limite: number }
): Promise<TrechoRelevante[]> {
  const { rows } = await client.query<TrechoRelevante>(
    `SELECT id, origem::text AS origem, conteudo, metadados,
            1 - (embedding <=> $1::vector) AS similaridade
       FROM cross_ai.documento_rag
      WHERE ($2::text IS NULL OR origem::text = $2::text)
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    [vetorParaSql(embeddingConsulta), filtros.origem ?? null, filtros.limite]
  );
  return rows.map((r) => ({ ...r, similaridade: Number(r.similaridade) }));
}

/** Conta os documentos indexados (por origem, se informado). */
export async function contarDocumentos(client: PoolClient, origem?: string | null): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT count(*) AS total FROM cross_ai.documento_rag
      WHERE ($1::text IS NULL OR origem::text = $1::text)`,
    [origem ?? null]
  );
  return Number(rows[0].total);
}
