// -----------------------------------------------------------------------------
// Chunking semântico do Cross Knowledge.
//
// "Quebrar a cada N caracteres" corta definição no meio: o trecho recuperado
// chega ao agente sem o sujeito da frase, e ele preenche a lacuna sozinho —
// exatamente o que a arquitetura proíbe. Aqui a divisão segue a ESTRUTURA do
// documento: seções de markdown primeiro, parágrafos depois, e só então um
// corte por tamanho como último recurso.
//
// Cada chunk carrega sua seção de origem, então o trecho é interpretável
// isoladamente e o humano confere a proveniência sem abrir o documento inteiro.
//
// Função pura, sem I/O: testável offline.
// -----------------------------------------------------------------------------

export interface ChunkConhecimento {
  ordem: number;
  /** Título da seção de origem; null quando o texto vem antes de qualquer título. */
  secao: string | null;
  conteudo: string;
}

export interface OpcoesChunking {
  /** Teto de caracteres por chunk. Acima disso, a seção é subdividida. */
  tamanhoMaximo?: number;
  /**
   * Piso de caracteres. Fragmentos menores são anexados ao anterior — um chunk
   * de duas palavras não tem contexto suficiente para significar nada sozinho.
   */
  tamanhoMinimo?: number;
}

const PADRAO: Required<OpcoesChunking> = {
  tamanhoMaximo: 1200,
  tamanhoMinimo: 120,
};

/** Título de seção em markdown (`#` a `######`). */
const RE_TITULO = /^(#{1,6})\s+(.+?)\s*$/;

interface Bloco {
  secao: string | null;
  linhas: string[];
}

/**
 * Divide por títulos de markdown, preservando a hierarquia no rótulo da seção.
 * Um `##` dentro de `#` vira "Pai › Filho", para o trecho não perder o contexto
 * do capítulo a que pertence.
 */
function blocosPorSecao(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  const pilha: { nivel: number; titulo: string }[] = [];
  let atual: Bloco = { secao: null, linhas: [] };

  for (const linha of texto.split(/\r?\n/)) {
    const m = RE_TITULO.exec(linha);
    if (!m) {
      atual.linhas.push(linha);
      continue;
    }

    // Fecha o bloco anterior antes de abrir a nova seção.
    if (atual.linhas.some((l) => l.trim())) blocos.push(atual);

    const nivel = m[1].length;
    const titulo = m[2].trim();
    while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
    pilha.push({ nivel, titulo });

    atual = { secao: pilha.map((p) => p.titulo).join(' › '), linhas: [] };
  }

  if (atual.linhas.some((l) => l.trim())) blocos.push(atual);
  return blocos;
}

/** Divide um bloco grande em parágrafos, agrupando até o teto de tamanho. */
function dividirPorParagrafo(texto: string, maximo: number): string[] {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const partes: string[] = [];
  let buffer = '';

  for (const p of paragrafos) {
    // Parágrafo que sozinho estoura o teto: quebra por frase, sem partir
    // no meio de uma palavra.
    if (p.length > maximo) {
      if (buffer) {
        partes.push(buffer);
        buffer = '';
      }
      partes.push(...dividirPorFrase(p, maximo));
      continue;
    }

    const candidato = buffer ? `${buffer}\n\n${p}` : p;
    if (candidato.length > maximo) {
      if (buffer) partes.push(buffer);
      buffer = p;
    } else {
      buffer = candidato;
    }
  }

  if (buffer) partes.push(buffer);
  return partes;
}

/** Último recurso: agrupa frases até o teto. Nunca corta no meio de palavra. */
function dividirPorFrase(texto: string, maximo: number): string[] {
  const frases = texto.match(/[^.!?]+[.!?]*\s*/g) ?? [texto];
  const partes: string[] = [];
  let buffer = '';

  for (const frase of frases) {
    const candidato = buffer + frase;
    if (candidato.length > maximo && buffer) {
      partes.push(buffer.trim());
      buffer = frase;
    } else {
      buffer = candidato;
    }
  }

  if (buffer.trim()) partes.push(buffer.trim());
  return partes;
}

/**
 * Divide um documento de conhecimento em chunks recuperáveis.
 *
 * O rótulo da seção é PREFIXADO ao conteúdo do chunk. Isso é deliberado: o
 * embedding passa a carregar o contexto do capítulo, e um trecho sobre
 * "territórios" recuperado isoladamente ainda diz de qual metodologia veio.
 */
export function dividirEmChunks(texto: string, opcoes: OpcoesChunking = {}): ChunkConhecimento[] {
  const { tamanhoMaximo, tamanhoMinimo } = { ...PADRAO, ...opcoes };
  const chunks: ChunkConhecimento[] = [];

  for (const bloco of blocosPorSecao(texto)) {
    const corpo = bloco.linhas.join('\n').trim();
    if (!corpo) continue;

    for (const parte of dividirPorParagrafo(corpo, tamanhoMaximo)) {
      const conteudo = bloco.secao ? `${bloco.secao}\n\n${parte}` : parte;

      // Fragmento curto demais é anexado ao anterior da MESMA seção — juntar
      // seções diferentes misturaria conceitos não relacionados.
      const anterior = chunks[chunks.length - 1];
      if (
        parte.length < tamanhoMinimo &&
        anterior &&
        anterior.secao === bloco.secao &&
        anterior.conteudo.length + parte.length <= tamanhoMaximo
      ) {
        anterior.conteudo = `${anterior.conteudo}\n\n${parte}`;
        continue;
      }

      chunks.push({ ordem: chunks.length, secao: bloco.secao, conteudo });
    }
  }

  // Reordena: anexos podem ter deixado buracos na sequência.
  return chunks.map((c, i) => ({ ...c, ordem: i }));
}
