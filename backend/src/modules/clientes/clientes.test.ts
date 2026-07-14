import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Clientes & Contratos — /v1/clientes, /v1/contratos (RF016–RF018)

/** Cria uma organização e devolve o parte_id. */
async function criarParte(nome = "Marca Cliente"): Promise<string> {
  const res = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return res.body.id as string;
}

/** Cria um cliente Cross e devolve o corpo. */
async function criarCliente() {
  const parteId = await criarParte();
  const res = await request(app).post("/v1/clientes").send({ parte_id: parteId }).expect(201);
  return res.body as { id: string; versao: string; parte_id: string };
}

/** Cria um contrato e devolve o corpo. */
async function criarContrato(clienteId: string, codigo?: string) {
  const res = await request(app)
    .post(`/v1/clientes/${clienteId}/contratos`)
    .send({ codigo, descricao: "Contrato de teste" })
    .expect(201);
  return res.body as { id: string; versao: string };
}

describe("Clientes — /v1/clientes (RF016)", () => {
  it("registra o cliente (201)", async () => {
    const parteId = await criarParte();
    const res = await request(app).post("/v1/clientes").send({ parte_id: parteId });
    expect(res.status).toBe(201);
    expect(res.body.parte_id).toBe(parteId);
    expect(res.body.status).toBe("ativo");
  });

  it("rejeita segundo vínculo ativo para a mesma Parte (409 — RN007)", async () => {
    const parteId = await criarParte();
    await request(app).post("/v1/clientes").send({ parte_id: parteId }).expect(201);
    const res = await request(app).post("/v1/clientes").send({ parte_id: parteId });
    expect(res.status).toBe(409);
  });

  it("rejeita parte_id inexistente (409 — FK)", async () => {
    const res = await request(app)
      .post("/v1/clientes")
      .send({ parte_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(409);
  });

  it("lista clientes paginado (200)", async () => {
    await criarCliente();
    const res = await request(app).get("/v1/clientes?por_pagina=50");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.pagina).toBe(1);
  });

  it("obtém e atualiza com If-Match (200), e 404 para inexistente", async () => {
    const cliente = await criarCliente();

    const obtido = await request(app).get(`/v1/clientes/${cliente.id}`).expect(200);
    expect(obtido.body.id).toBe(cliente.id);

    const patch = await request(app)
      .patch(`/v1/clientes/${cliente.id}`)
      .set("If-Match", `"${obtido.body.versao}"`)
      .send({ observacoes: "Conta estratégica" });
    expect(patch.status).toBe(200);
    expect(patch.body.observacoes).toBe("Conta estratégica");

    await request(app).get("/v1/clientes/00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("arquiva o cliente (204) e ele some", async () => {
    const cliente = await criarCliente();
    await request(app).delete(`/v1/clientes/${cliente.id}`).expect(204);
    await request(app).get(`/v1/clientes/${cliente.id}`).expect(404);
  });
});

describe("Contratos — /v1/clientes/:id/contratos (RF017)", () => {
  it("cria contrato (201) e lista (200)", async () => {
    const cliente = await criarCliente();
    const criado = await request(app)
      .post(`/v1/clientes/${cliente.id}/contratos`)
      .send({ codigo: "CT-001", descricao: "Fee mensal" });
    expect(criado.status).toBe(201);
    expect(criado.body.codigo).toBe("CT-001");
    expect(criado.body.status).toBe("em_negociacao");

    const lista = await request(app).get(`/v1/clientes/${cliente.id}/contratos`);
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita código de contrato ativo duplicado (409 — RN011)", async () => {
    const cliente = await criarCliente();
    await criarContrato(cliente.id, "CT-DUP");
    const res = await request(app)
      .post(`/v1/clientes/${cliente.id}/contratos`)
      .send({ codigo: "CT-DUP" });
    expect(res.status).toBe(409);
  });

  it("rejeita datas invertidas (422 — RN030)", async () => {
    const cliente = await criarCliente();
    const res = await request(app)
      .post(`/v1/clientes/${cliente.id}/contratos`)
      .send({ data_inicio: "2026-06-01", data_fim: "2026-01-01" });
    expect(res.status).toBe(422);
  });

  it("obtém e atualiza contrato com If-Match (200)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);

    const obtido = await request(app).get(`/v1/contratos/${contrato.id}`).expect(200);
    expect(obtido.body.modelos).toEqual([]);

    const patch = await request(app)
      .patch(`/v1/contratos/${contrato.id}`)
      .set("If-Match", `"${obtido.body.versao}"`)
      .send({ status_contrato_codigo: "vigente" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("vigente");
  });

  it("404 para contrato inexistente", async () => {
    await request(app).get("/v1/contratos/00000000-0000-0000-0000-000000000000").expect(404);
  });
});

describe("Modelos e remuneração — /v1/contratos/:id (RF018)", () => {
  it("define os modelos de contratação (200 — RN009)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);

    const res = await request(app)
      .put(`/v1/contratos/${contrato.id}/modelos`)
      .send({ modelos: ["fee_mensal", "success_fee"] });
    expect(res.status).toBe(200);
    expect(res.body.modelos).toEqual(expect.arrayContaining(["fee_mensal", "success_fee"]));
  });

  it("rejeita modelo inexistente (422)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);
    const res = await request(app)
      .put(`/v1/contratos/${contrato.id}/modelos`)
      .send({ modelos: ["nao_existe"] });
    expect(res.status).toBe(422);
  });

  it("adiciona componente de remuneração (201) e lista (200)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);

    const criado = await request(app)
      .post(`/v1/contratos/${contrato.id}/componentes-remuneracao`)
      .send({ tipo_remuneracao_codigo: "valor_mensal", valor: 15000, moeda: "BRL" });
    expect(criado.status).toBe(201);
    expect(criado.body.tipo_remuneracao_codigo).toBe("valor_mensal");

    const lista = await request(app).get(`/v1/contratos/${contrato.id}/componentes-remuneracao`);
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita componente sem valor e sem percentual (422 — RN010)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);
    const res = await request(app)
      .post(`/v1/contratos/${contrato.id}/componentes-remuneracao`)
      .send({ tipo_remuneracao_codigo: "outro" });
    expect(res.status).toBe(422);
  });

  it("rejeita valor sem moeda (422 — RN010)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);
    const res = await request(app)
      .post(`/v1/contratos/${contrato.id}/componentes-remuneracao`)
      .send({ tipo_remuneracao_codigo: "valor_mensal", valor: 1000 });
    expect(res.status).toBe(422);
  });

  it("rejeita moeda fora do ISO 4217 (422 — RN038)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);
    const res = await request(app)
      .post(`/v1/contratos/${contrato.id}/componentes-remuneracao`)
      .send({ tipo_remuneracao_codigo: "valor_mensal", valor: 1000, moeda: "br1" });
    expect(res.status).toBe(422);
  });

  it("remove componente (204)", async () => {
    const cliente = await criarCliente();
    const contrato = await criarContrato(cliente.id);
    const criado = await request(app)
      .post(`/v1/contratos/${contrato.id}/componentes-remuneracao`)
      .send({ tipo_remuneracao_codigo: "percentual_negocio", percentual: 10 })
      .expect(201);

    await request(app)
      .delete(`/v1/contratos/${contrato.id}/componentes-remuneracao/${criado.body.id}`)
      .expect(204);

    const lista = await request(app).get(`/v1/contratos/${contrato.id}/componentes-remuneracao`);
    expect(lista.body.itens).toHaveLength(0);
  });
});
