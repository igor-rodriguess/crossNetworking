import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  MIGRATION_DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Configuração de ambiente inválida:", parsed.error.issues);
  process.exit(1);
}

const data = parsed.data;
const isTest = Boolean(process.env.VITEST) || data.NODE_ENV === "test";

export const env = {
  databaseUrl: data.DATABASE_URL,
  port: data.PORT,
  nodeEnv: data.NODE_ENV,
  logLevel: data.LOG_LEVEL,
  corsOrigin: data.CORS_ORIGIN,
  rateLimitMax: data.RATE_LIMIT_MAX,
  rateLimitWindowMs: data.RATE_LIMIT_WINDOW_MS,
  isTest,
};
