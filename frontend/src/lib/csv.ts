// Parser de CSV mínimo e sem dependências, suficiente para a importação da demo.
// Suporta: separador vírgula OU ponto-e-vírgula (detectado no cabeçalho),
// campos entre aspas com vírgulas/quebras internas e aspas escapadas ("").

export interface CsvParse {
  cabecalho: string[];
  linhas: Record<string, string>[];
}

function detectarSeparador(primeiraLinha: string): ',' | ';' {
  // Planilhas em pt-BR costumam exportar com ';'. Escolhe o que aparece mais.
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length;
  const pontosVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  return pontosVirgula > virgulas ? ';' : ',';
}

/** Quebra uma linha de CSV respeitando aspas. */
function separarCampos(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++; // pula a aspa escapada
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === sep && !dentroAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((s) => s.trim());
}

export function parseCsv(texto: string): CsvParse {
  // Normaliza quebras de linha e remove BOM do começo do arquivo
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const linhasBrutas = limpo.split('\n').filter((l) => l.trim() !== '');
  if (linhasBrutas.length === 0) return { cabecalho: [], linhas: [] };

  const sep = detectarSeparador(linhasBrutas[0]);
  const cabecalho = separarCampos(linhasBrutas[0], sep).map((h) => h.toLowerCase());

  const linhas = linhasBrutas.slice(1).map((linha) => {
    const campos = separarCampos(linha, sep);
    const registro: Record<string, string> = {};
    cabecalho.forEach((chave, i) => {
      registro[chave] = campos[i] ?? '';
    });
    return registro;
  });

  return { cabecalho, linhas };
}
