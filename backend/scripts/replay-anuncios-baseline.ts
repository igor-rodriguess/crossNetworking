/**
 * Reprocessa as URLs de anúncio REAIS da baseline (AI-02.1) pelo filtro novo.
 *
 * Existe porque o buscador nem sempre devolve anúncios: a rodada AFTER não
 * trouxe nenhum, então o filtro não seria exercitado com dado real. Aqui as
 * URLs que de fato passaram no BEFORE são reprocessadas — prova direta.
 *
 * Uso: npx tsx scripts/replay-anuncios-baseline.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { avaliarFonte, detectarAnuncio } from "../src/modules/agentes/evidencia/qualidade-fonte";

const RAW = join(process.cwd(), "..", "docs", "ai", "validation", "raw");

interface Resultado {
  titulo: string;
  url: string;
  dominio: string;
}

function main() {
  const caminho = join(RAW, "research-evidence-live-baseline", "caso-a-converse", "search-results.json");
  const dados = JSON.parse(readFileSync(caminho, "utf8")) as { resultados: Resultado[] };

  const anuncios = dados.resultados.filter((r) => r.dominio === "duckduckgo.com");
  const linhas: unknown[] = [];
  let bloqueados = 0;

  for (const a of anuncios) {
    const deteccao = detectarAnuncio(a.url, a.titulo);
    const qualidade = avaliarFonte({ url: a.url, titulo: a.titulo, dominio: a.dominio });
    if (deteccao.ehAnuncio) bloqueados++;

    linhas.push({
      titulo: a.titulo,
      url_truncada: a.url.slice(0, 110) + "…",
      antes: { aceito_como_fonte: true, score: 58, classificacao: "media" },
      depois: {
        detectado_como_anuncio: deteccao.ehAnuncio,
        sinais: deteccao.sinais,
        classificacao: qualidade.classificacao,
        score: qualidade.score,
        scrapes_evitados: deteccao.ehAnuncio ? 1 : 0,
      },
    });

    // eslint-disable-next-line no-console
    console.log(`${deteccao.ehAnuncio ? "BLOQUEADO" : "PASSOU !!"} | score ${qualidade.score} | ${a.titulo.slice(0, 48)}`);
    // eslint-disable-next-line no-console
    console.log(`   sinais: ${deteccao.sinais.join(", ")}`);
  }

  const saida = {
    fonte: "raw/research-evidence-live-baseline/caso-a-converse/search-results.json",
    anuncios_na_baseline: anuncios.length,
    bloqueados_pelo_filtro_novo: bloqueados,
    scrapes_evitados: bloqueados,
    detalhes: linhas,
  };

  writeFileSync(
    join(RAW, "research-evidence-source-quality", "replay-anuncios-baseline.json"),
    JSON.stringify(saida, null, 2) + "\n",
    "utf8"
  );

  // eslint-disable-next-line no-console
  console.log(`\nRESULTADO: ${bloqueados}/${anuncios.length} anúncios bloqueados`);
}

main();
