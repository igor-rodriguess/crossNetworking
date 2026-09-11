import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { salvarProposta, listarVersoes } from "./recomendacao.repository";
import type { RecommendationProposal } from "./recomendacao.schema";

// -----------------------------------------------------------------------------
// Persistência da Recommendation — §36, §37 e §52 da AI-06.
//
// Prova que a proposta é auditável depois e que persistir NÃO cria registro
// operacional.
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

function proposta(
  candidatoId: string,
  over: Partial<RecommendationProposal> = {}
): RecommendationProposal {
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
    racional: ["sinal de público forte"],
    evidencias_suporte: [],
    crossability_suporte: [],
    sinais_suporte: [],
    contra_evidencias: [],
    riscos: [],
    questoes_abertas: ["Confirmar interesse atual."],
    lacunas: [],
    proximo_passo: "preparar_para_human_gate",
    confianca: 62,
    componentes_confianca: [],
    nivel_validacao: "estrutural",
    limitacoes: ["semantic_matching_pendente"],
    rejeitados: [],
    proveniencia: {
      matching_direcao: "cliente_para_parceiro",
      matching_pesos_versao: "retrieval-v1",
      perfil_origem_versao: 1,
      perfil_candidato_versao: 2,
      crossability_hash: "hash-cross",
      hash_entrada: "hash-entrada-1",
    },
    telemetria: {
      duracao_ms: 5, llm_calls: 0, embedding_calls: 0, custo_estimado_usd: 0,
      oportunidades_criadas: 0, projetos_criados: 0, parcerias_criadas: 0,
      reunioes_criadas: 0, mudancas_funil: 0, score_card_executado: false,
    },
    ...over,
  } as RecommendationProposal;
}

describe("Persistência da Recommendation", () => {
  it("grava e permite auditar o que sustentou a proposta", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Candidata Persist AI06");
      const r = await salvarProposta(client, { proposta: proposta(cand) });

      const { rows } = await client.query(
        `SELECT direcao, status, nivel_sustentacao, confianca, nivel_validacao,
                perfil_candidato_versao, crossability_hash, matching_pesos_versao, hash_entrada
           FROM cross_ai.recomendacao WHERE id = $1`,
        [r.id]
      );
      const l = rows[0];
      expect(l.direcao).toBe("cliente_para_parceiro");
      expect(l.status).toBe("pronta_para_revisao");
      expect(l.confianca).toBe(62);
      expect(l.nivel_validacao).toBe("estrutural");
      expect(l.perfil_candidato_versao).toBe(2);
      expect(l.crossability_hash).toBe("hash-cross");
      expect(l.matching_pesos_versao).toBe("retrieval-v1");
    });
  });

  it("hipótese nula é persistida como recusa legítima", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Sem Sustentacao AI06");
      const r = await salvarProposta(client, {
        proposta: proposta(cand, {
          hipotese_oportunidade: null,
          status: "sustentacao_insuficiente",
          nivel_sustentacao: "sustentacao_insuficiente",
        }),
      });

      const { rows } = await client.query(
        `SELECT hipotese_oportunidade, status FROM cross_ai.recomendacao WHERE id = $1`,
        [r.id]
      );
      expect(rows[0].hipotese_oportunidade).toBeNull();
      expect(rows[0].status).toBe("sustentacao_insuficiente");
    });
  });

  it("reexecutar cria nova versão sem apagar a anterior", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Versionada AI06");
      const v1 = await salvarProposta(client, { proposta: proposta(cand) });

      // Evidence mudou → nova proposta, mesma proposta lógica.
      const v2 = await salvarProposta(client, {
        proposta: proposta(cand, {
          confianca: 78,
          proveniencia: {
            ...proposta(cand).proveniencia,
            hash_entrada: "hash-entrada-2",
          },
        }),
        propostaLogicaId: v1.propostaLogicaId,
      });

      expect(v2.propostaLogicaId).toBe(v1.propostaLogicaId);
      expect(v2.versao).toBe(2);
      expect(v2.id).not.toBe(v1.id);

      const historico = await listarVersoes(client, v1.propostaLogicaId);
      expect(historico).toHaveLength(2);
      expect(historico[0].versao).toBe(2);
      // As duas continuam auditáveis, com hashes distintos.
      expect(new Set(historico.map((h) => h.hashEntrada)).size).toBe(2);
    });
  });

  it("persistir NÃO cria oportunidade, projeto nem candidatura", async () => {
    await withTransaction(async (client) => {
      const cand = await criarParte(client, "Sem Efeito AI06");

      const contar = async () => {
        const { rows } = await client.query<{ n: string }>(
          `SELECT (
             (SELECT count(*) FROM cross_projects.candidatura_parceiro) +
             (SELECT count(*) FROM cross_projects.projeto) +
             (SELECT count(*) FROM cross_projects.frente_oportunidade) +
             (SELECT count(*) FROM cross_ai.oportunidade_ia)
           )::text AS n`
        );
        return rows[0].n;
      };

      const antes = await contar();
      await salvarProposta(client, { proposta: proposta(cand) });
      expect(await contar()).toBe(antes);
    });
  });
});
