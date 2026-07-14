import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Projetos — /v1/projetos (RF019–RF023)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

async function criarClienteCross(): Promise<string> {
  const nome = `Marca ${unico()}`;
  const parte = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  const cliente = await request(app)
    .post("/v1/clientes")
    .send({ parte_id: parte.body.id })
    .expect(201);
  return cliente.body.id as string;
}

async function criarProjeto() {
  const clienteId = await criarClienteCross();
  const res = await request(app)
    .post("/v1/projetos")
    .send({ cliente_cross_id: clienteId, nome: "Projeto Teste", objetivo: "Gerar parcerias" })
    .expect(201);
  return res.body as { id: string; versao: string };
}

async function criarUsuario(): Promise<string> {
  const res = await request(app)
    .post("/v1/usuarios")
    .send({ nome: "Resp", email: `resp.${unico()}@cross.local` })
    .expect(201);
  return res.body.id as string;
}

describe("Projetos — /v1/projetos (RF019)", () => {
  it("cria projeto vinculado a um cliente (201 — RN012)", async () => {
    const clienteId = await criarClienteCross();
    const res = await request(app)
      .post("/v1/projetos")
      .send({ cliente_cross_id: clienteId, nome: "Campanha X", objetivo: "Ampliar alcance" });
    expect(res.status).toBe(201);
    expect(res.body.cliente_cross_id).toBe(clienteId);
    expect(res.body.status).toBe("rascunho");
  });

  it("rejeita projeto sem objetivo (422 — RN012)", async () => {
    const clienteId = await criarClienteCross();
    const res = await request(app)
      .post("/v1/projetos")
      .send({ cliente_cross_id: clienteId, nome: "Sem objetivo" });
    expect(res.status).toBe(422);
  });

  it("rejeita cliente inexistente (409 — FK)", async () => {
    const res = await request(app).post("/v1/projetos").send({
      cliente_cross_id: "00000000-0000-0000-0000-000000000000",
      nome: "X",
      objetivo: "Y",
    });
    expect(res.status).toBe(409);
  });

  it("rejeita datas invertidas (422 — RN030)", async () => {
    const clienteId = await criarClienteCross();
    const res = await request(app).post("/v1/projetos").send({
      cliente_cross_id: clienteId,
      nome: "X",
      objetivo: "Y",
      data_inicio: "2026-06-01",
      data_fim_real: "2026-01-01",
    });
    expect(res.status).toBe(422);
  });

  it("lista, obtém, atualiza (If-Match) e arquiva", async () => {
    const projeto = await criarProjeto();

    const lista = await request(app).get("/v1/projetos?por_pagina=50");
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBeGreaterThanOrEqual(1);

    const obtido = await request(app).get(`/v1/projetos/${projeto.id}`).expect(200);

    const patch = await request(app)
      .patch(`/v1/projetos/${projeto.id}`)
      .set("If-Match", `"${obtido.body.versao}"`)
      .send({ status_projeto_codigo: "em_andamento" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("em_andamento");

    await request(app).delete(`/v1/projetos/${projeto.id}`).expect(204);
    await request(app).get(`/v1/projetos/${projeto.id}`).expect(404);
  });
});

describe("Origem da demanda — RF020", () => {
  it("registra e lista a origem (201/200)", async () => {
    const projeto = await criarProjeto();
    const criada = await request(app)
      .post(`/v1/projetos/${projeto.id}/origens-demanda`)
      .send({ tipo_origem_demanda_codigo: "briefing_cliente", descricao: "Briefing recebido" });
    expect(criada.status).toBe(201);
    expect(criada.body.tipo_origem_demanda_codigo).toBe("briefing_cliente");

    const lista = await request(app).get(`/v1/projetos/${projeto.id}/origens-demanda`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita tipo de origem inexistente (422)", async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .post(`/v1/projetos/${projeto.id}/origens-demanda`)
      .send({ tipo_origem_demanda_codigo: "nao_existe" });
    expect(res.status).toBe(422);
  });
});

describe("Briefing versionado — RF021 (RN021)", () => {
  it("cria versões incrementais sem sobrescrever", async () => {
    const projeto = await criarProjeto();

    const v1 = await request(app)
      .post(`/v1/projetos/${projeto.id}/briefings`)
      .send({ conteudo: "Primeira versão" })
      .expect(201);
    expect(v1.body.numero_versao).toBe(1);
    expect(v1.body.status_versao).toBe("rascunho");

    const v2 = await request(app)
      .post(`/v1/projetos/${projeto.id}/briefings`)
      .send({ conteudo: "Segunda versão" })
      .expect(201);
    expect(v2.body.numero_versao).toBe(2);

    const lista = await request(app).get(`/v1/projetos/${projeto.id}/briefings`);
    expect(lista.body.itens).toHaveLength(2);
  });

  it("publica a vigente e rebaixa a anterior (RN021)", async () => {
    const projeto = await criarProjeto();
    const v1 = await request(app)
      .post(`/v1/projetos/${projeto.id}/briefings`)
      .send({ conteudo: "V1" })
      .expect(201);
    const v2 = await request(app)
      .post(`/v1/projetos/${projeto.id}/briefings`)
      .send({ conteudo: "V2" })
      .expect(201);

    await request(app).post(`/v1/briefings/${v1.body.id}/vigencia`).expect(200);
    const pub2 = await request(app).post(`/v1/briefings/${v2.body.id}/vigencia`).expect(200);
    expect(pub2.body.status_versao).toBe("vigente");

    const lista = await request(app).get(`/v1/projetos/${projeto.id}/briefings`);
    const vigentes = lista.body.itens.filter((v: { status_versao: string }) => v.status_versao === "vigente");
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].id).toBe(v2.body.id);
  });
});

describe("Planejamento versionado — RF022", () => {
  it("cria versão e publica como vigente", async () => {
    const projeto = await criarProjeto();
    const v1 = await request(app)
      .post(`/v1/projetos/${projeto.id}/planejamentos`)
      .send({ objetivos_negocio: "Crescer 20%", territorios: "Música, Esporte" })
      .expect(201);
    expect(v1.body.numero_versao).toBe(1);

    const pub = await request(app).post(`/v1/planejamentos/${v1.body.id}/vigencia`).expect(200);
    expect(pub.body.status_versao).toBe("vigente");
  });
});

describe("Responsáveis — RF023 (RN013)", () => {
  it("designa e lista responsáveis (201/200)", async () => {
    const projeto = await criarProjeto();
    const usuarioId = await criarUsuario();

    const criado = await request(app)
      .post(`/v1/projetos/${projeto.id}/responsaveis`)
      .send({ usuario_interno_id: usuarioId, funcao: "Líder" });
    expect(criado.status).toBe(201);
    expect(criado.body.usuario_interno_id).toBe(usuarioId);

    const lista = await request(app).get(`/v1/projetos/${projeto.id}/responsaveis`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("recusa remover o último responsável ativo (409 — RN013)", async () => {
    const projeto = await criarProjeto();
    const usuarioId = await criarUsuario();
    const resp = await request(app)
      .post(`/v1/projetos/${projeto.id}/responsaveis`)
      .send({ usuario_interno_id: usuarioId })
      .expect(201);

    const res = await request(app).delete(`/v1/projetos/${projeto.id}/responsaveis/${resp.body.id}`);
    expect(res.status).toBe(409);
  });

  it("remove um responsável quando há outro ativo (204)", async () => {
    const projeto = await criarProjeto();
    const u1 = await criarUsuario();
    const u2 = await criarUsuario();

    const r1 = await request(app)
      .post(`/v1/projetos/${projeto.id}/responsaveis`)
      .send({ usuario_interno_id: u1 })
      .expect(201);
    await request(app)
      .post(`/v1/projetos/${projeto.id}/responsaveis`)
      .send({ usuario_interno_id: u2 })
      .expect(201);

    await request(app).delete(`/v1/projetos/${projeto.id}/responsaveis/${r1.body.id}`).expect(204);
    const lista = await request(app).get(`/v1/projetos/${projeto.id}/responsaveis`);
    expect(lista.body.itens).toHaveLength(1);
  });
});
