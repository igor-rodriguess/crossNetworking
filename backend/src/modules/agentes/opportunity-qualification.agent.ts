import type { AnaliseCrossabilitySaida, CredibilidadeSaida, ExtracaoSaida, NivelCompat, RecomendacaoCross } from "./agentes.schema";
import type { ColetaFontesSaida } from "./agentes.schema";

// -----------------------------------------------------------------------------
// Opportunity Qualification — porta de entrada antes de qualquer recomendação.
//
// O agente não tenta descobrir uma empresa a partir de uma página solta. Primeiro
// verifica se há uma candidata identificável, com contexto operacional da Cross e
// evidência suficiente para sustentar um rascunho. É propositalmente determinístico:
// a LLM pode enriquecer uma hipótese aprovada, mas não pode transformar ruído em
// oportunidade.
// -----------------------------------------------------------------------------

export interface CandidataDaBase {
  parceiro_id: string;
  parceiro_nome: string;
  segmento: string | null;
  projeto_id: string;
  projeto_nome: string;
  frente_id: string;
  frente_nome: string;
  observacoes: string | null;
}

export interface QualificacaoDaBase {
  candidata: CandidataDaBase;
  elegivel: boolean;
  prioridade: number;
  confianca: number;
  status: string;
  objetivo: string | null;
  territorio: string | null;
  motivos: string[];
  pendencias: string[];
}

function normalizar(valor: string): string {
  return valor
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function campoDasObservacoes(observacoes: string | null, rotulo: string): string | null {
  const encontrada = new RegExp(`^${rotulo}:\\s*(.+)$`, "im").exec(observacoes ?? "");
  return encontrada?.[1]?.trim() || null;
}

function prioridadeDoStatus(status: string): number {
  const valor = normalizar(status);
  if (valor.includes("em negociacao")) return 100;
  if (valor.includes("frente aberta")) return 82;
  if (valor.includes("abrir frente")) return 70;
  if (valor.includes("validar")) return 52;
  return 0;
}

function statusAceito(status: string): boolean {
  return prioridadeDoStatus(status) > 0;
}

/**
 * Seleciona somente candidatas com movimentação real no funil. "Sem retorno",
 * "stand by" e "declinado" continuam no histórico, mas não ocupam o radar.
 */
export function qualificarCandidaturasDaBase(candidatas: CandidataDaBase[], limite: number): QualificacaoDaBase[] {
  return candidatas
    .map((candidata) => {
      const status = campoDasObservacoes(candidata.observacoes, "Status de origem") ?? "Não informado";
      const objetivo = campoDasObservacoes(candidata.observacoes, "Objetivo");
      const territorio = campoDasObservacoes(candidata.observacoes, "Território");
      const prioridade = prioridadeDoStatus(status);
      const motivos: string[] = [];
      const pendencias: string[] = [];

      if (prioridade) motivos.push(`Status operacional: ${status}.`);
      else pendencias.push(`Status sem ação ativa: ${status}.`);
      if (objetivo) motivos.push(`Objetivo registrado: ${objetivo}.`);
      else pendencias.push("Objetivo de parceria não informado no funil.");
      if (territorio) motivos.push(`Território registrado: ${territorio}.`);
      else pendencias.push("Território ainda não informado.");
      if (candidata.segmento) motivos.push(`Segmento identificado: ${candidata.segmento}.`);
      else pendencias.push("Segmento da candidata ainda não informado.");

      const detalhes = (candidata.observacoes ?? "").replace(/\s+/g, " ").trim().length >= 35;
      if (detalhes) motivos.push("Há histórico operacional suficiente para uma hipótese inicial.");
      else pendencias.push("Histórico operacional muito curto para sustentar uma recomendação.");

      const evidencia =
        (prioridade ? 35 : 0) +
        (objetivo ? 25 : 0) +
        (territorio ? 12 : 0) +
        (candidata.segmento ? 12 : 0) +
        (detalhes ? 16 : 0);
      const confianca = Math.min(85, evidencia);
      const elegivel = statusAceito(status) && Boolean(objetivo) && detalhes;

      return { candidata, elegivel, prioridade, confianca, status, objetivo, territorio, motivos, pendencias };
    })
    .filter((item) => item.elegivel)
    .sort((a, b) => b.prioridade - a.prioridade || b.confianca - a.confianca || a.candidata.parceiro_nome.localeCompare(b.candidata.parceiro_nome, "pt-BR"))
    .slice(0, limite);
}

const NIVEL_POR_STATUS: Array<[RegExp, NivelCompat]> = [
  [/EM\s+NEGOCIAÇÃO/i, "alta"],
  [/FRENTE\s+ABERTA|ABRIR\s+FRENTE/i, "media"],
];

function nivelDeMomento(status: string): NivelCompat {
  return NIVEL_POR_STATUS.find(([padrao]) => padrao.test(status))?.[1] ?? "baixa";
}

function dimensao(nivel: NivelCompat, texto: string) {
  return { nivel, texto };
}

/**
 * Aplica uma leitura Crossability honesta sobre o que a Cross realmente possui.
 * Ausência de dado é "baixa", nunca "média" por conveniência.
 */
export function analisarCandidataDaBase(cliente: string, qualificacao: QualificacaoDaBase): AnaliseCrossabilitySaida {
  const { candidata, status, objetivo, territorio, confianca, pendencias } = qualificacao;
  const momento = nivelDeMomento(status);
  const fit: NivelCompat = /collab|experi[eê]ncia de marca|produto/i.test(objetivo ?? "") ? "media" : "baixa";
  const sinergia: NivelCompat = candidata.segmento && objetivo ? "media" : "baixa";
  const recomendacao: RecomendacaoCross = momento === "alta" && confianca >= 70 ? "recomendada" : "em_estudo";

  return {
    compatibilidade_publicos: dimensao(
      "baixa",
      `A Base Cross ainda não possui público estruturado de ${candidata.parceiro_nome}; esta dimensão não foi inferida.`
    ),
    compatibilidade_territorios: dimensao(
      territorio ? "media" : "baixa",
      territorio
        ? `O funil associa a oportunidade ao território ${territorio}; a aderência de praça ainda depende de validação com ${cliente}.`
        : "Não há território registrado para comparar com a estratégia de cliente."
    ),
    complementaridade_ativos: dimensao(
      "media",
      `A frente ${candidata.frente_nome} define o contexto da oportunidade; os ativos próprios de ${candidata.parceiro_nome} ainda precisam ser confirmados.`
    ),
    sinergias: dimensao(
      sinergia,
      sinergia
        ? `Há uma hipótese entre o segmento ${candidata.segmento} e o objetivo “${objetivo}”, ainda sem contrapartidas validadas.`
        : "Não há informação suficiente para afirmar sinergias de canais, produto ou distribuição."
    ),
    fit_estrategico: dimensao(
      fit,
      objetivo
        ? `O funil registra o objetivo “${objetivo}”; isso sustenta uma hipótese de fit, não uma confirmação de posicionamento.`
        : "Sem objetivo estruturado, não há base para avaliar fit estratégico."
    ),
    momento_estrategico: dimensao(
      momento,
      `Status operacional registrado: ${status}. ${momento === "alta" ? "Há negociação em curso e a validação deve priorizar a próxima ação comercial." : "Ainda é necessário confirmar interesse, timing e disponibilidade."}`
    ),
    recomendacao,
    racional_recomendacao: `${candidata.parceiro_nome} entra no radar porque já é uma candidata ativa no funil da Cross para ${cliente}, na frente ${candidata.frente_nome}. ${pendencias.length ? `Antes de avançar, validar: ${pendencias.join(" ")}` : "A oportunidade possui contexto operacional suficiente para curadoria inicial."}`,
    confianca,
  };
}

export interface ValidacaoExterna {
  aprovada: boolean;
  motivos: string[];
}

const NOMES_GENERICOS = new Set([
  "aceite e cadastre", "nossos fornecedores", "portal de gestao multimarcas",
  "portal multimarcas", "login", "sign in", "home", "inicio",
]);

/**
 * Sem uma entidade válida e uma fonte que mencione a própria entidade, uma busca
 * externa fica apenas como pesquisa, nunca como sugestão persistida.
 */
export function validarCandidataExterna(input: {
  cliente: string;
  parceiro: string;
  extracao: ExtracaoSaida | undefined;
  coleta: ColetaFontesSaida | null | undefined;
  credibilidade: CredibilidadeSaida | null | undefined;
}): ValidacaoExterna {
  const parceiro = normalizar(input.parceiro);
  const cliente = normalizar(input.cliente);
  const motivos: string[] = [];
  if (!parceiro || parceiro.length < 3 || NOMES_GENERICOS.has(parceiro)) motivos.push("Nome de entidade genérico ou inválido.");
  if (parceiro === cliente || parceiro.startsWith(`${cliente} `)) motivos.push("A candidata não pode ser o próprio cliente.");

  const perfil = input.extracao?.perfis.find((item) => normalizar(item.nome) === parceiro);
  if (!perfil) motivos.push("A entidade não tem perfil extraído identificável.");
  else if (perfil.confianca < 55) motivos.push("O perfil extraído não atingiu confiança mínima de 55%.");

  const urlsComEvidenciaDaMarca = new Set(
    (perfil?.fontes ?? [])
      .filter((fonte) => normalizar(fonte.evidencia).includes(parceiro))
      .map((fonte) => fonte.url),
  );
  const confiaveis = new Map(
    (input.credibilidade?.avaliacoes ?? [])
      .filter((avaliacao) => avaliacao.score >= 50)
      .map((avaliacao) => [avaliacao.url, avaliacao]),
  );
  const haMencao = (input.coleta?.coletas ?? [])
    .flatMap((coleta) => coleta.resultados)
    .some((resultado) => {
      const texto = normalizar(`${resultado.titulo} ${resultado.trecho ?? ""}`);
      return Boolean(confiaveis.get(resultado.url)) &&
        (texto.includes(parceiro) || urlsComEvidenciaDaMarca.has(resultado.url));
    });
  if (!haMencao) motivos.push("Nenhuma fonte com credibilidade mínima menciona claramente a entidade candidata.");

  return { aprovada: motivos.length === 0, motivos };
}
