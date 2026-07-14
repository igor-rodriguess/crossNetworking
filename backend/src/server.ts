import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./shared/logger";
import { closePool } from "./shared/db";

const server = app.listen(env.port, () => {
  logger.info(`Plataforma Cross API ouvindo na porta ${env.port}`);
});

// Encerramento gracioso: para de aceitar conexões, fecha o pool e sai.
async function shutdown(sinal: string): Promise<void> {
  logger.info(`${sinal} recebido — encerrando...`);
  server.close(async () => {
    await closePool().catch(() => undefined);
    process.exit(0);
  });
  // fallback duro se o close travar
  setTimeout(() => process.exit(1), 10_000).unref();
}

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => void shutdown(sinal));
}
