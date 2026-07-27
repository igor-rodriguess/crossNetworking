import { PoolClient } from "pg";

// Auditoria de execuções de agente (cross_ai.execucao_agente). Toda rodada de
// qualquer agente é registrada aqui — sucesso ou erro — para rastreabilidade.

export interface RegistroExecucao {
  agente: string;
  status: "sucesso" | "erro";
  origem: string; // "openai" | "mock"
  entrada: unknown;
  saida?: unknown;
  erro?: string | null;
  tokensEntrada?: number;
  tokensSaida?: number;
  duracaoMs?: number;
  criadoPorId?: string | null;
  projetoId?: string | null;
  frenteId?: string | null;
}

export async function registrarExecucao(
  client: PoolClient,
  dados: RegistroExecucao
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.execucao_agente
       (agente, status, origem, entrada, saida, erro,
        tokens_entrada, tokens_saida, duracao_ms,
        criado_por_id, projeto_id, frente_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      dados.agente,
      dados.status,
      dados.origem,
      JSON.stringify(dados.entrada),
      dados.saida !== undefined ? JSON.stringify(dados.saida) : null,
      dados.erro ?? null,
      dados.tokensEntrada ?? 0,
      dados.tokensSaida ?? 0,
      dados.duracaoMs ?? null,
      dados.criadoPorId ?? null,
      dados.projetoId ?? null,
      dados.frenteId ?? null,
    ]
  );
  return rows[0].id;
}

export interface ExecucaoRow {
  id: string;
  agente: string;
  status: string;
  origem: string;
  saida: unknown;
  erro: string | null;
  criado_em: string;
}

export interface ParteBusca {
  id: string;
  nome: string;
}

/**
 * Busca Partes ativas cujo nome_exibicao contém o termo (case-insensitive) —
 * usado pelo Entity Resolver para casar entidades da pesquisa com a base.
 */
export async function buscarPartesPorNome(
  client: PoolClient,
  termo: string,
  tipo: string | null,
  limite = 10
): Promise<ParteBusca[]> {
  const { rows } = await client.query<ParteBusca>(
    `SELECT id, nome_exibicao AS nome
       FROM cross_core.parte
      WHERE arquivado_em IS NULL
        AND nome_exibicao ILIKE '%' || $1 || '%'
        AND ($2::text IS NULL OR tipo::text = $2)
      ORDER BY length(nome_exibicao)
      LIMIT $3`,
    [termo, tipo, limite]
  );
  return rows;
}

/** Lista as execuções mais recentes de um agente (para auditoria/telemetria). */
export async function listarExecucoes(
  client: PoolClient,
  filtros: { agente?: string; limit: number; offset: number }
): Promise<{ itens: ExecucaoRow[]; total: number }> {
  const { rows } = await client.query<ExecucaoRow & { total: string }>(
    `SELECT id, agente, status, origem, saida, erro, criado_em,
            count(*) OVER() AS total
       FROM cross_ai.execucao_agente
      WHERE ($1::text IS NULL OR agente::text = $1::text)
      ORDER BY criado_em DESC
      LIMIT $2 OFFSET $3`,
    [filtros.agente ?? null, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, ...r }) => r);
  return { itens, total };
}
