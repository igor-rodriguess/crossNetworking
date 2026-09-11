import type { PoolClient } from "pg";
import { hashConteudo } from "./meeting-intelligence.agent";
import type { MeetingIntelligenceResult, TipoConteudo } from "./reuniao.schema";

// -----------------------------------------------------------------------------
// Persistência do conteúdo de reunião e da análise derivada.
//
// Duas responsabilidades separadas de propósito:
//   · o conteúdo é FONTE — versionado, nunca sobrescrito por interpretação
//   · a análise é DERIVADA — vive em cross_ai, apontando o hash que analisou
//
// Editar a ata não corrompe a análise antiga: ela continua ligada ao texto que
// realmente leu.
// -----------------------------------------------------------------------------

export interface EntradaConteudo {
  reuniaoId: string;
  conteudo: string;
  tipoConteudo?: TipoConteudo;
  criadoPorId?: string | null;
}

export interface ConteudoSalvo {
  id: string;
  versao: number;
  hash: string;
  jaExistia: boolean;
}

/**
 * Grava uma versão do conteúdo.
 *
 * Conteúdo idêntico não gera versão nova — reenviar o mesmo texto é operação
 * inócua, não um evento de edição.
 */
export async function salvarConteudo(
  client: PoolClient,
  entrada: EntradaConteudo
): Promise<ConteudoSalvo> {
  const hash = hashConteudo(entrada.conteudo);

  const { rows: existente } = await client.query<{ id: string; versao: number }>(
    `SELECT id, versao FROM cross_execution.reuniao_conteudo
      WHERE reuniao_id = $1 AND conteudo_hash = $2`,
    [entrada.reuniaoId, hash]
  );
  if (existente.length) {
    return { id: existente[0].id, versao: existente[0].versao, hash, jaExistia: true };
  }

  const { rows: max } = await client.query<{ max: number | null }>(
    `SELECT MAX(versao) AS max FROM cross_execution.reuniao_conteudo WHERE reuniao_id = $1`,
    [entrada.reuniaoId]
  );
  const versao = (max[0]?.max ?? 0) + 1;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.reuniao_conteudo
       (reuniao_id, tipo_conteudo, conteudo, versao, conteudo_hash, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      entrada.reuniaoId,
      entrada.tipoConteudo ?? "notas",
      entrada.conteudo,
      versao,
      hash,
      entrada.criadoPorId ?? null,
    ]
  );
  return { id: rows[0].id, versao, hash, jaExistia: false };
}

/** Versão mais recente do conteúdo de uma reunião. */
export async function buscarConteudoAtual(client: PoolClient, reuniaoId: string) {
  const { rows } = await client.query(
    `SELECT id, tipo_conteudo, conteudo, versao, conteudo_hash
       FROM cross_execution.reuniao_conteudo
      WHERE reuniao_id = $1 ORDER BY versao DESC LIMIT 1`,
    [reuniaoId]
  );
  return rows[0] ?? null;
}

export interface AnaliseSalva {
  id: string;
  versaoAnalise: number;
  jaExistia: boolean;
}

/**
 * Grava a análise.
 *
 * Idempotente por (reunião, hash do conteúdo, versão do extrator): reanalisar o
 * mesmo texto com o mesmo extrator devolve a análise existente. Mudou o texto
 * ou o extrator, é outra análise — e a anterior permanece.
 */
export async function salvarAnalise(
  client: PoolClient,
  resultado: MeetingIntelligenceResult,
  opcoes: { conteudoId?: string | null; criadoPorId?: string | null } = {}
): Promise<AnaliseSalva> {
  const { rows: existente } = await client.query<{ id: string; versao_analise: number }>(
    `SELECT id, versao_analise FROM cross_ai.analise_reuniao
      WHERE reuniao_id = $1 AND conteudo_hash = $2 AND extractor_versao = $3`,
    [resultado.reuniao_id, resultado.conteudo_hash, resultado.extractor_versao]
  );
  if (existente.length) {
    return {
      id: existente[0].id,
      versaoAnalise: existente[0].versao_analise,
      jaExistia: true,
    };
  }

  const { rows: max } = await client.query<{ max: number | null }>(
    `SELECT MAX(versao_analise) AS max FROM cross_ai.analise_reuniao WHERE reuniao_id = $1`,
    [resultado.reuniao_id]
  );
  const versaoAnalise = (max[0]?.max ?? 0) + 1;

  const t = resultado.telemetria;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_ai.analise_reuniao (
       reuniao_id, conteudo_id, conteudo_hash, conteudo_versao,
       extractor_mode, extractor_versao, nivel_validacao, status,
       resultado, resumo_executivo,
       total_segmentos, total_lotes, total_itens, speakers_nao_resolvidos,
       duracao_ms, llm_calls, custo_estimado_usd, versao_analise, criado_por_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      resultado.reuniao_id,
      opcoes.conteudoId ?? null,
      resultado.conteudo_hash,
      resultado.conteudo_versao,
      resultado.extractor_mode,
      resultado.extractor_versao,
      resultado.nivel_validacao,
      resultado.status,
      JSON.stringify(resultado),
      resultado.resumo_executivo,
      t.total_segmentos,
      t.total_lotes,
      t.total_itens,
      resultado.speakers_nao_resolvidos.length,
      t.duracao_ms,
      t.llm_calls,
      t.custo_estimado_usd,
      versaoAnalise,
      opcoes.criadoPorId ?? null,
    ]
  );

  return { id: rows[0].id, versaoAnalise, jaExistia: false };
}

/** Histórico de análises de uma reunião, mais recente primeiro. */
export async function listarAnalises(client: PoolClient, reuniaoId: string) {
  const { rows } = await client.query(
    `SELECT id, versao_analise, conteudo_hash, conteudo_versao, status,
            extractor_mode, extractor_versao, total_itens, criado_em
       FROM cross_ai.analise_reuniao
      WHERE reuniao_id = $1
      ORDER BY versao_analise DESC`,
    [reuniaoId]
  );
  return rows;
}
