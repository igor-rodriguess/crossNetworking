import type { PoolClient } from "pg";
import type { RecommendationProposal } from "./recomendacao.schema";

// -----------------------------------------------------------------------------
// Persistência da Recommendation.
//
// Vive em `cross_ai.recomendacao`, deliberadamente separada de
// `candidatura_parceiro` e `frente_oportunidade`. Persistir uma hipótese numa
// tabela operacional equivaleria a criar oportunidade — que é justamente o que
// o Human Gate existe para impedir.
//
// Reexecutar não sobrescreve: nova versão com o mesmo `proposta_logica_id`.
// -----------------------------------------------------------------------------

export interface EntradaPersistencia {
  proposta: RecommendationProposal;
  /** Versão anterior da mesma proposta lógica, quando for reexecução. */
  propostaLogicaId?: string | null;
  execucaoId?: string | null;
  criadoPorId?: string | null;
}

export interface PropostaPersistida {
  id: string;
  propostaLogicaId: string;
  versao: number;
  criadoEm: string;
}

export async function salvarProposta(
  client: PoolClient,
  entrada: EntradaPersistencia
): Promise<PropostaPersistida> {
  const p = entrada.proposta;

  // Próxima versão da mesma proposta lógica. Começa em 1 quando é nova.
  let versao = 1;
  if (entrada.propostaLogicaId) {
    const { rows } = await client.query<{ max: number | null }>(
      `SELECT MAX(versao) AS max FROM cross_ai.recomendacao WHERE proposta_logica_id = $1`,
      [entrada.propostaLogicaId]
    );
    versao = (rows[0]?.max ?? 0) + 1;
  }

  const { rows } = await client.query<{
    id: string;
    proposta_logica_id: string;
    versao: number;
    criado_em: string;
  }>(
    `INSERT INTO cross_ai.recomendacao (
       direcao, origem_parte_id, origem_nome, origem_vinculo,
       candidato_parte_id, candidato_nome, objetivo,
       status, nivel_sustentacao, hipotese_oportunidade,
       confianca, nivel_validacao, proximo_passo,
       perfil_origem_versao, perfil_candidato_versao,
       crossability_hash, matching_pesos_versao, hash_entrada,
       proposta, contra_evidencias, lacunas, riscos,
       proposta_logica_id, versao, execucao_id, criado_por_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
       COALESCE($23::uuid, gen_random_uuid()), $24, $25, $26
     )
     RETURNING id, proposta_logica_id, versao, criado_em`,
    [
      p.direcao,
      p.origem.parte_id,
      p.origem.nome,
      p.origem.vinculo,
      p.candidato.parte_id,
      p.candidato.nome,
      p.objetivo,
      p.status,
      p.nivel_sustentacao,
      p.hipotese_oportunidade,
      p.confianca,
      p.nivel_validacao,
      p.proximo_passo,
      p.proveniencia.perfil_origem_versao,
      p.proveniencia.perfil_candidato_versao,
      p.proveniencia.crossability_hash,
      p.proveniencia.matching_pesos_versao,
      p.proveniencia.hash_entrada,
      JSON.stringify(p),
      p.contra_evidencias.length,
      p.lacunas.length,
      p.riscos.length,
      entrada.propostaLogicaId ?? null,
      versao,
      entrada.execucaoId ?? null,
      entrada.criadoPorId ?? null,
    ]
  );

  return {
    id: rows[0].id,
    propostaLogicaId: rows[0].proposta_logica_id,
    versao: rows[0].versao,
    criadoEm: rows[0].criado_em,
  };
}

/** Histórico de versões de uma proposta lógica, mais recente primeiro. */
export async function listarVersoes(
  client: PoolClient,
  propostaLogicaId: string
): Promise<Array<{
  id: string;
  versao: number;
  status: string;
  confianca: number;
  hashEntrada: string;
  criadoEm: string;
}>> {
  const { rows } = await client.query(
    `SELECT id, versao, status, confianca, hash_entrada, criado_em
       FROM cross_ai.recomendacao
      WHERE proposta_logica_id = $1
      ORDER BY versao DESC`,
    [propostaLogicaId]
  );
  return rows.map((r) => ({
    id: r.id,
    versao: r.versao,
    status: r.status,
    confianca: r.confianca,
    hashEntrada: r.hash_entrada,
    criadoEm: r.criado_em,
  }));
}
