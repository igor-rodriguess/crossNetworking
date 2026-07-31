import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./shared/logger";
import { closePool } from "./shared/db";
import { iniciarDrenagem } from "./shared/lifecycle";
import { recuperarTarefasInterrompidas } from "./modules/agentes/agentes.service";
import { aquecerOllama } from "./modules/agentes/shared/llm";

const server = app.listen(env.port, () => {
  logger.info(`Plataforma Cross API ouvindo na porta ${env.port}`);
});

// Tarefas de IA rodam no próprio processo; se ele reiniciar, tarefas antigas
// não devem parecer vivas para a interface. A recuperação é best-effort e não
// bloqueia a subida da API.
void recuperarTarefasInterrompidas()
  .then((encerradas) => {
    if (encerradas) logger.warn({ encerradas }, "Tarefas de IA interrompidas foram encerradas na inicialização");
  })
  .catch((erro) => logger.warn({ erro }, "Não foi possível recuperar tarefas de IA interrompidas"));

// O aquecimento é assíncrono: a API sobe de imediato e o primeiro uso humano
// encontra o modelo local já carregado na maior parte dos casos.
void aquecerOllama()
  .then(() => logger.info({ modelo: env.ollamaModel }, "Ollama aquecido para os agentes de IA"))
  .catch((erro) => logger.warn({ erro }, "Não foi possível aquecer o Ollama; haverá fallback local quando necessário"));
// Algumas ações síncronas e curtas (enriquecimento de perfil e mapeamento de
// CSV) usam Ollama local e Firecrawl. O limite HTTP precisa comportar o teto
// do LLM, enquanto os pipelines longos continuam usando a fila assíncrona.
server.requestTimeout = 120_000;
server.headersTimeout = 125_000;
server.keepAliveTimeout = 5_000;

// Encerramento gracioso: para de aceitar conexões, fecha o pool e sai.
let encerrando = false;
async function shutdown(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  iniciarDrenagem();
  logger.info(`${sinal} recebido — encerrando...`);
  server.close(async () => {
    await closePool().catch(() => undefined);
    process.exit(0);
  });
  // fallback duro se o close travar
  setTimeout(() => process.exit(1), env.shutdownTimeoutMs).unref();
}

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => void shutdown(sinal));
}

process.on("unhandledRejection", (motivo) => {
  logger.fatal({ motivo }, "promise rejeitada sem tratamento");
  void shutdown("unhandledRejection");
});
process.on("uncaughtException", (erro) => {
  logger.fatal({ erro }, "exceção não tratada");
  void shutdown("uncaughtException");
});
