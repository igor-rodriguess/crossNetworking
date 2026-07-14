import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Frentes & Candidaturas — /v1/frentes, /v1/candidaturas (RF024–RF026)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

async function criarParte(nome = `Parceiro ${unico()}`): Promise<string> {
  const res = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return res.body.id as string;
}

async function criarProjeto(): Promise<string> {
  const parteId = await criarParte(`Marca ${unico()}`);
  const cliente = await request(app).post("/v1/clientes").send({ parte_id: parteId }).expect(201);
  const projeto = await request(app)
    .post("/v1/projetos")
    .send({ cliente_cross_id: cliente.body.id, nome: "Projeto", objetivo: "Parcerias" })
    .expect(201);
  return projeto.body.id as string;
}

async function criarFrente() {
  const projetoId = await criarProjeto();
  const res = await request(app)
    .post(`/v1/projetos/${projetoId}/frentes`)
    .send({ nome: "Frente Música", objetivo: "Encontrar parceiros" })
    .expect(201);
  return res.body as { id: string; versao: string };
}

async function criarCandidatura(frenteId: string) {
  const parteId = await criarParte();
  const res = await request(app)
    .post(`/v1/frentes/${frenteId}/candidaturas`)
    .send({ parte_id: parteId })
    .expect(201);
  return res.body as { id: string; versao: string; parte_id: string };
}

describe("Frentes — /v1/projetos/:id/frentes (RF024)", () => {
  it("cria frente no projeto (201 — RN014)", async () => {
    const projetoId = await criarProjeto();
    const res = await request(app)
      .post(`/v1/projetos/${projetoId}/frentes`)
      .send({ nome: "Frente Esporte", objetivo: "Ativação esportiva" });
    expect(res.status).toBe(201);
    expect(res.body.projeto_id).toBe(projetoId);
    expect(res.body.status).toBe("aberta");
  });

  it("rejeita frente em projeto inexistente (404)", async () => {
    const res = await request(app)
      .post("/v1/projetos/00000000-0000-0000-0000-000000000000/frentes")
      .send({ nome: "X", objetivo: "Y" });
    expect(res.status).toBe(404);
  });

  it("rejeita encerramento antes da abertura (422 — RN030)", async () => {
    const projetoId = await criarProjeto();
    const res = await request(app).post(`/v1/projetos/${projetoId}/frentes`).send({
      nome: "X",
      objetivo: "Y",
      data_abertura: "2026-06-01",
      data_encerramento: "2026-01-01",
    });
    expect(res.status).toBe(422);
  });

  it("lista, obtém, atualiza (If-Match) e reabre a frente", async () => {
    const frente = await criarFrente();

    const obtida = await request(app).get(`/v1/frentes/${frente.id}`).expect(200);

    const patch = await request(app)
      .patch(`/v1/frentes/${frente.id}`)
      .set("If-Match", `"${obtida.body.versao}"`)
      .send({ status_frente_codigo: "encerrada", data_encerramento: "2026-12-01" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("encerrada");

    const reaberta = await request(app).post(`/v1/frentes/${frente.id}/reabertura`).expect(200);
    expect(reaberta.body.status).toBe("reaberta");
    expect(reaberta.body.data_encerramento).toBeNull();
  });
});

describe("Candidaturas — /v1/frentes/:id/candidaturas (RF025)", () => {
  it("registra candidatura (201) e lista (200)", async () => {
    const frente = await criarFrente();
    const parteId = await criarParte();

    const res = await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId, interesse_cliente_codigo: "alto" });
    expect(res.status).toBe(201);
    expect(res.body.parte_id).toBe(parteId);
    expect(res.body.status).toBe("identificada");
    expect(res.body.interesse_cliente).toBe("alto");

    const lista = await request(app).get(`/v1/frentes/${frente.id}/candidaturas`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita a mesma Parte duas vezes ativa na frente (409 — RN015)", async () => {
    const frente = await criarFrente();
    const parteId = await criarParte();

    await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId })
      .expect(201);

    const res = await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId });
    expect(res.status).toBe(409);
  });

  it("permite reentrada da Parte após arquivamento (RN015/RN035)", async () => {
    const frente = await criarFrente();
    const parteId = await criarParte();

    const primeira = await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId })
      .expect(201);

    await request(app).delete(`/v1/candidaturas/${primeira.body.id}`).expect(204);

    await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId })
      .expect(201);
  });

  it("rejeita nível de interesse inexistente (422)", async () => {
    const frente = await criarFrente();
    const parteId = await criarParte();
    const res = await request(app)
      .post(`/v1/frentes/${frente.id}/candidaturas`)
      .send({ parte_id: parteId, interesse_cliente_codigo: "nao_existe" });
    expect(res.status).toBe(422);
  });
});

describe("Movimentações — /v1/candidaturas/:id/movimentacoes (RF026 — RN017)", () => {
  it("movimenta o status e grava o histórico na mesma transação", async () => {
    const frente = await criarFrente();
    const cand = await criarCandidatura(frente.id);

    const mov = await request(app)
      .post(`/v1/candidaturas/${cand.id}/movimentacoes`)
      .send({ status_codigo: "em_analise", justificativa: "Iniciando avaliação" });
    expect(mov.status).toBe(201);
    expect(mov.body.status).toBe("em_analise");

    const hist = await request(app).get(`/v1/candidaturas/${cand.id}/movimentacoes`);
    expect(hist.status).toBe(200);
    expect(hist.body.itens).toHaveLength(1);
    expect(hist.body.itens[0].status_anterior).toBe("identificada");
    expect(hist.body.itens[0].status_novo).toBe("em_analise");
    expect(hist.body.itens[0].justificativa).toBe("Iniciando avaliação");
  });

  it("acumula o histórico a cada movimentação", async () => {
    const frente = await criarFrente();
    const cand = await criarCandidatura(frente.id);

    await request(app)
      .post(`/v1/candidaturas/${cand.id}/movimentacoes`)
      .send({ status_codigo: "em_analise" })
      .expect(201);
    await request(app)
      .post(`/v1/candidaturas/${cand.id}/movimentacoes`)
      .send({ status_codigo: "recomendada" })
      .expect(201);

    const hist = await request(app).get(`/v1/candidaturas/${cand.id}/movimentacoes`);
    expect(hist.body.itens).toHaveLength(2);
  });

  it("rejeita status inexistente (422)", async () => {
    const frente = await criarFrente();
    const cand = await criarCandidatura(frente.id);
    const res = await request(app)
      .post(`/v1/candidaturas/${cand.id}/movimentacoes`)
      .send({ status_codigo: "nao_existe" });
    expect(res.status).toBe(422);
  });

  it("404 para candidatura inexistente", async () => {
    const res = await request(app)
      .post("/v1/candidaturas/00000000-0000-0000-0000-000000000000/movimentacoes")
      .send({ status_codigo: "em_analise" });
    expect(res.status).toBe(404);
  });
});
