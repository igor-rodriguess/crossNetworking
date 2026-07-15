import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Documentos — /v1/documentos (RF009)

const HASH = "a".repeat(64);

const docValido = () => ({
  nome: "Contrato.pdf",
  tipo_mime: "application/pdf",
  arquivo_url: "https://storage.exemplo/contrato.pdf",
  hash_sha256: HASH,
  extensao: "pdf",
  tamanho_bytes: 1024,
});

describe("POST /v1/documentos", () => {
  it("registra o documento (201)", async () => {
    const res = await request(app).post("/v1/documentos").send(docValido());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.nome).toBe("Contrato.pdf");
    expect(res.body.status).toBe("ativo");
    expect(res.body.numero_versao).toBe(1);
  });

  it("rejeita hash fora do formato SHA-256 (422)", async () => {
    const res = await request(app)
      .post("/v1/documentos")
      .send({ ...docValido(), hash_sha256: "123" });
    expect(res.status).toBe(422);
    expect(res.body.codigo).toBe(422);
  });

  it("rejeita nome vazio (422)", async () => {
    const res = await request(app)
      .post("/v1/documentos")
      .send({ ...docValido(), nome: "   " });
    expect(res.status).toBe(422);
  });

  it("rejeita tamanho negativo (422)", async () => {
    const res = await request(app)
      .post("/v1/documentos")
      .send({ ...docValido(), tamanho_bytes: -5 });
    expect(res.status).toBe(422);
  });
});

describe("GET /v1/documentos/:id", () => {
  it("retorna o documento criado (200)", async () => {
    const criado = await request(app).post("/v1/documentos").send(docValido()).expect(201);
    const res = await request(app).get(`/v1/documentos/${criado.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(criado.body.id);
    expect(res.body.hash_sha256).toBe(HASH);
  });

  it("404 para id inexistente", async () => {
    const res = await request(app).get("/v1/documentos/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("Vínculos de documento — RF009", () => {
  let seq = 0;
  const unico = () => `${Date.now()}.${seq++}`;

  async function criarProjeto(): Promise<string> {
    const nome = `Marca ${unico()}`;
    const parte = await request(app)
      .post("/v1/partes")
      .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
      .expect(201);
    const cliente = await request(app).post("/v1/clientes").send({ parte_id: parte.body.id }).expect(201);
    const projeto = await request(app)
      .post("/v1/projetos")
      .send({ cliente_cross_id: cliente.body.id, nome: "Projeto", objetivo: "Doc" })
      .expect(201);
    return projeto.body.id as string;
  }

  it("vincula documento a um projeto por FK explícita, lista e desvincula", async () => {
    const doc = await request(app).post("/v1/documentos").send(docValido()).expect(201);
    const projetoId = await criarProjeto();

    const vinc = await request(app)
      .post(`/v1/documentos/${doc.body.id}/vinculos`)
      .send({ entidade: "projeto", entidade_id: projetoId });
    expect(vinc.status).toBe(201);
    expect(vinc.body.vinculos).toHaveLength(1);
    expect(vinc.body.vinculos[0].entidade).toBe("projeto");
    expect(vinc.body.vinculos[0].entidade_id).toBe(projetoId);

    const lista = await request(app).get(`/v1/documentos/${doc.body.id}/vinculos`).expect(200);
    expect(lista.body.itens).toHaveLength(1);

    await request(app)
      .delete(`/v1/documentos/${doc.body.id}/vinculos/projeto/${projetoId}`)
      .expect(204);

    const depois = await request(app).get(`/v1/documentos/${doc.body.id}/vinculos`).expect(200);
    expect(depois.body.itens).toHaveLength(0);
  });

  it("404 quando a entidade-alvo não existe", async () => {
    const doc = await request(app).post("/v1/documentos").send(docValido()).expect(201);
    const res = await request(app)
      .post(`/v1/documentos/${doc.body.id}/vinculos`)
      .send({ entidade: "parceria", entidade_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  it("422 para entidade fora do vocabulário", async () => {
    const doc = await request(app).post("/v1/documentos").send(docValido()).expect(201);
    const res = await request(app)
      .post(`/v1/documentos/${doc.body.id}/vinculos`)
      .send({ entidade: "inexistente", entidade_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(422);
  });
});
