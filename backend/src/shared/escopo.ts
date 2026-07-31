import type { PoolClient } from "pg";

/**
 * Escopo de acesso por cliente (migration 052).
 *
 * A autorização por persona (authz.ts) responde "o que esta pessoa pode fazer".
 * Este módulo responde a outra pergunta, que faltava: "quais contas esta pessoa
 * pode ver". Sem ela, qualquer usuário autenticado enxergava os dados de todos
 * os clientes — inofensivo com uma conta em operação, vazamento entre clientes
 * no dia em que houver duas.
 *
 * Regra: o escopo restrito é OPT-IN. Um usuário sem vínculos declarados em
 * `usuario_cliente_escopo` continua vendo tudo (equipe interna da Cross); a
 * restrição só passa a valer quando alguém declara os clientes daquele usuário.
 * Assim o enforcement entra sem quebrar quem já usa a plataforma.
 */

/**
 * Clientes que o usuário pode acessar.
 *
 * `null` significa "sem restrição" — e é diferente de lista vazia, que
 * significaria "nenhum cliente". Quem consome precisa tratar os dois casos:
 * ignorar o filtro quando `null`, aplicar `IN (...)` quando houver lista.
 */
export async function clientesDoUsuario(
  client: PoolClient,
  usuarioId: string | null
): Promise<string[] | null> {
  if (!usuarioId) return null;

  const { rows } = await client.query<{ cliente_cross_id: string }>(
    `SELECT cliente_cross_id
       FROM cross_core.usuario_cliente_escopo
      WHERE usuario_interno_id = $1 AND revogado_em IS NULL`,
    [usuarioId]
  );

  return rows.length === 0 ? null : rows.map((r) => r.cliente_cross_id);
}

/**
 * O usuário pode acessar esta conta? Delega à função do banco para manter uma
 * única definição da regra — a mesma que as políticas de RLS usarão quando
 * forem habilitadas.
 */
export async function podeVerCliente(
  client: PoolClient,
  usuarioId: string | null,
  clienteCrossId: string
): Promise<boolean> {
  const { rows } = await client.query<{ pode: boolean }>(
    "SELECT cross_core.usuario_pode_ver_cliente($1, $2) AS pode",
    [usuarioId, clienteCrossId]
  );
  return rows[0]?.pode ?? false;
}

/**
 * Cláusula SQL que restringe uma consulta aos clientes do usuário.
 *
 * Devolve `{ sql: "", params: [] }` quando não há restrição, para que o
 * chamador possa concatenar sem ramificar. O parâmetro é sempre um array de
 * UUIDs passado como `= ANY($n)` — nunca interpolação de string.
 *
 * @param coluna  expressão SQL que produz o cliente_cross_id na consulta
 * @param proximoParam  índice do próximo placeholder ($1, $2, ...)
 */
export function filtroDeCliente(
  clientes: string[] | null,
  coluna: string,
  proximoParam: number
): { sql: string; params: string[][] } {
  if (clientes === null) return { sql: "", params: [] };
  return { sql: ` AND ${coluna} = ANY($${proximoParam})`, params: [clientes] };
}
