// -----------------------------------------------------------------------------
// Execução com concorrência limitada.
//
// `Promise.all` dispara tudo de uma vez. Contra uma API remota isso é o certo,
// mas contra um modelo LOCAL (Ollama em CPU) as chamadas competem pelo mesmo
// núcleo: cinco em paralelo não terminam em 1x o tempo, terminam em ~5x cada
// uma, e ainda arriscam estourar a memória da máquina.
//
// Aqui processamos em janelas de tamanho fixo, preservando a ORDEM da entrada.
// -----------------------------------------------------------------------------

/** Executa `tarefa` sobre cada item, com no máximo `limite` em voo. */
export async function mapearComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const teto = Math.max(1, Math.floor(limite));
  const resultados = new Array<R>(itens.length);
  let proximo = 0;

  // Cada worker puxa o próximo índice livre até a fila esvaziar.
  async function worker(): Promise<void> {
    for (;;) {
      const indice = proximo++;
      if (indice >= itens.length) return;
      resultados[indice] = await tarefa(itens[indice], indice);
    }
  }

  const workers = Array.from({ length: Math.min(teto, itens.length) }, worker);
  await Promise.all(workers);
  return resultados;
}
