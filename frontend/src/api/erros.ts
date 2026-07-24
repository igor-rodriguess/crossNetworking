// Erro tipado da API — espelha o envelope PT-BR do backend:
//   { codigo, erro, mensagem, detalhes, requisicao_id }
// (ver backend/src/shared/middleware/error-handler.ts)
//
// Toda falha de rede/HTTP vira um ErroApi, para a UI ter uma mensagem
// consistente em português e poder reagir ao identificador (`erro`) e ao
// código HTTP (`status`).

export interface EnvelopeErro {
  codigo?: number;
  erro?: string;
  mensagem?: string;
  detalhes?: unknown;
  requisicao_id?: string;
}

export class ErroApi extends Error {
  /** Código HTTP (401, 404, 409, 422, 500…). 0 = falha de rede/sem resposta. */
  readonly status: number;
  /** Identificador do erro no backend: "unauthorized", "validation", "conflict"… */
  readonly codigo: string;
  readonly detalhes?: unknown;
  readonly requisicaoId?: string;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: unknown, requisicaoId?: string) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.requisicaoId = requisicaoId;
  }

  /** True quando o problema é de autenticação (token ausente/expirado/ inválido). */
  get naoAutorizado(): boolean {
    return this.status === 401;
  }

  /** True em conflito de versão (trava otimista com ETag/If-Match). */
  get conflito(): boolean {
    return this.status === 409;
  }
}

/** Monta um ErroApi a partir da Response já sabendo que não foi ok. */
export async function erroDaResposta(resposta: Response): Promise<ErroApi> {
  let env: EnvelopeErro = {};
  try {
    env = (await resposta.json()) as EnvelopeErro;
  } catch {
    // corpo vazio ou não-JSON (ex.: 204/502) — seguimos com o status cru
  }
  const mensagem = env.mensagem || mensagemPadrao(resposta.status);
  return new ErroApi(
    env.codigo ?? resposta.status,
    env.erro ?? 'erro',
    mensagem,
    env.detalhes,
    env.requisicao_id,
  );
}

/** Erro quando a requisição nem chegou ao servidor (offline, DNS, CORS). */
export function erroDeRede(causa: unknown): ErroApi {
  const detalhe = causa instanceof Error ? causa.message : String(causa);
  return new ErroApi(0, 'rede', 'Não foi possível falar com o servidor. Verifique sua conexão.', detalhe);
}

function mensagemPadrao(status: number): string {
  switch (status) {
    case 400:
      return 'Requisição inválida.';
    case 401:
      return 'Sessão inválida ou expirada.';
    case 403:
      return 'Você não tem permissão para esta ação.';
    case 404:
      return 'Recurso não encontrado.';
    case 409:
      return 'Conflito: o registro foi alterado por outra pessoa.';
    case 422:
      return 'Dados inválidos.';
    case 428:
      return 'É necessário informar a versão do registro.';
    default:
      return status >= 500 ? 'Erro interno do servidor.' : 'Ocorreu um erro inesperado.';
  }
}
