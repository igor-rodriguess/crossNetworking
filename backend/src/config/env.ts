import "dotenv/config";
import { z } from "zod";

// Chave de API opcional. Duas robustezas contra erros comuns de `.env`:
// (1) uma variável PRESENTE mas VAZIA (ex.: `DEEPSEEK_API_KEY=` aguardando ser
//     preenchida) conta como ausente, não como erro — senão o boot cai no Zod;
// (2) espaços em volta (ex.: `FIRECRAWL_API_KEY= fc-...`, um erro fácil ao
//     colar) são removidos, para a chave não ir com espaço no header Bearer.
const chaveOpcional = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? undefined : t;
}, z.string().min(1).optional());

// `z.coerce.boolean()` usa Boolean(value), então a string "false" vira true.
// O .env é textual; parseamos explicitamente os booleanos para preservar a
// semântica esperada em desenvolvimento e produção.
const booleanEnv = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
  }
  return v;
}, z.boolean().default(false));

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  MIGRATION_DATABASE_URL: z.string().optional(),
  // Verificação estrita do certificado TLS do banco. O pooler do Supabase usa
  // um certificado que pode não estar na cadeia padrão; deixe `false` (default)
  // com ele, ou forneça a CA e ligue `true` em produção própria.
  DATABASE_SSL_STRICT: booleanEnv,
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("*"),
  TRUST_PROXY: booleanEnv,
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
  AI_PROVIDER: z.enum(["openai", "deepseek", "ollama"]).default("ollama"),
  OPENAI_API_KEY: chaveOpcional,
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  DEEPSEEK_API_KEY: chaveOpcional,
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
  // Modelo de embeddings do RAG. text-embedding-3-small = 1536 dimensões
  // (deve casar com a dimensão da coluna vector no banco). Só a OpenAI oferece
  // embeddings; o DeepSeek não tem. Sem chave OpenAI, o RAG usa o stub.
  OPENAI_EMBED_MODEL: z.string().min(1).default("text-embedding-3-small"),
  FIRECRAWL_API_KEY: chaveOpcional,
  // Teto de cada chamada de LLM. Sem ele, uma chamada travada pendura o
  // pipeline inteiro sem erro. A plataforma prioriza uma sugestão curável em
  // fallback a deixar a interface aguardando minutos pelo modelo local.
  // Um modelo local pode precisar de alguns segundos extras na primeira chamada
  // (carregamento em memória). 90s preserva o fallback seguro sem derrubar uma
  // execução válida do Ollama durante a demonstração ou após ocioso.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  // Força o modo mock mesmo com chave presente (útil para testes/CI).
  AI_MOCK: booleanEnv,

  // --- Guardrails de custo (Sprint 0D) -------------------------------------
  // Medir custo não é controlar custo. Estes limites são verificados ANTES de
  // cada operação potencialmente paga; ver shared/budget.ts.
  //
  // KILL SWITCH. Enquanto false, nenhuma chamada paga acontece — mesmo com
  // chave presente no ambiente. Ter/não ter chave não é proteção suficiente:
  // uma chave colada por engano no .env não deve, sozinha, liberar gasto.
  // Provedores locais (Ollama) continuam funcionando normalmente.
  AI_PAID_PROVIDERS_ENABLED: booleanEnv,
  // Teto de custo estimado por execução de pipeline, em USD.
  AI_MAX_COST_PER_RUN_USD: z.coerce.number().nonnegative().default(0.5),
  // Tetos de chamadas por execução. Conservadores para desenvolvimento —
  // NÃO são os valores finais de produção.
  AI_MAX_LLM_CALLS_PER_RUN: z.coerce.number().int().positive().default(20),
  AI_MAX_WEB_SEARCHES_PER_RUN: z.coerce.number().int().positive().default(12),
  AI_MAX_SCRAPES_PER_RUN: z.coerce.number().int().positive().default(15),
  // Trava contra "candidate explosion": quantos candidatos podem seguir para
  // o reasoning (1 chamada de LLM por candidato).
  AI_MAX_REASONING_CANDIDATES: z.coerce.number().int().positive().default(8),
  AI_MAX_RETRIES_PER_STEP: z.coerce.number().int().min(0).max(5).default(2),
  // Modo estrito de custo: operação paga cujo custo NÃO é estimável (modelo
  // fora da tabela de preços) é BLOQUEADA. `null` não é gratuito — é "não sei
  // quanto custa", e liberar isso é como assinar cheque em branco.
  // Default true: fail-safe. Pode ser desligado em desenvolvimento.
  AI_STRICT_COST_MODE: z.preprocess((v) => {
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    return v;
  }, z.boolean().default(true)),

  // Operações autorizadas a consumir LLM. Segunda trava, independente do kill
  // switch: mesmo com provider habilitado, só o que estiver nesta lista pode
  // gerar chamada. Impede que ligar o provider para UMA finalidade libere
  // inferência em Planning, Crossability e nos demais agentes.
  //
  // Lista separada por vírgula; vazio = nenhuma operação autorizada.
  // Default `fact_extraction`: é a única operação que hoje precisa de LLM.
  AI_ALLOWED_LLM_OPERATIONS: z.preprocess(
    (v) => (typeof v === "string" ? v : "fact_extraction"),
    z.string().default("fact_extraction")
  ),
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

/**
 * Banco usado pela suíte automatizada.
 *
 * Os testes criam clientes, projetos e candidaturas reais. O harness
 * (tests/setup.ts) envolve cada caso numa transação com ROLLBACK, mas isso não
 * é garantia suficiente: um teste que abra a própria conexão, ou uma queda no
 * meio da execução, deixa resíduo. Em julho/2026 foi assim que 25 clientes
 * "Cli * E2E" foram parar na base real (limpos pela migration 051).
 *
 * Por isso, sob VITEST usamos TEST_DATABASE_URL. Quando ela não está definida,
 * o teste NÃO cai silenciosamente na produção: `db.ts` aborta com instrução de
 * como subir o banco local. Preferimos falhar ruidosamente a sujar dados reais.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? null;

export const env = {
  databaseUrl: data.DATABASE_URL,
  testDatabaseUrl,
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
  ollamaBaseUrl: data.OLLAMA_BASE_URL.replace(/\/$/, ""),
  ollamaModel: data.OLLAMA_MODEL,
  openaiEmbedModel: data.OPENAI_EMBED_MODEL,
  firecrawlApiKey: data.FIRECRAWL_API_KEY,
  llmTimeoutMs: data.LLM_TIMEOUT_MS,
  // AI_MOCK cru — força o stub em qualquer camada (busca/extração), útil em CI.
  forcarMock: data.AI_MOCK,
  // Chave do provedor de LLM selecionado (a que o wrapper usa de fato).
  // O kill switch tem precedência: sem ele ligado, a chave é ignorada e o
  // provedor pago fica inalcançável.
  llmApiKey:
    !data.AI_PAID_PROVIDERS_ENABLED
      ? undefined
      : data.AI_PROVIDER === "deepseek"
        ? data.DEEPSEEK_API_KEY
        : data.AI_PROVIDER === "openai"
          ? data.OPENAI_API_KEY
          : undefined,
  // Modo mock do LLM: AI_MOCK, kill switch desligado, ou provedor selecionado
  // sem chave. (Não usamos mais LLM próprio — extração é via Firecrawl —, mas
  // os agentes de reasoning que ainda referenciam isto seguem em stub por
  // padrão, sem quebrar.)
  aiMock:
    data.AI_MOCK ||
    (data.AI_PROVIDER !== "ollama" &&
      (!data.AI_PAID_PROVIDERS_ENABLED ||
        !(data.AI_PROVIDER === "deepseek" ? data.DEEPSEEK_API_KEY : data.OPENAI_API_KEY))),
  // Extração via Firecrawl: real quando há chave Firecrawl, AI_MOCK off e o
  // kill switch ligado — o Firecrawl é cobrado por página.
  extracaoMock: data.AI_MOCK || !data.AI_PAID_PROVIDERS_ENABLED || !data.FIRECRAWL_API_KEY,
  // Embeddings do RAG só são reais com chave OpenAI (DeepSeek não tem
  // embeddings) e com o kill switch ligado — são cobrados por uso.
  embeddingMock: data.AI_MOCK || !data.AI_PAID_PROVIDERS_ENABLED || !data.OPENAI_API_KEY,

  // --- Guardrails de custo -------------------------------------------------
  paidProvidersEnabled: data.AI_PAID_PROVIDERS_ENABLED,
  strictCostMode: data.AI_STRICT_COST_MODE,
  maxCostPerRunUsd: data.AI_MAX_COST_PER_RUN_USD,
  maxLlmCallsPerRun: data.AI_MAX_LLM_CALLS_PER_RUN,
  maxWebSearchesPerRun: data.AI_MAX_WEB_SEARCHES_PER_RUN,
  maxScrapesPerRun: data.AI_MAX_SCRAPES_PER_RUN,
  maxReasoningCandidates: data.AI_MAX_REASONING_CANDIDATES,
  maxRetriesPerStep: data.AI_MAX_RETRIES_PER_STEP,
  /** Operações autorizadas a consumir LLM (allowlist). */
  allowedLlmOperations: new Set(
    data.AI_ALLOWED_LLM_OPERATIONS.split(",")
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean)
  ),

  isTest,
  isProd,
};
