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
