/**
 * Reprocessa o Entity Intelligence Profile aplicando a reclassificação de
 * categorias corrigida hoje (extracao-llm.reclassificarCategoria).
 *
 * O perfil da AI-03 foi gerado ANTES da correção: os fatos de público e de
 * ativos ficaram sob `movimentos`. Isso não é detalhe cosmético — o Crossability
 * seleciona fatos por seção, então um fato de público arquivado em `movimentos`
 * simplesmente não chega à dimensão Públicos.
 *
 * Este script move os elementos para a seção correta, sem inventar nada:
 * usa exatamente a mesma função de reclassificação já coberta por teste.
 *
 * Uso: npx tsx scripts/reclassificar-perfil.ts <entrada.json> <saida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { reclassificarCategoria } from "../src/modules/agentes/evidencia/extracao-llm";
import type { EntityIntelligenceProfile, ElementoPerfil } from "../src/modules/agentes/entidade/perfil.schema";
import type { CategoriaFato } from "../src/modules/agentes/evidencia/evidencia.schema";

const entrada = process.argv[2];
const saida = process.argv[3];

const perfil = JSON.parse(readFileSync(entrada, "utf8")) as EntityIntelligenceProfile;

/** Seção do perfil ← categoria reclassificada. */
const SECAO_POR_CATEGORIA: Record<string, keyof EntityIntelligenceProfile> = {
  publico: "publicos",
  territorio: "territorios",
  ativo: "ativos",
};

/** Seções cujos elementos podem ter sido classificados errado na origem. */
const ORIGENS: Array<keyof EntityIntelligenceProfile> = ["movimentos", "contexto_empresa"];

let movidos = 0;

for (const origem of ORIGENS) {
  const elementos = perfil[origem] as ElementoPerfil[];
  if (!Array.isArray(elementos)) continue;

  const restantes: ElementoPerfil[] = [];

  for (const e of elementos) {
    // A categoria original não é preservada no perfil; parte-se de uma
    // genérica para que a reclassificação possa atuar.
    const r = reclassificarCategoria(e.valor, "movimento_estrategico" as CategoriaFato);
    const destino = SECAO_POR_CATEGORIA[r.categoria];

    if (r.reclassificado && destino) {
      (perfil[destino] as ElementoPerfil[]).push(e);
      movidos++;
      console.log(`${origem} -> ${String(destino)}: ${e.valor.slice(0, 70)}`);
    } else {
      restantes.push(e);
    }
  }

  (perfil[origem] as ElementoPerfil[]) = restantes;
}

// Lacunas que deixaram de existir precisam sair: manter "nenhum fato sobre
// público" com público preenchido seria reportar uma lacuna falsa.
perfil.lacunas = perfil.lacunas.filter((l) => {
  const secao = l.campo as keyof EntityIntelligenceProfile;
  const preenchida = Array.isArray(perfil[secao]) && (perfil[secao] as unknown[]).length > 0;
  return !preenchida;
});

perfil.versao_perfil = perfil.versao_perfil + 1;

writeFileSync(saida, JSON.stringify(perfil, null, 2));

console.log(`\nmovidos: ${movidos}`);
console.log(`publicos=${perfil.publicos.length} territorios=${perfil.territorios.length} ativos=${perfil.ativos.length}`);
console.log(`lacunas restantes: ${perfil.lacunas.length}`);
