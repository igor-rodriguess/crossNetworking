import { Router, Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import { construirOpenApi } from "../../shared/openapi";

export const docsRouter = Router();

// Documento OpenAPI (fonte única do contrato) e UI interativa.
docsRouter.get("/v1/openapi.json", (_req, res) => {
  res.json(construirOpenApi());
});

docsRouter.use(
  "/v1/docs",
  swaggerUi.serve,
  (req: Request, res: Response, next: NextFunction) =>
    swaggerUi.setup(construirOpenApi(), { customSiteTitle: "Plataforma Cross API" })(req, res, next)
);
