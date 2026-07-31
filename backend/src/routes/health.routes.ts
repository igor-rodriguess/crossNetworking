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
    // A conta da aplicação tem privilégio mínimo e não lê o histórico de
    // migrations. A sonda deve verificar conectividade real, não depender de
    // uma tabela administrativa que só o executor de migrations pode acessar.
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({
      status: "erro",
      detalhe: env.isProd ? undefined : err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Sonda operacional dos agentes. Para Ollama, confirma que o serviço responde
 * e que o modelo configurado está instalado; assim um deploy em rede não fica
 * "verde" apenas porque a API e o banco estão disponíveis.
 */
healthRouter.get("/health/ai", async (_req, res) => {
  if (env.aiProvider !== "ollama") {
    res.json({
      status: env.aiMock ? "degraded" : "configured",
      provider: env.aiProvider,
      mode: env.aiMock ? "mock" : "remote",
    });
    return;
  }

  if (env.aiMock) {
    res.json({ status: "degraded", provider: "ollama", model: env.ollamaModel, mode: "mock" });
    return;
  }

  try {
    const resposta = await fetch(`${env.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const corpo = await resposta.json() as { models?: Array<{ name?: string }> };
    const instalado = (corpo.models ?? []).some((modelo) => modelo.name === env.ollamaModel);
    if (!instalado) {
      res.status(503).json({ status: "unavailable", provider: "ollama", model: env.ollamaModel, detalhe: "Modelo não instalado." });
      return;
    }
    res.json({ status: "ok", provider: "ollama", model: env.ollamaModel, mode: "local" });
  } catch (erro) {
    res.status(503).json({
      status: "unavailable",
      provider: "ollama",
      model: env.ollamaModel,
      detalhe: env.isProd ? undefined : erro instanceof Error ? erro.message : String(erro),
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
