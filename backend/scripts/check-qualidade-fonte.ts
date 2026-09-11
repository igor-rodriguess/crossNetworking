import { readFileSync } from "node:fs";
import { avaliarFonte } from "../src/modules/agentes/evidencia/qualidade-fonte";

// Reavalia as fontes descartadas de um Evidence Package real com a regra atual.
// Uso: tsx scripts/check-qualidade-fonte.ts <evidence-package.json>

const pkg = JSON.parse(readFileSync(process.argv[2], "utf8"));

const urls: string[] = [
  ...(pkg.descartados ?? [])
    .filter((d: { motivo: string }) => d.motivo === "baixa_credibilidade")
    .map((d: { referencia: string }) => d.referencia),
];

let recuperadas = 0;
for (const url of urls) {
  if (!url.startsWith("http")) continue;
  const a = avaliarFonte({ url, dominio: undefined, siteOficial: "converse.com" });
  const passa = a.classificacao !== "baixa_autoridade" && a.classificacao !== "agregador";
  if (passa) recuperadas++;
  console.log(`${passa ? "PASSA " : "barra "} ${String(a.score).padStart(3)} ${a.classificacao.padEnd(24)} ${url.slice(0, 78)}`);
}
console.log(`\nrecuperadas: ${recuperadas}/${urls.length}`);
