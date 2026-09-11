import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../shared/db";
import * as repo from "./execucao.repository";

// -----------------------------------------------------------------------------
// Domínio de Reunião — cenários A a L da Sprint DOMAIN-01.
//
// ANTES desta Sprint, `cross_execution.reuniao.parceria_id` era NOT NULL: nenhuma
// reunião podia existir sem parceria fechada. Isso invertia a ordem real do
// negócio — a conversa acontece antes, e é ela que decide se haverá parceria.
//
// Estes testes provam que os quatro contextos agora convivem, que reuniões
// legadas continuam válidas, e que criar reunião não dispara nada operacional.
// -----------------------------------------------------------------------------

interface Base {
  usuarioId: string;
  clienteParteId: string;
  parceiroParteId: string;
  artistaParteId: string;
  projetoId: string;
  frenteId: string;
  candidaturaId: string;
  parceriaId: string;
}

async function montarBase(client: PoolClient, sufixo: string): Promise<Base> {
  const stParte = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`);
  const novaParte = async (nome: string) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
       VALUES ('organizacao',$1,$2) RETURNING id`, [nome, stParte.rows[0].id]);
    return rows[0].id;
  };

  const usuario = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1,$2,'estrategista') RETURNING id`,
    [`User ${sufixo}`, `user.${sufixo}@cross.teste`]);

  const cliParte = await novaParte(`Cliente ${sufixo}`);
  const parParte = await novaParte(`Parceiro ${sufixo}`);
  const artParte = await novaParte(`Artista ${sufixo}`);

  const stCli = await client.query<{ id: string }>(
    `SELECT id FROM cross_commercial.status_cliente ORDER BY ordem LIMIT 1`);
  const cliente = await client.query<{ id: string }>(
    `INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
     VALUES ($1,$2) RETURNING id`, [cliParte, stCli.rows[0].id]);

  const stProj = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_projeto ORDER BY ordem LIMIT 1`);
  const projeto = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.projeto (cliente_cross_id, nome, objetivo, status_projeto_id)
     VALUES ($1,$2,'Objetivo',$3) RETURNING id`,
    [cliente.rows[0].id, `Projeto ${sufixo}`, stProj.rows[0].id]);

  const stFr = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_frente ORDER BY ordem LIMIT 1`);
  const frente = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.frente_oportunidade
       (projeto_id, nome, objetivo, data_abertura, status_frente_id)
     VALUES ($1,$2,'Objetivo',CURRENT_DATE,$3) RETURNING id`,
    [projeto.rows[0].id, `Frente ${sufixo}`, stFr.rows[0].id]);

  const stCand = await client.query<{ id: string }>(
    `SELECT id FROM cross_projects.status_candidatura WHERE codigo='identificada'`);
  const cand = await client.query<{ id: string }>(
    `INSERT INTO cross_projects.candidatura_parceiro
       (frente_oportunidade_id, parte_id, status_candidatura_id)
     VALUES ($1,$2,$3) RETURNING id`,
    [frente.rows[0].id, parParte, stCand.rows[0].id]);

  // Parceria legada, para provar retrocompatibilidade.
  //
  // Note o quanto ela exige: candidatura + projeto + frente + cliente. Era esta
  // cadeia inteira que a reunião herdava ao depender de parceria.
  // WAD 7.3.14: parceria exige decisão de aprovação da candidatura E Paper
  // validado na frente. Regras reais do domínio, satisfeitas pelo caminho
  // legítimo — não contornadas.
  //
  // A extensão desta pré-condição é o próprio argumento da Sprint: ao depender
  // de parceria, a reunião herdava candidatura + projeto + frente + decisão +
  // Paper validado. Uma conversa exploratória não tem nada disso.
  const tipoAprovada = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.tipo_decisao WHERE codigo='aprovada'`);
  await client.query(
    `INSERT INTO cross_methodologies.decisao_candidatura
       (candidatura_parceiro_id, tipo_decisao_id, responsavel_id, data_decisao)
     VALUES ($1,$2,$3, now())`,
    [cand.rows[0].id, tipoAprovada.rows[0].id, usuario.rows[0].id]);

  const stPaperValidado = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.status_paper WHERE codigo='validado'`);
  const paper = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.paper (frente_oportunidade_id, titulo, status_paper_id)
     VALUES ($1,$2,$3) RETURNING id`,
    [frente.rows[0].id, `Paper ${sufixo}`, stPaperValidado.rows[0].id]);
  const versaoPaper = await client.query<{ id: string }>(
    `INSERT INTO cross_methodologies.versao_paper (paper_id, numero_versao, estrategia_proposta)
     VALUES ($1,1,'Estratégia') RETURNING id`, [paper.rows[0].id]);
  const tipoVal = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.tipo_validacao LIMIT 1`);
  const stValAprovada = await client.query<{ id: string }>(
    `SELECT id FROM cross_methodologies.status_validacao WHERE codigo='aprovada'`);
  await client.query(
    `INSERT INTO cross_methodologies.validacao_paper
       (versao_paper_id, tipo_validacao_id, status_validacao_id, responsavel_id, data_validacao)
     VALUES ($1,$2,$3,$4, now())`,
    [versaoPaper.rows[0].id, tipoVal.rows[0].id, stValAprovada.rows[0].id, usuario.rows[0].id]);

  const stParc = await client.query<{ id: string }>(
    `SELECT id FROM cross_partnerships.status_parceria ORDER BY ordem LIMIT 1`);
  const parceria = await client.query<{ id: string }>(
    `INSERT INTO cross_partnerships.parceria
       (candidatura_parceiro_id, projeto_id, frente_oportunidade_id,
        cliente_cross_id, parte_parceira_id, status_parceria_id, data_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING id`,
    [cand.rows[0].id, projeto.rows[0].id, frente.rows[0].id,
     cliente.rows[0].id, parParte, stParc.rows[0].id]);

  return {
    usuarioId: usuario.rows[0].id,
    clienteParteId: cliParte, parceiroParteId: parParte, artistaParteId: artParte,
    projetoId: projeto.rows[0].id, frenteId: frente.rows[0].id,
    candidaturaId: cand.rows[0].id, parceriaId: parceria.rows[0].id,
  };
}

/** Contagem do que uma reunião NÃO pode criar. */
async function contarOperacional(client: PoolClient) {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM cross_projects.candidatura_parceiro)::int candidaturas,
            (SELECT count(*) FROM cross_projects.projeto)::int projetos,
            (SELECT count(*) FROM cross_partnerships.parceria)::int parcerias,
            (SELECT count(*) FROM cross_projects.historico_candidatura)::int movimentacoes`);
  return rows[0];
}

const REUNIAO = { titulo: "Conversa", data_reuniao: new Date().toISOString() };

// -----------------------------------------------------------------------------

describe("A · Reunião legada com parceria", () => {
  it("continua válida após a migration", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "a1");
      const id = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Reunião legada" },
        { parceriaId: b.parceriaId }, b.usuarioId);

      const r = await repo.buscarReuniao(client, id);
      expect(r!.parceria_id).toBe(b.parceriaId);
      expect(r!.candidatura_parceiro_id).toBeNull();
      expect(r!.projeto_id).toBeNull();

      // A rota legada por parceria continua enxergando a reunião.
      const lista = await repo.listarReunioes(client, b.parceriaId);
      expect(lista.map((x) => x.id)).toContain(id);
    });
  });
});

describe("B · Reunião de oportunidade", () => {
  it("existe com candidatura, sem projeto e sem parceria", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "b1");
      const id = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Conversa sobre a oportunidade" },
        { candidaturaParceiroId: b.candidaturaId, tipo: "negociacao" }, b.usuarioId);

      const r = await repo.buscarReuniao(client, id);
      // Este era o caso impossível antes da 061.
      expect(r!.candidatura_parceiro_id).toBe(b.candidaturaId);
      expect(r!.parceria_id).toBeNull();
      expect(r!.projeto_id).toBeNull();
      expect(r!.tipo).toBe("negociacao");
    });
  });
});

describe("C · Reunião pré-oportunidade", () => {
  it("existe sem candidatura, projeto ou parceria", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "c1");
      const id = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Primeira conversa exploratória" },
        { tipo: "exploratoria" }, b.usuarioId);

      // Participantes: as Partes reais que conversaram.
      await repo.adicionarParticipante(client, id, { parte_id: b.clienteParteId, papel: "cliente" });
      await repo.adicionarParticipante(client, id, { parte_id: b.parceiroParteId, papel: "prospect" });

      const r = await repo.buscarReuniao(client, id);
      expect(r!.parceria_id).toBeNull();
      expect(r!.candidatura_parceiro_id).toBeNull();
      expect(r!.projeto_id).toBeNull();
      expect(r!.participantes).toHaveLength(2);
    });
  });
});

describe("D · Reunião de projeto", () => {
  it("existe com projeto, sem exigir parceria", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "d1");
      const id = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Acompanhamento do projeto" },
        { projetoId: b.projetoId, tipo: "acompanhamento" }, b.usuarioId);

      const r = await repo.buscarReuniao(client, id);
      expect(r!.projeto_id).toBe(b.projetoId);
      expect(r!.parceria_id).toBeNull();
    });
  });
});

describe("E · Múltiplas Partes e usuário interno", () => {
  it("suporta várias Partes e distingue Parte de usuário Cross", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "e1");
      const id = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Reunião com várias partes" }, {}, b.usuarioId);

      await repo.adicionarParticipante(client, id, { parte_id: b.clienteParteId, papel: "cliente" });
      await repo.adicionarParticipante(client, id, { parte_id: b.parceiroParteId, papel: "parceiro" });
      await repo.adicionarParticipante(client, id, { parte_id: b.artistaParteId, papel: "artista" });
      await repo.adicionarParticipante(client, id, { usuario_interno_id: b.usuarioId, papel: "cross" });

      const participantes = await repo.listarParticipantes(client, id);
      expect(participantes).toHaveLength(4);

      // A CHECK do banco garante que os dois conceitos não se confundem:
      // participante é Parte OU usuário interno, nunca ambos.
      const partes = participantes.filter((p) => p.parte_id);
      const internos = participantes.filter((p) => p.usuario_interno_id);
      expect(partes).toHaveLength(3);
      expect(internos).toHaveLength(1);
      expect(partes.every((p) => !p.usuario_interno_id)).toBe(true);
    });
  });

  it("rejeita participante que seja Parte e usuário ao mesmo tempo", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "e2");
      const id = await repo.inserirReuniaoComContexto(client, REUNIAO, {}, b.usuarioId);

      await client.query("SAVEPOINT p");
      await expect(
        client.query(
          `INSERT INTO cross_execution.reuniao_participante (reuniao_id, parte_id, usuario_interno_id)
           VALUES ($1,$2,$3)`, [id, b.clienteParteId, b.usuarioId])
      ).rejects.toThrow(/ck_reuniao_participante_alvo/i);
      await client.query("ROLLBACK TO SAVEPOINT p");
    });
  });
});

describe("F/G/H · Reunião não cria nada operacional", () => {
  it("criar reunião não gera oportunidade, projeto nem parceria", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "f1");
      const antes = await contarOperacional(client);

      await repo.inserirReuniaoComContexto(client, REUNIAO, {}, b.usuarioId);
      await repo.inserirReuniaoComContexto(
        client, REUNIAO, { candidaturaParceiroId: b.candidaturaId }, b.usuarioId);
      await repo.inserirReuniaoComContexto(
        client, REUNIAO, { projetoId: b.projetoId }, b.usuarioId);

      const depois = await contarOperacional(client);
      expect(depois).toEqual(antes);
    });
  });
});

describe("I · Integridade de contexto", () => {
  it("rejeita candidatura e projeto de cadeias diferentes", async () => {
    await withTransaction(async (client) => {
      const b1 = await montarBase(client, "i1");
      const b2 = await montarBase(client, "i2");

      // Candidatura de b1 com projeto de b2: inconsistente.
      await client.query("SAVEPOINT ctx");
      await expect(
        repo.inserirReuniaoComContexto(client, REUNIAO,
          { candidaturaParceiroId: b1.candidaturaId, projetoId: b2.projetoId }, b1.usuarioId)
      ).rejects.toThrow(/Contexto inconsistente/i);
      await client.query("ROLLBACK TO SAVEPOINT ctx");
    });
  });

  it("aceita candidatura e projeto da MESMA cadeia", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "i3");
      const id = await repo.inserirReuniaoComContexto(client, REUNIAO,
        { candidaturaParceiroId: b.candidaturaId, projetoId: b.projetoId }, b.usuarioId);

      const r = await repo.buscarReuniao(client, id);
      expect(r!.candidatura_parceiro_id).toBe(b.candidaturaId);
      expect(r!.projeto_id).toBe(b.projetoId);
    });
  });
});

describe("J · Consultas para o Meeting Intelligence", () => {
  it("lista reuniões por Parte", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "j1");
      const id1 = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Conversa 1" }, {}, b.usuarioId);
      const id2 = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Conversa 2" },
        { candidaturaParceiroId: b.candidaturaId }, b.usuarioId);
      await repo.adicionarParticipante(client, id1, { parte_id: b.parceiroParteId });
      await repo.adicionarParticipante(client, id2, { parte_id: b.parceiroParteId });

      const reunioes = await repo.listarReunioesPorParte(client, b.parceiroParteId);
      expect(reunioes.map((r) => r.id).sort()).toEqual([id1, id2].sort());
    });
  });

  it("lista reuniões por oportunidade", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "j2");
      const id = await repo.inserirReuniaoComContexto(
        client, REUNIAO, { candidaturaParceiroId: b.candidaturaId }, b.usuarioId);
      await repo.inserirReuniaoComContexto(client, REUNIAO, {}, b.usuarioId);

      const reunioes = await repo.listarReunioesPorCandidatura(client, b.candidaturaId);
      expect(reunioes).toHaveLength(1);
      expect(reunioes[0].id).toBe(id);
    });
  });

  it("lista reuniões por projeto", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "j3");
      const id = await repo.inserirReuniaoComContexto(
        client, REUNIAO, { projetoId: b.projetoId }, b.usuarioId);

      const reunioes = await repo.listarReunioesPorProjeto(client, b.projetoId);
      expect(reunioes.map((r) => r.id)).toContain(id);
    });
  });
});

describe("K · Status da reunião", () => {
  it("nasce planejada e não existe estado de aprovação automática", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "k1");
      const id = await repo.inserirReuniaoComContexto(client, REUNIAO, {}, b.usuarioId);

      const r = await repo.buscarReuniao(client, id);
      // Sem Human Gate de reunião no domínio: nada é "aprovado" sozinho porque
      // o conceito não existe. Inventá-lo criaria regra que ninguém pediu.
      expect(r!.status).toBe("planejada");

      await client.query("SAVEPOINT st");
      await expect(
        client.query(`UPDATE cross_execution.reuniao SET status='aprovada' WHERE id=$1`, [id])
      ).rejects.toThrow(/ck_reuniao_status/i);
      await client.query("ROLLBACK TO SAVEPOINT st");
    });
  });

  it("permite marcar como realizada por ação explícita", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "k2");
      const id = await repo.inserirReuniaoComContexto(client, REUNIAO, {}, b.usuarioId);
      await client.query(`UPDATE cross_execution.reuniao SET status='realizada' WHERE id=$1`, [id]);

      const r = await repo.buscarReuniao(client, id);
      expect(r!.status).toBe("realizada");
    });
  });
});

describe("L · Auditoria e preservação de histórico", () => {
  it("registra criador e preserva a reunião quando o contexto some", async () => {
    await withTransaction(async (client) => {
      const b = await montarBase(client, "l1");
      const id = await repo.inserirReuniaoComContexto(
        client, REUNIAO, { candidaturaParceiroId: b.candidaturaId }, b.usuarioId);

      const { rows: criado } = await client.query(
        `SELECT criado_por_id, criado_em FROM cross_execution.reuniao WHERE id=$1`, [id]);
      expect(criado[0].criado_por_id).toBe(b.usuarioId);
      expect(criado[0].criado_em).toBeTruthy();

      // Apagar a oportunidade NÃO pode apagar a conversa que aconteceu.
      //
      // Usa uma candidatura sem decisão vinculada: a do `montarBase` tem
      // decisao_candidatura (exigida pela parceria legada) e está protegida por
      // outra FK — o que é correto, mas impede isolar o comportamento testado.
      const stCand = await client.query<{ id: string }>(
        `SELECT id FROM cross_projects.status_candidatura WHERE codigo='identificada'`);
      const outra = await client.query<{ id: string }>(
        `INSERT INTO cross_projects.candidatura_parceiro
           (frente_oportunidade_id, parte_id, status_candidatura_id)
         VALUES ($1,$2,$3) RETURNING id`,
        [b.frenteId, b.artistaParteId, stCand.rows[0].id]);

      const idLigada = await repo.inserirReuniaoComContexto(
        client, { ...REUNIAO, titulo: "Conversa sobre oportunidade descartada" },
        { candidaturaParceiroId: outra.rows[0].id }, b.usuarioId);

      await client.query(
        `DELETE FROM cross_projects.candidatura_parceiro WHERE id=$1`, [outra.rows[0].id]);

      // ON DELETE SET NULL: a reunião sobrevive ao contexto que a motivou.
      const r = await repo.buscarReuniao(client, idLigada);
      expect(r).not.toBeNull();
      expect(r!.candidatura_parceiro_id).toBeNull();
      expect(r!.titulo).toBe("Conversa sobre oportunidade descartada");
    });
  });
});
