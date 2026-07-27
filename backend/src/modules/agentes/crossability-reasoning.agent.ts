import { chamarLLMJson, type MensagemLLM } from "./shared/llm";
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

export interface ResultadoReasoningAgente {
  saida: AnaliseCrossabilitySaida;
  origem: "openai" | "mock";
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
  });

  const saida = analiseCrossabilitySchema.parse(resultado.dados);
  return { saida, origem: resultado.origem, tokens: resultado.tokens };
}
