import { PoolClient } from "pg";
import { ALVOS_EVIDENCIA, AlvoEvidencia, CriarEvidenciaInput, CriarFonteInput, FiltroAuditoria } from "./governanca.schema";

type C = PoolClient;

// --- RF048 · Fontes ---------------------------------------------------------

export async function inserirFonte(c: C, i: CriarFonteInput) {
  const { rows } = await c.query(
    "INSERT INTO cross_governance.fonte (nome,tipo,url,descricao) VALUES ($1,$2,$3,$4) RETURNING id,nome,tipo,url,descricao,ativo",
    [i.nome, i.tipo ?? null, i.url ?? null, i.descricao ?? null]
  );
  return rows[0];
}
export async function listarFontes(c: C) {
  const { rows } = await c.query("SELECT id,nome,tipo,url,descricao,ativo FROM cross_governance.fonte WHERE ativo ORDER BY nome");
  return rows;
}
export async function existeFonte(c: C, id: string) {
  const r = await c.query("SELECT 1 FROM cross_governance.fonte WHERE id=$1", [id]);
  return r.rowCount !== 0;
}

// --- RF048 · Evidências -----------------------------------------------------

export async function inserirEvidencia(c: C, i: CriarEvidenciaInput, u: string | null) {
  const { rows } = await c.query(
    `INSERT INTO cross_governance.evidencia
       (fonte_id,documento_id,titulo,descricao,url,validade_inicio,validade_fim,nivel_confianca,validado_por_id,data_validacao,criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,CASE WHEN $9::uuid IS NULL THEN NULL ELSE NOW() END,$9::uuid)
     RETURNING id,fonte_id,documento_id,titulo,descricao,url,data_coleta,validade_inicio,validade_fim,
               nivel_confianca::float8 AS nivel_confianca,validado_por_id,status`,
    [i.fonte_id ?? null, i.documento_id ?? null, i.titulo, i.descricao ?? null, i.url ?? null, i.validade_inicio ?? null, i.validade_fim ?? null, i.nivel_confianca ?? null, u]
  );
  return rows[0];
}
export async function buscarEvidencia(c: C, id: string) {
  const { rows } = await c.query(
    `SELECT id,fonte_id,documento_id,titulo,descricao,url,data_coleta,validade_inicio,validade_fim,
            nivel_confianca::float8 AS nivel_confianca,validado_por_id,status
       FROM cross_governance.evidencia WHERE id=$1 AND arquivado_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}
export async function existeAlvo(c: C, alvo: AlvoEvidencia, id: string) {
  // O nome da tabela-alvo é derivado do mapa fechado ALVOS_EVIDENCIA (não do usuário).
  const alvos: Record<AlvoEvidencia, string> = {
    perfil_estrategico: "cross_intelligence.perfil_estrategico",
    analise_crossability: "cross_methodologies.analise_crossability",
    medicao_midia: "cross_intelligence.medicao_midia",
    big_moment: "cross_intelligence.big_moment",
    resultado: "cross_analytics.resultado",
    calculo_roi: "cross_analytics.calculo_roi",
  };
  const r = await c.query(`SELECT 1 FROM ${alvos[alvo]} WHERE id=$1`, [id]);
  return r.rowCount !== 0;
}
export async function vincularEvidencia(
  c: C,
  alvo: AlvoEvidencia,
  alvoId: string,
  evidenciaId: string,
  relevancia: string | null,
  observacoes: string | null
) {
  const { tabela, coluna } = ALVOS_EVIDENCIA[alvo];
  await c.query(
    `INSERT INTO cross_governance.${tabela} (${coluna},evidencia_id,relevancia,observacoes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (${coluna},evidencia_id) DO UPDATE SET relevancia=EXCLUDED.relevancia,observacoes=EXCLUDED.observacoes`,
    [alvoId, evidenciaId, relevancia, observacoes]
  );
}
export async function listarVinculosEvidencia(c: C, evidenciaId: string) {
  const partes: string[] = [];
  const params = [evidenciaId];
  for (const [tipo, { tabela, coluna }] of Object.entries(ALVOS_EVIDENCIA)) {
    partes.push(
      `SELECT '${tipo}' AS alvo_tipo, ${coluna} AS alvo_id, relevancia, observacoes FROM cross_governance.${tabela} WHERE evidencia_id=$1`
    );
  }
  const { rows } = await c.query(partes.join(" UNION ALL "), params);
  return rows;
}

// --- RF049 · Auditoria (somente leitura) ------------------------------------

export async function consultarAuditoria(c: C, f: FiltroAuditoria) {
  const cond: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    cond.push(sql.replace("$?", `$${params.length}`));
  };
  if (f.tabela) add("tabela_afetada = $?", f.tabela);
  if (f.schema) add("schema_afetado = $?", f.schema);
  if (f.registro_id) add("registro_id = $?", f.registro_id);
  if (f.usuario_id) add("usuario_id = $?", f.usuario_id);
  if (f.operacao) add("operacao = $?", f.operacao);
  if (f.de) add("executado_em >= $?", f.de);
  if (f.ate) add("executado_em <= $?", f.ate);
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  params.push(f.limite);
  const { rows } = await c.query(
    `SELECT id,usuario_id,schema_afetado,tabela_afetada,registro_id,operacao,origem,executado_em
       FROM cross_governance.auditoria ${where}
      ORDER BY executado_em DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// --- RF051 · Base de conhecimento (leitura estruturada e rastreável) --------

export async function baseConhecimentoParte(c: C, parteId: string) {
  const parte = await c.query(
    "SELECT id,tipo,nome_exibicao,criado_em FROM cross_core.parte WHERE id=$1 AND arquivado_em IS NULL",
    [parteId]
  );
  if (parte.rowCount === 0) return null;

  const perfil = await c.query(
    `SELECT numero_versao,resumo,posicionamento,objetivos,desafios,vigente_desde
       FROM cross_intelligence.perfil_estrategico
      WHERE parte_id=$1 AND status_versao='vigente' AND arquivado_em IS NULL`,
    [parteId]
  );
  const territorios = await c.query(
    `SELECT t.codigo,t.nome,pt.relevancia FROM cross_intelligence.parte_territorio pt
       JOIN cross_intelligence.territorio t ON t.id=pt.territorio_id
      WHERE pt.parte_id=$1 AND pt.arquivado_em IS NULL`,
    [parteId]
  );
  const publicos = await c.query(
    `SELECT p.nome,pp.relevancia FROM cross_intelligence.parte_publico pp
       JOIN cross_intelligence.publico p ON p.id=pp.publico_id
      WHERE pp.parte_id=$1 AND pp.arquivado_em IS NULL`,
    [parteId]
  );
  const ativos = await c.query(
    "SELECT nome,categoria,valor_referencia::float8 AS valor_referencia,moeda FROM cross_intelligence.ativo WHERE parte_id=$1 AND arquivado_em IS NULL",
    [parteId]
  );
  const midia = await c.query(
    `SELECT cm.plataforma,t.codigo AS metrica,m.valor::float8 AS valor,m.data_coleta,
            m.nivel_confianca::float8 AS nivel_confianca,m.fonte
       FROM cross_intelligence.medicao_midia m
       JOIN cross_intelligence.canal_midia cm ON cm.id=m.canal_midia_id
       JOIN cross_analytics.tipo_metrica t ON t.id=m.tipo_metrica_id
      WHERE cm.parte_id=$1 AND cm.arquivado_em IS NULL
      ORDER BY m.data_coleta DESC LIMIT 20`,
    [parteId]
  );
  return {
    parte: parte.rows[0],
    perfil_vigente: perfil.rows[0] ?? null,
    territorios: territorios.rows,
    publicos: publicos.rows,
    ativos: ativos.rows,
    midia_recente: midia.rows,
    // Rastreabilidade: todo dado vem da estrutura relacional oficial (RN039/RN036).
    proveniencia: "cross_platform.postgres",
  };
}
