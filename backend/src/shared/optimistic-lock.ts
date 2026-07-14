import { AppError, ConflictError } from "./errors";

/**
 * Controle de concorrência otimista. A versão do recurso é o `xmin` da linha
 * (id de transação que a criou/atualizou), exposto como ETag e exigido em
 * atualizações via cabeçalho `If-Match`.
 */

/** Lê e valida o cabeçalho `If-Match`; 428 se ausente. */
export function exigirIfMatch(header: string | undefined): string {
  const v = header?.trim().replace(/^"|"$/g, "");
  if (!v) {
    throw new AppError(
      428,
      "Cabeçalho If-Match (versão do recurso, obtida no GET) é obrigatório para atualizar",
      "precondition_required"
    );
  }
  return v;
}

/** Após o UPDATE condicional: 0 linhas = versão desatualizada (409). */
export function assertVersaoAtual(rowCount: number): void {
  if (rowCount === 0) {
    throw new ConflictError("O recurso foi modificado por outra operação; recarregue e tente de novo");
  }
}
