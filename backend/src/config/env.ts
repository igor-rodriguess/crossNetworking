import "dotenv/config";
import { z } from "zod";

// Chave de API opcional: uma variável PRESENTE mas VAZIA (ex.: `DEEPSEEK_API_KEY=`
// no .env, aguardando ser preenchida) deve contar como ausente, não como erro.
// Sem isto, `z.string().min(1).optional()` rejeita a string vazia e derruba o boot.
const chaveOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

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
  //
  // Provedor do LLM de raciocínio. DeepSeek é compatível com o formato da OpenAI
  // (mesmo /chat/completions, mesmo response_format json_object) e tem custo bem
  // menor — só muda a URL base, a chave e o modelo.
  AI_PROVIDER: z.enum(["openai", "deepseek"]).default("deepseek"),
  OPENAI_API_KEY: chaveOpcional,
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  DEEPSEEK_API_KEY: chaveOpcional,
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
  // Modelo de embeddings do RAG. text-embedding-3-small = 1536 dimensões
  // (deve casar com a dimensão da coluna vector no banco). Só a OpenAI oferece
  // embeddings; o DeepSeek não tem. Sem chave OpenAI, o RAG usa o stub.
  OPENAI_EMBED_MODEL: z.string().min(1).default("text-embedding-3-small"),
  FIRECRAWL_API_KEY: chaveOpcional,
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
  aiProvider: data.AI_PROVIDER,
  openaiApiKey: data.OPENAI_API_KEY,
  openaiModel: data.OPENAI_MODEL,
  deepseekApiKey: data.DEEPSEEK_API_KEY,
  deepseekModel: data.DEEPSEEK_MODEL,
  openaiEmbedModel: data.OPENAI_EMBED_MODEL,
  firecrawlApiKey: data.FIRECRAWL_API_KEY,
  // Chave do provedor de LLM selecionado (a que o wrapper usa de fato).
  llmApiKey: data.AI_PROVIDER === "deepseek" ? data.DEEPSEEK_API_KEY : data.OPENAI_API_KEY,
  // Modo mock quando AI_MOCK está ligado OU o provedor selecionado não tem chave.
  aiMock: data.AI_MOCK || !(data.AI_PROVIDER === "deepseek" ? data.DEEPSEEK_API_KEY : data.OPENAI_API_KEY),
  // Embeddings do RAG só são reais com chave OpenAI (DeepSeek não tem embeddings).
  embeddingMock: data.AI_MOCK || !data.OPENAI_API_KEY,
  isTest,
  isProd,
};
