import { chamarLLMJson, type MensagemLLM, type OrigemLLM } from "./shared/llm";
import {
  camposImportacaoCsvPorEntidade,
  mapeamentoImportacaoCsvSaidaSchema,
  type AnalisarImportacaoCsvInput,
  type MapeamentoImportacaoCsvSaida,
} from "./agentes.schema";

// O agente nunca decide gravar dados. Sua responsabilidade é somente sugerir o
// mapeamento de colunas para a prévia que será revisada pela pessoa usuária.
const SYSTEM = `Você é o Agente de Mapeamento de Planilhas da Plataforma Cross.
Sua tarefa é interpretar cabeçalhos e uma pequena amostra de CSV e mapear APENAS
as colunas que realmente existem para os campos permitidos da entidade escolhida.

Regras rigorosas:
- não invente colunas nem valores;
- cada coluna de origem só pode ser usada uma vez;
- deixe de fora um campo quando não houver correspondência confiável;
- use confiança alta, media ou baixa de forma honesta;
- priorize nome, cliente e objetivo quando existirem;
- responda somente JSON válido, sem markdown.`;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SINONIMOS: Record<string, string[]> = {
  nome: ["nome", "razao_social", "empresa", "empresa_parceira", "marca", "marca_parceira", "marca_talento", "marca_ou_talento", "cliente", "nome_da_empresa", "nome_fantasia", "iniciativa", "campanha", "titulo", "titulo_projeto", "propriedade", "nome_ativo"],
  tipo: ["tipo", "tipo_parte", "pessoa_ou_organizacao", "natureza"],
  categoria: ["categoria", "segmento", "setor", "industria", "nicho", "area_de_atuacao", "area_atuacao", "vertical", "mercado", "tipo_ativo", "tipo_de_ativo", "classe_ativo"],
  segmento: ["segmento", "setor", "industria", "nicho", "categoria", "area_de_atuacao", "area_atuacao", "vertical", "mercado"],
  papel: ["papel", "role", "tipo_relacionamento", "relacionamento", "papel_na_cross"],
  razao_social: ["razao_social", "razao", "nome_legal"],
  cnpj: ["cnpj"],
  site: ["site", "site_oficial", "website", "website_oficial", "url", "link", "pagina_oficial"],
  nome_artistico: ["nome_artistico", "artista", "nome_publico"],
  cpf: ["cpf"],
  nacionalidade: ["nacionalidade", "pais"],
  contato_nome: ["contato", "nome_contato", "responsavel", "responsavel_conta"],
  contato_cargo: ["cargo", "funcao_contato"],
  contato_email: ["email", "e_mail", "email_contato"],
  contato_telefone: ["telefone", "fone", "celular", "whatsapp"],
  inicio_relacionamento: ["inicio_relacionamento", "inicio", "data_inicio"],
  observacoes: ["observacoes", "observacao", "anotacoes", "anotacoes_comerciais", "observacoes_comerciais", "notas", "comentarios", "historico"],
  cliente: ["cliente", "cliente_nome", "empresa_cliente", "marca_cliente", "conta", "account", "conta_cliente"],
  projeto: ["projeto", "nome_projeto", "projeto_nome", "iniciativa", "campanha"],
  frente: ["frente", "nome_frente", "frente_oportunidade", "oportunidade", "linha_de_oportunidade"],
  parte: ["parte", "marca", "marca_talento", "marca_ou_talento", "empresa", "parceiro", "talento", "nome_parte", "proponente", "propriedade"],
  objetivo: ["objetivo", "objetivos", "briefing", "brief", "meta", "finalidade", "proposito"],
  descricao: ["descricao", "descrição", "resumo", "detalhes", "detalhamento", "sobre"],
  produto: ["produto", "projeto_produto", "servico", "serviço"],
  data_inicio: ["data_inicio", "inicio", "início", "start_date", "inicio_previsto", "inicio_planejado"],
  data_previsao_fim: ["data_previsao_fim", "previsao_fim", "data_fim", "fim", "end_date", "final_estimado", "fim_previsto", "termino_previsto"],
  data_abertura: ["data_abertura", "abertura", "inicio_frente"],
  data_encerramento: ["data_encerramento", "encerramento", "fim_frente"],
  prioridade: ["prioridade", "priority"],
  status: ["status", "situacao", "situação", "etapa"],
  interesse_cliente: ["interesse_cliente", "interesse_da_marca", "interesse"],
  interesse_parceiro: ["interesse_parceiro", "interesse_do_parceiro"],
  disponibilidade_confirmada: ["disponibilidade_confirmada", "disponibilidade", "disponivel"],
  valor_referencia: ["valor_referencia", "valor", "valor_estimado", "preco", "preco_estimado", "orcamento", "budget"],
  moeda: ["moeda", "currency"],
  plataforma: ["plataforma", "canal", "rede_social"],
  identificador: ["identificador", "usuario", "handle", "perfil"],
  url: ["url", "link", "link_perfil"],
  resumo: ["resumo", "perfil", "descricao_perfil"],
  posicionamento: ["posicionamento", "posicao_de_marca"],
  objetivos: ["objetivos", "objetivo_estrategico"],
  desafios: ["desafios", "desafio"],
};

function mapeamentoHeuristico(input: AnalisarImportacaoCsvInput): MapeamentoImportacaoCsvSaida {
  const disponiveis = new Set(input.cabecalhos);
  const usados = new Set<string>();
  const campos = camposImportacaoCsvPorEntidade[input.entidade]
    .map((campo) => {
      const sinonimos = SINONIMOS[campo] ?? [campo];
      const origem = [...disponiveis].find((cabecalho) => {
        if (usados.has(cabecalho)) return false;
        const normalizado = normalizar(cabecalho);
        return sinonimos.some((s) => {
          const sinonimo = normalizar(s);
          // AlÃ©m da igualdade, aceita o sinÃ´nimo como parte inequÃ­voca de um
          // cabeÃ§alho mais descritivo, como "Empresa parceira" ou "Site
          // oficial". Isso mantÃ©m a importaÃ§Ã£o utilizÃ¡vel se o Ollama local
          // estiver aquecendo, sem tentar adivinhar campos por similaridade vaga.
          return normalizado === sinonimo
            || (sinonimo.length >= 4 && normalizado.includes(sinonimo));
        });
      });
      if (!origem) return null;
      usados.add(origem);
      return { campo_destino: campo, coluna_origem: origem, confianca: "media" as const };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    campos,
    observacoes: campos.length
      ? ["Mapeamento inicial por cabeçalho; revise a prévia antes de confirmar."]
      : ["Não foi possível reconhecer colunas automaticamente. Faça o mapeamento manual."],
  };
}

function mensagens(input: AnalisarImportacaoCsvInput): MensagemLLM[] {
  const camposPermitidos = camposImportacaoCsvPorEntidade[input.entidade];
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        entidade: input.entidade,
        campos_permitidos: camposPermitidos,
        cabecalhos: input.cabecalhos,
        amostra: input.amostra.slice(0, 20),
        formato_resposta: {
          campos: [{ campo_destino: "um campo permitido", coluna_origem: "um cabeçalho existente", confianca: "alta|media|baixa" }],
          observacoes: ["alertas e limitações"],
        },
      }),
    },
  ];
}

export interface ResultadoMapeamentoCsv {
  mapeamento: MapeamentoImportacaoCsvSaida;
  origem: OrigemLLM;
  tokens?: { entrada: number; saida: number };
}

export async function mapearCsvComIA(input: AnalisarImportacaoCsvInput): Promise<ResultadoMapeamentoCsv> {
  let resultado: Awaited<ReturnType<typeof chamarLLMJson<unknown>>>;
  try {
    resultado = await chamarLLMJson<unknown>({
      mensagens: mensagens(input),
      mock: () => mapeamentoHeuristico(input),
      temperatura: 0,
      formatoJson: mapeamentoImportacaoCsvSaidaSchema,
      // A tela é interativa. Cabeçalhos já têm cobertura determinística; o
      // Ollama entra para interpretar variações menos óbvias. Em CPU, a
      // primeira inferência real costuma passar de 20 s; 40 s preserva o uso
      // da IA sem exceder o timeout da API e mantém o fallback determinístico.
      timeoutMs: 40_000,
    });
  } catch {
    const heuristico = mapeamentoHeuristico(input);
    return {
      mapeamento: {
        ...heuristico,
        observacoes: [
          ...heuristico.observacoes,
          "O Ollama não respondeu a tempo; a sugestão foi gerada pelo reconhecimento local de cabeçalhos.",
        ],
      },
      origem: "mock",
    };
  }

  const permitido = new Set(camposImportacaoCsvPorEntidade[input.entidade]);
  const cabecalhos = new Set(input.cabecalhos);
  const bruto = mapeamentoImportacaoCsvSaidaSchema.parse(resultado.dados);
  const usados = new Set<string>();
  const destinos = new Set<string>();
  const campos = bruto.campos.filter((campo) => {
    if (!permitido.has(campo.campo_destino) || !cabecalhos.has(campo.coluna_origem) || usados.has(campo.coluna_origem) || destinos.has(campo.campo_destino)) return false;
    usados.add(campo.coluna_origem);
    destinos.add(campo.campo_destino);
    return true;
  });

  // Qwen pode devolver JSON válido porém conservador demais (lista vazia) em
  // planilhas pequenas. Completamos lacunas óbvias por cabeçalho, mantendo a
  // sugestão do modelo onde ela existe. Assim a experiência não depende de uma
  // inferência generativa para casos que são semanticamente determinísticos.
  for (const sugestao of mapeamentoHeuristico(input).campos) {
    if (!usados.has(sugestao.coluna_origem) && !destinos.has(sugestao.campo_destino)) {
      campos.push(sugestao);
      usados.add(sugestao.coluna_origem);
      destinos.add(sugestao.campo_destino);
    }
  }

  const observacoes = campos.length === bruto.campos.length
    ? bruto.observacoes
    : [...bruto.observacoes, "Campos óbvios também foram reconhecidos pela validação de cabeçalho."];
  return { mapeamento: { campos, observacoes }, origem: resultado.origem, tokens: resultado.tokens };
}
