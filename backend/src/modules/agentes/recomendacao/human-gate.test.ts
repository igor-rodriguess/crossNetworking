import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { salvarProposta } from "./recomendacao.repository";
import { decidir, buscarRevisao, listarPendentes, historicoDecisoes } from "./human-gate.service";
import { ConflitoDeVersao, RevisaoInvalida } from "./human-gate.schema";
import type { RecommendationProposal } from "./recomendacao.schema";

// -----------------------------------------------------------------------------
// Recommendation Human Gate — cenários A a Z da Sprint AI-07A.
//
// A IA propõe · o humano decide · o sistema registra.
//
// Nenhum cenário pode produzir efeito operacional: candidatura, Paper, Score
// Card, projeto, parceria e reunião permanecem em zero. RN022 e RN023 seguem
// intocadas — há teste específico para isso.
// -----------------------------------------------------------------------------

async function criarParte(client: PoolClient, nome: string): Promise<string> {
  const st = await client.query<{ id: string }>(
    `SELECT id FROM cross_core.status_parte ORDER BY ordem LIMIT 1`
  );
  const p = await client.query<{ id: string }>(
    `INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
     VALUES ('organizacao', $1, $2) RETURNING id`,
    [nome, st.rows[0].id]
  );
  return p.rows[0].id;
}

async function criarUsuario(client: PoolClient, nome: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO cross_core.usuario_interno (nome, email, persona)
     VALUES ($1, $2, 'administrador') RETURNING id`,
    [nome, `${nome.toLowerCase().replace(/\s+/g, ".")}@teste.cross`]
  );
  return rows[0].id;
}

function proposta(candidatoId: string, over: Partial<RecommendationProposal> = {}): RecommendationProposal {
  return {
    direcao: "cliente_para_parceiro",
    origem: { parte_id: null, nome: "Cliente Alfa", vinculo: "vinculada" },
    candidato: {
      parte_id: candidatoId, nome: "Marca Candidata",
      eh_cliente_cross: false, status_perfil: "completo",
    },
    objetivo: "ativação cultural",
    status: "pronta_para_revisao",
    nivel_sustentacao: "sustentacao_forte",
    hipotese_oportunidade: "Existe uma hipótese de conexão sustentada por público e território.",
    racional: ["Públicos: 2 em comum."],
    evidencias_suporte: [], crossability_suporte: [], sinais_suporte: [],
    contra_evidencias: [], riscos: [], questoes_abertas: [], lacunas: [],
    proximo_passo: "preparar_para_human_gate",
    confianca: 75, componentes_confianca: [],
    nivel_validacao: "estrutural",
    limitacoes: ["semantic_matching_pendente"],
    rejeitados: [],
    proveniencia: {
      matching_direcao: "cliente_para_parceiro", matching_pesos_versao: "retrieval-v1",
      perfil_origem_versao: 1, perfil_candidato_versao: 1,
      crossability_hash: "hash-cross", hash_entrada: "hash-1",
    },
    telemetria: {
      duracao_ms: 5, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      oportunidades_criadas: 0, projetos_criados: 0, parcerias_criadas: 0,
      reunioes_criadas: 0, mudancas_funil: 0, score_card_executado: false,
    },
    ...over,
  } as RecommendationProposal;
}

/** Contagem de tudo que NÃO pode ser criado por uma decisão humana. */
async function contarOperacional(client: PoolClient) {
  const { rows } = await client.query<{
    candidaturas: string; projetos: string; frentes: string;
    papers: string; scorecards: string; parcerias: string;
  }>(
    `SELECT
       (SELECT count(*) FROM cross_projects.candidatura_parceiro)::text  AS candidaturas,
       (SELECT count(*) FROM cross_projects.projeto)::text               AS projetos,
       (SELECT count(*) FROM cross_projects.frente_oportunidade)::text   AS frentes,
       (SELECT count(*) FROM cross_methodologies.paper_candidatura)::text AS papers,
       (SELECT count(*) FROM cross_methodologies.avaliacao_score_card)::text AS scorecards,
       (SELECT count(*) FROM cross_projects.historico_candidatura)::text AS parcerias`
  );
  return rows[0];
}

// -----------------------------------------------------------------------------

describe("A/Z · Fila de pendências", () => {
  it("recomendação sem decisão aparece como pendente e some após decidir", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Pendente AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const antes = await listarPendentes(client);
      expect(antes.some((p) => p.recomendacaoId === salva.id)).toBe(true);

      await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null, nome: "Revisor" });

      const depois = await listarPendentes(client);
      expect(depois.some((p) => p.recomendacaoId === salva.id)).toBe(false);
    });
  });
});

describe("B/C · Aprovação humana", () => {
  it("aprova e registra o estado correto", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Aprovada AI07A");
      const usuario = await criarUsuario(client, "Ana Revisora");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const { revisao } = await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade", motivo: "Sinais consistentes." },
        { usuarioId: usuario, nome: "Ana Revisora" });

      // O nome do estado diz exatamente o que aconteceu: aprovada para REVISÃO
      // de oportunidade — nenhuma oportunidade foi criada.
      expect(revisao.decisao).toBe("aprovada_para_revisao_de_oportunidade");
      expect(revisao.revisor_id).toBe(usuario);
      expect(revisao.decidido_em).toBeTruthy();
      expect(revisao.nivel_validacao).toBe("estrutural");
    });
  });
});

describe("D/E · Edição humana", () => {
  it("preserva o original da IA e registra a edição", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Editada AI07A");
      const usuario = await criarUsuario(client, "Bruno Revisor");
      const original = "Existe uma hipótese de conexão sustentada por público e território.";
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const { revisao } = await decidir(client, {
        recomendacao_id: salva.id,
        decisao: "aprovada_com_edicoes",
        motivo: "Ajustei o território prioritário.",
        edicoes: { hipotese_oportunidade: "Avaliar prioritariamente no território de música." },
      }, { usuarioId: usuario, nome: "Bruno Revisor" });

      expect(revisao.decisao).toBe("aprovada_com_edicoes");
      // O que a IA propôs continua intacto no snapshot.
      expect((revisao.snapshot_ia as { hipotese_oportunidade: string }).hipotese_oportunidade).toBe(original);
      // A edição humana fica em campo separado — nunca sobrescreve.
      expect((revisao.edicoes_humanas as { hipotese_oportunidade: string }).hipotese_oportunidade)
        .toContain("música");
      expect(revisao.motivo).toContain("território");
    });
  });
});

describe("F/G · Rejeição", () => {
  it("rejeita preservando recomendação e histórico", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Rejeitada AI07A");
      const usuario = await criarUsuario(client, "Carla Revisora");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const { revisao } = await decidir(client,
        { recomendacao_id: salva.id, decisao: "rejeitada", motivo: "Conflito de exclusividade conhecido." },
        { usuarioId: usuario, nome: "Carla Revisora" });

      expect(revisao.decisao).toBe("rejeitada");
      expect(revisao.motivo).toContain("exclusividade");

      // A recomendação continua na base, intacta.
      const { rows } = await client.query(
        `SELECT status, hipotese_oportunidade FROM cross_ai.recomendacao WHERE id = $1`,
        [salva.id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].hipotese_oportunidade).toBeTruthy();
    });
  });
});

describe("H · Sustentação insuficiente", () => {
  it("não deixa aprovar sem reconhecer a insuficiência", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Insuf AI07A");
      const salva = await salvarProposta(client, {
        proposta: proposta(cand, {
          status: "sustentacao_insuficiente",
          nivel_sustentacao: "sustentacao_insuficiente",
          hipotese_oportunidade: null,
        }),
      });

      await expect(
        decidir(client,
          { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
          { usuarioId: null })
      ).rejects.toThrow(RevisaoInvalida);
    });
  });

  it("permite override, mas o registra explicitamente", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Override AI07A");
      const salva = await salvarProposta(client, {
        proposta: proposta(cand, { status: "sustentacao_insuficiente", hipotese_oportunidade: null }),
      });

      const { revisao } = await decidir(client, {
        recomendacao_id: salva.id,
        decisao: "aprovada_para_revisao_de_oportunidade",
        override_insuficiente: true,
        motivo: "Contexto comercial não registrado na base.",
      }, { usuarioId: null });

      expect(revisao.override_insuficiente).toBe(true);
    });
  });

  it("rejeitar recomendação insuficiente não exige override", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Insuf Rej AI07A");
      const salva = await salvarProposta(client, {
        proposta: proposta(cand, { status: "sustentacao_insuficiente", hipotese_oportunidade: null }),
      });

      const { revisao } = await decidir(client,
        { recomendacao_id: salva.id, decisao: "rejeitada", motivo: "Sem base." },
        { usuarioId: null });
      expect(revisao.decisao).toBe("rejeitada");
    });
  });
});

describe("I · Idempotência", () => {
  it("aprovar duas vezes produz uma única decisão", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Idem AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const p1 = await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });
      const p2 = await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });

      expect(p1.jaExistia).toBe(false);
      expect(p2.jaExistia).toBe(true);
      expect(p2.revisao.id).toBe(p1.revisao.id);

      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.recomendacao_revisao WHERE recomendacao_id = $1`,
        [salva.id]
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });
});

describe("J · Concorrência", () => {
  it("escrita com versão obsoleta é bloqueada", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Conc AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      // Revisor A decide primeiro.
      const a = await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null, nome: "Revisor A" });
      expect(a.revisao.versao_revisao).toBe(1);

      // Revisor B leu a v1 e tenta rejeitar — sobre a mesma versão, funciona.
      const b = await decidir(client,
        { recomendacao_id: salva.id, decisao: "rejeitada", versao_revisao_lida: 1, motivo: "Discordo." },
        { usuarioId: null, nome: "Revisor B" });
      expect(b.revisao.decisao).toBe("rejeitada");
      expect(b.revisao.versao_revisao).toBe(2);

      // Revisor C ainda tem a v1 em mãos: escrita obsoleta é barrada.
      await expect(
        decidir(client,
          { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade", versao_revisao_lida: 1 },
          { usuarioId: null, nome: "Revisor C" })
      ).rejects.toThrow(ConflitoDeVersao);
    });
  });

  it("mudar decisão sem declarar a versão lida é bloqueado", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Conc2 AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });

      await expect(
        decidir(client, { recomendacao_id: salva.id, decisao: "rejeitada" }, { usuarioId: null })
      ).rejects.toThrow(ConflitoDeVersao);
    });
  });
});

describe("K · Identidade do revisor", () => {
  it("o revisor vem do contexto autenticado, não do payload", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Tamper AI07A");
      const real = await criarUsuario(client, "Usuario Real");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      // Payload tenta se passar por outra pessoa; o contrato nem aceita o campo.
      const payloadMalicioso = {
        recomendacao_id: salva.id,
        decisao: "aprovada_para_revisao_de_oportunidade" as const,
        revisor_id: "00000000-0000-0000-0000-000000000000",
        approved_by: "CEO",
      };

      const { revisao } = await decidir(
        client,
        payloadMalicioso,
        { usuarioId: real, nome: "Usuario Real" }
      );

      expect(revisao.revisor_id).toBe(real);
      expect(revisao.revisor_nome).toBe("Usuario Real");
    });
  });
});

describe("L · Recomendação inválida", () => {
  it("recusa decidir sobre recomendação inexistente", async () => {
    await withTransaction(async (client) => {
      await expect(
        decidir(client,
          { recomendacao_id: "00000000-0000-0000-0000-000000000000", decisao: "rejeitada" },
          { usuarioId: null })
      ).rejects.toThrow(RevisaoInvalida);
    });
  });
});

describe("M/N · Snapshot e versionamento", () => {
  it("a decisão fica presa à versão da recomendação analisada", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Snap AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const { revisao } = await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });

      expect(revisao.recomendacao_versao).toBe(1);
      expect((revisao.snapshot_ia as { confianca: number }).confianca).toBe(75);
    });
  });

  it("v1 rejeitada e v2 aprovada convivem como decisões independentes", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand Hist AI07A");

      const v1 = await salvarProposta(client, { proposta: proposta(cand) });
      await decidir(client,
        { recomendacao_id: v1.id, decisao: "rejeitada", motivo: "Evidência fraca." },
        { usuarioId: null });

      // Nova evidência → nova versão da mesma proposta lógica.
      const v2 = await salvarProposta(client, {
        proposta: proposta(cand, { confianca: 88 }),
        propostaLogicaId: v1.propostaLogicaId,
      });
      await decidir(client,
        { recomendacao_id: v2.id, decisao: "aprovada_para_revisao_de_oportunidade", motivo: "Nova evidência." },
        { usuarioId: null });

      const historico = await historicoDecisoes(client, v1.propostaLogicaId);
      expect(historico).toHaveLength(2);
      expect(historico.map((h) => h.decisao).sort()).toEqual(
        ["aprovada_para_revisao_de_oportunidade", "rejeitada"]
      );

      // A decisão da v1 não mudou retroativamente.
      const decisaoV1 = historico.find((h) => h.recomendacaoVersao === 1)!;
      expect(decisaoV1.decisao).toBe("rejeitada");
    });
  });
});

describe("O–U · Zero efeito operacional", () => {
  it("nenhuma decisão cria candidatura, Paper, Score Card, projeto ou parceria", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand ZeroOp AI07A");
      const antes = await contarOperacional(client);

      // Aprovar
      const a = await salvarProposta(client, { proposta: proposta(cand) });
      await decidir(client,
        { recomendacao_id: a.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });

      // Editar + aprovar
      const b = await salvarProposta(client, { proposta: proposta(cand) });
      await decidir(client, {
        recomendacao_id: b.id, decisao: "aprovada_com_edicoes",
        edicoes: { hipotese_oportunidade: "Outra leitura." },
      }, { usuarioId: null });

      // Rejeitar
      const c = await salvarProposta(client, { proposta: proposta(cand) });
      await decidir(client,
        { recomendacao_id: c.id, decisao: "rejeitada", motivo: "Não faz sentido." },
        { usuarioId: null });

      const depois = await contarOperacional(client);
      expect(depois).toEqual(antes);
    });
  });
});

describe("V/W · RN022 e RN023 preservadas", () => {
  it("RN022: avaliacao_score_card continua exigindo candidatura e Paper", async () => {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'cross_methodologies'
            AND table_name   = 'avaliacao_score_card'
            AND column_name IN ('candidatura_parceiro_id','validacao_paper_id')
          ORDER BY column_name`
      );
      expect(rows).toHaveLength(2);
      // Se alguma virasse nullable, o Score Card poderia ser aplicado sem
      // candidatura ou sem Paper aprovado — exatamente o que RN022 impede.
      for (const r of rows) {
        expect(r.is_nullable).toBe("NO");
      }
    });
  });

  it("RN023: os pesos versionados continuam sendo a fonte da pontuação", async () => {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'cross_methodologies'
            AND table_name   = 'criterio_score_card'
            AND column_name IN ('peso_sim','peso_nao')
          ORDER BY column_name`
      );
      expect(rows.map((r) => r.column_name)).toEqual(["peso_nao", "peso_sim"]);

      // E a avaliação continua guardando o score derivado, não um valor livre.
      const { rows: score } = await client.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema='cross_methodologies' AND table_name='avaliacao_score_card'
            AND column_name='score_total'`
      );
      expect(score[0].is_nullable).toBe("NO");
    });
  });

  it("o Human Gate não referencia Score Card nem candidatura", async () => {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='cross_ai' AND table_name='recomendacao_revisao'`
      );
      const colunas = rows.map((r) => r.column_name);
      expect(colunas).not.toContain("candidatura_parceiro_id");
      expect(colunas).not.toContain("avaliacao_score_card_id");
      expect(colunas).not.toContain("validacao_paper_id");
    });
  });
});

describe("X/Y · Zero IA paga", () => {
  it("o Human Gate não consome LLM nem embeddings", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Cand SemIA AI07A");
      const salva = await salvarProposta(client, { proposta: proposta(cand) });

      const antes = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.consumo_ia WHERE local = FALSE`
      );
      await decidir(client,
        { recomendacao_id: salva.id, decisao: "aprovada_para_revisao_de_oportunidade" },
        { usuarioId: null });
      const depois = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cross_ai.consumo_ia WHERE local = FALSE`
      );

      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });
});
