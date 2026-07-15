import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./shared/logger";
import { closePool } from "./shared/db";
import { iniciarDrenagem } from "./shared/lifecycle";

const server = app.listen(env.port, () => {
  logger.info(`Plataforma Cross API ouvindo na porta ${env.port}`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
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
