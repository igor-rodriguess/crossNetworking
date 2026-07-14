import { PoolClient } from "pg";
import { CriarOrganizacaoInput, CriarPessoaInput } from "./partes.schema";

export async function resolverStatusParteId(
  client: PoolClient,
  codigo: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM cross_core.status_parte WHERE codigo = $1",
    [codigo]
  );
  return rows[0]?.id ?? null;
}

export async function inserirParte(
  client: PoolClient,
  data: { tipo: string; nome_exibicao: string; status_parte_id: string; criado_por_id: string | null }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id, criado_por_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.tipo, data.nome_exibicao, data.status_parte_id, data.criado_por_id]
  );
  return rows[0].id;
}

export async function inserirOrganizacao(
  client: PoolClient,
  parteId: string,
  org: CriarOrganizacaoInput["organizacao"]
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.organizacao
       (parte_id, nome_fantasia, razao_social, cnpj, segmento_principal, site)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [parteId, org.nome_fantasia, org.razao_social ?? null, org.cnpj ?? null, org.segmento_principal ?? null, org.site ?? null]
  );
}

export async function inserirPessoa(
  client: PoolClient,
  parteId: string,
  p: CriarPessoaInput["pessoa"]
): Promise<void> {
  await client.query(
    `INSERT INTO cross_core.pessoa
       (parte_id, nome_completo, nome_artistico, cpf, nacionalidade)
     VALUES ($1, $2, $3, $4, $5)`,
    [parteId, p.nome_completo, p.nome_artistico ?? null, p.cpf ?? null, p.nacionalidade ?? null]
  );
}

export interface ParteRow {
  id: string;
  tipo: "organizacao" | "pessoa";
  nome_exibicao: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  versao: string; // xmin — token de concorrência otimista
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  segmento_principal: string | null;
  site: string | null;
  nome_completo: string | null;
  nome_artistico: string | null;
  cpf: string | null;
  nacionalidade: string | null;
}

export async function buscarPorId(client: PoolClient, id: string): Promise<ParteRow | null> {
  const { rows } = await client.query<ParteRow>(
    `SELECT p.id, p.tipo, p.nome_exibicao, sp.codigo AS status,
            p.criado_em, p.atualizado_em, p.xmin::text AS versao,
            o.nome_fantasia, o.razao_social, o.cnpj, o.segmento_principal, o.site,
            pe.nome_completo, pe.nome_artistico, pe.cpf, pe.nacionalidade
       FROM cross_core.parte p
       JOIN cross_core.status_parte sp ON sp.id = p.status_parte_id
       LEFT JOIN cross_core.organizacao o ON o.parte_id = p.id
       LEFT JOIN cross_core.pessoa pe ON pe.parte_id = p.id
      WHERE p.id = $1 AND p.arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export interface ParteListaRow {
  id: string;
  tipo: string;
  nome_exibicao: string;
  status: string;
  criado_em: string;
  total: string;
}

export async function listarPartes(
  client: PoolClient,
  filtros: { busca: string | null; tipo: string | null; limit: number; offset: number }
): Promise<{ itens: Omit<ParteListaRow, "total">[]; total: number }> {
  const { rows } = await client.query<ParteListaRow>(
    `SELECT p.id, p.tipo, p.nome_exibicao, sp.codigo AS status, p.criado_em,
            count(*) OVER() AS total
       FROM cross_core.parte p
       JOIN cross_core.status_parte sp ON sp.id = p.status_parte_id
      WHERE p.arquivado_em IS NULL
        AND ($1::text IS NULL OR p.nome_exibicao ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR p.tipo::text = $2)
      ORDER BY p.criado_em DESC
      LIMIT $3 OFFSET $4`,
    [filtros.busca, filtros.tipo, filtros.limit, filtros.offset]
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const itens = rows.map(({ total: _t, ...r }) => r);
  return { itens, total };
}

/** Atualiza campos base da Parte com trava otimista (xmin). Retorna linhas afetadas. */
export async function atualizarParteBase(
  client: PoolClient,
  id: string,
  patch: { nome_exibicao?: string; status_parte_id?: string },
  versaoEsperada: string
): Promise<number> {
  const res = await client.query(
    `UPDATE cross_core.parte
        SET nome_exibicao = COALESCE($2, nome_exibicao),
            status_parte_id = COALESCE($3, status_parte_id)
      WHERE id = $1 AND arquivado_em IS NULL AND xmin::text = $4`,
    [id, patch.nome_exibicao ?? null, patch.status_parte_id ?? null, versaoEsperada]
  );
  return res.rowCount ?? 0;
}

export async function existeParteAtiva(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_core.parte WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}
