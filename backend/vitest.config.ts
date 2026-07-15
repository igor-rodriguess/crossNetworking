import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Nunca testar a saída compilada de `npm run build`.
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Um único client de banco é compartilhado por arquivo de teste para o
    // padrão de rollback — por isso os arquivos rodam em série.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
