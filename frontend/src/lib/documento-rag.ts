import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

const LIMITE_ARQUIVO_BYTES = 15 * 1024 * 1024;
const TAMANHO_TRECHO = 1_600;
const SOBREPOSICAO = 220;

export interface TextoExtraido {
  texto: string;
  paginas?: number;
}

function normalizarTexto(texto: string): string {
  return texto
    .replace(/\u0000/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extrai o texto no navegador. O arquivo não é enviado nem armazenado pela
 * aplicação: apenas os trechos que a pessoa confirma vão para o RAG. */
export async function extrairTextoArquivo(arquivo: File): Promise<TextoExtraido> {
  if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
    throw new Error('O arquivo ultrapassa 15 MB. Divida-o em relatórios menores para indexar com segurança.');
  }

  const nome = arquivo.name.toLowerCase();
  const ehPdf = arquivo.type === 'application/pdf' || nome.endsWith('.pdf');
  if (!ehPdf) {
    const texto = normalizarTexto(await arquivo.text());
    if (!texto) throw new Error('Não foi possível encontrar texto no arquivo.');
    return { texto };
  }

  // O worker do PDF.js é servido pelo bundle do Vite e não depende de CDN.
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const pdf = await getDocument({ data: dados }).promise;
  const paginas: string[] = [];
  for (let paginaAtual = 1; paginaAtual <= pdf.numPages; paginaAtual++) {
    const pagina = await pdf.getPage(paginaAtual);
    const conteudo = await pagina.getTextContent();
    const textoPagina = conteudo.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ');
    if (textoPagina.trim()) paginas.push(`[Página ${paginaAtual}]\n${textoPagina}`);
  }
  const texto = normalizarTexto(paginas.join('\n\n'));
  if (!texto) throw new Error('O PDF não possui texto selecionável. Exporte-o com OCR antes de enviar.');
  return { texto, paginas: pdf.numPages };
}

/** Divide em unidades de contexto pequenas, preservando uma sobreposição para
 * não separar uma ideia no meio. Prioriza quebras de parágrafo e frase. */
export function fatiarParaRag(texto: string): string[] {
  const limpo = normalizarTexto(texto);
  const trechos: string[] = [];
  let inicio = 0;
  while (inicio < limpo.length) {
    let fim = Math.min(limpo.length, inicio + TAMANHO_TRECHO);
    if (fim < limpo.length) {
      const janela = limpo.slice(inicio, fim);
      const quebra = Math.max(janela.lastIndexOf('\n\n'), janela.lastIndexOf('. '), janela.lastIndexOf('; '));
      if (quebra > TAMANHO_TRECHO * 0.55) fim = inicio + quebra + 1;
    }
    const trecho = limpo.slice(inicio, fim).trim();
    if (trecho) trechos.push(trecho);
    if (fim >= limpo.length) break;
    inicio = Math.max(fim - SOBREPOSICAO, inicio + 1);
  }
  return trechos;
}
