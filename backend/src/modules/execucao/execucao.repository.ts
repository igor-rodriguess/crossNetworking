import { PoolClient } from "pg";
import {
  AdicionarParticipanteInput,
  AtribuirResponsavelInput,
  AtualizarEntregaInput,
  AtualizarEtapaInput,
  AtualizarPendenciaInput,
  AtualizarReuniaoInput,
  CriarEntregaInput,
  CriarEtapaInput,
  CriarPendenciaInput,
  CriarPlanoInput,
  CriarReuniaoInput,
  CriarTouchpointInput,
} from "./execucao.schema";

export async function resolverCodigo(
  client: PoolClient,
  tabela: string,
  codigo: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM ${tabela} WHERE codigo = $1`,
    [codigo]
  );
  return rows[0]?.id ?? null;
}

function montarSet(campos: Record<string, unknown>, params: unknown[]): string[] {
  const set: string[] = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    params.push(valor);
    set.push(`${coluna} = $${params.length}`);
  }
  return set;
}

export async function existeParceria(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT 1 FROM cross_partnerships.parceria WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return rows.length > 0;
}

// --- Plano de execução (RF038 — RN029) -------------------------------------

export async function inserirPlano(
  client: PoolClient,
  parceriaId: string,
  input: CriarPlanoInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows: prox } = await client.query<{ proxima: number }>(
    `SELECT COALESCE(MAX(numero_versao), 0) + 1 AS proxima
       FROM cross_execution.plano_execucao WHERE parceria_id = $1`,
    [parceriaId]
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.plano_execucao
       (parceria_id, numero_versao, nome, descricao, status_execucao_id,
        criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     RETURNING id`,
    [
      parceriaId,
      Number(prox[0].proxima),
      input.nome ?? null,
      input.descricao ?? null,
      statusId,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_PLANO = `
  SELECT p.id, p.parceria_id, p.numero_versao, p.nome, p.descricao,
         s.codigo AS status, p.status_versao, p.vigente_desde, p.vigente_ate,
         p.criado_em, p.xmin::text AS versao
    FROM cross_execution.plano_execucao p
    JOIN cross_execution.status_execucao s ON s.id = p.status_execucao_id
   WHERE p.arquivado_em IS NULL`;

export async function buscarPlano(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_PLANO} AND p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarPlanos(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `${SELECT_PLANO} AND p.parceria_id = $1 ORDER BY p.numero_versao DESC`,
    [parceriaId]
  );
  return rows;
}

/** Uma única versão vigente por parceria (RN029 / uq_plano_execucao_vigente). */
export async function publicarPlano(client: PoolClient, planoId: string, parceriaId: string) {
  await client.query(
    `UPDATE cross_execution.plano_execucao
        SET status_versao = 'substituida', vigente_ate = NOW()
      WHERE parceria_id = $1 AND status_versao = 'vigente' AND arquivado_em IS NULL AND id <> $2`,
    [parceriaId, planoId]
  );
  const { rows } = await client.query(
    `UPDATE cross_execution.plano_execucao
        SET status_versao = 'vigente', vigente_desde = NOW(), vigente_ate = NULL
      WHERE id = $1 AND arquivado_em IS NULL
      RETURNING id, parceria_id, numero_versao, status_versao, vigente_desde`,
    [planoId]
  );
  return rows[0] ?? null;
}

// --- Etapa (RF039) ----------------------------------------------------------

export async function inserirEtapa(
  client: PoolClient,
  planoId: string,
  input: CriarEtapaInput,
  statusId: string
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.etapa_execucao
       (plano_execucao_id, nome, descricao, ordem, data_inicio_prevista,
        data_fim_prevista, status_execucao_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      planoId,
      input.nome,
      input.descricao ?? null,
      input.ordem,
      input.data_inicio_prevista ?? null,
      input.data_fim_prevista ?? null,
      statusId,
    ]
  );
  return rows[0].id;
}

const SELECT_ETAPA = `
  SELECT e.id, e.plano_execucao_id, e.nome, e.descricao, e.ordem,
         e.data_inicio_prevista, e.data_fim_prevista, s.codigo AS status,
         e.criado_em, e.xmin::text AS versao
    FROM cross_execution.etapa_execucao e
    JOIN cross_execution.status_execucao s ON s.id = e.status_execucao_id
   WHERE e.arquivado_em IS NULL`;

export async function buscarEtapa(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_ETAPA} AND e.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarEtapas(client: PoolClient, planoId: string) {
  const { rows } = await client.query(
    `${SELECT_ETAPA} AND e.plano_execucao_id = $1 ORDER BY e.ordem`,
    [planoId]
  );
  return rows;
}

export async function atualizarEtapa(
  client: PoolClient,
  id: string,
  patch: AtualizarEtapaInput & { status_execucao_id?: string },
  versao: string
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      nome: patch.nome,
      descricao: patch.descricao,
      ordem: patch.ordem,
      data_inicio_prevista: patch.data_inicio_prevista,
      data_fim_prevista: patch.data_fim_prevista,
      status_execucao_id: patch.status_execucao_id,
    },
    params
  );
  set.push("atualizado_em = NOW()");
  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_execution.etapa_execucao
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

export async function arquivarEtapa(client: PoolClient, id: string): Promise<number> {
  const res = await client.query(
    "UPDATE cross_execution.etapa_execucao SET arquivado_em = NOW() WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return res.rowCount ?? 0;
}

// --- Entrega (RF040) --------------------------------------------------------

export async function inserirEntrega(
  client: PoolClient,
  etapaId: string,
  input: CriarEntregaInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.entrega
       (etapa_execucao_id, nome, descricao, data_prevista, data_entrega,
        status_entrega_id, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING id`,
    [
      etapaId,
      input.nome,
      input.descricao ?? null,
      input.data_prevista ?? null,
      input.data_entrega ?? null,
      statusId,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_ENTREGA = `
  SELECT e.id, e.etapa_execucao_id, e.nome, e.descricao, e.data_prevista,
         e.data_entrega, s.codigo AS status, e.criado_em, e.xmin::text AS versao
    FROM cross_execution.entrega e
    JOIN cross_execution.status_entrega s ON s.id = e.status_entrega_id
   WHERE e.arquivado_em IS NULL`;

export async function buscarEntrega(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_ENTREGA} AND e.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarEntregas(client: PoolClient, etapaId: string) {
  const { rows } = await client.query(
    `${SELECT_ENTREGA} AND e.etapa_execucao_id = $1 ORDER BY e.data_prevista NULLS LAST, e.criado_em`,
    [etapaId]
  );
  return rows;
}

export async function atualizarEntrega(
  client: PoolClient,
  id: string,
  patch: AtualizarEntregaInput & { status_entrega_id?: string },
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      nome: patch.nome,
      descricao: patch.descricao,
      data_prevista: patch.data_prevista,
      data_entrega: patch.data_entrega,
      status_entrega_id: patch.status_entrega_id,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");
  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_execution.entrega
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

export async function atribuirResponsavel(
  client: PoolClient,
  entregaId: string,
  input: AtribuirResponsavelInput
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.entrega_responsavel
       (entrega_id, usuario_interno_id, parte_id, funcao, inicio, fim)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      entregaId,
      input.usuario_interno_id ?? null,
      input.parte_id ?? null,
      input.funcao ?? null,
      input.inicio ?? null,
      input.fim ?? null,
    ]
  );
  return rows[0].id;
}

export async function listarResponsaveis(client: PoolClient, entregaId: string) {
  const { rows } = await client.query(
    `SELECT id, entrega_id, usuario_interno_id, parte_id, funcao, inicio, fim
       FROM cross_execution.entrega_responsavel
      WHERE entrega_id = $1 AND arquivado_em IS NULL
      ORDER BY inicio NULLS LAST`,
    [entregaId]
  );
  return rows;
}

export async function removerResponsavel(client: PoolClient, id: string): Promise<number> {
  const res = await client.query(
    "UPDATE cross_execution.entrega_responsavel SET arquivado_em = NOW() WHERE id = $1 AND arquivado_em IS NULL",
    [id]
  );
  return res.rowCount ?? 0;
}

// --- Reunião, participantes e touchpoint (RF041) ---------------------------

export async function inserirReuniao(
  client: PoolClient,
  parceriaId: string,
  input: CriarReuniaoInput,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.reuniao
       (parceria_id, titulo, data_reuniao, local, resumo, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     RETURNING id`,
    [parceriaId, input.titulo, input.data_reuniao, input.local ?? null, input.resumo ?? null, usuarioId]
  );
  return rows[0].id;
}

const SELECT_REUNIAO = `
  SELECT id, parceria_id, candidatura_parceiro_id, projeto_id, tipo, status,
         titulo, data_reuniao, local, resumo, criado_em,
         xmin::text AS versao
    FROM cross_execution.reuniao
   WHERE arquivado_em IS NULL`;

export async function buscarReuniao(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_REUNIAO} AND id = $1`, [id]);
  if (!rows[0]) return null;
  return { ...rows[0], participantes: await listarParticipantes(client, id) };
}

export async function listarReunioes(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `${SELECT_REUNIAO} AND parceria_id = $1 ORDER BY data_reuniao DESC`,
    [parceriaId]
  );
  return rows;
}

// --- Reunião com contexto flexível (DOMAIN-01) -------------------------------
//
// A reunião deixou de exigir parceria: ela costuma acontecer ANTES de existir
// parceria, e é justamente ela que decide se vai existir. Parceria, oportunidade
// e projeto entram como contexto opcional.

export interface ContextoReuniao {
  parceriaId?: string | null;
  candidaturaParceiroId?: string | null;
  projetoId?: string | null;
  tipo?: string;
  status?: string;
}

/**
 * Insere reunião com contexto opcional.
 *
 * Convive com `inserirReuniao`, que continua servindo a rota legada de
 * parceria — remover aquele caminho quebraria clientes existentes sem
 * necessidade.
 */
export async function inserirReuniaoComContexto(
  client: PoolClient,
  input: CriarReuniaoInput,
  contexto: ContextoReuniao,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.reuniao
       (parceria_id, candidatura_parceiro_id, projeto_id, tipo, status,
        titulo, data_reuniao, local, resumo, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
     RETURNING id`,
    [
      contexto.parceriaId ?? null,
      contexto.candidaturaParceiroId ?? null,
      contexto.projetoId ?? null,
      contexto.tipo ?? "reuniao",
      contexto.status ?? "planejada",
      input.titulo,
      input.data_reuniao,
      input.local ?? null,
      input.resumo ?? null,
      usuarioId,
    ]
  );
  return rows[0].id;
}

/**
 * Reuniões de uma Parte, por participação.
 *
 * Responde "quais reuniões conhecemos sobre esta Parte?" — pergunta que o
 * Meeting Intelligence fará. Passa por `reuniao_participante`, porque é lá que
 * a relação com Parte realmente vive.
 */
export async function listarReunioesPorParte(client: PoolClient, parteId: string) {
  const { rows } = await client.query(
    `${SELECT_REUNIAO}
       AND id IN (
         SELECT reuniao_id FROM cross_execution.reuniao_participante
          WHERE parte_id = $1
       )
     ORDER BY data_reuniao DESC`,
    [parteId]
  );
  return rows;
}

/** Reuniões ligadas a uma oportunidade (candidatura). */
export async function listarReunioesPorCandidatura(client: PoolClient, candidaturaId: string) {
  const { rows } = await client.query(
    `${SELECT_REUNIAO} AND candidatura_parceiro_id = $1 ORDER BY data_reuniao DESC`,
    [candidaturaId]
  );
  return rows;
}

/** Reuniões ligadas a um projeto. */
export async function listarReunioesPorProjeto(client: PoolClient, projetoId: string) {
  const { rows } = await client.query(
    `${SELECT_REUNIAO} AND projeto_id = $1 ORDER BY data_reuniao DESC`,
    [projetoId]
  );
  return rows;
}

export async function atualizarReuniao(
  client: PoolClient,
  id: string,
  patch: AtualizarReuniaoInput,
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      titulo: patch.titulo,
      data_reuniao: patch.data_reuniao,
      local: patch.local,
      resumo: patch.resumo,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");
  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_execution.reuniao
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}

export async function adicionarParticipante(
  client: PoolClient,
  reuniaoId: string,
  input: AdicionarParticipanteInput
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.reuniao_participante
       (reuniao_id, usuario_interno_id, parte_id, papel)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [reuniaoId, input.usuario_interno_id ?? null, input.parte_id ?? null, input.papel ?? null]
  );
  return rows[0].id;
}

export async function listarParticipantes(client: PoolClient, reuniaoId: string) {
  const { rows } = await client.query(
    `SELECT id, reuniao_id, usuario_interno_id, parte_id, papel
       FROM cross_execution.reuniao_participante
      WHERE reuniao_id = $1`,
    [reuniaoId]
  );
  return rows;
}

export async function removerParticipante(client: PoolClient, id: string): Promise<number> {
  const res = await client.query(
    "DELETE FROM cross_execution.reuniao_participante WHERE id = $1",
    [id]
  );
  return res.rowCount ?? 0;
}

export async function inserirTouchpoint(
  client: PoolClient,
  parceriaId: string,
  input: CriarTouchpointInput,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.touchpoint
       (parceria_id, tipo, descricao, data_touchpoint, responsavel_id, criado_por_id)
     VALUES ($1,$2,$3,COALESCE($4::timestamptz, NOW()),$5,$5)
     RETURNING id`,
    [parceriaId, input.tipo ?? null, input.descricao, input.data_touchpoint ?? null, usuarioId]
  );
  return rows[0].id;
}

export async function listarTouchpoints(client: PoolClient, parceriaId: string) {
  const { rows } = await client.query(
    `SELECT id, parceria_id, tipo, descricao, data_touchpoint, responsavel_id, criado_em
       FROM cross_execution.touchpoint
      WHERE parceria_id = $1
      ORDER BY data_touchpoint DESC`,
    [parceriaId]
  );
  return rows;
}

// --- Pendência (RF042) ------------------------------------------------------

export async function inserirPendencia(
  client: PoolClient,
  parceriaId: string,
  input: CriarPendenciaInput,
  statusId: string,
  usuarioId: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_execution.pendencia
       (parceria_id, etapa_execucao_id, entrega_id, descricao, status_pendencia_id,
        prazo, responsavel_id, criado_por_id, atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
     RETURNING id`,
    [
      parceriaId,
      input.etapa_execucao_id ?? null,
      input.entrega_id ?? null,
      input.descricao,
      statusId,
      input.prazo ?? null,
      usuarioId,
    ]
  );
  return rows[0].id;
}

const SELECT_PENDENCIA = `
  SELECT p.id, p.parceria_id, p.etapa_execucao_id, p.entrega_id, p.descricao,
         s.codigo AS status, p.prazo, p.responsavel_id, p.criado_em,
         p.xmin::text AS versao
    FROM cross_execution.pendencia p
    JOIN cross_execution.status_pendencia s ON s.id = p.status_pendencia_id
   WHERE p.arquivado_em IS NULL`;

export async function buscarPendencia(client: PoolClient, id: string) {
  const { rows } = await client.query(`${SELECT_PENDENCIA} AND p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listarPendencias(
  client: PoolClient,
  parceriaId: string,
  status?: string
) {
  const params: unknown[] = [parceriaId];
  let filtro = "";
  if (status) {
    params.push(status);
    filtro = ` AND s.codigo = $${params.length}`;
  }
  const { rows } = await client.query(
    `${SELECT_PENDENCIA} AND p.parceria_id = $1${filtro} ORDER BY p.prazo NULLS LAST, p.criado_em`,
    params
  );
  return rows;
}

export async function atualizarPendencia(
  client: PoolClient,
  id: string,
  patch: AtualizarPendenciaInput & { status_pendencia_id?: string },
  versao: string,
  usuarioId: string | null
): Promise<number> {
  const params: unknown[] = [];
  const set = montarSet(
    {
      descricao: patch.descricao,
      status_pendencia_id: patch.status_pendencia_id,
      prazo: patch.prazo,
    },
    params
  );
  params.push(usuarioId);
  set.push(`atualizado_por_id = $${params.length}`, "atualizado_em = NOW()");
  params.push(id, versao);
  const res = await client.query(
    `UPDATE cross_execution.pendencia
        SET ${set.join(", ")}
      WHERE id = $${params.length - 1} AND xmin::text = $${params.length}
        AND arquivado_em IS NULL`,
    params
  );
  return res.rowCount ?? 0;
}
