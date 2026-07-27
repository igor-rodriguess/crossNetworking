import {
  verificacaoSaidaSchema,
  type StatusVerificacao,
  type VerificacaoSaida,
  type VerificarFatosInput,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Fact Verifier — parte 2 da validação (a afirmação confere em 2+ fontes?).
//
// Separado de credibilidade da FONTE (Source Credibility) e de dedupe de
// ENTIDADE (Entity Resolver). Núcleo heurístico: uma afirmação é "corroborada"
// quando sustentada por 2+ fontes de DOMÍNIOS DISTINTOS (independência real —
// dez páginas do mesmo site não corroboram). Uma fonte só → "fonte_unica".
// Nenhuma fonte válida → "nao_confirmada".
//
// Determinístico, sem LLM, sem custo. Quando houver LLM, ele pode entrar para
// agrupar afirmações equivalentes escritas de formas diferentes (fica para
// evolução — o núcleo de corroboração continua aqui).
// -----------------------------------------------------------------------------

/** Extrai o domínio de uma fonte (url ou host) para medir independência. */
function dominioDe(fonte: string): string {
  const f = fonte.trim().toLowerCase();
  try {
    if (f.startsWith("http")) return new URL(f).hostname.replace(/^www\./, "");
  } catch {
    /* não é url — trata como host cru */
  }
  return f.replace(/^www\./, "").split("/")[0];
}

function classificar(dominiosDistintos: number): { status: StatusVerificacao; observacao: string } {
  if (dominiosDistintos >= 2) {
    return {
      status: "corroborada",
      observacao: `Sustentada por ${dominiosDistintos} fontes independentes.`,
    };
  }
  if (dominiosDistintos === 1) {
    return {
      status: "fonte_unica",
      observacao: "Apenas uma fonte sustenta — tratar como indício, não como fato estabelecido.",
    };
  }
  return { status: "nao_confirmada", observacao: "Sem fonte válida associada." };
}

export interface ResultadoVerificacaoAgente {
  saida: VerificacaoSaida;
}

/** Verifica a corroboração de cada afirmação por fontes independentes. */
export function verificarFatos(input: VerificarFatosInput): ResultadoVerificacaoAgente {
  const verificacoes = input.afirmacoes.map((af) => {
    const dominios = new Set(af.fontes.map(dominioDe).filter(Boolean));
    const { status, observacao } = classificar(dominios.size);
    return {
      texto: af.texto,
      status,
      fontes_independentes: dominios.size,
      fontes: [...dominios],
      observacao,
    };
  });

  const resumo = {
    corroborada: verificacoes.filter((v) => v.status === "corroborada").length,
    nao_confirmada: verificacoes.filter((v) => v.status === "nao_confirmada").length,
    fonte_unica: verificacoes.filter((v) => v.status === "fonte_unica").length,
  };

  const saida = verificacaoSaidaSchema.parse({ total: verificacoes.length, resumo, verificacoes });
  return { saida };
}
