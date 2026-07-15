import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";

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
});
