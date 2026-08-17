import { PoolClient } from "pg";
import { vetorParaSql } from "../shared/embeddings";

// -----------------------------------------------------------------------------
// Persistência do Cross Knowledge (cross_ai.conhecimento_*).
//
// Todo SQL aqui filtra por status e escopo no BANCO, não em memória: trazer
// conhecimento de outro cliente para descartar depois em TypeScript deixaria o
// dado passar pela aplicação, e um filtro esquecido viraria vazamento.
// -----------------------------------------------------------------------------

export type CategoriaConhecimento =
  | "metodologia_crossability"
  | "definicao"
  | "criterio"
  | "playbook"
  | "case_aprovado"
  | "principio"
  | "padrao_decisao"
  | "aprendizado_validado"
  | "criterio_cliente"
  | "outro";

export type StatusConhecimento = "rascunho" | "validado" | "obsoleto";
export type EscopoConhecimento = "global" | "cliente" | "interno";

export interface DocumentoConhecimento {
  id: string;
  codigo: string;
  titulo: string;
  categoria: CategoriaConhecimento;
  escopo: EscopoConhecimento;
  cliente_cross_id: string | null;
  documento_origem: string | null;
}

/** Cria ou atualiza o documento pelo `codigo` — reindexar não duplica. */
export async function upsertDocumento(
  client: PoolClient,
  dados: {
    codigo: string;
    titulo: string;
    categoria: CategoriaConhecimento;
    escopo?: EscopoConhecimento;
    clienteCrossId?: string | null;
    documentoOrigem?: string | null;
    descricao?: string | null;
    criadoPorId?: string | null;
  }
): Promise<DocumentoConhecimento> {
  const { rows } = await client.query<DocumentoConhecimento>(
    `INSERT INTO cross_ai.conhecimento_documento
       (codigo, titulo, categoria, escopo, cliente_cross_id, documento_origem, descricao, criado_por_id)
     VALUES ($1, $2, $3::cross_ai.conhecimento_categoria, $4::cross_ai.conhecimento_escopo, $5, $6, $7, $8)
     ON CONFLICT (codigo) DO UPDATE
       SET titulo = EXCLUDED.titulo,
           categoria = EXCLUDED.categoria,
           escopo = EXCLUDED.escopo,
           cliente_cross_id = EXCLUDED.cliente_cross_id,
           documento_origem = EXCLUDED.documento_origem,
           descricao = EXCLUDED.descricao,
           atualizado_em = NOW()
     RETURNING id, codigo, titulo, categoria::text AS categoria, escopo::text AS escopo,
               cliente_cross_id, documento_origem`,
    [
      dados.codigo,
      dados.titulo,
      dados.categoria,
      dados.escopo ?? "global",
      dados.clienteCrossId ?? null,
      dados.documentoOrigem ?? null,
      dados.descricao ?? null,
      dados.criadoPorId ?? null,
    ]
  );
  return rows[0];
}

export interface VersaoConhecimento {
  id: string;
  documento_id: string;
  versao: number;
  status: StatusConhecimento;
}

/** Cria ou atualiza a versão. A mesma (documento, versão) é sempre a mesma linha. */
export async function upsertVersao(
  client: PoolClient,
  dados: {
    documentoId: string;
    versao: number;
    conteudo: string;
    status?: StatusConhecimento;
    aprovadoPorId?: string | null;
    substituiVersaoId?: string | null;
    notas?: string | null;
  }
): Promise<VersaoConhecimento> {
  const status = dados.status ?? "rascunho";
  const { rows } = await client.query<VersaoConhecimento>(
    `INSERT INTO cross_ai.conhecimento_versao
       (documento_id, versao, conteudo, status, aprovado_em, aprovado_por_id, substitui_versao_id, notas)
     VALUES ($1, $2, $3, $4::cross_ai.conhecimento_status,
             CASE WHEN $4 = 'validado' THEN NOW() ELSE NULL END, $5, $6, $7)
     ON CONFLICT (documento_id, versao) DO UPDATE
       SET conteudo = EXCLUDED.conteudo,
           status = EXCLUDED.status,
           aprovado_em = CASE WHEN EXCLUDED.status = 'validado'
                              THEN COALESCE(cross_ai.conhecimento_versao.aprovado_em, NOW())
                              ELSE NULL END,
           aprovado_por_id = EXCLUDED.aprovado_por_id,
           substitui_versao_id = EXCLUDED.substitui_versao_id,
           notas = EXCLUDED.notas,
           atualizado_em = NOW()
     RETURNING id, documento_id, versao, status::text AS status`,
    [
      dados.documentoId,
      dados.versao,
      dados.conteudo,
      status,
      dados.aprovadoPorId ?? null,
      dados.substituiVersaoId ?? null,
      dados.notas ?? null,
    ]
  );
  return rows[0];
}

/**
 * Marca as demais versões do documento como obsoletas.
 *
 * Necessário porque só existe UMA versão validada por documento (índice parcial
 * único da migration 055): promover a v2 exige aposentar a v1 na mesma
 * transação, senão o índice rejeita a operação.
 */
export async function obsoletarOutrasVersoes(
  client: PoolClient,
  documentoId: string,
  versaoManterId: string
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE cross_ai.conhecimento_versao
        SET status = 'obsoleto', atualizado_em = NOW()
      WHERE documento_id = $1 AND id <> $2 AND status = 'validado'`,
    [documentoId, versaoManterId]
  );
  return rowCount ?? 0;
}

export interface ChunkParaIndexar {
  ordem: number;
  secao: string | null;
  conteudo: string;
  embedding: number[];
  embeddingOrigem: string;
  metadados?: unknown;
}

/**
 * Substitui os chunks de uma versão.
 *
 * DELETE + INSERT em vez de upsert por ordem: uma reindexação pode produzir
 * MENOS chunks que a anterior (texto encurtou), e sobrariam órfãos das
 * posições finais apontando para conteúdo que não existe mais.
 */
export async function substituirChunks(
  client: PoolClient,
  versaoId: string,
  chunks: ChunkParaIndexar[]
): Promise<number> {
  await client.query(`DELETE FROM cross_ai.conhecimento_chunk WHERE versao_id = $1`, [versaoId]);

  for (const c of chunks) {
    await client.query(
      `INSERT INTO cross_ai.conhecimento_chunk
         (versao_id, ordem, secao, conteudo, embedding, embedding_origem, metadados)
       VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
      [
        versaoId,
        c.ordem,
        c.secao,
        c.conteudo,
        vetorParaSql(c.embedding),
        c.embeddingOrigem,
        c.metadados !== undefined ? JSON.stringify(c.metadados) : null,
      ]
    );
  }
  return chunks.length;
}

export interface ChunkRecuperado {
  chunk_id: string;
  documento_id: string;
  versao_id: string;
  codigo: string;
  titulo: string;
  secao: string | null;
  categoria: CategoriaConhecimento;
  escopo: EscopoConhecimento;
  cliente_cross_id: string | null;
  versao: number;
  status: StatusConhecimento;
  conteudo: string;
  embedding_origem: string;
  aprovado_em: string | null;
  relevancia: number;
}

export interface FiltrosBusca {
  /** Categorias aceitas; vazio = todas. */
  categorias?: CategoriaConhecimento[];
  /**
   * Cliente em contexto. Conhecimento `global`/`interno` sempre entra;
   * conhecimento de OUTRO cliente nunca entra.
   */
  clienteCrossId?: string | null;
  /**
   * Quando true, ignora o filtro de status — usado só por diagnóstico e pelos
   * cenários de validação, para mostrar o que FOI descartado e por quê.
   * Nunca deve ser usado no caminho dos agentes em produção.
   */
  incluirNaoValidados?: boolean;
  limite: number;
}

/**
 * Busca por similaridade de cosseno, já filtrando status e escopo no banco.
 *
 * O `LIMIT` recebe um múltiplo do top-k pedido: a deduplicação e o corte por
 * threshold acontecem na camada de serviço, e cortar cedo demais deixaria o
 * serviço sem candidatos para diversificar.
 */
export async function buscarChunksSimilares(
  client: PoolClient,
  embeddingConsulta: number[],
  filtros: FiltrosBusca
): Promise<ChunkRecuperado[]> {
  const { rows } = await client.query<ChunkRecuperado>(
    `SELECT ch.id                AS chunk_id,
            doc.id               AS documento_id,
            v.id                 AS versao_id,
            doc.codigo,
            doc.titulo,
            ch.secao,
            doc.categoria::text  AS categoria,
            doc.escopo::text     AS escopo,
            doc.cliente_cross_id,
            v.versao,
            v.status::text       AS status,
            ch.conteudo,
            ch.embedding_origem,
            v.aprovado_em,
            1 - (ch.embedding <=> $1::vector) AS relevancia
       FROM cross_ai.conhecimento_chunk ch
       JOIN cross_ai.conhecimento_versao v   ON v.id = ch.versao_id
       JOIN cross_ai.conhecimento_documento doc ON doc.id = v.documento_id
      WHERE ($2::boolean OR v.status = 'validado')
        -- Isolamento por cliente: global e interno valem para todos; o
        -- conhecimento de um cliente só aparece para aquele cliente.
        AND (doc.escopo <> 'cliente' OR doc.cliente_cross_id = $3::uuid)
        AND ($4::text[] IS NULL OR doc.categoria::text = ANY($4::text[]))
      ORDER BY ch.embedding <=> $1::vector
      LIMIT $5`,
    [
      vetorParaSql(embeddingConsulta),
      filtros.incluirNaoValidados ?? false,
      filtros.clienteCrossId ?? null,
      filtros.categorias && filtros.categorias.length ? filtros.categorias : null,
      filtros.limite,
    ]
  );
  return rows.map((r) => ({ ...r, relevancia: Number(r.relevancia) }));
}

/** Conta documentos, versões e chunks — usado por diagnóstico e showcase. */
export async function contarConhecimento(client: PoolClient): Promise<{
  documentos: number;
  versoes: number;
  chunks: number;
  validados: number;
}> {
  const { rows } = await client.query<{
    documentos: string;
    versoes: string;
    chunks: string;
    validados: string;
  }>(
    `SELECT (SELECT count(*) FROM cross_ai.conhecimento_documento) AS documentos,
            (SELECT count(*) FROM cross_ai.conhecimento_versao)    AS versoes,
            (SELECT count(*) FROM cross_ai.conhecimento_chunk)     AS chunks,
            (SELECT count(*) FROM cross_ai.conhecimento_versao
              WHERE status = 'validado')                            AS validados`
  );
  const r = rows[0];
  return {
    documentos: Number(r.documentos),
    versoes: Number(r.versoes),
    chunks: Number(r.chunks),
    validados: Number(r.validados),
  };
}
