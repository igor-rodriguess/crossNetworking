import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Administração — /v1/usuarios e /v1/catalogos (RF002, RN006, RN018)

let seq = 0;
const emailUnico = () => `user.${Date.now()}.${seq++}@cross.local`;

async function criarUsuario(email = emailUnico()) {
  const res = await request(app).post("/v1/usuarios").send({ nome: "Fulano", email }).expect(201);
  return res.body as { id: string; versao: string; email: string };
}

describe("Usuários — /v1/usuarios (RF002)", () => {
  it("cria usuário (201)", async () => {
    const email = emailUnico();
    const res = await request(app).post("/v1/usuarios").send({ nome: "Ana", email, cargo: "Estrategista" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body.ativo).toBe(true);
  });

  it("rejeita e-mail inválido (422)", async () => {
    const res = await request(app).post("/v1/usuarios").send({ nome: "Ana", email: "sem-arroba" });
    expect(res.status).toBe(422);
  });

  it("rejeita e-mail duplicado, sem diferenciar maiúsculas (409 — RN006)", async () => {
    const email = emailUnico();
    await request(app).post("/v1/usuarios").send({ nome: "Ana", email }).expect(201);
    const res = await request(app)
      .post("/v1/usuarios")
      .send({ nome: "Outra", email: email.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it("lista, obtém e atualiza com If-Match (200)", async () => {
    const usuario = await criarUsuario();

    const lista = await request(app).get("/v1/usuarios?por_pagina=50");
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBeGreaterThanOrEqual(1);

    const obtido = await request(app).get(`/v1/usuarios/${usuario.id}`).expect(200);

    const patch = await request(app)
      .patch(`/v1/usuarios/${usuario.id}`)
      .set("If-Match", `"${obtido.body.versao}"`)
      .send({ cargo: "Coordenador" });
    expect(patch.status).toBe(200);
    expect(patch.body.cargo).toBe("Coordenador");
  });

  it("inativa o usuário (204) e ele some", async () => {
    const usuario = await criarUsuario();
    await request(app).delete(`/v1/usuarios/${usuario.id}`).expect(204);
    await request(app).get(`/v1/usuarios/${usuario.id}`).expect(404);
  });
});

describe("Catálogos — /v1/catalogos/:nome (RN018)", () => {
  it("retorna os status de projeto (200)", async () => {
    const res = await request(app).get("/v1/catalogos/status-projeto");
    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBeGreaterThan(0);
    expect(res.body.itens.some((i: { codigo: string }) => i.codigo === "em_andamento")).toBe(true);
  });

  it("retorna os territórios (200)", async () => {
    const res = await request(app).get("/v1/catalogos/territorios");
    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBeGreaterThan(0);
  });

  it("rejeita catálogo desconhecido (422)", async () => {
    const res = await request(app).get("/v1/catalogos/nao-existe");
    expect(res.status).toBe(422);
  });
});
