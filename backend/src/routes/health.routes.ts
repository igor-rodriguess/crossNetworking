import { Router } from "express";
import { pool } from "../config/database";
import { env } from "../config/env";
import { timingSafeEqual } from "node:crypto";
import { metricasPrometheus } from "../shared/metrics";
import { estaDrenando } from "../shared/lifecycle";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/health/db", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS migrations FROM public.schema_migrations"
    );
    res.json({ status: "ok", migrationsAplicadas: rows[0].migrations });
  } catch (err) {
    res.status(503).json({
      status: "erro",
      detalhe: env.isProd ? undefined : err instanceof Error ? err.message : String(err),
    });
  }
});

/** Readiness para balanceadores: só fica 200 quando banco e migrations respondem. */
healthRouter.get("/readyz", async (_req, res) => {
  if (estaDrenando()) {
    res.status(503).json({ status: "draining" });
    return;
  }
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

healthRouter.get("/metrics", (req, res) => {
  const token = env.metricsToken;
  const recebido = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token.length !== recebido.length || !timingSafeEqual(Buffer.from(token), Buffer.from(recebido))) {
    return res.status(401).json({ codigo: 401, erro: "unauthorized", mensagem: "Autenticação obrigatória" });
  }
  res.type("text/plain; version=0.0.4").send(metricasPrometheus());
});
