import { Router } from "express";
import { pool } from "../config/database";

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
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});
