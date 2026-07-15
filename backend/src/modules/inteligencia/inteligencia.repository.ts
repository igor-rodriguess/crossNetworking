import { PoolClient } from "pg";
import type {
  CriarAtivoInput,
  CriarBigMomentInput,
  CriarCanalInput,
  CriarDisponibilidadeInput,
  CriarEventoAgendaInput,
  CriarEventoTurneInput,
  CriarPerfilInput,
  CriarPracaInput,
  CriarPublicoInput,
  CriarRepresentacaoInput,
  CriarTerritorioInput,
  CriarTurneInput,
  RegistrarMedicaoMidiaInput,
  VincularPracaInput,
  VincularPublicoInput,
  VincularTerritorioInput,
} from "./inteligencia.schema";

type C = PoolClient;

export async function existeParte(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_core.parte WHERE id=$1 AND arquivado_em IS NULL", [id]);
  return r.rowCount !== 0;
}
export async function existePessoa(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_core.pessoa WHERE parte_id=$1", [id]);
  return r.rowCount !== 0;
}
export async function existeAtivo(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_intelligence.ativo WHERE id=$1 AND arquivado_em IS NULL", [id]);
  return r.rowCount !== 0;
}
export async function existeCanal(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_intelligence.canal_midia WHERE id=$1 AND arquivado_em IS NULL", [id]);
  return r.rowCount !== 0;
}
export async function existeTurne(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_intelligence.turne WHERE id=$1 AND arquivado_em IS NULL", [id]);
  return r.rowCount !== 0;
}
export async function resolverTipoMetrica(c: C, codigo: string) {
  const { rows } = await c.query("SELECT id FROM cross_analytics.tipo_metrica WHERE codigo=$1", [codigo]);
  return rows[0]?.id as string | undefined;
}
export async function resolverTipoDisponibilidade(c: C, codigo: string) {
  const { rows } = await c.query("SELECT id FROM cross_intelligence.tipo_disponibilidade WHERE codigo=$1", [codigo]);
  return rows[0]?.id as string | undefined;
}

// --- RF010 · Perfil estratégico versionado ---------------------------------

export async function inserirPerfil(c: C, parteId: string, i: CriarPerfilInput, u: string | null) {
  const { rows: p } = await c.query(
    "SELECT COALESCE(MAX(numero_versao),0)+1 AS n FROM cross_intelligence.perfil_estrategico WHERE parte_id=$1",
    [parteId]
  );
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.perfil_estrategico
       (parte_id,numero_versao,resumo,posicionamento,objetivos,desafios,criado_por_id,atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING id,parte_id,numero_versao,resumo,posicionamento,objetivos,desafios,status_versao,vigente_desde,criado_em`,
    [parteId, Number(p[0].n), i.resumo ?? null, i.posicionamento ?? null, i.objetivos ?? null, i.desafios ?? null, u]
  );
  return rows[0];
}
export async function buscarPerfil(c: C, id: string) {
  const { rows } = await c.query(
    `SELECT id,parte_id,numero_versao,resumo,posicionamento,objetivos,desafios,status_versao,vigente_desde,vigente_ate,criado_em
       FROM cross_intelligence.perfil_estrategico WHERE id=$1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}
export async function listarPerfis(c: C, parteId: string) {
  const { rows } = await c.query(
    `SELECT id,numero_versao,resumo,posicionamento,objetivos,desafios,status_versao,vigente_desde,vigente_ate,criado_em
       FROM cross_intelligence.perfil_estrategico WHERE parte_id=$1 AND arquivado_em IS NULL ORDER BY numero_versao DESC`,
    [parteId]
  );
  return rows;
}
export async function publicarPerfil(c: C, id: string, parteId: string) {
  await c.query(
    `UPDATE cross_intelligence.perfil_estrategico SET status_versao='substituida',vigente_ate=NOW()
      WHERE parte_id=$1 AND status_versao='vigente' AND arquivado_em IS NULL AND id<>$2`,
    [parteId, id]
  );
  const { rows } = await c.query(
    `UPDATE cross_intelligence.perfil_estrategico SET status_versao='vigente',vigente_desde=NOW(),vigente_ate=NULL
      WHERE id=$1 AND arquivado_em IS NULL RETURNING id,parte_id,numero_versao,status_versao,vigente_desde`,
    [id]
  );
  return rows[0] ?? null;
}

// --- RF011 · Catálogos ------------------------------------------------------

export async function inserirPublico(c: C, i: CriarPublicoInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.publico (nome,descricao,faixa_etaria) VALUES ($1,$2,$3) RETURNING id,nome,descricao,faixa_etaria,ativo",
    [i.nome, i.descricao ?? null, i.faixa_etaria ?? null]
  );
  return rows[0];
}
export async function listarPublicos(c: C) {
  const { rows } = await c.query("SELECT id,nome,descricao,faixa_etaria,ativo FROM cross_intelligence.publico WHERE ativo ORDER BY nome");
  return rows;
}
export async function inserirPraca(c: C, i: CriarPracaInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.praca (nome,uf,pais) VALUES ($1,$2,COALESCE($3,'Brasil')) RETURNING id,nome,uf,pais,ativo",
    [i.nome, i.uf ?? null, i.pais ?? null]
  );
  return rows[0];
}
export async function listarPracas(c: C) {
  const { rows } = await c.query("SELECT id,nome,uf,pais,ativo FROM cross_intelligence.praca WHERE ativo ORDER BY nome");
  return rows;
}
export async function inserirTerritorio(c: C, i: CriarTerritorioInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.territorio (codigo,nome,descricao) VALUES ($1,$2,$3) RETURNING id,codigo,nome,descricao,ativo",
    [i.codigo, i.nome, i.descricao ?? null]
  );
  return rows[0];
}
export async function listarTerritorios(c: C) {
  const { rows } = await c.query("SELECT id,codigo,nome,descricao,ativo FROM cross_intelligence.territorio WHERE ativo ORDER BY nome");
  return rows;
}

// --- RF011 · Associações ----------------------------------------------------

export async function vincularPublico(c: C, parteId: string, i: VincularPublicoInput) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.parte_publico (parte_id,publico_id,relevancia,vigente_desde,vigente_ate)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,parte_id,publico_id,relevancia,vigente_desde,vigente_ate`,
    [parteId, i.publico_id, i.relevancia ?? null, i.vigente_desde ?? null, i.vigente_ate ?? null]
  );
  return rows[0];
}
export async function vincularPraca(c: C, parteId: string, i: VincularPracaInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.parte_praca (parte_id,praca_id,relevancia) VALUES ($1,$2,$3) RETURNING id,parte_id,praca_id,relevancia",
    [parteId, i.praca_id, i.relevancia ?? null]
  );
  return rows[0];
}
export async function vincularTerritorio(c: C, parteId: string, i: VincularTerritorioInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.parte_territorio (parte_id,territorio_id,relevancia) VALUES ($1,$2,$3) RETURNING id,parte_id,territorio_id,relevancia",
    [parteId, i.territorio_id, i.relevancia ?? null]
  );
  return rows[0];
}
export async function associacoesDaParte(c: C, parteId: string) {
  const publicos = await c.query(
    `SELECT pp.id,pp.publico_id,p.nome,pp.relevancia,pp.vigente_desde,pp.vigente_ate
       FROM cross_intelligence.parte_publico pp JOIN cross_intelligence.publico p ON p.id=pp.publico_id
      WHERE pp.parte_id=$1 AND pp.arquivado_em IS NULL ORDER BY p.nome`,
    [parteId]
  );
  const pracas = await c.query(
    `SELECT pp.id,pp.praca_id,p.nome,p.uf,pp.relevancia
       FROM cross_intelligence.parte_praca pp JOIN cross_intelligence.praca p ON p.id=pp.praca_id
      WHERE pp.parte_id=$1 AND pp.arquivado_em IS NULL ORDER BY p.nome`,
    [parteId]
  );
  const territorios = await c.query(
    `SELECT pt.id,pt.territorio_id,t.codigo,t.nome,pt.relevancia
       FROM cross_intelligence.parte_territorio pt JOIN cross_intelligence.territorio t ON t.id=pt.territorio_id
      WHERE pt.parte_id=$1 AND pt.arquivado_em IS NULL ORDER BY t.nome`,
    [parteId]
  );
  return { publicos: publicos.rows, pracas: pracas.rows, territorios: territorios.rows };
}
export async function arquivarVinculo(c: C, tabela: string, parteId: string, alvoCol: string, alvoId: string) {
  const r = await c.query(
    `UPDATE cross_intelligence.${tabela} SET arquivado_em=NOW() WHERE parte_id=$1 AND ${alvoCol}=$2 AND arquivado_em IS NULL`,
    [parteId, alvoId]
  );
  return r.rowCount ?? 0;
}

// --- RF012 · Ativos ---------------------------------------------------------

export async function inserirAtivo(c: C, parteId: string, i: CriarAtivoInput, u: string | null) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.ativo (parte_id,nome,categoria,descricao,valor_referencia,moeda,criado_por_id,atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING id,parte_id,nome,categoria,descricao,valor_referencia::float8 AS valor_referencia,moeda,criado_em,xmin::text AS versao`,
    [parteId, i.nome, i.categoria ?? null, i.descricao ?? null, i.valor_referencia ?? null, i.moeda ?? null, u]
  );
  return rows[0];
}
export async function buscarAtivo(c: C, id: string) {
  const { rows } = await c.query(
    `SELECT id,parte_id,nome,categoria,descricao,valor_referencia::float8 AS valor_referencia,moeda,criado_em,xmin::text AS versao
       FROM cross_intelligence.ativo WHERE id=$1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}
export async function listarAtivos(c: C, parteId: string) {
  const { rows } = await c.query(
    `SELECT id,nome,categoria,descricao,valor_referencia::float8 AS valor_referencia,moeda,criado_em
       FROM cross_intelligence.ativo WHERE parte_id=$1 AND arquivado_em IS NULL ORDER BY nome`,
    [parteId]
  );
  return rows;
}
export async function atualizarAtivo(
  c: C,
  id: string,
  patch: Record<string, unknown>,
  versao: string,
  u: string | null
) {
  const params: unknown[] = [];
  const set: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    params.push(v);
    set.push(`${k}=$${params.length}`);
  }
  params.push(u);
  set.push(`atualizado_por_id=$${params.length}`, "atualizado_em=NOW()");
  params.push(id, versao);
  const r = await c.query(
    `UPDATE cross_intelligence.ativo SET ${set.join(",")}
      WHERE id=$${params.length - 1} AND xmin::text=$${params.length} AND arquivado_em IS NULL`,
    params
  );
  return r.rowCount ?? 0;
}

// --- RF013 · Canais de mídia e medições ------------------------------------

export async function inserirCanal(c: C, parteId: string, i: CriarCanalInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.canal_midia (parte_id,plataforma,identificador,url) VALUES ($1,$2,$3,$4) RETURNING id,parte_id,plataforma,identificador,url,criado_em",
    [parteId, i.plataforma, i.identificador ?? null, i.url ?? null]
  );
  return rows[0];
}
export async function listarCanais(c: C, parteId: string) {
  const { rows } = await c.query(
    "SELECT id,parte_id,plataforma,identificador,url,criado_em FROM cross_intelligence.canal_midia WHERE parte_id=$1 AND arquivado_em IS NULL ORDER BY plataforma",
    [parteId]
  );
  return rows;
}
export async function inserirMedicaoMidia(c: C, canalId: string, i: RegistrarMedicaoMidiaInput, tipoId: string, u: string | null) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.medicao_midia (canal_midia_id,tipo_metrica_id,valor,unidade,fonte,nivel_confianca,criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id,canal_midia_id,valor::float8 AS valor,unidade,fonte,nivel_confianca::float8 AS nivel_confianca,data_coleta`,
    [canalId, tipoId, i.valor, i.unidade ?? null, i.fonte ?? null, i.nivel_confianca ?? null, u]
  );
  return rows[0];
}
export async function listarMedicoesMidia(c: C, canalId: string) {
  const { rows } = await c.query(
    `SELECT m.id,m.canal_midia_id,t.codigo AS tipo_metrica,m.valor::float8 AS valor,m.unidade,m.fonte,
            m.nivel_confianca::float8 AS nivel_confianca,m.data_coleta
       FROM cross_intelligence.medicao_midia m JOIN cross_analytics.tipo_metrica t ON t.id=m.tipo_metrica_id
      WHERE m.canal_midia_id=$1 ORDER BY m.data_coleta DESC`,
    [canalId]
  );
  return rows;
}

// --- RF014 · Disponibilidade ------------------------------------------------

export async function inserirDisponibilidade(c: C, i: CriarDisponibilidadeInput, tipoId: string) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.disponibilidade
       (parte_id,ativo_id,tipo_disponibilidade_id,data_inicio,data_fim,motivo_indisponibilidade,observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id,parte_id,ativo_id,data_inicio,data_fim,motivo_indisponibilidade,observacoes,criado_em`,
    [i.parte_id ?? null, i.ativo_id ?? null, tipoId, i.data_inicio, i.data_fim, i.motivo_indisponibilidade ?? null, i.observacoes ?? null]
  );
  return rows[0];
}
export async function listarDisponibilidades(c: C, coluna: "parte_id" | "ativo_id", id: string) {
  const { rows } = await c.query(
    `SELECT d.id,d.parte_id,d.ativo_id,t.codigo AS tipo,d.data_inicio,d.data_fim,d.motivo_indisponibilidade,d.observacoes
       FROM cross_intelligence.disponibilidade d JOIN cross_intelligence.tipo_disponibilidade t ON t.id=d.tipo_disponibilidade_id
      WHERE d.${coluna}=$1 ORDER BY d.data_inicio DESC`,
    [id]
  );
  return rows;
}

// --- RF015 · Artistas -------------------------------------------------------

export async function inserirRepresentacao(c: C, pessoaId: string, i: CriarRepresentacaoInput) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.representacao_artistica (pessoa_id,representante_parte_id,tipo_representacao,vigente_desde,vigente_ate)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,pessoa_id,representante_parte_id,tipo_representacao,vigente_desde,vigente_ate`,
    [pessoaId, i.representante_parte_id, i.tipo_representacao, i.vigente_desde ?? null, i.vigente_ate ?? null]
  );
  return rows[0];
}
export async function listarRepresentacoes(c: C, pessoaId: string) {
  const { rows } = await c.query(
    "SELECT id,pessoa_id,representante_parte_id,tipo_representacao,vigente_desde,vigente_ate FROM cross_intelligence.representacao_artistica WHERE pessoa_id=$1 AND arquivado_em IS NULL ORDER BY vigente_desde DESC NULLS LAST",
    [pessoaId]
  );
  return rows;
}
export async function inserirTurne(c: C, pessoaId: string, i: CriarTurneInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.turne (pessoa_id,nome,descricao,data_inicio,data_fim) VALUES ($1,$2,$3,$4,$5) RETURNING id,pessoa_id,nome,descricao,data_inicio,data_fim,criado_em",
    [pessoaId, i.nome, i.descricao ?? null, i.data_inicio ?? null, i.data_fim ?? null]
  );
  return rows[0];
}
export async function listarTurnes(c: C, pessoaId: string) {
  const { rows } = await c.query(
    "SELECT id,pessoa_id,nome,descricao,data_inicio,data_fim,criado_em FROM cross_intelligence.turne WHERE pessoa_id=$1 AND arquivado_em IS NULL ORDER BY data_inicio DESC NULLS LAST",
    [pessoaId]
  );
  return rows;
}
export async function inserirEventoTurne(c: C, turneId: string, i: CriarEventoTurneInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.evento_turne (turne_id,nome,cidade,local,data_evento) VALUES ($1,$2,$3,$4,$5) RETURNING id,turne_id,nome,cidade,local,data_evento",
    [turneId, i.nome ?? null, i.cidade ?? null, i.local ?? null, i.data_evento]
  );
  return rows[0];
}
export async function listarEventosTurne(c: C, turneId: string) {
  const { rows } = await c.query(
    "SELECT id,turne_id,nome,cidade,local,data_evento FROM cross_intelligence.evento_turne WHERE turne_id=$1 ORDER BY data_evento",
    [turneId]
  );
  return rows;
}
export async function inserirBigMoment(c: C, pessoaId: string, i: CriarBigMomentInput, u: string | null) {
  const { rows } = await c.query(
    `INSERT INTO cross_intelligence.big_moment (pessoa_id,titulo,descricao,categoria,data_prevista,criado_por_id,atualizado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id,pessoa_id,titulo,descricao,categoria,data_prevista,criado_em`,
    [pessoaId, i.titulo, i.descricao ?? null, i.categoria ?? null, i.data_prevista ?? null, u]
  );
  return rows[0];
}
export async function listarBigMoments(c: C, pessoaId: string) {
  const { rows } = await c.query(
    "SELECT id,pessoa_id,titulo,descricao,categoria,data_prevista,criado_em FROM cross_intelligence.big_moment WHERE pessoa_id=$1 AND arquivado_em IS NULL ORDER BY data_prevista DESC NULLS LAST",
    [pessoaId]
  );
  return rows;
}
export async function inserirEventoAgenda(c: C, pessoaId: string, i: CriarEventoAgendaInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_intelligence.evento_agenda (pessoa_id,titulo,descricao,local,data_inicio,data_fim) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,pessoa_id,titulo,descricao,local,data_inicio,data_fim,criado_em",
    [pessoaId, i.titulo, i.descricao ?? null, i.local ?? null, i.data_inicio, i.data_fim ?? null]
  );
  return rows[0];
}
export async function listarAgenda(c: C, pessoaId: string) {
  const { rows } = await c.query(
    "SELECT id,pessoa_id,titulo,descricao,local,data_inicio,data_fim,criado_em FROM cross_intelligence.evento_agenda WHERE pessoa_id=$1 AND arquivado_em IS NULL ORDER BY data_inicio DESC",
    [pessoaId]
  );
  return rows;
}
