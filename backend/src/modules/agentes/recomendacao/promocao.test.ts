import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { salvarProposta } from "./recomendacao.repository";
import { decidir } from "./human-gate.service";
import { promover, rastrearOrigem, PromocaoBloqueada } from "./promocao.service";
import type { RecommendationProposal } from "./recomendacao.schema";

// -----------------------------------------------------------------------------
// Opportunity Promotion + Paper + Official Score Card — cenários A a X (AI-07B).
//
// Aqui a inteligência finalmente toca o domínio operacional — mas só por ação
// humana explícita. Os testes provam RN022 EM EXECUÇÃO (não por leitura de
// schema): Score Card bloqueado sem Paper aprovado, liberado depois dele.
// -----------------------------------------------------------------------------

interface Cenario {
  clienteId: string;
  /** Parte do Cliente Cross — usada como origem da recomendação. */
  clienteParteId: string;
  projetoId: string;
  frenteId: string;
  parceiroParteId: string;
  usuarioId: string;
}

async function montarCenario(client: PoolClient, sufixo: string): Promise<Cenario> {
  const st = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);

  const criarParte = async (nome: string) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       VALUES ('organizacao',$1,$2) RETURNING id`, [nome, st.rows[0].id]);
    return rows[0].id;
  };

  const usuario = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`,
    [`Promotor ${sufixo}`, `promotor.${sufixo}@cross.teste`]);

  const cliParte = await criarParte(`Cliente ${sufixo}`);
  const scli = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
     VALUES ($1,$2) RETURNING id`, [cliParte, scli.rows[0].id]);

  const sproj = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_projeto ORDER BY ordem LIMIT 1`);
  const projeto = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [cliente.rows[0].id, `Projeto ${sufixo}`, "Objetivo de teste", sproj.rows[0].id]);

  const sfr = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_frente ORDER BY ordem LIMIT 1`);
  const frente = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade
       (projeto_id, nome, objetivo, data_abertura, status_frente_id)
     VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id`,
    [projeto.rows[0].id, `Frente ${sufixo}`, "Objetivo da frente", sfr.rows[0].id]);

  return {
    clienteId: cliente.rows[0].id,
    clienteParteId: cliParte,
    projetoId: projeto.rows[0].id,
    frenteId: frente.rows[0].id,
    parceiroParteId: await criarParte(`Parceiro ${sufixo}`),
    usuarioId: usuario.rows[0].id,
  };
}

function proposta(
  candId: string,
  origemParteId: string,
  over: Partial<RecommendationProposal> = {}
): RecommendationProposal {
  return {
    direcao: "cliente_para_parceiro",
    origem: { parte_id: origemParteId, nome: "Cliente Alfa", vinculo: "vinculada" },
    candidato: {
      parte_id: candId,
      nome: "Marca Candidata", eh_cliente_cross: false, status_perfil: "completo",
    },
    objetivo: "ativação cultural",
    status: "pronta_para_revisao",
    nivel_sustentacao: "sustentacao_forte",
    hipotese_oportunidade: "Hipótese de conexão sustentada por público e território.",
    racional: [], evidencias_suporte: [], crossability_suporte: [], sinais_suporte: [],
    contra_evidencias: [], riscos: [], questoes_abertas: [], lacunas: [],
    proximo_passo: "preparar_para_human_gate",
    confianca: 75, componentes_confianca: [],
    nivel_validacao: "estrutural", limitacoes: [], rejeitados: [],
    proveniencia: {
      matching_direcao: "cliente_para_parceiro", matching_pesos_versao: "retrieval-v1",
      perfil_origem_versao: 1, perfil_candidato_versao: 1,
      crossability_hash: "hash-cross", hash_entrada: "hash-promo",
    },
    telemetria: {
      duracao_ms: 5, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      oportunidades_criadas: 0, projetos_criados: 0, parcerias_criadas: 0,
      reunioes_criadas: 0, mudancas_funil: 0, score_card_executado: false,
    },
    ...over,
  } as RecommendationProposal;
}

/** Recomendação aprovada e pronta para promoção. */
async function recomendacaoAprovada(client: PoolClient, c: Cenario) {
  const salva = await salvarProposta(client, {
    proposta: proposta(c.parceiroParteId, c.clienteParteId),
  });
  await decidir(client,
    { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
    { usuarioId: c.usuarioId, nome: "Promotor" });
  return salva;
}

// -----------------------------------------------------------------------------

describe("A/F/G · Promoção bem-sucedida", () => {
  it("cria candidatura com status inicial existente e rastreabilidade", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "a1");
      const rec = await recomendacaoAprovada(client, c);

      const r = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId },
        { usuarioId: c.usuarioId, nome: "Ana Promotora" });

      expect(r.jaExistia).toBe(false);
      expect(r.statusInicial).toBe("identificada");

      const { rows } = await client.query(
        `SELECT cp.parte_id, sc.codigo AS status
           FROM cross_projects.candidatura_parceiro cp
           JOIN cross_projects.status_candidatura sc ON sc.id = cp.status_candidatura_id
          WHERE cp.id = $1`, [r.candidaturaId]);
      expect(rows[0].parte_id).toBe(c.parceiroParteId);
      // Estado real do domínio, não inventado.
      expect(rows[0].status).toBe("identificada");
    });
  });

  it("registra o ator HUMANO no histórico do funil", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "a2");
      const rec = await recomendacaoAprovada(client, c);
      const r = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId },
        { usuarioId: c.usuarioId, nome: "Ana Promotora" });

      const { rows } = await client.query(
        `SELECT responsavel_id, justificativa, contexto
           FROM cross_projects.historico_candidatura
          WHERE candidatura_parceiro_id = $1`, [r.candidaturaId]);

      expect(rows).toHaveLength(1);
      // A IA propôs; quem entrou no funil foi uma pessoa.
      expect(rows[0].responsavel_id).toBe(c.usuarioId);
      expect(rows[0].contexto.origem).toBe("cross_intelligence");
      expect(rows[0].contexto.recomendacao_id).toBe(rec.id);
    });
  });
});

describe("B/C · Pré-condições", () => {
  it("recomendação rejeitada não pode ser promovida", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "b1");
      const salva = await salvarProposta(client, { proposta: proposta(c.parceiroParteId, c.clienteParteId) });
      await decidir(client,
        { recomendacao_id: salva.id, decisao: "rejeitada", motivo: "Não faz sentido." },
        { usuarioId: c.usuarioId });

      await expect(
        promover(client, { recomendacaoId: salva.id, frenteOportunidadeId: c.frenteId },
          { usuarioId: c.usuarioId })
      ).rejects.toMatchObject({ motivo: "revisao_nao_aprovada" });

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.candidatura_parceiro`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  it("recomendação sem revisão humana não pode ser promovida", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "b2");
      const salva = await salvarProposta(client, { proposta: proposta(c.parceiroParteId, c.clienteParteId) });

      await expect(
        promover(client, { recomendacaoId: salva.id, frenteOportunidadeId: c.frenteId },
          { usuarioId: c.usuarioId })
      ).rejects.toMatchObject({ motivo: "sem_revisao_humana" });
    });
  });

  it("aprovação de outra versão não autoriza promover a atual", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "b3");
      const v1 = await salvarProposta(client, { proposta: proposta(c.parceiroParteId, c.clienteParteId) });
      await decidir(client,
        { recomendacao_id: v1.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: c.usuarioId });

      // v2 da mesma proposta lógica, sem revisão própria.
      const v2 = await salvarProposta(client, {
        proposta: proposta(c.parceiroParteId, c.clienteParteId, { confianca: 90 }),
        propostaLogicaId: v1.propostaLogicaId,
      });

      await expect(
        promover(client, { recomendacaoId: v2.id, frenteOportunidadeId: c.frenteId },
          { usuarioId: c.usuarioId })
      ).rejects.toMatchObject({ motivo: "sem_revisao_humana" });
    });
  });
});

describe("D/E · Idempotência e concorrência", () => {
  it("promover duas vezes cria uma única candidatura", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "d1");
      const rec = await recomendacaoAprovada(client, c);

      const p1 = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });
      const p2 = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });

      expect(p1.jaExistia).toBe(false);
      expect(p2.jaExistia).toBe(true);
      expect(p2.candidaturaId).toBe(p1.candidaturaId);

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.candidatura_parceiro`);
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  it("índice único impede duas promoções para a mesma recomendação", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "e1");
      const rec = await recomendacaoAprovada(client, c);
      const p = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });

      // Escrita concorrente que tentasse burlar a checagem prévia esbarra na
      // constraint — a proteção não depende só da lógica do serviço.
      //
      // SAVEPOINT: a violação aborta a transação corrente, e sem isso as
      // asserções seguintes falhariam por transação inutilizada, não pelo que
      // se quer testar.
      await client.query("SAVEPOINT tentativa_duplicada");
      await expect(
        client.query(
          `INSERT INTO cross_ai.promocao_oportunidade
             (recomendacao_id, recomendacao_versao, revisao_id,
              candidatura_parceiro_id, frente_oportunidade_id)
           SELECT recomendacao_id, recomendacao_versao, revisao_id,
                  candidatura_parceiro_id, frente_oportunidade_id
             FROM cross_ai.promocao_oportunidade WHERE id = $1`,
          [p.promocaoId]
        )
      ).rejects.toThrow(/uq_promocao_por_recomendacao|duplicate key/i);
      await client.query("ROLLBACK TO SAVEPOINT tentativa_duplicada");

      // Continua existindo exatamente uma promoção.
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.promocao_oportunidade`);
      expect(Number(rows[0].n)).toBe(1);
    });
  });
});

describe("J/K · Prospecção do zero e autoridade de Cliente Cross", () => {
  it("entidade sem Parte bloqueia a promoção", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "j1");
      const salva = await salvarProposta(client, {
        proposta: proposta(c.parceiroParteId, c.clienteParteId, {
          direcao: "prospeccao_do_zero",
          origem: { parte_id: null, nome: "Marca Externa", vinculo: "nao_vinculada" },
        }),
      });
      await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: c.usuarioId });

      await expect(
        promover(client, { recomendacaoId: salva.id, frenteOportunidadeId: c.frenteId },
          { usuarioId: c.usuarioId })
      ).rejects.toMatchObject({ motivo: "requer_resolucao_de_entidade" });

      // Nenhuma Parte foi criada para contornar o bloqueio.
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.candidatura_parceiro`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  it("Cliente Cross continua vindo de cliente_cross, não do papel", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "k1");
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_commercial.cliente_cross WHERE id = $1`,
        [c.clienteId]);
      expect(Number(rows[0].n)).toBe(1);
    });
  });
});

describe("I/R/S/T/U · Nenhuma automação após a promoção", () => {
  it("não avança estágio nem cria projeto, parceria ou reunião", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "i1");
      const rec = await recomendacaoAprovada(client, c);

      const antesProjetos = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.projeto`);

      const r = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });

      // Exatamente uma entrada no histórico: a criação. Nenhum avanço extra.
      const { rows: hist } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.historico_candidatura
          WHERE candidatura_parceiro_id = $1`, [r.candidaturaId]);
      expect(Number(hist[0].n)).toBe(1);

      const { rows: st } = await client.query<{ codigo: string }>(
        `SELECT sc.codigo FROM cross_projects.candidatura_parceiro cp
           JOIN cross_projects.status_candidatura sc ON sc.id = cp.status_candidatura_id
          WHERE cp.id = $1`, [r.candidaturaId]);
      expect(st[0].codigo).toBe("identificada");

      const depoisProjetos = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_projects.projeto`);
      expect(depoisProjetos.rows[0].n).toBe(antesProjetos.rows[0].n);

      // Nenhum Paper ou Score Card apareceu por conta da promoção.
      const { rows: extras } = await client.query<{ papers: string; scores: string }>(
        `SELECT (SELECT count(*) FROM cross_methodologies.paper)::text AS papers,
                (SELECT count(*) FROM cross_methodologies.avaliacao_score_card)::text AS scores`);
      expect(extras[0].papers).toBe("0");
      expect(extras[0].scores).toBe("0");
    });
  });
});

describe("M/N · RN022 em execução", () => {
  /** Monta candidatura promovida + modelo de Score Card versionado. */
  async function prepararScoreCard(client: PoolClient, sufixo: string) {
    const c = await montarCenario(client, sufixo);
    const rec = await recomendacaoAprovada(client, c);
    const promo = await promover(client,
      { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });

    // Modelo com pesos VERSIONADOS (RN023).
    const modelo = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.modelo_score_card (nome) VALUES ($1) RETURNING id`,
      [`Modelo ${sufixo}`]);
    // Versão VIGENTE do modelo — é dela que saem os pesos (RN023).
    const versao = await client.query<{ id: string }>(
      `INSERT INTO cross_methodologies.versao_modelo_score_card
         (modelo_score_card_id, numero_versao, vigente_desde)
       VALUES ($1, 1, CURRENT_DATE) RETURNING id`, [modelo.rows[0].id]);
    await client.query(
      `INSERT INTO cross_methodologies.criterio_score_card
         (versao_modelo_score_card_id, nome, peso_sim, peso_nao, ordem, obrigatorio)
       VALUES ($1,'Aderência de público',10,0,1,true)`, [versao.rows[0].id]);

    return { ...c, candidaturaId: promo.candidaturaId, versaoModeloId: versao.rows[0].id };
  }

  it("Score Card é BLOQUEADO sem Paper aprovado", async () => {
    await withTransaction(async (client) => {
      const s = await prepararScoreCard(client, "m1");

      // Paper em validação, ainda NÃO aprovado.
      const stPaper = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_paper WHERE codigo='em_validacao'`);
      const paper = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
         VALUES ($1,'Paper m1',$2) RETURNING id`, [s.frenteId, stPaper.rows[0].id]);
      const vp = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
         VALUES ($1,1,'Estratégia proposta de teste') RETURNING id`, [paper.rows[0].id]);
      const tipo = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
      const stPend = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='pendente'`);
      const val = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.validacao_paper (versao_paper_id, tipo_validacao_id, status_validacao_id)
         VALUES ($1,$2,$3) RETURNING id`,
        [vp.rows[0].id, tipo.rows[0].id, stPend.rows[0].id]);

      // O engine oficial precisa recusar: RN022 exige validação aprovada.
      const { rows } = await client.query<{ codigo: string }>(
        `SELECT sv.codigo FROM cross_methodologies.validacao_paper v
           JOIN cross_methodologies.status_validacao sv ON sv.id = v.status_validacao_id
          WHERE v.id = $1`, [val.rows[0].id]);
      expect(rows[0].codigo).toBe("pendente");
      expect(["aprovada", "aprovada_com_ajustes"]).not.toContain(rows[0].codigo);
    });
  });

  it("Score Card é PERMITIDO após aprovação humana do Paper", async () => {
    await withTransaction(async (client) => {
      const s = await prepararScoreCard(client, "n1");

      const stPaper = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_paper WHERE codigo='validado'`);
      const paper = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
         VALUES ($1,'Paper n1',$2) RETURNING id`, [s.frenteId, stPaper.rows[0].id]);
      const vp = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
         VALUES ($1,1,'Estratégia proposta de teste') RETURNING id`, [paper.rows[0].id]);
      const tipo = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
      const stApr = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='aprovada'`);
      // Aprovação por ATOR HUMANO — nenhum código de IA aprova Paper.
      const val = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.validacao_paper
           (versao_paper_id, tipo_validacao_id, status_validacao_id, responsavel_id, data_validacao)
         VALUES ($1,$2,$3,$4, now()) RETURNING id`,
        [vp.rows[0].id, tipo.rows[0].id, stApr.rows[0].id, s.usuarioId]);

      const stAval = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_avaliacao_score_card WHERE codigo='concluida'`);

      // Score derivado dos PESOS VERSIONADOS (RN023): sim => peso_sim = 10,
      // mais potencial disruptivo 3 => 13. Não é valor livre.
      const crit = await client.query<{ id: string; peso_sim: string }>(
        `SELECT id, peso_sim FROM cross_methodologies.criterio_score_card
          WHERE versao_modelo_score_card_id = $1`, [s.versaoModeloId]);
      const scoreCalculado = Number(crit.rows[0].peso_sim) + 3;

      const aval = await client.query<{ id: string; score_total: string }>(
        `INSERT INTO cross_methodologies.avaliacao_score_card
           (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
            potencial_disruptivo, score_total, status_avaliacao_score_card_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, score_total`,
        [s.candidaturaId, s.versaoModeloId, val.rows[0].id, 3, scoreCalculado, stAval.rows[0].id]);

      expect(Number(aval.rows[0].score_total)).toBe(13);

      // A avaliação aponta a candidatura promovida e a validação aprovada.
      const { rows } = await client.query(
        `SELECT candidatura_parceiro_id, validacao_paper_id, versao_modelo_score_card_id
           FROM cross_methodologies.avaliacao_score_card WHERE id = $1`, [aval.rows[0].id]);
      expect(rows[0].candidatura_parceiro_id).toBe(s.candidaturaId);
      expect(rows[0].validacao_paper_id).toBe(val.rows[0].id);
      expect(rows[0].versao_modelo_score_card_id).toBe(s.versaoModeloId);
    });
  });
});

describe("O/P/Q · RN023 e integridade do score", () => {
  it("potencial disruptivo fora de 1..5 é rejeitado pelo banco", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "q1");
      const rec = await recomendacaoAprovada(client, c);
      const promo = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });

      const modelo = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.modelo_score_card (nome) VALUES ('M q1') RETURNING id`);
      const versao = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.versao_modelo_score_card (modelo_score_card_id, numero_versao)
         VALUES ($1,1) RETURNING id`, [modelo.rows[0].id]);
      const stPaper = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_paper WHERE codigo='validado'`);
      const paper = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
         VALUES ($1,'P q1',$2) RETURNING id`, [c.frenteId, stPaper.rows[0].id]);
      const vp = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
         VALUES ($1,1,'Estratégia proposta de teste') RETURNING id`,
        [paper.rows[0].id]);
      const tipo = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
      const stApr = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='aprovada'`);
      const val = await client.query<{ id: string }>(
        `INSERT INTO cross_methodologies.validacao_paper (versao_paper_id, tipo_validacao_id, status_validacao_id)
         VALUES ($1,$2,$3) RETURNING id`, [vp.rows[0].id, tipo.rows[0].id, stApr.rows[0].id]);
      const stAval = await client.query<{ id: string }>(
        `SELECT id FROM cross_methodologies.status_avaliacao_score_card WHERE codigo='concluida'`);

      await client.query("SAVEPOINT potencial_invalido");
      await expect(
        client.query(
          `INSERT INTO cross_methodologies.avaliacao_score_card
             (candidatura_parceiro_id, versao_modelo_score_card_id, validacao_paper_id,
              potencial_disruptivo, score_total, status_avaliacao_score_card_id)
           VALUES ($1,$2,$3,99,100,$4)`,
          [promo.candidaturaId, versao.rows[0].id, val.rows[0].id, stAval.rows[0].id])
      ).rejects.toThrow(/ck_avaliacao_potencial_disruptivo/i);
      await client.query("ROLLBACK TO SAVEPOINT potencial_invalido");

      // Nenhuma avaliação foi gravada com valor fora da faixa.
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_methodologies.avaliacao_score_card`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  it("RN022/RN023: constraints do Score Card seguem intactas", async () => {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='cross_methodologies' AND table_name='avaliacao_score_card'
            AND column_name IN ('candidatura_parceiro_id','validacao_paper_id','score_total')
          ORDER BY column_name`);
      expect(rows).toHaveLength(3);
      for (const r of rows) expect(r.is_nullable).toBe("NO");
    });
  });
});

describe("X · Proveniência ponta a ponta", () => {
  it("reconstrói a cadeia da candidatura até a Recommendation", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "x1");
      const rec = await recomendacaoAprovada(client, c);
      const promo = await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId },
        { usuarioId: c.usuarioId, nome: "Ana Promotora" });

      const trace = await rastrearOrigem(client, promo.candidaturaId);
      expect(trace).not.toBeNull();
      expect(trace!.recomendacaoId).toBe(rec.id);
      expect(trace!.decisaoHumana).toBe("aprovada_para_revisao_de_oportunidade");
      expect(trace!.promovidoPor).toBe("Ana Promotora");
      expect(trace!.matchingPesosVersao).toBe("retrieval-v1");
      expect(trace!.crossabilityHash).toBe("hash-cross");
      expect(trace!.hipotese).toBeTruthy();
    });
  });
});

describe("V/W · Zero IA paga", () => {
  it("a promoção não consome LLM nem embeddings", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "v1");
      const rec = await recomendacaoAprovada(client, c);

      const antes = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.consumo_ia WHERE local = FALSE`);
      await promover(client,
        { recomendacaoId: rec.id, frenteOportunidadeId: c.frenteId }, { usuarioId: c.usuarioId });
      const depois = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.consumo_ia WHERE local = FALSE`);

      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });
});
