import { readFileSync } from "node:fs";
import { reclassificarCategoria } from "../src/modules/agentes/evidencia/extracao-llm";

// Confere a reclassificação determinística contra um Evidence Package real.
// Uso: tsx scripts/check-reclass.ts <caminho-do-evidence-package.json>

const pkg = JSON.parse(readFileSync(process.argv[2], "utf8"));

let mudou = 0;
for (const f of pkg.facts) {
  const r = reclassificarCategoria(f.claim, f.categoria);
  if (r.reclassificado) mudou++;
  const marca = r.reclassificado ? `${f.categoria} -> ${r.categoria}` : `= ${r.categoria}`;
  console.log(`${marca.padEnd(36)} ${f.claim.slice(0, 88)}`);
}
console.log(`\nreclassificados: ${mudou}/${pkg.facts.length}`);
