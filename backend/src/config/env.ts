import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  MIGRATION_DATABASE_URL: z.string().optional(),
  // Verificação estrita do certificado TLS do banco. O pooler do Supabase usa
  // um certificado que pode não estar na cadeia padrão; deixe `false` (default)
  // com ele, ou forneça a CA e ligue `true` em produção própria.
  DATABASE_SSL_STRICT: z.coerce.boolean().default(false),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("*"),
  TRUST_PROXY: z.coerce.boolean().default(false),
  REQUEST_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i, "use, por exemplo, 256kb ou 1mb").default("1mb"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(10000),
  // Segredo de assinatura dos tokens (HMAC-SHA256). Obrigatório em produção;
  // fora de produção cai num valor de desenvolvimento explícito.
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres").optional(),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Protege /metrics. Obrigatório em produção para não expor telemetria.
  METRICS_TOKEN: z.string().min(32, "METRICS_TOKEN deve ter ao menos 32 caracteres").optional(),

  // --- Agentes de IA (RF de IA — pipeline multiagente) ---------------------
  // Chaves opcionais: sem elas, os agentes rodam em MODO MOCK (stub
  // determinístico), o que permite desenvolver e testar sem custo/credencial.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  // Modelo de embeddings do RAG. text-embedding-3-small = 1536 dimensões
  // (deve casar com a dimensão da coluna vector no banco).
  OPENAI_EMBED_MODEL: z.string().min(1).default("text-embedding-3-small"),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  // Força o modo mock mesmo com chave presente (útil para testes/CI).
  AI_MOCK: z.coerce.boolean().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Configuração de ambiente inválida:", parsed.error.issues);
  process.exit(1);
}

const data = parsed.data;
const isTest = Boolean(process.env.VITEST) || data.NODE_ENV === "test";
const isProd = data.NODE_ENV === "production";

// O segredo de assinatura é obrigatório em produção. Fora dela, usa um valor
// de desenvolvimento fixo e explícito (nunca serve para produção).
if (isProd && !data.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error("JWT_SECRET é obrigatório em produção (defina uma string aleatória com 32+ caracteres).");
  process.exit(1);
}
if (isProd && data.CORS_ORIGIN === "*") {
  // eslint-disable-next-line no-console
  console.error("CORS_ORIGIN não pode ser '*' em produção; informe as origens permitidas.");
  process.exit(1);
}
if (isProd && !data.METRICS_TOKEN) {
  // eslint-disable-next-line no-console
  console.error("METRICS_TOKEN é obrigatório em produção.");
  process.exit(1);
}
const jwtSecret =
  data.JWT_SECRET ?? "dev-secret-somente-para-desenvolvimento-e-testes-32c";

export const env = {
  databaseUrl: data.DATABASE_URL,
  databaseSslStrict: data.DATABASE_SSL_STRICT,
  port: data.PORT,
  nodeEnv: data.NODE_ENV,
  logLevel: data.LOG_LEVEL,
  corsOrigin: data.CORS_ORIGIN,
  trustProxy: data.TRUST_PROXY,
  requestBodyLimit: data.REQUEST_BODY_LIMIT,
  rateLimitMax: data.RATE_LIMIT_MAX,
  rateLimitWindowMs: data.RATE_LIMIT_WINDOW_MS,
  shutdownTimeoutMs: data.SHUTDOWN_TIMEOUT_MS,
  jwtSecret,
  accessTokenTtlMin: data.ACCESS_TOKEN_TTL_MIN,
  refreshTokenTtlDays: data.REFRESH_TOKEN_TTL_DAYS,
  metricsToken: data.METRICS_TOKEN,
  // Agentes de IA
  openaiApiKey: data.OPENAI_API_KEY,
  openaiModel: data.OPENAI_MODEL,
  openaiEmbedModel: data.OPENAI_EMBED_MODEL,
  firecrawlApiKey: data.FIRECRAWL_API_KEY,
  // Sem chave OpenAI (ou AI_MOCK ligado) → agentes usam o stub determinístico.
  aiMock: data.AI_MOCK || !data.OPENAI_API_KEY,
  isTest,
  isProd,
};
