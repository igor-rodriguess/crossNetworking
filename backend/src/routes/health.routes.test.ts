import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sondas operacionais", () => {
  it("expõe liveness e readiness", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    const pronta = await request(app).get("/readyz");
    expect(pronta.status).toBe(200);
    expect(pronta.body).toEqual({ status: "ready" });
  });

  it("não expõe métricas sem o token operacional", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(401);
    expect(res.body.erro).toBe("unauthorized");
  });

  it("não revela detalhes internos no erro de readiness", async () => {
    const res = await request(app).get("/readyz");
    expect(res.body).not.toHaveProperty("detalhe");
  });

  it("verifica se o modelo Ollama configurado está disponível", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: process.env.OLLAMA_MODEL ?? "qwen3:4b" }] }),
    }));

    const res = await request(app).get("/health/ai");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", provider: "ollama", mode: "local" });
  });
});
