import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Parcerias — formalização, negociação, contrapartidas e contratos (RF034–RF037)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

async function criarParte(nome = `Parceiro ${unico()}`): Promise<string> {
  const res = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return res.body.id as string;
}

interface Cenario {
  projetoId: string;
  frenteId: string;
  candidaturaId: string;
}

/** Cliente → projeto → frente → candidatura. */
async function montarCenario(): Promise<Cenario> {
  const marcaId = await criarParte(`Marca ${unico()}`);
  const cliente = await request(app).post("/v1/clientes").send({ parte_id: marcaId }).expect(201);
  const projeto = await request(app)
    .post("/v1/projetos")
    .send({ cliente_cross_id: cliente.body.id, nome: "Projeto", objetivo: "Parcerias" })
    .expect(201);
  const frente = await request(app)
    .post(`/v1/projetos/${projeto.body.id}/frentes`)
    .send({ nome: "Frente", objetivo: "Objetivo" })
    .expect(201);
  const parceiroId = await criarParte();
  const cand = await request(app)
    .post(`/v1/frentes/${frente.body.id}/candidaturas`)
    .send({ parte_id: parceiroId })
    .expect(201);

  return {
    projetoId: projeto.body.id,
    frenteId: frente.body.id,
    candidaturaId: cand.body.id,
  };
}

/** Paper validado na frente — pré-requisito de RN026. */
async function validarPaper(frenteId: string): Promise<void> {
  const paper = await request(app)
    .post(`/v1/frentes/${frenteId}/papers`)
    .send({ titulo: "Paper" })
    .expect(201);
  const versao = await request(app)
    .post(`/v1/papers/${paper.body.id}/versoes`)
    .send({ estrategia_proposta: "Co-branding" })
    .expect(201);
  await request(app)
    .post(`/v1/versoes-paper/${versao.body.id}/validacoes`)
    .send({ tipo_validacao_codigo: "cliente", status_validacao_codigo: "aprovada" })
    .expect(201);
}

/** Cenário pronto para formalizar: Paper validado + decisão aprovada. */
async function cenarioAprovado(): Promise<Cenario> {
  const cenario = await montarCenario();
  await validarPaper(cenario.frenteId);
  await request(app)
    .post(`/v1/candidaturas/${cenario.candidaturaId}/decisoes`)
    .send({ tipo_decisao_codigo: "aprovada", justificativa: "Score alto" })
    .expect(201);
  return cenario;
}

function formalizar(candidaturaId: string, corpo: Record<string, unknown> = {}) {
  return request(app).post(`/v1/candidaturas/${candidaturaId}/parceria`).send(corpo);
}

describe("Formalização da parceria — RF034 (RN026)", () => {
  it("formaliza a parceria derivando projeto, frente, cliente e parceiro da candidatura", async () => {
    const cenario = await cenarioAprovado();

    const res = await formalizar(cenario.candidaturaId, {
      tipo_parceria_codigo: "co_branding",
      data_inicio: "2026-08-01",
      condicoes_comerciais: "Divisão 50/50 de mídia",
    });
    expect(res.status).toBe(201);
    expect(res.body.projeto_id).toBe(cenario.projetoId);
    expect(res.body.frente_oportunidade_id).toBe(cenario.frenteId);
    expect(res.body.tipo).toBe("co_branding");
    expect(res.body.status).toBe("em_estruturacao");
    expect(res.headers.etag).toBeDefined();
  });

  it("bloqueia a parceria sem decisão aprovada (422 — RN026)", async () => {
    const cenario = await montarCenario();
    await validarPaper(cenario.frenteId); // Paper validado, mas sem decisão

    const res = await formalizar(cenario.candidaturaId);
    expect(res.status).toBe(422);
  });

  it("bloqueia a parceria sem Paper validado na frente (422 — RN026)", async () => {
    const cenario = await montarCenario();
    await request(app)
      .post(`/v1/candidaturas/${cenario.candidaturaId}/decisoes`)
      .send({ tipo_decisao_codigo: "aprovada" })
      .expect(201);

    const res = await formalizar(cenario.candidaturaId);
    expect(res.status).toBe(422);
  });

  it("rejeita duas parcerias para a mesma candidatura (409)", async () => {
    const cenario = await cenarioAprovado();
    await formalizar(cenario.candidaturaId).expect(201);

    const res = await formalizar(cenario.candidaturaId);
    expect(res.status).toBe(409);
  });

  it("404 para candidatura inexistente", async () => {
    const res = await formalizar("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("lista, obtém, atualiza (If-Match) e arquiva", async () => {
    const cenario = await cenarioAprovado();
    const criada = await formalizar(cenario.candidaturaId).expect(201);

    const lista = await request(app)
      .get(`/v1/parcerias?projeto_id=${cenario.projetoId}`)
      .expect(200);
    expect(lista.body.itens).toHaveLength(1);
    expect(lista.body.total).toBe(1);

    const sem = await request(app).patch(`/v1/parcerias/${criada.body.id}`).send({ data_fim: "2026-12-31" });
    expect(sem.status).toBe(428); // If-Match ausente

    const patch = await request(app)
      .patch(`/v1/parcerias/${criada.body.id}`)
      .set("If-Match", `"${criada.body.versao}"`)
      .send({ status_parceria_codigo: "ativa", data_fim: "2026-12-31" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("ativa");

    const stale = await request(app)
      .patch(`/v1/parcerias/${criada.body.id}`)
      .set("If-Match", `"${criada.body.versao}"`)
      .send({ status_parceria_codigo: "suspensa" });
    expect(stale.status).toBe(409); // versão desatualizada

    await request(app).delete(`/v1/parcerias/${criada.body.id}`).expect(204);
    await request(app).get(`/v1/parcerias/${criada.body.id}`).expect(404);
  });
});

describe("Negociação — RF035", () => {
  it("abre a negociação e registra o resultado", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const neg = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/negociacoes`)
      .send({ descricao: "Rodada inicial", data_inicio: "2026-07-01" });
    expect(neg.status).toBe(201);
    expect(neg.body.status).toBe("em_andamento");

    const patch = await request(app)
      .patch(`/v1/negociacoes/${neg.body.id}`)
      .set("If-Match", `"${neg.body.versao}"`)
      .send({ status_negociacao_codigo: "concluida", resultado: "Acordo fechado" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("concluida");
    expect(patch.body.resultado).toBe("Acordo fechado");

    const lista = await request(app).get(`/v1/parcerias/${parceria.body.id}/negociacoes`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("422 para status de negociação inexistente", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const res = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/negociacoes`)
      .send({ status_negociacao_codigo: "nao_existe" });
    expect(res.status).toBe(422);
  });
});

describe("Contrapartidas — RF036 (RN027)", () => {
  it("registra, marca como cumprida e arquiva", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const cp = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/contrapartidas`)
      .send({
        descricao: "Cotas de mídia no evento",
        categoria: "midia",
        valor_estimado: 150000,
        moeda: "BRL",
        prazo: "2026-09-30",
      });
    expect(cp.status).toBe(201);
    expect(cp.body.cumprida).toBe(false);
    expect(cp.body.valor_estimado).toBe(150000);

    const patch = await request(app)
      .patch(`/v1/contrapartidas/${cp.body.id}`)
      .set("If-Match", `"${cp.body.versao}"`)
      .send({ cumprida: true });
    expect(patch.status).toBe(200);
    expect(patch.body.cumprida).toBe(true);

    await request(app).delete(`/v1/contrapartidas/${cp.body.id}`).expect(204);

    const lista = await request(app).get(`/v1/parcerias/${parceria.body.id}/contrapartidas`);
    expect(lista.body.itens).toHaveLength(0);
  });

  it("rejeita valor estimado sem moeda (422 — RN027)", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const res = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/contrapartidas`)
      .send({ descricao: "Sem moeda", valor_estimado: 1000 });
    expect(res.status).toBe(422);
  });
});

describe("Contrato de parceria — RF037", () => {
  it("registra o contrato e evolui o status", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const contrato = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/contratos`)
      .send({
        descricao: "Contrato de co-branding",
        data_inicio: "2026-08-01",
        data_fim: "2027-07-31",
        valor: 500000,
        moeda: "BRL",
      });
    expect(contrato.status).toBe(201);
    expect(contrato.body.status).toBe("em_negociacao");

    const patch = await request(app)
      .patch(`/v1/contratos-parceria/${contrato.body.id}`)
      .set("If-Match", `"${contrato.body.versao}"`)
      .send({ status_contrato_codigo: "vigente", data_assinatura: "2026-07-25" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("vigente");

    const lista = await request(app).get(`/v1/parcerias/${parceria.body.id}/contratos`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita data_fim anterior à data_inicio (422)", async () => {
    const cenario = await cenarioAprovado();
    const parceria = await formalizar(cenario.candidaturaId).expect(201);

    const res = await request(app)
      .post(`/v1/parcerias/${parceria.body.id}/contratos`)
      .send({ data_inicio: "2026-08-01", data_fim: "2026-01-01" });
    expect(res.status).toBe(422);
  });
});
