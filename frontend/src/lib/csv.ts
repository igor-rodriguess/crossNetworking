// Leitor de CSV tolerante a planilhas operacionais reais. Além do CSV comum,
// reconhece títulos antes do cabeçalho, cabeçalhos repetidos entre blocos e
// quebras de linha dentro de campos entre aspas.

export interface CsvParse {
  cabecalho: string[];
  linhas: Record<string, string>[];
  avisos: string[];
}

function normalizar(texto: string): string {
  return texto
    .replace(/\uFFFD/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectarSeparador(texto: string): ',' | ';' {
  // O conteúdo inteiro é usado porque planilhas de acompanhamento costumam
  // começar com um título antes da linha de cabeçalho.
  const virgulas = (texto.match(/,/g) ?? []).length;
  const pontosVirgula = (texto.match(/;/g) ?? []).length;
  return pontosVirgula > virgulas ? ';' : ',';
}

/** Lê registros respeitando aspas escapadas e quebras de linha internas. */
function lerRegistros(texto: string, separador: string): string[][] {
  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = '';
  let dentroAspas = false;

  function concluirCampo() {
    registro.push(campo.trim());
    campo = '';
  }
  function concluirRegistro() {
    concluirCampo();
    if (registro.some((valor) => valor.trim() !== '')) registros.push(registro);
    registro = [];
  }

  for (let indice = 0; indice < texto.length; indice++) {
    const caractere = texto[indice];
    if (caractere === '"') {
      if (dentroAspas && texto[indice + 1] === '"') {
        campo += '"';
        indice++;
      } else {
        dentroAspas = !dentroAspas;
      }
      continue;
    }
    if (caractere === separador && !dentroAspas) {
      concluirCampo();
      continue;
    }
    if (caractere === '\n' && !dentroAspas) {
      concluirRegistro();
      continue;
    }
    campo += caractere;
  }
  if (campo.length > 0 || registro.length > 0) concluirRegistro();
  return registros;
}

function pontuacaoDeCabecalho(campos: string[]): number {
  const valores = campos.map(normalizar);
  const conhecidos = [
    'nome', 'marca', 'talento', 'cliente', 'empresa', 'status', 'setor',
    'territorio', 'objetivo', 'observacoes', 'obs', 'projeto', 'frente',
  ];
  return valores.reduce((total, valor) =>
    total + (conhecidos.some((conhecido) => valor.includes(conhecido)) ? 1 : 0), 0);
}

function localizarCabecalho(registros: string[][]): number {
  let melhorIndice = 0;
  let melhorPontuacao = pontuacaoDeCabecalho(registros[0] ?? []);
  // Uma planilha pode ter uma capa curta antes da tabela. Limitamos a busca
  // para não confundir uma linha de dado distante com cabeçalho.
  for (let indice = 1; indice < Math.min(registros.length, 30); indice++) {
    const pontuacao = pontuacaoDeCabecalho(registros[indice]);
    if (pontuacao > melhorPontuacao) {
      melhorIndice = indice;
      melhorPontuacao = pontuacao;
    }
  }
  return melhorPontuacao >= 2 ? melhorIndice : 0;
}

function ehCabecalhoRepetido(campos: string[], cabecalho: string[]): boolean {
  const tamanho = Math.max(campos.length, cabecalho.length);
  if (tamanho === 0) return false;
  let iguais = 0;
  for (let indice = 0; indice < tamanho; indice++) {
    const valor = normalizar(campos[indice] ?? '');
    if (valor && valor === normalizar(cabecalho[indice] ?? '')) iguais++;
  }
  return iguais >= Math.min(3, cabecalho.length);
}

function indiceMarcaOuTalento(cabecalho: string[]): number {
  return cabecalho.findIndex((campo) => {
    const valor = normalizar(campo);
    return valor.includes('marca') || valor.includes('talento');
  });
}

/**
 * Converte CSV em objetos usando o cabeçalho mais provável, não apenas a
 * primeira linha. Em planilhas de parcerias, linhas de seção sem marca/talento
 * são ignoradas para não virarem cadastros inválidos.
 */
export function parseCsv(texto: string): CsvParse {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!limpo.trim()) return { cabecalho: [], linhas: [], avisos: [] };

  const registros = lerRegistros(limpo, detectarSeparador(limpo));
  if (registros.length === 0) return { cabecalho: [], linhas: [], avisos: [] };

  const indiceCabecalho = localizarCabecalho(registros);
  const cabecalho = registros[indiceCabecalho].map((campo) => campo.toLowerCase());
  const indiceMarca = indiceMarcaOuTalento(cabecalho);
  const avisos: string[] = [];
  if (indiceCabecalho > 0) avisos.push(`Cabeçalho reconhecido após ${indiceCabecalho} linha(s) de título.`);
  if (texto.includes('\uFFFD')) avisos.push('Há caracteres com codificação inválida. Prefira enviar o arquivo CSV original em vez de copiar texto já corrompido.');

  let cabecalhosRepetidos = 0;
  let linhasSecao = 0;
  const linhas = registros.slice(indiceCabecalho + 1).flatMap((campos) => {
    if (ehCabecalhoRepetido(campos, cabecalho)) {
      cabecalhosRepetidos++;
      return [];
    }
    // Formato típico de acompanhamento: títulos como "COLLABS" aparecem na
    // primeira coluna e a marca fica vazia. Eles são contexto visual, não dado.
    if (indiceMarca >= 0 && !(campos[indiceMarca] ?? '').trim()) {
      linhasSecao++;
      return [];
    }
    const registro: Record<string, string> = {};
    cabecalho.forEach((chave, indice) => { registro[chave] = campos[indice] ?? ''; });
    return [registro];
  });

  if (cabecalhosRepetidos) avisos.push(`${cabecalhosRepetidos} cabeçalho(s) repetido(s) foram ignorados.`);
  if (linhasSecao) avisos.push(`${linhasSecao} linha(s) de seção sem marca/talento foram ignoradas.`);
  return { cabecalho, linhas, avisos };
}
