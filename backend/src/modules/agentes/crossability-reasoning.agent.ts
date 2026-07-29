import { chamarLLMJson, type MensagemLLM, type OrigemLLM } from "./shared/llm";
import {
  analiseCrossabilitySchema,
  type AnaliseCrossabilitySaida,
  type NivelCompat,
  type RaciocinarCrossabilityInput,
  type RecomendacaoCross,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Crossability Reasoning — o CORAÇÃO da metodologia (Planning -> Collect ->
// Validate -> Extract -> REASON -> Recommend).
//
// Aplica a Crossability nas 6 dimensões do domínio e devolve, para cada uma,
// um nível (alta/media/baixa) + a justificativa. Produz um RASCUNHO: o agente
// PROPÕE; o especialista PROMOVE no Human Gate. Nada é escrito na base aqui.
//
// A saída bate exatamente com o que a plataforma persiste (compatibilidade_
// publicos, ..._territorios, complementaridade_ativos, sinergias,
// fit_estrategico, momento_estrategico + racional). Usa LLM; sem chave, um stub
// determinístico gera uma análise coerente das 6 dimensões.
// -----------------------------------------------------------------------------

const SYSTEM = `Você é o Agente de Raciocínio Crossability da plataforma Cross (estratégia de parcerias).
A metodologia Crossability avalia o encaixe entre um CLIENTE (quem busca a parceria) e um PARCEIRO candidato em SEIS dimensões:
- compatibilidade_publicos: os públicos casam ou se complementam?
- compatibilidade_territorios: territórios/praças de atuação em comum ou complementares?
- complementaridade_ativos: os ativos do parceiro somam ao que falta ao cliente?
- sinergias: ganhos mútuos de mídia, canais, distribuição?
- fit_estrategico: alinhamento de posicionamento e objetivos?
- momento_estrategico: há uma janela de oportunidade agora (lançamentos, eventos, expansão)?

Para CADA dimensão, atribua nivel "alta", "media" ou "baixa" e um texto curto justificando.
Depois, dê a recomendacao geral ("recomendada", "em_estudo" ou "nao_recomendada") e um racional que amarre as dimensões.
Seja honesto na confianca (0-100): pouca evidência = confiança baixa. Não invente fatos que não foram dados.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{
  "compatibilidade_publicos": { "nivel": "media", "texto": "" },
  "compatibilidade_territorios": { "nivel": "media", "texto": "" },
  "complementaridade_ativos": { "nivel": "media", "texto": "" },
  "sinergias": { "nivel": "media", "texto": "" },
  "fit_estrategico": { "nivel": "media", "texto": "" },
  "momento_estrategico": { "nivel": "media", "texto": "" },
  "recomendacao": "em_estudo",
  "racional_recomendacao": "",
  "confianca": 0
}`;

function montarMensagens(input: RaciocinarCrossabilityInput): MensagemLLM[] {
  const perfil = input.perfil_parceiro;
  const linhasPerfil = perfil
    ? [
        perfil.setor ? `Setor: ${perfil.setor}` : null,
        perfil.publicos?.length ? `Públicos: ${perfil.publicos.join(", ")}` : null,
        perfil.territorios?.length ? `Territórios: ${perfil.territorios.join(", ")}` : null,
        perfil.ativos?.length ? `Ativos: ${perfil.ativos.join(", ")}` : null,
        perfil.sinais_parceria?.length ? `Sinais de parceria: ${perfil.sinais_parceria.join(", ")}` : null,
      ].filter(Boolean)
    : [];
  const ctx = [
    `Cliente (quem busca a parceria): ${input.cliente}`,
    `Parceiro candidato: ${input.parceiro}`,
    input.objetivo ? `Objetivo da parceria: ${input.objetivo}` : null,
    linhasPerfil.length ? `Perfil do parceiro:\n${linhasPerfil.join("\n")}` : null,
    input.contexto_rag?.length
      ? `Contexto recuperado da base Cross (use apenas como apoio; não invente além dele):\n${input.contexto_rag.join("\n---\n")}`
      : null,
  ].filter(Boolean);
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Avalie a Crossability:\n\n${ctx.join("\n")}` },
  ];
}

// --- Stub determinístico (modo mock) -----------------------------------------
// Deriva níveis dos sinais do perfil, para uma análise coerente sem chave.
function analiseMock(input: RaciocinarCrossabilityInput): AnaliseCrossabilitySaida {
  const p = input.perfil_parceiro ?? {};
  const temPublico = (p.publicos?.length ?? 0) > 0;
  const temTerritorio = (p.territorios?.length ?? 0) > 0;
  const temAtivos = (p.ativos?.length ?? 0) > 0;
  const temSinais = (p.sinais_parceria?.length ?? 0) > 0;

  const nv = (cond: boolean, alta: NivelCompat = "alta"): NivelCompat => (cond ? alta : "media");
  const cli = input.cliente;
  const par = input.parceiro;

  const publicos = {
    nivel: nv(temPublico),
    texto: temPublico
      ? `Há indícios de público-alvo de ${par} alinhado ao que ${cli} busca.`
      : `Sem dados claros de público de ${par}; assumido nível médio.`,
  };
  const territorios = {
    nivel: nv(temTerritorio),
    texto: temTerritorio ? `Territórios de atuação identificados favorecem o encaixe.` : `Territórios não detalhados.`,
  };
  const ativos = {
    nivel: nv(temAtivos),
    texto: temAtivos ? `Ativos de ${par} somam ao que ${cli} precisa.` : `Ativos do parceiro pouco detalhados.`,
  };
  const sinergias = {
    nivel: "media" as NivelCompat,
    texto: `Sinergias de mídia/canais a confirmar entre ${cli} e ${par}.`,
  };
  const fit = {
    nivel: nv(temSinais),
    texto: temSinais ? `Sinais de abertura a parcerias reforçam o fit estratégico.` : `Fit estratégico a validar.`,
  };
  const momento = {
    nivel: "media" as NivelCompat,
    texto: `Janela de oportunidade a confirmar com o calendário de ${par}.`,
  };

  const niveis = [publicos, territorios, ativos, sinergias, fit, momento].map((d) => d.nivel);
  const altas = niveis.filter((n) => n === "alta").length;
  const recomendacao: RecomendacaoCross = altas >= 4 ? "recomendada" : altas >= 2 ? "em_estudo" : "nao_recomendada";

  return {
    compatibilidade_publicos: publicos,
    compatibilidade_territorios: territorios,
    complementaridade_ativos: ativos,
    sinergias,
    fit_estrategico: fit,
    momento_estrategico: momento,
    recomendacao,
    racional_recomendacao: `Análise MOCK (sem chave de IA): ${altas} de 6 dimensões em nível alto entre ${cli} e ${par}. Classificação preliminar "${recomendacao}" — revisar com evidências reais.`,
    confianca: 35,
  };
}

/**
 * Avaliação conservadora para descoberta de mercado. Não depende do RAG nem
 * tenta completar lacunas com uma LLM: cada dimensão sobe somente quando a
 * matéria externa trouxe um sinal específico da candidata. Assim a descoberta
 * continua rápida e auditável mesmo quando o Ollama local estiver ocupado.
 */
export function raciocinarCrossabilityComEvidenciaExterna(
  input: RaciocinarCrossabilityInput,
): ResultadoReasoningAgente {
  const perfil = input.perfil_parceiro ?? {};
  const parceiro = input.parceiro;
  const fontes = perfil.fontes ?? [];
  const evidencia = fontes[0]?.evidencia ?? "A fonte externa cita a marca, sem detalhar o contexto.";
  const temPublicos = (perfil.publicos?.length ?? 0) > 0;
  const temTerritorios = (perfil.territorios?.length ?? 0) > 0;
  const temAtivos = (perfil.ativos?.length ?? 0) > 0;
  const temSinais = (perfil.sinais_parceria?.length ?? 0) > 0;
  const baseConfianca = perfil.confianca ?? 0;
  const fontesSuficientes = fontes.length >= 2;

  const saida: AnaliseCrossabilitySaida = {
    compatibilidade_publicos: {
      nivel: temPublicos ? "media" : "baixa",
      texto: temPublicos
        ? `A fonte externa associa ${parceiro} aos públicos: ${perfil.publicos?.slice(0, 3).join(" · ")}. Ainda falta uma fonte externa comparável sobre o público da ${input.cliente}.`
        : `A matéria não detalha público de ${parceiro}; não há base externa suficiente para comparar com ${input.cliente}.`,
    },
    compatibilidade_territorios: {
      nivel: temTerritorios ? "media" : "baixa",
      texto: temTerritorios
        ? `A atuação citada para ${parceiro} inclui ${perfil.territorios?.slice(0, 3).join(" · ")}. A aderência de praças com ${input.cliente} precisa de validação comercial.`
        : `A fonte não informa praças ou territórios de ${parceiro}; esta dimensão permanece em estudo.`,
    },
    complementaridade_ativos: {
      nivel: temAtivos ? "media" : "baixa",
      texto: temAtivos
        ? `O artigo cita ativos de ${parceiro}: ${perfil.ativos?.slice(0, 3).join(" · ")}. Eles formam uma hipótese de ativação, ainda sem contrapartida confirmada por ${input.cliente}.`
        : `A matéria não descreve ativos acionáveis de ${parceiro}; não é possível afirmar complementaridade.`,
    },
    sinergias: {
      nivel: temSinais ? "media" : "baixa",
      texto: temSinais
        ? `Há sinal externo de colaboração ou ativação: ${perfil.sinais_parceria?.slice(0, 2).join(" · ")}. A sinergia deve ser validada em briefing conjunto.`
        : `Sem sinal externo de parceria, canal ou ativação, não há sinergia comprovada neste momento.`,
    },
    fit_estrategico: {
      nivel: fontesSuficientes && temSinais ? "media" : "baixa",
      texto: fontesSuficientes && temSinais
        ? `Duas ou mais evidências externas sustentam a hipótese para o objetivo “${input.objetivo ?? "parceria estratégica"}”.`
        : `A evidência atual sustenta uma hipótese sobre ${parceiro}, mas não comprova alinhamento estratégico com ${input.cliente}.`,
    },
    momento_estrategico: {
      nivel: temSinais ? "media" : "baixa",
      texto: temSinais
        ? `O contexto externo indica movimento de marca que justifica uma abordagem exploratória agora.`
        : `A fonte não apresenta uma janela comercial ou de calendário verificável para ${parceiro}.`,
    },
    recomendacao: "em_estudo",
    racional_recomendacao: `${parceiro} entrou no radar por evidência externa verificável: ${evidencia} A sugestão é preliminar e não usa a Base Cross como prova de fit. Antes de avançar, validar público, ativos disponíveis, exclusividade e interesse comercial.`,
    confianca: Math.min(58, Math.max(25, Math.round(baseConfianca * 0.65 + fontes.length * 4))),
  };
  return { saida, origem: "heuristica" };
}

export interface ResultadoReasoningAgente {
  saida: AnaliseCrossabilitySaida;
  origem: OrigemLLM;
  tokens?: { entrada: number; saida: number };
}

/** Produz a análise Crossability (rascunho) das 6 dimensões. */
export async function raciocinarCrossability(
  input: RaciocinarCrossabilityInput
): Promise<ResultadoReasoningAgente> {
  const resultado = await chamarLLMJson<unknown>({
    mensagens: montarMensagens(input),
    mock: () => analiseMock(input),
    temperatura: 0.3,
    timeoutMs: 25_000,
    formatoJson: analiseCrossabilitySchema,
  });

  const saida = analiseCrossabilitySchema.parse(resultado.dados);
  return { saida, origem: resultado.origem, tokens: resultado.tokens };
}
