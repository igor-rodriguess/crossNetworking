import type { PoolClient } from "pg";
import type { CrossabilityAnalysis } from "./crossability.schema";

// -----------------------------------------------------------------------------
// Persistência da análise Crossability.
//
// Guarda REFERÊNCIAS, não cópias: o perfil, a evidência e a metodologia já vivem
// em suas tabelas, e duplicá-los criaria duas versões da verdade que divergem
// com o tempo.
//
// O que precisa ser respondível depois:
//   · que entidade foi analisada
//   · qual versão do Entity Intelligence Profile sustentou
//   · qual versão da metodologia sustentou
//   · qual modelo produziu
//   · quando, e a que custo
//
// Reexecutar NÃO sobrescreve: gera nova linha com o mesmo `analise_logica_id`.
// Histórico sobrescrito é histórico perdido, e uma decisão passada precisa
// continuar auditável mesmo depois de a metodologia mudar.
// -----------------------------------------------------------------------------

export interface EntradaPersistencia {
  analise: CrossabilityAnalysis;
  parteId?: string | null;
  clienteCrossId?: string | null;
  /** Resposta crua do modelo, para auditar o que ele realmente disse. */
  saidaBruta?: unknown;
  execucaoId?: string | null;
  criadoPorId?: string | null;
  /**
   * Reexecução de uma análise lógica já existente. Omitido, o banco gera um id
   * novo — primeira execução daquela análise.
   */
  analiseLogicaId?: string | null;
}

export interface AnalisePersistida {
  id: string;
  analiseLogicaId: string;
  criadoEm: string;
}

export async function salvarAnalise(
  client: PoolClient,
  entrada: EntradaPersistencia
): Promise<AnalisePersistida> {
  const a = entrada.analise;
  const metodologia = a.methodology_version[0];

  const { rows } = await client.query<{
    id: string;
    analise_logica_id: string;
    criado_em: string;
  }>(
    `INSERT INTO cross_ai.analise_crossability (
       entidade, parte_id, cliente_cross_id, objetivo,
       perfil_versao, perfil_hash,
       metodologia_codigo, metodologia_versao,
       provedor, modelo,
       analise, saida_bruta,
       confianca_global, dimensoes_suportadas, referencias_rejeitadas,
       custo_estimado, duracao_ms,
       analise_logica_id, execucao_id, criado_por_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
       COALESCE($18::uuid, gen_random_uuid()), $19, $20
     )
     RETURNING id, analise_logica_id, criado_em`,
    [
      a.entidade,
      entrada.parteId ?? null,
      entrada.clienteCrossId ?? null,
      a.contexto.objetivo,
      a.provenance.perfil_versao,
      a.provenance.perfil_hash,
      metodologia?.codigo ?? null,
      metodologia?.versao ?? null,
      a.telemetria.provedor,
      a.telemetria.modelo,
      JSON.stringify(a),
      entrada.saidaBruta ? JSON.stringify(entrada.saidaBruta) : null,
      a.confidence,
      a.dimensions.filter((d) => d.status === "suportado").length,
      a.rejeitados.length,
      a.telemetria.custo_estimado_usd,
      a.telemetria.duracao_ms,
      entrada.analiseLogicaId ?? null,
      entrada.execucaoId ?? null,
      entrada.criadoPorId ?? null,
    ]
  );

  return {
    id: rows[0].id,
    analiseLogicaId: rows[0].analise_logica_id,
    criadoEm: rows[0].criado_em,
  };
}

/** Histórico de execuções de uma mesma análise lógica, mais recente primeiro. */
export async function listarExecucoes(
  client: PoolClient,
  analiseLogicaId: string
): Promise<Array<{
  id: string;
  criadoEm: string;
  modelo: string | null;
  metodologiaVersao: number | null;
  confianca: number | null;
}>> {
  const { rows } = await client.query(
    `SELECT id, criado_em, modelo, metodologia_versao, confianca_global
       FROM cross_ai.analise_crossability
      WHERE analise_logica_id = $1
      ORDER BY criado_em DESC`,
    [analiseLogicaId]
  );
  return rows.map((r) => ({
    id: r.id,
    criadoEm: r.criado_em,
    modelo: r.modelo,
    metodologiaVersao: r.metodologia_versao,
    confianca: r.confianca_global,
  }));
}
