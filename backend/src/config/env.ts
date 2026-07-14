import "dotenv/config";

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  port: Number(process.env.PORT ?? 3000),
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
}
