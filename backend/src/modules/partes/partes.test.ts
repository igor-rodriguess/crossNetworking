import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Módulo Base de Relacionamentos — /v1/partes (RF004, RF005; RN001, RN002)

const orgValida = () => ({
  tipo: "organizacao" as const,
  nome_exibicao: "Marca Teste",
  organizacao: { nome_fantasia: "Marca Teste", cnpj: "12345678000199" },
});

const pessoaValida = () => ({
  tipo: "pessoa" as const,
  nome_exibicao: "Fulano de Tal",
  pessoa: { nome_completo: "Fulano de Tal", cpf: "12345678901" },
});

describe("POST /v1/partes", () => {
  it("cria uma organização e retorna 201 com a especialização aninhada (RF004/RF005)", async () => {
    const res = await request(app).post("/v1/partes").send(orgValida());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.tipo).toBe("organizacao");
    expect(res.body.status).toBe("ativa");
    expect(res.body.especializacao.nome_fantasia).toBe("Marca Teste");
    expect(res.body.especializacao.cnpj).toBe("12345678000199");
  });

  it("cria uma pessoa e retorna 201 (RF005)", async () => {
    const res = await request(app).post("/v1/partes").send(pessoaValida());
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("pessoa");
    expect(res.body.especializacao.nome_completo).toBe("Fulano de Tal");
  });

  it("rejeita CNPJ com formato inválido (422) com envelope de erro (RN002)", async () => {
    const res = await request(app)
      .post("/v1/partes")
      .send({ tipo: "organizacao", nome_exibicao: "X", organizacao: { nome_fantasia: "X", cnpj: "123" } });
    expect(res.status).toBe(422);
    expect(res.body.codigo).toBe(422);
    expect(res.body.erro).toBe("validation");
    expect(res.body.mensagem).toBeTruthy();
  });

  it("rejeita nome de exibição vazio (422)", async () => {
    const res = await request(app)
      .post("/v1/partes")
      .send({ tipo: "organizacao", nome_exibicao: "   ", organizacao: { nome_fantasia: "X" } });
    expect(res.status).toBe(422);
  });

  it("rejeita CNPJ duplicado (409) (RN002)", async () => {
    const body = {
      tipo: "organizacao",
      nome_exibicao: "Dup",
      organizacao: { nome_fantasia: "Dup", cnpj: "99999999000199" },
    };
    await request(app).post("/v1/partes").send(body).expect(201);
    const res = await request(app).post("/v1/partes").send(body);
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe(409);
  });
});

describe("GET /v1/partes/:id", () => {
  it("retorna a parte recém-criada (200)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app).get(`/v1/partes/${criada.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(criada.body.id);
    expect(res.body.especializacao.nome_fantasia).toBe("Marca Teste");
  });

  it("retorna 404 com envelope de erro para id inexistente", async () => {
    const res = await request(app).get("/v1/partes/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe(404);
    expect(res.body.erro).toBe("not_found");
    expect(res.body.mensagem).toBeTruthy();
  });
});

describe("GET /v1/partes (lista paginada)", () => {
  it("lista com paginação e busca (RF008)", async () => {
    await request(app).post("/v1/partes").send(orgValida()).expect(201);
    await request(app).post("/v1/partes").send(pessoaValida()).expect(201);

    const res = await request(app).get("/v1/partes?por_pagina=50");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.itens)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.pagina).toBe(1);
    expect(res.body.por_pagina).toBe(50);

    const busca = await request(app).get("/v1/partes?busca=Marca");
    expect(busca.status).toBe(200);
    expect(busca.body.itens.every((p: { nome_exibicao: string }) => p.nome_exibicao.includes("Marca"))).toBe(true);
  });
});

describe("PATCH /v1/partes/:id (optimistic lock)", () => {
  it("atualiza com If-Match correto (200)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app)
      .patch(`/v1/partes/${criada.body.id}`)
      .set("If-Match", `"${criada.body.versao}"`)
      .send({ nome_exibicao: "Marca Renomeada" });
    expect(res.status).toBe(200);
    expect(res.body.nome_exibicao).toBe("Marca Renomeada");
  });

  it("exige If-Match (428)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app).patch(`/v1/partes/${criada.body.id}`).send({ nome_exibicao: "X" });
    expect(res.status).toBe(428);
  });

  it("rejeita versão desatualizada (409)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app)
      .patch(`/v1/partes/${criada.body.id}`)
      .set("If-Match", `"0"`)
      .send({ nome_exibicao: "X" });
    expect(res.status).toBe(409);
  });

  it("404 para id inexistente", async () => {
    const res = await request(app)
      .patch("/v1/partes/00000000-0000-0000-0000-000000000000")
      .set("If-Match", `"1"`)
      .send({ nome_exibicao: "X" });
    expect(res.status).toBe(404);
  });

  it("atualiza a especialização de organização junto do PATCH (RF005)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app)
      .patch(`/v1/partes/${criada.body.id}`)
      .set("If-Match", `"${criada.body.versao}"`)
      .send({ organizacao: { segmento_principal: "Bebidas", site: "https://nova.com" } });
    expect(res.status).toBe(200);
    expect(res.body.especializacao.segmento_principal).toBe("Bebidas");
    expect(res.body.especializacao.site).toBe("https://nova.com");
  });

  it("rejeita especialização incompatível com o tipo (422)", async () => {
    const criada = await request(app).post("/v1/partes").send(orgValida()).expect(201);
    const res = await request(app)
      .patch(`/v1/partes/${criada.body.id}`)
      .set("If-Match", `"${criada.body.versao}"`)
      .send({ pessoa: { nome_completo: "Não deveria" } });
    expect(res.status).toBe(422);
  });
});

describe("Borda e contrato", () => {
  it("rejeita x-usuario-id não-UUID (400)", async () => {
    const res = await request(app).post("/v1/partes").set("x-usuario-id", "abc").send(orgValida());
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe("bad_request");
  });

  it("responde com cabeçalho x-request-id", async () => {
    const res = await request(app).get("/v1/partes/00000000-0000-0000-0000-000000000000");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.body.requisicao_id).toBeTruthy();
  });

  it("expõe o documento OpenAPI 3.1 (200)", async () => {
    const res = await request(app).get("/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.paths["/v1/partes"]).toBeTruthy();
  });
});

/** Cria uma organização e devolve seu id. */
async function criarOrg(): Promise<string> {
  const res = await request(app).post("/v1/partes").send(orgValida()).expect(201);
  return res.body.id as string;
}

describe("DELETE /v1/partes/:id (arquivamento lógico — RN035)", () => {
  it("arquiva a Parte (204) e ela deixa de ser encontrada", async () => {
    const id = await criarOrg();
    await request(app).delete(`/v1/partes/${id}`).expect(204);
    await request(app).get(`/v1/partes/${id}`).expect(404);
  });

  it("404 ao arquivar id inexistente", async () => {
    await request(app).delete("/v1/partes/00000000-0000-0000-0000-000000000000").expect(404);
  });
});

describe("Papéis da Parte — /v1/partes/:id/papeis (RF006)", () => {
  it("atribui um papel (201) e lista (200)", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/papeis`)
      .send({ papel_codigo: "cliente" });
    expect(criado.status).toBe(201);
    expect(criado.body.papel_codigo).toBe("cliente");

    const lista = await request(app).get(`/v1/partes/${id}/papeis`);
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita papel duplicado ativo (409 — RN005)", async () => {
    const id = await criarOrg();
    await request(app).post(`/v1/partes/${id}/papeis`).send({ papel_codigo: "parceiro" }).expect(201);
    const res = await request(app).post(`/v1/partes/${id}/papeis`).send({ papel_codigo: "parceiro" });
    expect(res.status).toBe(409);
  });

  it("rejeita papel inexistente (422)", async () => {
    const id = await criarOrg();
    const res = await request(app).post(`/v1/partes/${id}/papeis`).send({ papel_codigo: "inexistente" });
    expect(res.status).toBe(422);
  });

  it("rejeita vigência invertida (422 — RN030)", async () => {
    const id = await criarOrg();
    const res = await request(app)
      .post(`/v1/partes/${id}/papeis`)
      .send({ papel_codigo: "artista", vigente_desde: "2026-06-10", vigente_ate: "2026-01-01" });
    expect(res.status).toBe(422);
  });

  it("remove o papel (204) e ele some da lista", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/papeis`)
      .send({ papel_codigo: "fornecedor" })
      .expect(201);

    await request(app).delete(`/v1/partes/${id}/papeis/${criado.body.id}`).expect(204);
    const lista = await request(app).get(`/v1/partes/${id}/papeis`);
    expect(lista.body.itens).toHaveLength(0);
  });

  it("404 para papel inexistente na Parte", async () => {
    const id = await criarOrg();
    await request(app)
      .delete(`/v1/partes/${id}/papeis/00000000-0000-0000-0000-000000000000`)
      .expect(404);
  });
});

describe("Contatos da Parte — /v1/partes/:id/contatos (RF007)", () => {
  it("adiciona contato (201) e lista (200)", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana", email: "ana@marca.com", principal: true });
    expect(criado.status).toBe(201);
    expect(criado.body.nome).toBe("Ana");
    expect(criado.body.principal).toBe(true);

    const lista = await request(app).get(`/v1/partes/${id}/contatos`);
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita segundo contato principal ativo (409 — RN004)", async () => {
    const id = await criarOrg();
    await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana", principal: true })
      .expect(201);

    const res = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Bruno", principal: true });
    expect(res.status).toBe(409);
  });

  it("rejeita e-mail inválido (422)", async () => {
    const id = await criarOrg();
    const res = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana", email: "sem-arroba" });
    expect(res.status).toBe(422);
  });

  it("atualiza contato com If-Match (200)", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana" })
      .expect(201);

    const res = await request(app)
      .patch(`/v1/partes/${id}/contatos/${criado.body.id}`)
      .set("If-Match", `"${criado.body.versao}"`)
      .send({ cargo: "Diretora" });
    expect(res.status).toBe(200);
    expect(res.body.cargo).toBe("Diretora");
  });

  it("rejeita atualização sem If-Match (428)", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana" })
      .expect(201);

    await request(app)
      .patch(`/v1/partes/${id}/contatos/${criado.body.id}`)
      .send({ cargo: "X" })
      .expect(428);
  });

  it("remove o contato (204)", async () => {
    const id = await criarOrg();
    const criado = await request(app)
      .post(`/v1/partes/${id}/contatos`)
      .send({ nome: "Ana" })
      .expect(201);

    await request(app).delete(`/v1/partes/${id}/contatos/${criado.body.id}`).expect(204);
    const lista = await request(app).get(`/v1/partes/${id}/contatos`);
    expect(lista.body.itens).toHaveLength(0);
  });
});
