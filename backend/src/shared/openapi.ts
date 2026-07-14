import { z } from "zod";

interface RotaDoc {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; // caminho completo, ex.: /v1/partes/:id
  tag: string;
  summary: string;
  body?: z.ZodType;
  responses: Record<string, string>;
}

const registro: RotaDoc[] = [];

/** Cada módulo registra suas rotas aqui; o documento é a fonte única do contrato. */
export function registrarRota(rota: RotaDoc): void {
  registro.push(rota);
}

function jsonSchemaDe(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema);
  } catch {
    return { type: "object" };
  }
}

/** Monta o documento OpenAPI 3.1 a partir das rotas registradas. */
export function construirOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of registro) {
    const caminho = r.path.replace(/:([A-Za-z_]+)/g, "{$1}");
    paths[caminho] ??= {};

    const op: Record<string, unknown> = {
      tags: [r.tag],
      summary: r.summary,
      responses: Object.fromEntries(
        Object.entries(r.responses).map(([codigo, descricao]) => [codigo, { description: descricao }])
      ),
    };
    if (r.body) {
      op.requestBody = {
        required: true,
        content: { "application/json": { schema: jsonSchemaDe(r.body) } },
      };
    }
    paths[caminho][r.method.toLowerCase()] = op;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Plataforma Cross API",
      version: "1.0.0",
      description: "API da Plataforma Cross — backend da Crossnetworking.",
    },
    servers: [{ url: "/" }],
    paths,
  };
}
