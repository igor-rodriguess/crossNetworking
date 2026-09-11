import type { PoolClient } from "pg";
import type { DirecaoMatching } from "./matching.schema";

// -----------------------------------------------------------------------------
// Acesso a dados do Internal Matching.
//
// O filtro pesado acontece no PostgreSQL, não em Node: carregar a base inteira
// para filtrar em memória funciona com 50 Partes e quebra com 50 mil. A consulta
// já devolve o pool restrito pela direção.
//
// Trabalha sobre `cross_core.parte` e `parte_papel` — Parte continua sendo a
// entidade central. Não existe base separada de parceiros, prospects ou
// clientes: são papéis da mesma entidade.
// -----------------------------------------------------------------------------

export interface ParteCandidata {
  parte_id: string;
  nome: string;
  tipo: string;
  papeis: string[];
  eh_cliente_cross: boolean;
  /** Grupo de marca, quando houver — base da deduplicação. */
  grupo_parte_id: string | null;
  publicos: string[];
  territorios: string[];
  pracas: string[];
  ativos: string[];
  segmento: string | null;
  atualizado_em: string | null;
  tem_perfil_estrategico: boolean;
}

/**
 * Papéis que podem ser alvo, por direção.
 *
 * `cliente_para_parceiro` NÃO exige papel histórico de parceiro: uma empresa
 * ainda não convertida é candidata legítima. Restringir a quem já é parceiro
 * transformaria o matching numa consulta ao passado.
 */
const PAPEIS_ALVO: Record<DirecaoMatching, string[] | null> = {
  cliente_para_parceiro: null,
  // Aqui a restrição é real e vem da relação interna, não do papel: Cliente
  // Cross é verdade da plataforma, e não se descobre na internet.
  parceiro_para_cliente: null,
  prospeccao_do_zero: null,
};

export interface OpcoesPool {
  direcao: DirecaoMatching;
  parteOrigemId?: string | null;
  excluidos?: string[];
  /** Teto do que o SQL devolve. Barreira contra candidate explosion. */
  limite: number;
  /** Restringe a Partes específicas — usado para carregar a origem. */
  somenteIds?: string[];
}

/**
 * Monta o pool de candidatos já filtrado.
 *
 * Filtros aplicados no banco:
 *   · Parte não arquivada (inativa não entra)
 *   · não é a própria origem (auto-match)
 *   · não está na lista de exclusão explícita
 *   · em `parceiro_para_cliente`, apenas Clientes Cross reais e ativos
 *
 * Agregações (públicos, territórios, ativos) vêm por LEFT JOIN: candidato sem
 * esses dados continua no pool com listas vazias. Excluí-lo no SQL seria tratar
 * ausência de dado como incompatibilidade.
 */
export async function buscarPool(
  client: PoolClient,
  opcoes: OpcoesPool
): Promise<ParteCandidata[]> {
  const exigirClienteCross = opcoes.direcao === "parceiro_para_cliente";
  const papeisAlvo = PAPEIS_ALVO[opcoes.direcao];

  const { rows } = await client.query<ParteCandidata>(
    `
    SELECT
      p.id                     AS parte_id,
      p.nome_exibicao          AS nome,
      p.tipo::text             AS tipo,
      COALESCE(pp.papeis, ARRAY[]::text[])        AS papeis,
      (cc.id IS NOT NULL)                          AS eh_cliente_cross,
      gm.grupo_parte_id                            AS grupo_parte_id,
      COALESCE(pub.itens, ARRAY[]::text[])         AS publicos,
      COALESCE(ter.itens, ARRAY[]::text[])         AS territorios,
      COALESCE(pra.itens, ARRAY[]::text[])         AS pracas,
      COALESCE(atv.itens, ARRAY[]::text[])         AS ativos,
      org.segmento_principal                       AS segmento,
      p.atualizado_em                              AS atualizado_em,
      (pe.id IS NOT NULL)                          AS tem_perfil_estrategico
    FROM cross_core.parte p

    -- Papéis vigentes: vigente_ate no passado significa papel encerrado.
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT pap.codigo::text) AS papeis
        FROM cross_core.parte_papel ppl
        JOIN cross_core.papel pap ON pap.id = ppl.papel_id
       WHERE ppl.parte_id = p.id
         AND ppl.arquivado_em IS NULL
         AND (ppl.vigente_ate IS NULL OR ppl.vigente_ate >= CURRENT_DATE)
    ) pp ON TRUE

    LEFT JOIN cross_commercial.cliente_cross cc
           ON cc.parte_id = p.id AND cc.arquivado_em IS NULL

    LEFT JOIN cross_core.grupo_marca gm ON gm.marca_parte_id = p.id

    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT pu.nome::text) AS itens
        FROM cross_intelligence.parte_publico ppu
        JOIN cross_intelligence.publico pu ON pu.id = ppu.publico_id
       WHERE ppu.parte_id = p.id AND ppu.arquivado_em IS NULL
    ) pub ON TRUE

    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT te.nome::text) AS itens
        FROM cross_intelligence.parte_territorio pte
        JOIN cross_intelligence.territorio te ON te.id = pte.territorio_id
       WHERE pte.parte_id = p.id AND pte.arquivado_em IS NULL
    ) ter ON TRUE

    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT pc.nome::text) AS itens
        FROM cross_intelligence.parte_praca ppr
        JOIN cross_intelligence.praca pc ON pc.id = ppr.praca_id
       WHERE ppr.parte_id = p.id AND ppr.arquivado_em IS NULL
    ) pra ON TRUE

    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT a.nome::text) AS itens
        FROM cross_intelligence.ativo a
       WHERE a.parte_id = p.id AND a.arquivado_em IS NULL
    ) atv ON TRUE

    LEFT JOIN cross_core.organizacao org ON org.parte_id = p.id

    LEFT JOIN LATERAL (
      SELECT id FROM cross_intelligence.perfil_estrategico pes
       WHERE pes.parte_id = p.id AND pes.arquivado_em IS NULL
       LIMIT 1
    ) pe ON TRUE

    WHERE p.arquivado_em IS NULL
      AND ($1::uuid IS NULL OR p.id <> $1::uuid)
      AND ($2::uuid[] IS NULL OR NOT (p.id = ANY($2::uuid[])))
      AND (NOT $3::boolean OR cc.id IS NOT NULL)
      AND ($4::text[] IS NULL OR COALESCE(pp.papeis, ARRAY[]::text[]) && $4::text[])
      AND ($6::uuid[] IS NULL OR p.id = ANY($6::uuid[]))
    ORDER BY p.nome_exibicao, p.id
    LIMIT $5
    `,
    [
      opcoes.parteOrigemId ?? null,
      opcoes.excluidos?.length ? opcoes.excluidos : null,
      exigirClienteCross,
      papeisAlvo,
      opcoes.limite,
      opcoes.somenteIds?.length ? opcoes.somenteIds : null,
    ]
  );

  return rows;
}

/** Total de Partes ativas — denominador honesto do funil de seleção. */
export async function contarPoolTotal(
  client: PoolClient,
  direcao: DirecaoMatching
): Promise<number> {
  const exigirClienteCross = direcao === "parceiro_para_cliente";
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM cross_core.parte p
       LEFT JOIN cross_commercial.cliente_cross cc
              ON cc.parte_id = p.id AND cc.arquivado_em IS NULL
      WHERE p.arquivado_em IS NULL
        AND (NOT $1::boolean OR cc.id IS NOT NULL)`,
    [exigirClienteCross]
  );
  return Number(rows[0]?.n ?? 0);
}

/** Dados da Parte de origem, quando vinculada. */
export async function buscarOrigem(
  client: PoolClient,
  parteId: string
): Promise<ParteCandidata | null> {
  const { rows } = await client.query<{ existe: boolean }>(
    `SELECT TRUE AS existe FROM cross_core.parte WHERE id = $1 AND arquivado_em IS NULL`,
    [parteId]
  );
  if (!rows.length) return null;

  // Reaproveita o SQL do pool para manter UMA definição da forma de
  // ParteCandidata; duas consultas divergiriam com o tempo.
  const encontradas = await buscarPoolPorIds(client, [parteId]);
  return encontradas[0] ?? null;
}

/**
 * Busca Partes específicas com a mesma forma do pool.
 *
 * Filtra no SQL, não em Node: carregar o pool inteiro para escolher uma linha
 * seria desperdício e deixaria de funcionar quando a base crescer.
 */
export async function buscarPoolPorIds(
  client: PoolClient,
  ids: string[]
): Promise<ParteCandidata[]> {
  if (!ids.length) return [];
  return buscarPool(client, {
    direcao: "cliente_para_parceiro",
    parteOrigemId: null,
    limite: ids.length,
    excluidos: [],
    somenteIds: ids,
  });
}

/**
 * Relacionamentos conhecidos entre a origem e os candidatos.
 *
 * O vínculo real na base é `candidatura_parceiro → frente_oportunidade →
 * projeto → cliente_cross`. Não existe tabela `parceria`: uma primeira versão
 * deste código assumiu que existia, e a consulta teria falhado silenciosamente.
 *
 * Relacionamento NÃO exclui candidato (§37): é registrado como contexto, e a
 * metodologia futura decide se ajuda ou atrapalha.
 */
export async function buscarRelacionamentos(
  client: PoolClient,
  parteOrigemId: string
): Promise<Map<string, "relacionamento_ativo" | "relacionamento_historico">> {
  const mapa = new Map<string, "relacionamento_ativo" | "relacionamento_historico">();

  // Caso 1: origem é Cliente Cross → candidatos são as Partes que já se
  // candidataram a frentes dos projetos dela.
  const comoCliente = await client.query<{ parte_id: string; ativo: boolean }>(
    `SELECT DISTINCT cp.parte_id,
            (cp.data_saida IS NULL) AS ativo
       FROM cross_projects.candidatura_parceiro cp
       JOIN cross_projects.frente_oportunidade fo ON fo.id = cp.frente_oportunidade_id
       JOIN cross_projects.projeto pj            ON pj.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc    ON cc.id = pj.cliente_cross_id
      WHERE cc.parte_id = $1
        AND cp.arquivado_em IS NULL`,
    [parteOrigemId]
  );

  // Caso 2: origem é a Parte candidata → candidatos são os Clientes Cross em
  // cujos projetos ela apareceu.
  const comoParceiro = await client.query<{ parte_id: string; ativo: boolean }>(
    `SELECT DISTINCT cc.parte_id,
            (cp.data_saida IS NULL) AS ativo
       FROM cross_projects.candidatura_parceiro cp
       JOIN cross_projects.frente_oportunidade fo ON fo.id = cp.frente_oportunidade_id
       JOIN cross_projects.projeto pj            ON pj.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc    ON cc.id = pj.cliente_cross_id
      WHERE cp.parte_id = $1
        AND cp.arquivado_em IS NULL`,
    [parteOrigemId]
  );

  for (const r of [...comoCliente.rows, ...comoParceiro.rows]) {
    if (!r.parte_id) continue;
    // Ativo prevalece sobre histórico quando a mesma dupla aparece nos dois.
    if (r.ativo) mapa.set(r.parte_id, "relacionamento_ativo");
    else if (!mapa.has(r.parte_id)) mapa.set(r.parte_id, "relacionamento_historico");
  }
  return mapa;
}
