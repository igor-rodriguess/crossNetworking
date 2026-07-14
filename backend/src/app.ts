import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./shared/logger";
import { requestContext } from "./shared/middleware/request-context";
import { errorHandler } from "./shared/middleware/error-handler";
import { healthRouter } from "./routes/health.routes";
import { docsRouter } from "./modules/docs/docs.routes";
import { partesRouter } from "./modules/partes/partes.routes";
import { documentosRouter } from "./modules/documentos/documentos.routes";
import { clientesRouter } from "./modules/clientes/clientes.routes";
import { adminRouter } from "./modules/admin/admin.routes";

export const app = express();
app.disable("x-powered-by");

// Segurança e borda
app.use(helmet());
app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((o) => o.trim()) }));
app.use(requestContext);
if (!env.isTest) {
  app.use(pinoHttp({ logger, genReqId: (req) => (req as { id?: string }).id ?? "" }));
}
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Rotas
app.use(healthRouter); // /health — sem versão
app.use(docsRouter); // /v1/docs, /v1/openapi.json
app.use("/v1", partesRouter); // API versionada
app.use("/v1", documentosRouter);
app.use("/v1", clientesRouter);
app.use("/v1", adminRouter);

// Middleware de erro (sempre por último)
app.use(errorHandler);
