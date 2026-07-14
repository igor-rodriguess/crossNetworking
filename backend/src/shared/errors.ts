/** Erro de aplicação com status HTTP associado. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super(404, message, "not_found");
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflito", details?: unknown) {
    super(409, message, "conflict", details);
  }
}
export class ValidationError extends AppError {
  constructor(message = "Dados inválidos", details?: unknown) {
    super(422, message, "validation", details);
  }
}

interface PgLikeError {
  code?: string;
  constraint?: string;
  column?: string;
  message?: string;
}

/**
 * Mapeia erros do PostgreSQL para AppError (mensagens limpas, sem vazar SQL).
 * Cobre violações de unicidade, FK, check, NOT NULL e as RAISE EXCEPTION dos
 * triggers de regra de negócio (P0001).
 */
export function mapPgError(err: unknown): AppError | null {
  const e = err as PgLikeError;
  if (!e || typeof e.code !== "string") return null;
  switch (e.code) {
    case "23505":
      return new ConflictError("Registro já existe (violação de unicidade)", { constraint: e.constraint });
    case "23503":
      return new ConflictError("Referência inválida (chave estrangeira)", { constraint: e.constraint });
    case "23514":
      return new ValidationError("Violação de regra de validação", { constraint: e.constraint });
    case "23502":
      return new ValidationError("Campo obrigatório ausente", { column: e.column });
    case "22P02":
      return new ValidationError("Formato de identificador inválido");
    case "P0001": // RAISE EXCEPTION dos triggers de regra de negócio
      return new ValidationError(e.message ?? "Regra de negócio violada");
    default:
      return null;
  }
}
