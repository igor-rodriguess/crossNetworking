import { chamarLLMJson, type MensagemLLM } from "./shared/llm";
import {
  extracaoSaidaSchema,
  type ExtracaoSaida,
  type ExtrairInformacoesInput,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Information Extractor — o QUARTO nó da espinha (Planning -> Collect ->
// Validate -> EXTRACT -> Reason -> Recommend).
//
// Transforma conteúdo bruto (texto de páginas coletadas) em campos
// ESTRUTURADOS alinhados ao domínio: nome, setor, públicos, territórios,
// ativos e sinais de parceria — o vocabulário que o Crossability Reasoning
// consome. Usa LLM (extração estruturada); sem chave, um stub determinístico
// deriva campos plausíveis do próprio texto.
// -----------------------------------------------------------------------------

const SYSTEM = `Você é o Agente Extrator de Informações da plataforma Cross (estratégia de parcerias).
Recebe textos brutos coletados sobre empresas/marcas/eventos e extrai informação ESTRUTURADA útil para avaliar potencial de parceria.

Para CADA conteúdo, produza um perfil com:
- nome: a entidade principal do texto
- setor: segmento de atuação
- publicos: públicos-alvo mencionados ou claramente inferíveis
- territorios: praças/regiões de atuação
- ativos: propriedades, canais, patrocínios, produtos relevantes
- sinais_parceria: indícios de interesse/abertura/potencial para parcerias
- confianca: 0-100, o quanto o texto sustenta o que você extraiu (seja honesto; texto vago = confiança baixa)

Não invente dados que o texto não sustenta — liste vazio [] quando não houver.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{ "perfis": [ { "nome": "", "setor": "", "publicos": [], "territorios": [], "ativos": [], "sinais_parceria": [], "confianca": 0 } ] }`;

function montarMensagens(input: ExtrairInformacoesInput): MensagemLLM[] {
  const blocos = input.conteudos.map((c, i) => `--- Conteúdo ${i + 1} ---\n${c}`).join("\n\n");
  const foco = input.foco ? `\n\nFoco da extração: ${input.foco}` : "";
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Extraia os perfis dos conteúdos abaixo.${foco}\n\n${blocos}` },
  ];
}

// --- Stub determinístico (modo mock) -----------------------------------------
// Deriva campos simples do texto — previsível, para o pipeline rodar sem chave.
function extracaoMock(input: ExtrairInformacoesInput): ExtracaoSaida {
  const perfis = input.conteudos.map((texto) => {
    const limpo = texto.trim();
    // Heurística boba mas útil: primeira "frase" curta vira o nome candidato.
    const nome = (limpo.split(/[.—\-|:]/)[0] || limpo).trim().slice(0, 60) || "Entidade";
    const temSetor = /bebida|festival|m[uú]sica|tecnologia|varejo|banco|energia|moda/i.exec(limpo);
    return {
      nome,
      setor: temSetor ? temSetor[0] : "não identificado",
      publicos: /jovem|jovens|18-24|classe|público/i.test(limpo) ? ["público jovem (inferido)"] : [],
      territorios: /nordeste|sul|sudeste|nacional|brasil/i.exec(limpo)?.slice(0, 1) ?? [],
      ativos: /patroc[ií]nio|palco|canal|festival|propriedade/i.exec(limpo)?.slice(0, 1) ?? [],
      sinais_parceria: /parceria|patroc[ií]nio|colabora|ativa[çc][aã]o/i.test(limpo)
        ? ["menção a parceria/patrocínio no texto"]
        : [],
      confianca: 40, // MOCK: confiança moderada-baixa, honesta
    };
  });
  return { total_conteudos: input.conteudos.length, perfis };
}

export interface ResultadoExtracaoAgente {
  saida: ExtracaoSaida;
  origem: "openai" | "mock";
  tokens?: { entrada: number; saida: number };
}

/** Extrai perfis estruturados dos conteúdos coletados. */
export async function extrairInformacoes(input: ExtrairInformacoesInput): Promise<ResultadoExtracaoAgente> {
  const resultado = await chamarLLMJson<unknown>({
    mensagens: montarMensagens(input),
    mock: () => extracaoMock(input),
    temperatura: 0.1,
  });

  // Normaliza: o LLM devolve { perfis: [...] }; o mock devolve o objeto completo.
  const bruto = resultado.dados as { perfis?: unknown; total_conteudos?: unknown };
  const candidato = {
    total_conteudos: typeof bruto.total_conteudos === "number" ? bruto.total_conteudos : input.conteudos.length,
    perfis: bruto.perfis ?? [],
  };
  const saida = extracaoSaidaSchema.parse(candidato);
  return { saida, origem: resultado.origem, tokens: resultado.tokens };
}
