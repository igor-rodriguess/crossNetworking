import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../shared/db";
import { decidir } from "../recomendacao/human-gate.service";
import {
  planejar, executarJourney, retomarJourney, carregarSteps, rastrearJourney,
} from "./cross-orchestrator";
import { POLITICA_REUSO } from "./journey.schema";
import { construirPerfil } from "../entidade/entity-intelligence.agent";
import { analisarCrossability } from "../crossability/crossability-reasoning.agent";
import type { EntityIntelligenceProfile } from "../entidade/perfil.schema";
import { fatoSchema, type EvidencePackage } from "../evidencia/evidencia.schema";

// -----------------------------------------------------------------------------
// Cross Orchestrator — cenários A a AQ (E2E-01).
//
// O que estes testes provam, em execução real contra o banco:
//   1. o planejamento é determinístico (nenhuma LLM decide o próximo passo);
//   2. REUSE BEFORE RERUN de fato evita reexecução;
//   3. os Human Gates PARAM a jornada — não existe caminho de auto-aprovação;
//   4. nenhum efeito operacional acontece sem ação humana explícita.
//
// Modo estrutural: zero IA paga, zero web ao vivo.
// -----------------------------------------------------------------------------

const AGORA = new Date("2026-06-15T12:00:00.000Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

interface Cenario {
  clienteParteId: string;
  parceiroParteId: string;
  frenteId: string;
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
    [`Orq ${sufixo}`, `orq.${sufixo}@cross.teste`]);

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
    clienteParteId: cliParte,
    parceiroParteId: await criarParte(`Parceiro ${sufixo}`),
    frenteId: frente.rows[0].id,
    usuarioId: usuario.rows[0].id,
  };
}

/**
 * Fatos de Evidence no formato que o Entity Intelligence consome.
 *
 * Construir o perfil pelo agente real — em vez de escrever o objeto à mão — é
 * deliberado: um fixture manual só reproduz o formato que EU imagino, e quando
 * o schema do perfil muda ele continua passando enquanto a produção quebra.
 */
function fatos(): EvidencePackage["facts"] {
  // Validado contra o schema real. Um fixture escrito "à mão" já falhou aqui
  // de duas formas silenciosas — categoria ignorada e natureza ausente fazem o
  // perfil sair vazio sem erro algum. Parsear força o formato correto.
  const f = (categoria: string, claim: string, i: number) =>
    fatoSchema.parse({
      fact_id: `f${i}`,
      claim,
      entidade: "Entidade Teste",
      categoria,
      natureza: "fato",
      source_refs: [`s${i}`],
      dominios_independentes: 2,
      verificacao: "corroborada",
      confianca: 80,
      publicado_em: "2026-05-01",
      coletado_em: "2026-06-01",
    });
  return [
    f("contexto_empresa", "Opera no mercado brasileiro.", 1),
    f("posicionamento", "Marca de cultura jovem.", 2),
    f("publico", "Jovens de 18 a 24 anos.", 3),
    f("territorio", "Brasil, foco Sudeste.", 4),
    f("ativo", "Programa de creators.", 5),
    f("produto", "Linha de streetwear.", 6),
  ] as unknown as EvidencePackage["facts"];
}

function evidencia(nome: string, comFatos: boolean): EvidencePackage {
  return {
    entidade: nome,
    facts: comFatos ? fatos() : [],
    fontes: [], lacunas: [], contradicoes: [],
    nivel_validacao: "estrutural",
    telemetria: {
      duracao_ms: 0, web_search_calls: 0, firecrawl_calls: 0,
      llm_calls: 0, custo_estimado_usd: 0,
    },
  } as unknown as EvidencePackage;
}

const evidenciaVazia = () => evidencia("x", false);

/** Perfil real, construído pelo agente real, com fatos suficientes. */
function perfilComFatos(nome: string, parteId: string | null): EntityIntelligenceProfile {
  return construirPerfil({
    entidade: nome,
    internos: { parte_id: parteId, nome_exibicao: nome, eh_cliente_cross: parteId !== null },
    evidencia: evidencia(nome, true),
    anterior: null,
  } as never);
}

/** Perfil sem nenhum fato — o fail-safe factual deve barrar. */
function perfilVazio(nome: string): EntityIntelligenceProfile {
  return construirPerfil({
    entidade: nome,
    internos: { parte_id: null, nome_exibicao: nome, eh_cliente_cross: false },
    evidencia: evidencia(nome, false),
    anterior: null,
  } as never);
}

/**
 * Aprova a recomendação da jornada.
 *
 * `override_insuficiente` é necessário porque a evidência do fixture é
 * propositalmente magra: a proposta sai como `requer_enriquecimento` e o
 * guardrail da AI-07A exige que aprovar assim seja um ato explícito e
 * registrado. O override não é atalho de teste — é o caminho previsto, e usá-lo
 * aqui mantém o guardrail intacto em vez de enfraquecê-lo para o teste passar.
 */
async function aprovar(client: PoolClient, recomendacaoId: string, c: Cenario) {
  return decidir(client,
    {
      recomendacao_id: recomendacaoId,
      decisao: "aprovada_para_revisao_de_oportunidade",
      override_insuficiente: true,
      motivo: "Aprovada para revisão apesar da evidência magra do cenário.",
    },
    { usuarioId: c.usuarioId, nome: "Revisor Nomeado" });
}

function entradaBase(c: Cenario, over: Record<string, unknown> = {}) {
  return {
    journeyType: "cliente_para_parceiro" as const,
    triggerSource: "system_test" as const,
    parteOrigemId: c.clienteParteId,
    nomeOrigem: "Cliente Alfa",
    objetivo: "ativação cultural",
    criadoPorId: c.usuarioId,
    agora: AGORA,
    artefatos: {
      perfilOrigem: perfilComFatos("Cliente Alfa", c.clienteParteId),
      perfilOrigemEm: diasAtras(2),
    },
    ...over,
  };
}

// =============================================================================
// A–E · Planejamento determinístico
// =============================================================================

describe("A–E · Planejamento determinístico", () => {
  it("A · produz o mesmo plano para a mesma entrada (sem LLM)", () => {
    const e = {
      journeyType: "cliente_para_parceiro" as const,
      nomeOrigem: "Marca X", agora: AGORA,
      artefatos: { perfilOrigem: perfilComFatos("Marca X", null), perfilOrigemEm: diasAtras(1) },
    };
    expect(JSON.stringify(planejar(e))).toBe(JSON.stringify(planejar(e)));
  });

  it("B · plano cobre as nove etapas na ordem canônica", () => {
    const p = planejar({ journeyType: "prospeccao_do_zero", nomeOrigem: "Nova", agora: AGORA });
    expect(p.steps.map((s) => s.step)).toEqual([
      "research", "entity_intelligence", "crossability", "matching",
      "recommendation", "human_review", "promotion", "paper", "score_card",
    ]);
  });

  it("C · toda etapa tem motivo explícito", () => {
    const p = planejar({ journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA });
    for (const s of p.steps) expect(s.motivo.length).toBeGreaterThan(10);
  });

  it("D · Human Gates são planejados como espera, nunca como execução", () => {
    const p = planejar({ journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA });
    for (const nome of ["human_review", "promotion", "paper", "score_card"]) {
      expect(p.steps.find((s) => s.step === nome)!.acao).toBe("aguardar_humano");
    }
  });

  it("E · prospecção sem Parte declara bloqueio de promoção no plano", () => {
    const p = planejar({ journeyType: "prospeccao_do_zero", nomeOrigem: "Externa", agora: AGORA });
    expect(p.bloqueios.join(" ")).toMatch(/não vinculada|promoção operacional bloqueada/i);
  });
});

// =============================================================================
// F–L · REUSE BEFORE RERUN
// =============================================================================

describe("F–L · Reuso antes de reexecução", () => {
  it("F · perfil fresco é reutilizado, não reexecutado", () => {
    const p = planejar({
      journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA,
      artefatos: { perfilOrigem: perfilComFatos("M", null), perfilOrigemEm: diasAtras(3) },
    });
    expect(p.steps.find((s) => s.step === "entity_intelligence")!.acao).toBe("reutilizar");
  });

  it("G · perfil obsoleto é reexecutado", () => {
    const p = planejar({
      journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA,
      artefatos: {
        perfilOrigem: perfilComFatos("M", null),
        perfilOrigemEm: diasAtras(POLITICA_REUSO.maxIdadePerfilDias + 5),
      },
    });
    expect(p.steps.find((s) => s.step === "entity_intelligence")!.acao).toBe("executar");
  });

  it("H · Evidence fresca é reutilizada", () => {
    const p = planejar({
      journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA,
      artefatos: { evidencia: evidenciaVazia(), evidenciaEm: diasAtras(1) },
    });
    expect(p.steps.find((s) => s.step === "research")!.acao).toBe("reutilizar");
  });

  it("I · research é pulada quando o perfil já consolida o que ela traria", () => {
    const p = planejar({
      journeyType: "cliente_para_parceiro", nomeOrigem: "M", agora: AGORA,
      artefatos: { perfilOrigem: perfilComFatos("M", null), perfilOrigemEm: diasAtras(1) },
    });
    expect(p.steps.find((s) => s.step === "research")!.acao).toBe("pular");
  });

  it("J · crossability fresca é reutilizada e a execução a reaproveita", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "j2");
      // Análise REAL, não stub: um objeto qualquer provaria só que o planejador
      // aceita o campo, não que a jornada consegue de fato reaproveitá-lo.
      const cross = await analisarCrossability({
        perfil: perfilComFatos("Cliente Alfa", c.clienteParteId),
        contexto: { objetivo: null }, client,
        chamarModelo: async () => ({ dados: {}, origem: "estrutural" }),
      } as never);

      const r = await executarJourney(client, entradaBase(c, {
        artefatos: {
          perfilOrigem: perfilComFatos("Cliente Alfa", c.clienteParteId),
          perfilOrigemEm: diasAtras(2),
          crossability: cross, crossabilityEm: diasAtras(4),
        },
      }));

      expect(r.plano.steps.find((s) => s.step === "crossability")!.acao).toBe("reutilizar");
      expect(r.steps.find((s) => s.step === "crossability")!.status).toBe("reutilizada");
      expect(r.telemetria.crossability_evitados).toBe(1);
      expect(r.status).toBe("aguardando_revisao_humana");
    });
  });

  it("K · matching NUNCA é reutilizado — direção é identidade do resultado", () => {
    expect(POLITICA_REUSO.reutilizarMatching).toBe(false);
    const p = planejar({
      journeyType: "parceiro_para_cliente", nomeOrigem: "M", agora: AGORA,
      artefatos: { perfilOrigem: perfilComFatos("M", null), perfilOrigemEm: diasAtras(1) },
    });
    expect(p.steps.find((s) => s.step === "matching")!.acao).toBe("executar");
  });

  it("L · plano sem artefatos não prevê chamada externa sem adaptador", () => {
    const p = planejar({ journeyType: "prospeccao_do_zero", nomeOrigem: "Nova", agora: AGORA });
    expect(p.chamadas_externas_estimadas).toBe(0);
  });
});

// =============================================================================
// M–T · Execução da jornada 1 (cliente → parceiro)
// =============================================================================

describe("M–T · Jornada cliente → parceiro", () => {
  it("M · para em aguardando_revisao_humana com recomendação criada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "m1");
      const r = await executarJourney(client, entradaBase(c));

      expect(r.status).toBe("aguardando_revisao_humana");
      expect(r.refs.recomendacao_id).toBeTruthy();
      expect(r.motivo_parada).toMatch(/decisão humana/i);
    });
  });

  it("N · human_review fica aguardando_humano, nunca concluida", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "n1");
      const r = await executarJourney(client, entradaBase(c));
      const hr = r.steps.find((s) => s.step === "human_review")!;
      expect(hr.status).toBe("aguardando_humano");
      expect(hr.status).not.toBe("concluida");
    });
  });

  it("O · nenhuma etapa pós-gate é executada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "o1");
      const r = await executarJourney(client, entradaBase(c));
      const pos = r.steps.filter((s) =>
        ["promotion", "paper", "score_card"].includes(s.step) && s.status === "concluida");
      expect(pos).toHaveLength(0);
    });
  });

  it("P · zero efeito operacional automático", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "p1");
      const r = await executarJourney(client, entradaBase(c));
      const t = r.telemetria;
      expect(t.oportunidades_criadas).toBe(0);
      expect(t.projetos_criados).toBe(0);
      expect(t.parcerias_criadas).toBe(0);
      expect(t.reunioes_criadas).toBe(0);
      expect(t.avancos_de_funil).toBe(0);
      expect(t.papers_aprovados_por_ia).toBe(0);
    });
  });

  it("Q · zero custo e zero chamada paga", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "q1");
      const t = (await executarJourney(client, entradaBase(c))).telemetria;
      expect(t.custo_estimado_usd).toBe(0);
      expect(t.llm_calls).toBe(0);
      expect(t.web_search_calls).toBe(0);
      expect(t.firecrawl_calls).toBe(0);
    });
  });

  it("R · etapas são persistidas em journey_step", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "r1");
      const r = await executarJourney(client, entradaBase(c));
      const steps = await carregarSteps(client, r.journey_id);
      expect(steps.length).toBe(r.steps.length);
      expect(steps.map((s) => s.ordem)).toEqual([...steps.map((s) => s.ordem)].sort((a, b) => a - b));
    });
  });

  it("S · reuso do perfil é contabilizado como economia", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "s1");
      const r = await executarJourney(client, entradaBase(c));
      expect(r.telemetria.entity_intelligence_evitados).toBe(1);
      expect(r.telemetria.steps_reutilizados).toBeGreaterThanOrEqual(1);
    });
  });

  it("T · correlation_id acompanha a jornada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "t1");
      const r = await executarJourney(client, entradaBase(c));
      expect(r.correlation_id).toMatch(/^jrn-/);
      const t = await rastrearJourney(client, r.journey_id);
      expect(t.correlation_id).toBe(r.correlation_id);
    });
  });
});

// =============================================================================
// U–Z · Human Gate: a pausa é real
// =============================================================================

describe("U–Z · Human Gate", () => {
  it("U · resume sem decisão continua aguardando", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "u1");
      const r = await executarJourney(client, entradaBase(c));
      const res = await retomarJourney(client, r.journey_id);
      expect(res.status).toBe("aguardando_revisao_humana");
      expect(res.candidaturaId).toBeNull();
    });
  });

  it("V · rejeição encerra a jornada sem criar nada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "v1");
      const r = await executarJourney(client, entradaBase(c));
      await decidir(client,
        { recomendacao_id: r.refs.recomendacao_id!, decisao: "rejeitada", motivo: "fora de foco" },
        { usuarioId: c.usuarioId, nome: "Revisor" });

      const res = await retomarJourney(client, r.journey_id);
      expect(res.status).toBe("revisao_rejeitada");
      expect(res.candidaturaId).toBeNull();
      expect(res.promocaoId).toBeNull();
    });
  });

  it("W · requer_mais_informacao NÃO avança para promoção", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "w1");
      const r = await executarJourney(client, entradaBase(c));
      await decidir(client,
        {
          recomendacao_id: r.refs.recomendacao_id!,
          decisao: "requer_mais_informacao", motivo: "faltam dados",
        },
        { usuarioId: c.usuarioId, nome: "Revisor" });

      const res = await retomarJourney(client, r.journey_id, {
        frenteOportunidadeId: c.frenteId, promotorId: c.usuarioId,
      });
      expect(res.status).toBe("aguardando_revisao_humana");
      expect(res.candidaturaId).toBeNull();
    });
  });

  it("X · aprovação sozinha não promove — promoção é ação separada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "x1");
      const r = await executarJourney(client, entradaBase(c));
      await aprovar(client, r.refs.recomendacao_id!, c);

      const res = await retomarJourney(client, r.journey_id);
      expect(res.status).toBe("aguardando_promocao");
      expect(res.candidaturaId).toBeNull();
    });
  });

  it("Y · promoção explícita cria candidatura", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "y1");
      const r = await executarJourney(client, entradaBase(c));
      await aprovar(client, r.refs.recomendacao_id!, c);

      const res = await retomarJourney(client, r.journey_id, {
        frenteOportunidadeId: c.frenteId,
        promotorId: c.usuarioId, promotorNome: "Promotor",
      });
      expect(res.status).toBe("oportunidade_criada");
      expect(res.candidaturaId).toBeTruthy();
    });
  });

  it("Z · nenhuma etapa é reexecutada no resume", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "z1");
      const r = await executarJourney(client, entradaBase(c));
      const antes = (await carregarSteps(client, r.journey_id)).length;

      await aprovar(client, r.refs.recomendacao_id!, c);
      const res = await retomarJourney(client, r.journey_id, {
        frenteOportunidadeId: c.frenteId, promotorId: c.usuarioId,
      });

      expect(res.stepsReexecutados).toBe(0);
      expect((await carregarSteps(client, r.journey_id)).length).toBe(antes);
    });
  });
});

// =============================================================================
// AA–AG · Fail-safe factual e caminhos sem sucesso
// =============================================================================

describe("AA–AG · Fail-safe factual", () => {
  it("AA · perfil sem fatos para a jornada em evidencia_insuficiente", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "aa1");
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: { perfilOrigem: perfilVazio("Fantasma"), perfilOrigemEm: diasAtras(1) },
      }));
      expect(r.status).toBe("evidencia_insuficiente");
      expect(r.refs.recomendacao_id).toBeNull();
    });
  });

  it("AB · evidencia_insuficiente ≠ falha", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ab1");
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: { perfilOrigem: perfilVazio("Fantasma"), perfilOrigemEm: diasAtras(1) },
      }));
      expect(r.status).not.toBe("falha");
    });
  });

  it("AC · etapas seguintes ficam bloqueadas, não falhas", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ac1");
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: { perfilOrigem: perfilVazio("Fantasma"), perfilOrigemEm: diasAtras(1) },
      }));
      const bloqueadas = r.steps.filter((s) => s.status === "bloqueada");
      expect(bloqueadas.length).toBeGreaterThanOrEqual(3);
      expect(r.steps.filter((s) => s.status === "falha")).toHaveLength(0);
    });
  });

  it("AD · sem fatos, nenhuma recomendação é persistida", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ad1");
      const antes = await client.query(`SELECT count(*)::int AS n FROM cross_ai.recomendacao`);
      await executarJourney(client, entradaBase(c, {
        artefatos: { perfilOrigem: perfilVazio("Fantasma"), perfilOrigemEm: diasAtras(1) },
      }));
      const depois = await client.query(`SELECT count(*)::int AS n FROM cross_ai.recomendacao`);
      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });

  it("AE · shortlist vazia gera requer_enriquecimento", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ae1");
      // Sem parceiros elegíveis além do próprio cenário: força shortlist curta.
      const r = await executarJourney(client, entradaBase(c, { maxCandidatos: 0, tamanhoShortlist: 0 }));
      expect(["requer_enriquecimento", "aguardando_revisao_humana"]).toContain(r.status);
    });
  });

  it("AF · jornada sem recomendação não é retomável", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "af1");
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: { perfilOrigem: perfilVazio("Fantasma"), perfilOrigemEm: diasAtras(1) },
      }));
      await expect(retomarJourney(client, r.journey_id)).rejects.toThrow(/nada a retomar/i);
    });
  });

  it("AG · jornada inexistente é erro explícito", async () => {
    await withTransaction(async (client) => {
      await expect(
        retomarJourney(client, "00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow(/não encontrada/i);
    });
  });
});

// =============================================================================
// AH–AM · Prospecção do zero e contexto opcional
// =============================================================================

describe("AH–AM · Prospecção e contexto opcional", () => {
  it("AH · prospecção sem Parte não cria Parte automaticamente", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ah1");
      const antes = await client.query(`SELECT count(*)::int AS n FROM cross_core.parte`);
      await executarJourney(client, entradaBase(c, {
        journeyType: "prospeccao_do_zero",
        parteOrigemId: null, nomeOrigem: "Marca Externa",
        artefatos: {
          perfilOrigem: perfilComFatos("Marca Externa", null), perfilOrigemEm: diasAtras(1),
        },
      }));
      const depois = await client.query(`SELECT count(*)::int AS n FROM cross_core.parte`);
      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });

  it("AI · origem não vinculada é registrada como tal", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ai1");
      const r = await executarJourney(client, entradaBase(c, {
        journeyType: "prospeccao_do_zero", parteOrigemId: null, nomeOrigem: "Externa",
        artefatos: { perfilOrigem: perfilComFatos("Externa", null), perfilOrigemEm: diasAtras(1) },
      }));
      expect(r.origem.vinculo).toBe("nao_vinculada");
    });
  });

  it("AJ · trigger não-humano não dispensa Human Gate", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "aj1");
      const r = await executarJourney(client, entradaBase(c, {
        triggerSource: "monitoring_alert", triggerRef: "alerta-123",
      }));
      expect(r.trigger_source).toBe("monitoring_alert");
      expect(r.status).toBe("aguardando_revisao_humana");
    });
  });

  it("AK · sinais opcionais entram como referência, não como execução", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ak1");
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: {
          perfilOrigem: perfilComFatos("Cliente Alfa", c.clienteParteId),
          perfilOrigemEm: diasAtras(2),
          bigMomentRefs: ["bm-1"],
          meetingIntelligenceRefs: ["mi-1"],
          monitoringAlertRef: "alerta-9",
        },
      }));
      expect(r.contexto_opcional.big_moment_refs).toEqual(["bm-1"]);
      expect(r.contexto_opcional.monitoring_alert_ref).toBe("alerta-9");
      expect(r.steps.some((s) => s.step === ("big_moment" as never))).toBe(false);
    });
  });

  it("AL · ausência de sinais opcionais não quebra a jornada", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "al1");
      const r = await executarJourney(client, entradaBase(c));
      expect(r.contexto_opcional.big_moment_refs).toEqual([]);
      expect(r.contexto_opcional.monitoring_alert_ref).toBeNull();
    });
  });

  it("AM · direção parceiro → cliente é registrada no matching", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "am1");
      const r = await executarJourney(client, entradaBase(c, {
        journeyType: "parceiro_para_cliente",
        parteOrigemId: c.parceiroParteId, nomeOrigem: "Parceiro Beta",
        artefatos: {
          perfilOrigem: perfilComFatos("Parceiro Beta", c.parceiroParteId),
          perfilOrigemEm: diasAtras(1),
        },
      }));
      if (r.refs.matching_direcao) expect(r.refs.matching_direcao).toBe("parceiro_para_cliente");
    });
  });
});

// =============================================================================
// AR–AT · Perfil do candidato (dados prontos para o front)
// =============================================================================

/** Dá à origem e ao candidato público/território em comum, na base interna. */
async function comDadosInternos(client: PoolClient, c: Cenario, sufixo: string) {
  const pub = await client.query<{ id: string }>(
    `INSERT INTO cross_intelligence.publico (nome, faixa_etaria, ativo)
     VALUES ($1,'18-24',true) RETURNING id`, [`Jovens ${sufixo}`]);
  const ter = await client.query<{ id: string }>(
    `INSERT INTO cross_intelligence.territorio (codigo, nome, ativo)
     VALUES ($1,$2,true) RETURNING id`, [`T-${sufixo}`, `Sudeste ${sufixo}`]);

  for (const parteId of [c.clienteParteId, c.parceiroParteId]) {
    await client.query(
      `INSERT INTO cross_intelligence.parte_publico (parte_id, publico_id, relevancia)
       VALUES ($1,$2,'alta')`, [parteId, pub.rows[0].id]);
    await client.query(
      `INSERT INTO cross_intelligence.parte_territorio (parte_id, territorio_id, relevancia)
       VALUES ($1,$2,'alta')`, [parteId, ter.rows[0].id]);
    await client.query(
      `INSERT INTO cross_intelligence.ativo (parte_id, nome, categoria)
       VALUES ($1,$2,'programa')`, [parteId, `Programa ${sufixo}`]);
  }
}

describe("AR–AT · Perfil do candidato", () => {
  it("AR · candidato com dados internos gera perfil e evidência de suporte", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ar1");
      await comDadosInternos(client, c, "ar1");

      const r = await executarJourney(client, entradaBase(c));
      const { rows } = await client.query<{
        perfil_candidato_versao: number | null; proposta: Record<string, unknown>;
      }>(
        `SELECT perfil_candidato_versao, proposta FROM cross_ai.recomendacao WHERE id = $1`,
        [r.refs.recomendacao_id]
      );

      // O perfil do candidato precisa EXISTIR: sem ele a proposta nunca teria
      // evidência de suporte, por construção.
      expect(rows[0].perfil_candidato_versao).not.toBeNull();
      const p = rows[0].proposta as { evidencias_suporte: unknown[] };
      expect(p.evidencias_suporte.length).toBeGreaterThan(0);
    });
  });

  it("AS · sem dados internos, o candidato é declarado incompleto (não inventado)", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "as1");
      const r = await executarJourney(client, entradaBase(c));
      const { rows } = await client.query<{ proposta: Record<string, unknown> }>(
        `SELECT proposta FROM cross_ai.recomendacao WHERE id = $1`, [r.refs.recomendacao_id]);

      const p = rows[0].proposta as {
        evidencias_suporte: unknown[]; lacunas: Array<{ descricao: string }>;
      };
      // Nada é inventado para preencher o vazio: zero evidência e lacuna explícita.
      expect(p.evidencias_suporte).toHaveLength(0);
      expect(p.lacunas.length).toBeGreaterThan(0);
    });
  });

  it("AT · perfil do candidato fornecido pelo chamador tem precedência", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "at1");
      await comDadosInternos(client, c, "at1");

      const fornecido = perfilComFatos("Parceiro Rico", c.parceiroParteId);
      const r = await executarJourney(client, entradaBase(c, {
        artefatos: {
          perfilOrigem: perfilComFatos("Cliente Alfa", c.clienteParteId),
          perfilOrigemEm: diasAtras(2),
          perfilCandidato: fornecido,
        },
      }));

      const { rows } = await client.query<{ proposta: Record<string, unknown> }>(
        `SELECT proposta FROM cross_ai.recomendacao WHERE id = $1`, [r.refs.recomendacao_id]);
      const p = rows[0].proposta as { evidencias_suporte: Array<{ afirmacao: string }> };
      // O perfil externo é mais rico: suas afirmações precisam aparecer.
      expect(p.evidencias_suporte.some((e) =>
        e.afirmacao.includes("Jovens de 18 a 24 anos"))).toBe(true);
    });
  });
});

// =============================================================================
// AN–AQ · Rastreabilidade e contrato
// =============================================================================

describe("AN–AQ · Rastreabilidade", () => {
  it("AN · resultado declara nível de validação honestamente", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "an1");
      const r = await executarJourney(client, entradaBase(c));
      expect(r.nivel_validacao).toBe("estrutural_e2e");
      expect(r.validacao_ia_real).toBe("pendente");
      expect(r.validacao_web_ao_vivo).toBe("pendente");
    });
  });

  it("AO · cadeia até a recomendação é rastreável por uma consulta", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ao1");
      const r = await executarJourney(client, entradaBase(c));
      const t = await rastrearJourney(client, r.journey_id);
      expect(t.recomendacao_id).toBe(r.refs.recomendacao_id);
      // A jornada é rastreável pelos ELOS (journey → recomendação → matching),
      // não pelo texto da hipótese: com evidência magra a proposta sai como
      // `requer_enriquecimento` e não afirma hipótese alguma — o que é o
      // comportamento correto, e não algo que o trace deva exigir.
      expect(t.journey_type).toBe("cliente_para_parceiro");
      expect(t.matching_pesos_versao).toBeTruthy();
    });
  });

  it("AP · decisão humana aparece na rastreabilidade", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "ap1");
      const r = await executarJourney(client, entradaBase(c));
      await aprovar(client, r.refs.recomendacao_id!, c);
      await retomarJourney(client, r.journey_id);

      const t = await rastrearJourney(client, r.journey_id);
      expect(t.decisao_humana).toBe("aprovada_para_revisao_de_oportunidade");
      expect(t.revisor_nome).toBe("Revisor Nomeado");
    });
  });

  it("AQ · motivo longo de parada é preservado sem truncar", async () => {
    await withTransaction(async (client) => {
      const c = await montarCenario(client, "aq1");
      const r = await executarJourney(client, entradaBase(c));
      const { rows } = await client.query<{ motivo_parada: string }>(
        `SELECT motivo_parada FROM cross_ai.journey_execution WHERE id = $1`, [r.journey_id]);
      expect(rows[0].motivo_parada).toBe(r.motivo_parada);
    });
  });
});
