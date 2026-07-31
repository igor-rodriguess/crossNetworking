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

export interface ExecucaoCompleta {
  id: string;
  agente: string;
  status: string;
  saida: unknown;
}

export interface OportunidadeIaInsert {
  execucaoPipelineId?: string | null;
  pipeline: "partner_discovery" | "market_intelligence";
  clienteNome: string;
  objetivo: string;
  parceiroNome: string;
  perfilParceiro?: unknown;
  analise: unknown;
  scoreFit: number;
  confianca: number;
  fontes: unknown[];
  briefing: unknown;
  projetoId?: string | null;
  frenteId?: string | null;
  criadoPorId?: string | null;
}

export interface OportunidadeIaRow {
  id: string;
  execucao_pipeline_id: string | null;
  pipeline: "partner_discovery" | "market_intelligence";
  cliente_nome: string;
  objetivo: string;
  parceiro_nome: string;
  perfil_parceiro: unknown | null;
  analise: unknown;
  score_fit: number;
  confianca: number;
  fontes: unknown[];
  briefing: unknown;
  status: "rascunho" | "em_curadoria" | "aprovada" | "descartada";
  projeto_id: string | null;
  frente_id: string | null;
  criado_em: string;
}

/** Persiste um rascunho de oportunidade sem promover nenhum dado de domínio. */
export async function inserirOportunidadeIa(client: PoolClient, dados: OportunidadeIaInsert): Promise<OportunidadeIaRow> {
  const { rows } = await client.query<OportunidadeIaRow>(
    `INSERT INTO cross_ai.oportunidade_ia
       (execucao_pipeline_id, pipeline, cliente_nome, objetivo, parceiro_nome,
        perfil_parceiro, analise, score_fit, confianca, fontes, briefing,
        projeto_id, frente_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id,execucao_pipeline_id,pipeline,cliente_nome,objetivo,parceiro_nome,
               perfil_parceiro,analise,score_fit,confianca,fontes,briefing,status,
               projeto_id,frente_id,criado_em`,
    [
      dados.execucaoPipelineId ?? null,
      dados.pipeline,
      dados.clienteNome,
      dados.objetivo,
      dados.parceiroNome,
      dados.perfilParceiro === undefined ? null : JSON.stringify(dados.perfilParceiro),
      JSON.stringify(dados.analise),
      dados.scoreFit,
      dados.confianca,
      JSON.stringify(dados.fontes),
      JSON.stringify(dados.briefing),
      dados.projetoId ?? null,
      dados.frenteId ?? null,
      dados.criadoPorId ?? null,
    ]
  );
  return rows[0];
}

/** Lista os rascunhos mais recentes exibidos na central de oportunidades. */
export async function listarOportunidadesIa(
  client: PoolClient,
  filtros: { cliente?: string; limit: number; offset: number }
): Promise<{ itens: OportunidadeIaRow[]; total: number }> {
  const { rows } = await client.query<OportunidadeIaRow & { total: string }>(
    `SELECT id,execucao_pipeline_id,pipeline,cliente_nome,objetivo,parceiro_nome,
            perfil_parceiro,analise,score_fit,confianca,fontes,briefing,status,
            projeto_id,frente_id,criado_em,count(*) OVER() AS total
       FROM cross_ai.oportunidade_ia
      WHERE status <> 'descartada'
        AND ($1::text IS NULL OR cliente_nome ILIKE '%' || $1 || '%')
      ORDER BY criado_em DESC
      LIMIT $2 OFFSET $3`,
    [filtros.cliente ?? null, filtros.limit, filtros.offset]
  );
  return {
    itens: rows.map(({ total: _total, ...item }) => item),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

/** Busca uma execução por id (para o Human Gate curar sua saída). */
export async function buscarExecucao(client: PoolClient, id: string): Promise<ExecucaoCompleta | null> {
  const { rows } = await client.query<ExecucaoCompleta>(
    `SELECT id, agente::text AS agente, status::text AS status, saida
       FROM cross_ai.execucao_agente WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
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

export async function existePartePorNomeExato(client: PoolClient, nome: string): Promise<boolean> {
  const { rows } = await client.query<{ existe: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM cross_core.parte
        WHERE arquivado_em IS NULL AND lower(trim(nome_exibicao)) = lower(trim($1))
     ) AS existe`,
    [nome]
  );
  return rows[0]?.existe ?? false;
}

export async function buscarClienteIdPorNomeExato(client: PoolClient, nome: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT cc.id
       FROM cross_commercial.cliente_cross cc
       JOIN cross_core.parte p ON p.id = cc.parte_id
      WHERE cc.arquivado_em IS NULL
        AND p.arquivado_em IS NULL
        AND lower(trim(p.nome_exibicao)) = lower(trim($1))
      ORDER BY cc.criado_em DESC
      LIMIT 1`,
    [nome]
  );
  return rows[0]?.id ?? null;
}

export interface CandidatoBaseParaSugestao {
  parceiro_id: string;
  parceiro_nome: string;
  segmento: string | null;
  projeto_id: string;
  projeto_nome: string;
  frente_id: string;
  frente_nome: string;
  observacoes: string | null;
}

export interface FrenteParaDescoberta {
  frente_id: string;
  frente_nome: string;
  categoria: string | null;
  objetivo: string;
}

/** Contexto estratégico para pesquisar o mercado, não uma lista de resultados. */
export async function listarFrentesParaDescoberta(
  client: PoolClient,
  clienteNome: string,
  projetoId: string | null,
  frenteId: string | null = null,
): Promise<FrenteParaDescoberta[]> {
  const { rows } = await client.query<FrenteParaDescoberta>(
    `SELECT fo.id AS frente_id,
            fo.nome AS frente_nome,
            fo.categoria,
            fo.objetivo
       FROM cross_projects.frente_oportunidade fo
       JOIN cross_projects.projeto pr ON pr.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
       JOIN cross_core.parte cliente ON cliente.id = cc.parte_id
      WHERE cliente.arquivado_em IS NULL
        AND cc.arquivado_em IS NULL
        AND pr.arquivado_em IS NULL
        AND fo.arquivado_em IS NULL
        AND lower(trim(cliente.nome_exibicao)) = lower(trim($1))
        AND ($2::uuid IS NULL OR pr.id = $2)
        AND ($3::uuid IS NULL OR fo.id = $3)
      ORDER BY pr.nome, fo.nome`,
    [clienteNome, projetoId, frenteId],
  );
  return rows;
}

/** Marcas já candidatas não são "novas oportunidades" e devem ser excluídas. */
export async function listarParceirosJaMapeadosNoFunil(
  client: PoolClient,
  clienteNome: string,
): Promise<string[]> {
  const { rows } = await client.query<{ parceiro_nome: string }>(
    `SELECT DISTINCT lower(trim(p.nome_exibicao)) AS parceiro_nome
       FROM cross_projects.candidatura_parceiro cp
       JOIN cross_projects.frente_oportunidade fo ON fo.id = cp.frente_oportunidade_id
       JOIN cross_projects.projeto pr ON pr.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
       JOIN cross_core.parte cliente ON cliente.id = cc.parte_id
       JOIN cross_core.parte p ON p.id = cp.parte_id
      WHERE cliente.arquivado_em IS NULL
        AND cc.arquivado_em IS NULL
        AND pr.arquivado_em IS NULL
        AND fo.arquivado_em IS NULL
        AND cp.arquivado_em IS NULL
        AND p.arquivado_em IS NULL
        AND lower(trim(cliente.nome_exibicao)) = lower(trim($1))`,
    [clienteNome],
  );
  return rows.map((row) => row.parceiro_nome);
}

/**
 * Retorna candidatos que já estão no funil do cliente. A Central de IA parte
 * dessa evidência operacional antes de tentar inventar nomes a partir da web.
 */
export async function listarCandidatosDaBaseParaSugestao(
  client: PoolClient,
  clienteNome: string,
  projetoId: string | null,
  limite: number,
): Promise<CandidatoBaseParaSugestao[]> {
  const { rows } = await client.query<CandidatoBaseParaSugestao>(
    `SELECT p.id AS parceiro_id,
            p.nome_exibicao AS parceiro_nome,
            o.segmento_principal AS segmento,
            pr.id AS projeto_id,
            pr.nome AS projeto_nome,
            fo.id AS frente_id,
            fo.nome AS frente_nome,
            cp.observacoes
       FROM cross_projects.candidatura_parceiro cp
       JOIN cross_projects.frente_oportunidade fo ON fo.id = cp.frente_oportunidade_id
       JOIN cross_projects.projeto pr ON pr.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
       JOIN cross_core.parte cliente ON cliente.id = cc.parte_id
       JOIN cross_core.parte p ON p.id = cp.parte_id
       LEFT JOIN cross_core.organizacao o ON o.parte_id = p.id
      WHERE cliente.arquivado_em IS NULL
        AND cc.arquivado_em IS NULL
        AND pr.arquivado_em IS NULL
        AND fo.arquivado_em IS NULL
        AND cp.arquivado_em IS NULL
        AND p.arquivado_em IS NULL
        AND lower(trim(cliente.nome_exibicao)) = lower(trim($1))
        AND ($2::uuid IS NULL OR pr.id = $2)
        AND coalesce(cp.observacoes, '') NOT ILIKE '%Status de origem: DECLINADO%'
        AND coalesce(cp.observacoes, '') NOT ILIKE '%Status de origem: STAND BY%'
      ORDER BY CASE
          WHEN cp.observacoes ILIKE '%Status de origem: EM NEGOCIAÇÃO%' THEN 0
          WHEN cp.observacoes ILIKE '%Status de origem: FRENTE ABERTA%' THEN 1
          WHEN cp.observacoes ILIKE '%Status de origem: ABRIR FRENTE%' THEN 2
          WHEN cp.observacoes ILIKE '%Status de origem: VALIDAR%' THEN 3
          WHEN cp.observacoes ILIKE '%Status de origem: SEM RETORNO%' THEN 4
          ELSE 5
        END,
        pr.nome, fo.nome, p.nome_exibicao
      LIMIT $3`,
    [clienteNome, projetoId, limite],
  );
  return rows;
}

/** Evita repetir rascunhos ainda em avaliação a cada clique em “Gerar sugestões”. */
export async function listarParceirosComOportunidadeAtiva(
  client: PoolClient,
  clienteNome: string,
): Promise<string[]> {
  const { rows } = await client.query<{ parceiro_nome: string }>(
    `SELECT DISTINCT lower(trim(parceiro_nome)) AS parceiro_nome
       FROM cross_ai.oportunidade_ia
      WHERE lower(trim(cliente_nome)) = lower(trim($1))
        AND status IN ('rascunho', 'em_curadoria', 'aprovada')`,
    [clienteNome],
  );
  return rows.map((row) => row.parceiro_nome);
}

export async function buscarParteIdPorNomeExato(client: PoolClient, nome: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.parte
      WHERE arquivado_em IS NULL AND lower(trim(nome_exibicao)) = lower(trim($1))
      ORDER BY criado_em DESC LIMIT 1`,
    [nome]
  );
  return rows[0]?.id ?? null;
}

export async function buscarProjetoIdPorNomes(client: PoolClient, clienteNome: string, projetoNome: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT pr.id
       FROM cross_projects.projeto pr
       JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
       JOIN cross_core.parte cliente ON cliente.id = cc.parte_id
      WHERE pr.arquivado_em IS NULL AND cc.arquivado_em IS NULL AND cliente.arquivado_em IS NULL
        AND lower(trim(cliente.nome_exibicao)) = lower(trim($1))
        AND lower(trim(pr.nome)) = lower(trim($2))
      ORDER BY pr.criado_em DESC LIMIT 1`,
    [clienteNome, projetoNome]
  );
  return rows[0]?.id ?? null;
}

export async function buscarFrenteIdPorNomes(
  client: PoolClient,
  clienteNome: string,
  projetoNome: string,
  frenteNome: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT fo.id
       FROM cross_projects.frente_oportunidade fo
       JOIN cross_projects.projeto pr ON pr.id = fo.projeto_id
       JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
       JOIN cross_core.parte cliente ON cliente.id = cc.parte_id
      WHERE fo.arquivado_em IS NULL AND pr.arquivado_em IS NULL AND cc.arquivado_em IS NULL AND cliente.arquivado_em IS NULL
        AND lower(trim(cliente.nome_exibicao)) = lower(trim($1))
        AND lower(trim(pr.nome)) = lower(trim($2))
        AND lower(trim(fo.nome)) = lower(trim($3))
      ORDER BY fo.criado_em DESC LIMIT 1`,
    [clienteNome, projetoNome, frenteNome]
  );
  return rows[0]?.id ?? null;
}

/** Evita duplicar a mesma marca no mesmo funil durante reimportações. */
export async function buscarCandidaturaIdPorFrenteEParte(
  client: PoolClient,
  frenteId: string,
  parteId: string
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id
       FROM cross_projects.candidatura_parceiro
      WHERE frente_oportunidade_id = $1
        AND parte_id = $2
        AND arquivado_em IS NULL
      ORDER BY criado_em DESC
      LIMIT 1`,
    [frenteId, parteId]
  );
  return rows[0]?.id ?? null;
}

// --- Tarefas de pipeline (execução assíncrona com progresso) ------------------

export type StatusTarefa = "pendente" | "executando" | "concluida" | "erro";

export interface EtapaTarefa {
  nome: string;
  status: "sucesso" | "parcial" | "ignorada" | "erro";
  origem?: string;
  observacao?: string;
  duracao_ms?: number;
}

export interface TarefaPipelineRow {
  id: string;
  pipeline: "partner_discovery" | "market_intelligence";
  status: StatusTarefa;
  etapa_atual: string | null;
  etapas: EtapaTarefa[];
  progresso: number;
  resultado: unknown | null;
  erro: string | null;
  execucao_pipeline_id: string | null;
  criado_em: string;
  atualizado_em: string;
  concluido_em: string | null;
}

const COLUNAS_TAREFA = `id, pipeline, status, etapa_atual, etapas, progresso, resultado,
                        erro, execucao_pipeline_id, criado_em, atualizado_em, concluido_em`;

/** Cria a tarefa em 'pendente'. A execução em si acontece fora da transação. */
export async function criarTarefaPipeline(
  client: PoolClient,
  dados: {
    pipeline: "partner_discovery" | "market_intelligence";
    entrada: unknown;
    projetoId?: string | null;
    frenteId?: string | null;
    criadoPorId?: string | null;
  }
): Promise<TarefaPipelineRow> {
  const { rows } = await client.query<TarefaPipelineRow>(
    `INSERT INTO cross_ai.tarefa_pipeline (pipeline, entrada, projeto_id, frente_id, criado_por_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUNAS_TAREFA}`,
    [
      dados.pipeline,
      JSON.stringify(dados.entrada),
      dados.projetoId ?? null,
      dados.frenteId ?? null,
      dados.criadoPorId ?? null,
    ]
  );
  return rows[0];
}

/** Atualiza o progresso de uma tarefa em andamento (chamado a cada etapa). */
export async function atualizarProgressoTarefa(
  client: PoolClient,
  id: string,
  dados: { status?: StatusTarefa; etapaAtual?: string | null; etapas?: EtapaTarefa[]; progresso?: number }
): Promise<void> {
  await client.query(
    `UPDATE cross_ai.tarefa_pipeline
        SET status = COALESCE($2, status),
            etapa_atual = COALESCE($3, etapa_atual),
            etapas = COALESCE($4::jsonb, etapas),
            progresso = COALESCE($5, progresso),
            atualizado_em = NOW()
      WHERE id = $1`,
    [
      id,
      dados.status ?? null,
      dados.etapaAtual === undefined ? null : dados.etapaAtual,
      dados.etapas ? JSON.stringify(dados.etapas) : null,
      dados.progresso ?? null,
    ]
  );
}

/** Fecha a tarefa — com resultado (sucesso) ou mensagem de erro. */
export async function finalizarTarefa(
  client: PoolClient,
  id: string,
  dados: { status: "concluida" | "erro"; resultado?: unknown; erro?: string; execucaoPipelineId?: string | null }
): Promise<void> {
  await client.query(
    // $2 é comparado no CASE e atribuído a uma coluna varchar; sem o cast
    // explícito o Postgres deduz dois tipos diferentes para o mesmo parâmetro.
    `UPDATE cross_ai.tarefa_pipeline
        SET status = $2::text,
            resultado = $3::jsonb,
            erro = $4,
            execucao_pipeline_id = $5,
            progresso = CASE WHEN $2::text = 'concluida' THEN 100 ELSE progresso END,
            etapa_atual = NULL,
            atualizado_em = NOW(),
            concluido_em = NOW()
      WHERE id = $1`,
    [
      id,
      dados.status,
      dados.resultado === undefined ? null : JSON.stringify(dados.resultado),
      dados.erro ?? null,
      dados.execucaoPipelineId ?? null,
    ]
  );
}

/**
 * Um worker de tarefas vive no processo da API. Se esse processo reiniciar, não
 * existe outro worker que possa retomar uma tarefa marcada como executando.
 * Encerramos apenas tarefas antigas para que a interface não fique em polling
 * infinito e a auditoria deixe explícito que a execução foi interrompida.
 */
export async function encerrarTarefasInterrompidas(
  client: PoolClient,
  idadeMinimaMinutos = 10,
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE cross_ai.tarefa_pipeline
        SET status = 'erro',
            etapa_atual = NULL,
            erro = COALESCE(NULLIF(erro, '') || E'\n', '') || 'Execução interrompida por reinicialização da API. Execute novamente para retomar a pesquisa.',
            atualizado_em = NOW(),
            concluido_em = NOW()
      WHERE status IN ('pendente', 'executando')
        AND atualizado_em < NOW() - ($1::int * INTERVAL '1 minute')`,
    [idadeMinimaMinutos],
  );
  return rowCount ?? 0;
}

export async function buscarTarefaPipeline(client: PoolClient, id: string): Promise<TarefaPipelineRow | null> {
  const { rows } = await client.query<TarefaPipelineRow>(
    `SELECT ${COLUNAS_TAREFA} FROM cross_ai.tarefa_pipeline WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarTarefasPipeline(
  client: PoolClient,
  filtros: { status?: string; limit: number; offset: number }
): Promise<{ itens: TarefaPipelineRow[]; total: number }> {
  const { rows } = await client.query<TarefaPipelineRow & { total: string }>(
    `SELECT ${COLUNAS_TAREFA}, count(*) OVER() AS total
       FROM cross_ai.tarefa_pipeline
      WHERE ($1::text IS NULL OR status = $1::text)
      ORDER BY criado_em DESC
      LIMIT $2 OFFSET $3`,
    [filtros.status ?? null, filtros.limit, filtros.offset]
  );
  return {
    itens: rows.map(({ total: _t, ...r }) => r),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
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
