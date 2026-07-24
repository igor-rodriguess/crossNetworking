import type {
  AnaliseCrossability,
  AnaliseTriade,
  Frente,
  NivelCompat,
  Paper,
  Parte,
  PerfilArtista,
  Projeto,
} from '../types';
import { MARCAS } from './mock';

// ─────────────────────────────────────────────────────────────────────────────
// Projetos — com origem da demanda, briefings versionados e planejamento
// ─────────────────────────────────────────────────────────────────────────────

export const PROJETOS: Projeto[] = [
  {
    id: 'pr-aurora-verao',
    clienteId: 'cli-aurora',
    nome: 'Plataforma de Verão 2026',
    objetivo:
      'Consolidar a Aurora como a marca de bebidas do verão brasileiro por meio de parcerias em música, moda e cultura urbana.',
    produto: 'Linha premium Aurora + edições limitadas',
    origem: 'briefing_cliente',
    status: 'em_andamento',
    faseAtual: 'implementacao',
    dataInicio: '2025-10-15',
    atualizadoEm: '2026-07-14',
    prazoEstimado: 'Q4 2026',
    valorPotencial: 2_200_000,
    responsaveis: ['Marina Duarte', 'Igor Rodrigues', 'Luísa Prado'],
    briefings: [
      {
        versao: 1,
        status: 'substituida',
        data: '2025-10-20',
        responsavel: 'Marina Duarte',
        conteudo:
          'Briefing inicial recebido do CMO da Aurora: ampliar presença da marca no verão 2026 com foco em festivais de música do litoral. Verba de referência de R$ 1,5 mi para parcerias. Público prioritário 18–34, classes AB.',
      },
      {
        versao: 2,
        status: 'vigente',
        data: '2025-11-18',
        responsavel: 'Marina Duarte',
        conteudo:
          'Revisão após workshop com o cliente: além de festivais, incluir colaborações de produto (moda/lifestyle) e cultura urbana. Verba ampliada para R$ 2,2 mi. Exigência de exclusividade de categoria em todas as propriedades. KPI principal: alcance qualificado e vendas da linha premium nas praças SP, RJ e Nordeste.',
      },
    ],
    planejamento: {
      diagnostico:
        'A Aurora tem alta lembrança de marca no varejo, mas baixa associação com experiências e música. Concorrentes ocupam os principais festivais; há espaço em propriedades emergentes e colaborações de produto.',
      territorios: ['Música & Festivais', 'Verão & Litoral', 'Moda & Lifestyle', 'Cultura urbana'],
      oportunidades:
        'Entrar como patrocinadora master de festival em ascensão (custo/benefício superior aos consolidados), cápsulas de produto co-assinadas e circuitos culturais com selo próprio.',
    },
  },
  {
    id: 'pr-vetor-esporte',
    clienteId: 'cli-vetor',
    nome: 'Território Esporte & Juventude',
    objetivo:
      'Posicionar o Banco Vetor junto ao público jovem adulto via esporte e audiência digital, convertendo audiência em abertura de contas.',
    produto: 'Conta digital Vetor + cartão universitário',
    origem: 'oportunidade_cross',
    status: 'em_andamento',
    faseAtual: 'implementacao',
    dataInicio: '2025-09-20',
    atualizadoEm: '2026-07-12',
    prazoEstimado: 'Q4 2026',
    valorPotencial: 1_800_000,
    responsaveis: ['Caio Nogueira', 'Igor Rodrigues'],
    briefings: [
      {
        versao: 1,
        status: 'vigente',
        data: '2025-09-28',
        responsavel: 'Caio Nogueira',
        conteudo:
          'Oportunidade identificada pela Cross em prospecção ativa: o basquete urbano cresce dois dígitos ao ano e não tem patrocinador financeiro relevante. Proposta levada ao Vetor: ocupar o território antes dos concorrentes, com meta de 25 mil contas novas no ciclo e presença nas 12 arenas da liga.',
      },
    ],
    planejamento: {
      diagnostico:
        'O Vetor tem produto digital competitivo, mas marca percebida como distante do público 20–39. Esporte emergente oferece custo de entrada baixo e alta conexão emocional.',
      territorios: ['Basquete & Ligas', 'Esporte universitário', 'Conteúdo digital'],
      oportunidades:
        'Naming rights da temporada da Liga Metropolitana, programa universitário com atléticas e ativações de geração de leads com creators e propriedades digitais.',
    },
  },
  {
    id: 'pr-pulso-cultura',
    clienteId: 'cli-pulso',
    nome: 'Energia da Cultura',
    objetivo:
      'Associar a Pulso a experiências culturais e sustentáveis, reforçando o posicionamento de energia limpa e inovação.',
    produto: 'Marca institucional Pulso + eletropostos',
    origem: 'briefing_cliente',
    status: 'em_andamento',
    faseAtual: 'acompanhamento',
    dataInicio: '2025-09-05',
    atualizadoEm: '2026-07-10',
    prazoEstimado: 'Q4 2026',
    valorPotencial: 1_100_000,
    responsaveis: ['Ana Beltrão', 'Igor Rodrigues', 'Luísa Prado'],
    briefings: [
      {
        versao: 1,
        status: 'substituida',
        data: '2025-09-10',
        responsavel: 'Ana Beltrão',
        conteudo:
          'Briefing da diretoria de marca da Pulso: dar visibilidade ao reposicionamento "energia limpa" com patrocínios de alto impacto. Preferência por propriedades com narrativa ambiental.',
      },
      {
        versao: 2,
        status: 'substituida',
        data: '2025-10-02',
        responsavel: 'Ana Beltrão',
        conteudo:
          'Ajuste do cliente: incluir o público gamer/jovem no escopo (novo produto de energia para data centers e e-sports) e priorizar propriedades com contrapartidas de mídia mensuráveis.',
      },
      {
        versao: 3,
        status: 'vigente',
        data: '2026-02-12',
        responsavel: 'Luísa Prado',
        conteudo:
          'Revisão de meio de ciclo: com a Arena Pulso entregue, o foco passa a ser mobilidade elétrica (eletropostos co-brandados) e experiências presenciais sustentáveis. Meta: 3 parcerias formalizadas até dez/2026 e ROI consolidado ≥ 2,0x.',
      },
    ],
    planejamento: {
      diagnostico:
        'A Pulso comunica sustentabilidade, mas a associação espontânea ainda é de "distribuidora tradicional". Experiências presenciais e mobilidade elétrica são os territórios de maior aderência.',
      territorios: ['Sustentabilidade & Experiências', 'Inovação & Mobilidade', 'Cultura gamer'],
      oportunidades:
        'Patrocínio de propriedades de ecoturismo certificadas, naming de arenas de e-sports (energia do gaming) e rede de eletropostos em parceria com apps de mobilidade.',
    },
  },

  // ── Projetos em fases iniciais e encerrados (base histórica global) ────────
  {
    id: 'pr-aurora-nordeste',
    clienteId: 'cli-aurora',
    nome: 'Expansão Nordeste',
    objetivo: 'Levar a plataforma de parcerias da Aurora para as capitais do Nordeste no verão 2027.',
    produto: 'Linha premium Aurora',
    origem: 'briefing_cliente',
    status: 'planejamento',
    faseAtual: 'briefing',
    dataInicio: '2026-06-22',
    atualizadoEm: '2026-07-08',
    prazoEstimado: 'Q1 2027',
    valorPotencial: 900_000,
    responsaveis: ['Marina Duarte'],
    briefings: [
      {
        versao: 1,
        status: 'vigente',
        data: '2026-06-25',
        responsavel: 'Marina Duarte',
        conteudo:
          'Briefing recebido: replicar o modelo da Plataforma de Verão nas capitais do Nordeste, priorizando propriedades locais (festas regionais, blocos e casas de show) com verba inicial de R$ 900 mil. Próximo passo: kickoff com o time regional da Aurora.',
      },
    ],
    planejamento: {
      diagnostico: 'A consolidar após o kickoff — estudos de mercado regionais solicitados.',
      territorios: ['Festas regionais', 'Música & Verão'],
      oportunidades: 'Mapeamento inicial em andamento.',
    },
  },
  {
    id: 'pr-vetor-varejo',
    clienteId: 'cli-vetor',
    nome: 'Co-branding Varejo',
    objetivo: 'Cartão co-branded do Vetor com uma grande rede varejista para ampliar a base além do público jovem.',
    produto: 'Cartão co-branded',
    origem: 'oportunidade_cross',
    status: 'em_andamento',
    faseAtual: 'paper',
    dataInicio: '2026-04-15',
    atualizadoEm: '2026-07-13',
    prazoEstimado: 'Q1 2027',
    valorPotencial: 2_500_000,
    responsaveis: ['Caio Nogueira', 'Luísa Prado'],
    briefings: [
      {
        versao: 1,
        status: 'vigente',
        data: '2026-04-18',
        responsavel: 'Caio Nogueira',
        conteudo:
          'Oportunidade mapeada pela Cross: redes varejistas buscando braço financeiro. Proposta em elaboração para o comitê do Vetor; Plano tático em construção com dois candidatos finalistas.',
      },
    ],
    planejamento: {
      diagnostico: 'Varejo físico com alta capilaridade e baixa penetração de crédito próprio nas classes B/C.',
      territorios: ['Varejo & Consumo', 'Crédito'],
      oportunidades: 'Cartão co-branded com programa de pontos integrado ao app do Vetor.',
    },
  },
  {
    id: 'pr-pulso-b2b',
    clienteId: 'cli-pulso',
    nome: 'Energia B2B Tech',
    objetivo: 'Posicionar a Pulso como fornecedora de energia limpa para data centers e empresas de tecnologia.',
    produto: 'Contratos B2B de energia limpa',
    origem: 'oportunidade_cross',
    status: 'em_andamento',
    faseAtual: 'crossability',
    dataInicio: '2026-05-20',
    atualizadoEm: '2026-07-11',
    prazoEstimado: 'Q2 2027',
    valorPotencial: 3_400_000,
    responsaveis: ['Ana Beltrão', 'Igor Rodrigues'],
    briefings: [
      {
        versao: 1,
        status: 'vigente',
        data: '2026-05-25',
        responsavel: 'Igor Rodrigues',
        conteudo:
          'Prospecção ativa da Cross: o boom de IA multiplicou a demanda de data centers por energia limpa certificada. Análise Crossability em curso para mapear empresas de tecnologia com metas públicas de descarbonização.',
      },
    ],
    planejamento: {
      diagnostico: 'Demanda B2B por energia certificada cresce acima da oferta; Pulso tem excedente de geração solar.',
      territorios: ['Tecnologia & Data centers', 'ESG'],
      oportunidades: 'Parcerias de fornecimento de longo prazo com selo de energia limpa co-comunicado.',
    },
  },
  {
    id: 'pr-aurora-inverno',
    clienteId: 'cli-aurora',
    nome: 'Plataforma Inverno 2025',
    objetivo: 'Presença da Aurora em festivais gastronômicos e de vinho na serra durante o inverno 2025.',
    produto: 'Linha de rótulos especiais',
    origem: 'briefing_cliente',
    status: 'concluido',
    faseAtual: 'acompanhamento',
    dataInicio: '2025-03-10',
    atualizadoEm: '2025-09-30',
    prazoEstimado: 'Q3 2025',
    valorPotencial: 480_000,
    responsaveis: ['Marina Duarte', 'Luísa Prado'],
    briefings: [
      {
        versao: 1,
        status: 'vigente',
        data: '2025-03-14',
        responsavel: 'Marina Duarte',
        conteudo:
          'Projeto encerrado: ativação em 3 festivais de inverno com a linha de rótulos especiais. Resultados consolidados no encerramento — ROI 1,8x e aprendizados incorporados à Plataforma de Verão 2026.',
      },
    ],
    planejamento: {
      diagnostico: 'Projeto concluído — histórico preservado na base para consulta e aprendizados.',
      territorios: ['Gastronomia', 'Inverno & Serra'],
      oportunidades: 'Base de relacionamento com festivais gastronômicos aproveitável em novos ciclos.',
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Frentes de oportunidade
// ─────────────────────────────────────────────────────────────────────────────

export const FRENTES: Frente[] = [
  { id: 'fr-ab-musica', projetoId: 'pr-aurora-verao', nome: 'Música & Festivais', territorio: 'Verão & Litoral', objetivo: 'Patrocínio master de propriedade musical em ascensão no litoral.', status: 'em_andamento' },
  { id: 'fr-ab-lifestyle', projetoId: 'pr-aurora-verao', nome: 'Lifestyle & Colabs', territorio: 'Moda & Lifestyle', objetivo: 'Colaborações de produto co-assinadas com marcas de lifestyle.', status: 'em_andamento' },
  { id: 'fr-ab-cultura', projetoId: 'pr-aurora-verao', nome: 'Cultura Urbana', territorio: 'Arte de rua', objetivo: 'Circuitos culturais com selo Aurora nas capitais prioritárias.', status: 'em_andamento' },
  { id: 'fr-bv-esporte', projetoId: 'pr-vetor-esporte', nome: 'Basquete & Ligas', territorio: 'Basquete urbano', objetivo: 'Naming rights e programa universitário no basquete.', status: 'em_andamento' },
  { id: 'fr-bv-digital', projetoId: 'pr-vetor-esporte', nome: 'Audiência Digital & Leads', territorio: 'Conteúdo digital', objetivo: 'Propriedades digitais para conversão de contas.', status: 'aberta' },
  { id: 'fr-pe-sustent', projetoId: 'pr-pulso-cultura', nome: 'Sustentabilidade & Experiências', territorio: 'Ecoturismo', objetivo: 'Experiências presenciais com narrativa de energia limpa.', status: 'em_andamento' },
  { id: 'fr-pe-inova', projetoId: 'pr-pulso-cultura', nome: 'Inovação & Mobilidade', territorio: 'Cidades inteligentes', objetivo: 'Mobilidade elétrica e cultura gamer.', status: 'em_andamento' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Papers e validações (por frente)
// ─────────────────────────────────────────────────────────────────────────────

export const PAPERS: Paper[] = [
  {
    id: 'paper-ab-musica',
    frenteId: 'fr-ab-musica',
    titulo: 'Aurora no território da música de verão',
    versoes: [
      { numero: 1, status: 'substituida', estrategia: 'Entrada como cota prata no Festival Maré com ativação de bar temático.', criadoEm: '2025-12-01', responsavel: 'Marina Duarte' },
      { numero: 2, status: 'vigente', estrategia: 'Patrocínio master do Festival Maré com exclusividade de categoria, espaço próprio e extensão para o selo Discos Baía como trilha do verão Aurora.', criadoEm: '2025-12-10', responsavel: 'Marina Duarte' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-ab-mare', ordem: 1, justificativa: 'Melhor fit de público e território; janela de exclusividade disponível.' },
      { candidaturaId: 'cand-ab-baia', ordem: 2, justificativa: 'Complemento de narrativa musical com custo reduzido.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2025-12-11', responsavel: 'Comitê Cross', versaoNumero: 2 },
      { tipo: 'cliente', status: 'aprovada', data: '2025-12-16', responsavel: 'CMO Aurora', versaoNumero: 2 },
    ],
  },
  {
    id: 'paper-ab-lifestyle',
    frenteId: 'fr-ab-lifestyle',
    titulo: 'Cápsulas de produto Aurora',
    versoes: [
      { numero: 1, status: 'vigente', estrategia: 'Cápsula co-assinada com a Onda Surfwear (drop de verão) com varejo compartilhado e mídia dividida.', criadoEm: '2026-02-02', responsavel: 'Luísa Prado' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-ab-onda', ordem: 1, justificativa: 'Marca em expansão com histórico forte de colabs.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2026-02-05', responsavel: 'Comitê Cross', versaoNumero: 1 },
      { tipo: 'cliente', status: 'aprovada', data: '2026-02-14', responsavel: 'CMO Aurora', versaoNumero: 1 },
    ],
  },
  {
    id: 'paper-ab-cultura',
    frenteId: 'fr-ab-cultura',
    titulo: 'Selo Aurora de cultura urbana',
    versoes: [
      { numero: 1, status: 'vigente', estrategia: 'Circuito Coletivo Trilhos em 4 capitais com selo Aurora, somado a distribuição de conteúdo via CineJá.', criadoEm: '2026-05-08', responsavel: 'Igor Rodrigues' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-ab-trilhos', ordem: 1, justificativa: 'Autenticidade no território e praças alinhadas.' },
      { candidaturaId: 'cand-ab-cineja', ordem: 2, justificativa: 'Amplificação de alcance com cinema nacional.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2026-05-12', responsavel: 'Comitê Cross', versaoNumero: 1 },
      { tipo: 'cliente', status: 'pendente', data: '2026-07-10', responsavel: 'CMO Aurora', versaoNumero: 1 },
    ],
  },
  {
    id: 'paper-bv-esporte',
    frenteId: 'fr-bv-esporte',
    titulo: 'Vetor como o banco do basquete',
    versoes: [
      { numero: 1, status: 'substituida', estrategia: 'Patrocínio pontual dos playoffs da Liga Metropolitana.', criadoEm: '2025-11-15', responsavel: 'Caio Nogueira' },
      { numero: 2, status: 'vigente', estrategia: 'Naming rights da temporada completa + programa universitário com a Atlética Nacional para funil de contas.', criadoEm: '2025-11-24', responsavel: 'Caio Nogueira' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-bv-liga', ordem: 1, justificativa: 'Propriedade âncora do território com audiência crescente.' },
      { candidaturaId: 'cand-bv-atletica', ordem: 2, justificativa: 'Captação direta no público universitário.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2025-11-25', responsavel: 'Comitê Cross', versaoNumero: 2 },
      { tipo: 'cliente', status: 'aprovada', data: '2025-12-05', responsavel: 'Diretoria Vetor', versaoNumero: 2 },
    ],
  },
  {
    id: 'paper-bv-digital',
    frenteId: 'fr-bv-digital',
    titulo: 'Audiência digital para geração de contas',
    versoes: [
      { numero: 1, status: 'em_revisao', estrategia: 'Combinação TechNave (credibilidade e leads B2B) + CineJá (co-branded de conteúdo) com metas de conversão por propriedade.', criadoEm: '2026-06-20', responsavel: 'Igor Rodrigues' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-bv-technave', ordem: 1, justificativa: 'Público early adopter aderente à conta digital.' },
      { candidaturaId: 'cand-bv-cineja', ordem: 2, justificativa: 'Base de assinantes em crescimento para oferta co-branded.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'pendente', data: '2026-07-14', responsavel: 'Comitê Cross', versaoNumero: 1 },
    ],
  },
  {
    id: 'paper-pe-sustent',
    frenteId: 'fr-pe-sustent',
    titulo: 'Energia limpa em experiências reais',
    versoes: [
      { numero: 1, status: 'vigente', estrategia: 'Patrocínio da trilha certificada do EcoParque com estação de recarga solar como prova de conceito visitável.', criadoEm: '2025-12-08', responsavel: 'Ana Beltrão' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-pe-eco', ordem: 1, justificativa: 'Certificação ambiental e volume de visitação comprovado.' },
      { candidaturaId: 'cand-pe-mare', ordem: 2, justificativa: 'Palco sustentável no festival como extensão futura.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2025-12-12', responsavel: 'Comitê Cross', versaoNumero: 1 },
      { tipo: 'cliente', status: 'aprovada', data: '2026-01-05', responsavel: 'Diretoria Pulso', versaoNumero: 1 },
    ],
  },
  {
    id: 'paper-pe-inova',
    frenteId: 'fr-pe-inova',
    titulo: 'Pulso: a energia do gaming e da mobilidade',
    versoes: [
      { numero: 1, status: 'vigente', estrategia: 'Naming da Arena Pixel no primeiro semestre e rede de eletropostos co-brandados com o app Rota Livre no segundo.', criadoEm: '2025-11-10', responsavel: 'Ana Beltrão' },
    ],
    recomendacoes: [
      { candidaturaId: 'cand-pe-pixel', ordem: 1, justificativa: 'Associação direta energia ↔ e-sports com mídia própria.' },
      { candidaturaId: 'cand-pe-rota', ordem: 2, justificativa: 'Mobilidade elétrica com 2 mi de usuários ativos.' },
    ],
    validacoes: [
      { tipo: 'interna', status: 'aprovada', data: '2025-11-18', responsavel: 'Comitê Cross', versaoNumero: 1 },
      { tipo: 'cliente', status: 'aprovada', data: '2025-12-01', responsavel: 'Diretoria Pulso', versaoNumero: 1 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Análises Crossability (versionadas por candidatura — RN019)
// ─────────────────────────────────────────────────────────────────────────────

// `complemento` (opcional): [forçaCliente, forçaParceiro], cada um com os 6
// níveis na ordem publicos/territorios/ativos/sinergias/fit/momento. Onde o
// parceiro supera o cliente, a parceria preenche uma lacuna.
type SeisNiveis = [NivelCompat, NivelCompat, NivelCompat, NivelCompat, NivelCompat, NivelCompat];

function perfil([publicos, territorios, ativos, sinergias, fit, momento]: SeisNiveis) {
  return { publicos, territorios, ativos, sinergias, fit, momento };
}

function analise(
  candidaturaId: string,
  numeroVersao: number,
  niveis: SeisNiveis,
  recomendacao: AnaliseCrossability['recomendacao'],
  racional: string,
  responsavel: string,
  data: string,
  complemento?: [SeisNiveis, SeisNiveis],
): AnaliseCrossability {
  const [publicos, territorios, ativos, sinergias, fit, momento] = niveis;
  return {
    candidaturaId,
    numeroVersao,
    publicos,
    territorios,
    ativos,
    sinergias,
    fit,
    momento,
    recomendacao,
    racional,
    responsavel,
    data,
    ...(complemento && { forcaCliente: perfil(complemento[0]), forcaParceiro: perfil(complemento[1]) }),
  };
}

export const ANALISES_CROSSABILITY: AnaliseCrossability[] = [
  analise('cand-ab-mare', 1, ['alta', 'alta', 'media', 'alta', 'alta', 'media'], 'em_estudo', 'Fit de público excelente; aguardando confirmação da janela de exclusividade de categoria.', 'Marina Duarte', '2025-11-28'),
  analise('cand-ab-mare', 2, ['alta', 'alta', 'alta', 'alta', 'alta', 'alta'], 'recomendada', 'Exclusividade confirmada e edição 2026 com expansão de praça — melhor oportunidade do território.', 'Marina Duarte', '2025-12-04',
    // Aurora tem marca forte mas é fraca em público jovem e territórios de música/experiência;
    // o Festival Maré preenche exatamente essas lacunas.
    [['baixa', 'baixa', 'media', 'media', 'alta', 'media'], ['alta', 'alta', 'alta', 'alta', 'media', 'alta']]),
  analise('cand-ab-onda', 1, ['alta', 'alta', 'alta', 'alta', 'media', 'alta'], 'recomendada', 'Histórico de colabs forte; drop de verão alinhado ao calendário da linha premium.', 'Marina Duarte', '2026-01-24'),
  analise('cand-ab-trilhos', 1, ['alta', 'alta', 'media', 'alta', 'media', 'media'], 'recomendada', 'Autenticidade única no território urbano; exige negociação de exclusividade por praça.', 'Igor Rodrigues', '2026-04-20'),
  analise('cand-ab-cineja', 1, ['media', 'media', 'alta', 'media', 'alta', 'alta'], 'recomendada', 'Alcance qualificado e momento de crescimento; conexão de território é indireta (cinema ↔ verão).', 'Marina Duarte', '2026-05-26',
    // Aurora quer alcance digital jovem que hoje não tem; CineJá entrega ativos de conteúdo e audiência.
    [['baixa', 'media', 'baixa', 'media', 'alta', 'media'], ['media', 'media', 'alta', 'media', 'alta', 'alta']]),
  analise('cand-ab-voz', 1, ['alta', 'media', 'baixa', 'media', 'media', 'media'], 'em_estudo', 'Rede ampla, mas sem ativos proprietários; depende de curadoria de creators por praça.', 'Luísa Prado', '2026-06-26'),
  analise('cand-ab-baia', 1, ['alta', 'alta', 'media', 'media', 'media', 'alta'], 'em_estudo', 'Casting em ascensão; potencial de trilha sonora do verão Aurora. Validar disponibilidade dos artistas.', 'Igor Rodrigues', '2026-07-03'),
  analise('cand-bv-liga', 1, ['alta', 'alta', 'alta', 'alta', 'alta', 'media'], 'recomendada', 'Território sem concorrente financeiro; audiência em crescimento de dois dígitos e governança auditada.', 'Caio Nogueira', '2025-11-08'),
  analise('cand-bv-atletica', 1, ['alta', 'alta', 'media', 'alta', 'alta', 'alta'], 'recomendada', 'Captação direta no público universitário; sinergia clara com o cartão universitário.', 'Caio Nogueira', '2026-04-18'),
  analise('cand-bv-technave', 1, ['media', 'baixa', 'alta', 'media', 'alta', 'alta'], 'em_estudo', 'Credibilidade e leads B2B relevantes; território de esporte não conversa — tratar como frente digital.', 'Igor Rodrigues', '2026-05-28'),
  analise('cand-bv-pixel', 1, ['alta', 'media', 'alta', 'media', 'baixa', 'media'], 'nao_recomendada', 'Risco reputacional acima do apetite do setor financeiro (disputas trabalhistas recentes com jogadores).', 'Caio Nogueira', '2026-03-18'),
  analise('cand-pe-eco', 1, ['alta', 'alta', 'alta', 'alta', 'alta', 'media'], 'recomendada', 'Certificação ambiental renovada e 500 mil visitantes/ano; prova de conceito ideal para energia limpa.', 'Ana Beltrão', '2025-11-26'),
  analise('cand-pe-pixel', 1, ['media', 'media', 'alta', 'alta', 'alta', 'alta'], 'recomendada', 'Narrativa "energia do gaming" inédita no mercado; mídia própria com audiência jovem.', 'Ana Beltrão', '2025-10-22'),
  analise('cand-pe-rota', 1, ['alta', 'alta', 'alta', 'alta', 'media', 'alta'], 'recomendada', 'Eletropostos co-brandados materializam o reposicionamento; 2 mi de usuários ativos.', 'Igor Rodrigues', '2026-05-02'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Análise triádica (metodologia fiel): Objetivos · Ativos · Consumidores.
// Cada item é detalhado e recebe um veredito da análise (casa/complementa/não casa).
// Exemplo completo: Aurora Bebidas × Festival Maré.
// ─────────────────────────────────────────────────────────────────────────────

let _seqItem = 0;
function item(
  descricao: string,
  origem: 'cliente' | 'parceiro',
  veredito?: AnaliseTriade['objetivos'][number]['veredito'],
  nota?: string,
) {
  _seqItem += 1;
  return { id: `it-seed-${_seqItem}`, descricao, origem, veredito, nota };
}

export const ANALISES_TRIADE: AnaliseTriade[] = [
  {
    candidaturaId: 'cand-ab-mare',
    responsavel: 'Marina Duarte',
    atualizadoEm: '2025-12-04T15:20:00',
    objetivos: [
      item('Ser a marca de bebidas do verão brasileiro', 'cliente', 'complementa', 'Ser reconhecida no território musical do litoral.'),
      item('Consolidar o Festival Maré como propriedade master do verão', 'parceiro', 'complementa', 'Aurora entra como cota master e ancora o festival.'),
      item('Ambos querem dominar o verão/litoral — objetivos que se cumprimentam', 'cliente', 'casa'),
    ],
    ativos: [
      item('Linha premium + edições limitadas (produto)', 'cliente', 'complementa', 'Produto para ativação e amostragem no festival.'),
      item('Verba de mídia e presença nacional', 'cliente', 'complementa'),
      item('3 dias · 45 mil pessoas/dia · palco alternativo', 'parceiro', 'complementa', 'Escala de público presencial que a Aurora não tem sozinha.'),
      item('Vila gastronômica (espaço de marca)', 'parceiro', 'complementa'),
      item('Exclusividade de categoria de bebidas', 'parceiro', 'casa', 'Garante que nenhum concorrente ativa no festival.'),
    ],
    consumidores: [
      item('18–34, classes AB (público atual da Aurora)', 'cliente'),
      item('Aurora QUER alcançar jovem 18–24 do circuito musical', 'cliente', 'complementa', 'Público que hoje ela não atinge bem.'),
      item('Frequentadores de festival, 18–30, litoral e capitais', 'parceiro', 'complementa', 'O Festival entrega justamente o público jovem que a Aurora busca.'),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Base de Relacionamentos — todas as Partes do ecossistema Cross
// (marcas candidatas, clientes atendidos e pessoas/talentos mapeados)
// ─────────────────────────────────────────────────────────────────────────────

// Perfis estratégicos das marcas (inteligência estratégica por Parte)
const PERFIS: Record<string, Partial<Parte>> = {
  'm-festival-mare': {
    papeis: ['parceiro', 'veiculo_midia'],
    pracas: ['Florianópolis', 'Litoral SP', 'Salvador'],
    ativos: [
      { nome: 'Festival Maré (3 dias, 45 mil pessoas/dia)', tipo: 'Evento próprio' },
      { nome: 'Vila gastronômica e palco alternativo', tipo: 'Espaço patrocinável' },
    ],
    canais: [
      { canal: 'Instagram', alcance: '1,4 mi seguidores' },
      { canal: 'YouTube (aftermovies)', alcance: '18 mi views/ano' },
    ],
    contatos: [{ nome: 'Beatriz Camargo', cargo: 'Diretora comercial', email: 'bia@festivalmare.com.br', principal: true }],
    cadastradaEm: '2025-10-12',
  },
  'm-liga-metropolitana': {
    papeis: ['parceiro'],
    pracas: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Recife'],
    ativos: [
      { nome: '12 arenas com naming disponível', tipo: 'Propriedade física' },
      { nome: 'Transmissão em streaming próprio', tipo: 'Canal de mídia' },
    ],
    canais: [
      { canal: 'Streaming próprio', alcance: '410 mil/rodada' },
      { canal: 'TikTok', alcance: '2,1 mi seguidores' },
    ],
    contatos: [{ nome: 'Fernando Luz', cargo: 'CEO', email: 'fernando@ligametropolitana.com.br', principal: true }],
    cadastradaEm: '2025-09-30',
  },
  'm-onda-surf': {
    papeis: ['parceiro'],
    pracas: ['Litoral SP', 'Florianópolis', 'Rio de Janeiro'],
    ativos: [{ nome: 'Rede de 34 lojas próprias', tipo: 'Varejo' }, { nome: 'Time de atletas patrocinados', tipo: 'Talentos' }],
    canais: [{ canal: 'Instagram', alcance: '890 mil seguidores' }],
    contatos: [{ nome: 'Paula Andrade', cargo: 'Head de marca', email: 'paula@ondasurf.com.br', principal: true }],
    cadastradaEm: '2025-11-20',
  },
  'm-technave': {
    papeis: ['parceiro_potencial', 'veiculo_midia'],
    pracas: ['São Paulo', 'Nacional (digital)'],
    ativos: [{ nome: 'Conferência anual (28 mil inscritos)', tipo: 'Evento próprio' }, { nome: 'Newsletter diária', tipo: 'Canal de mídia' }],
    canais: [{ canal: 'Newsletter', alcance: '310 mil assinantes' }, { canal: 'LinkedIn', alcance: '540 mil seguidores' }],
    contatos: [{ nome: 'Ricardo Sena', cargo: 'Diretor de parcerias', email: 'ricardo@technave.com.br', principal: true }],
    cadastradaEm: '2025-12-05',
  },
  'm-arena-pixel': {
    papeis: ['parceiro'],
    pracas: ['São Paulo', 'Curitiba'],
    ativos: [{ nome: 'Arena física (2,4 mil lugares)', tipo: 'Propriedade física' }, { nome: 'Campeonatos próprios', tipo: 'Evento próprio' }],
    canais: [{ canal: 'Twitch', alcance: '180 mil médios/final' }, { canal: 'Instagram', alcance: '760 mil seguidores' }],
    contatos: [{ nome: 'Duda Ferraz', cargo: 'Head comercial', email: 'duda@arenapixel.gg', principal: true }],
    cadastradaEm: '2025-09-08',
  },
  'm-cine-ja': {
    papeis: ['parceiro_potencial', 'veiculo_midia'],
    pracas: ['Nacional (digital)'],
    ativos: [{ nome: 'Catálogo de cinema independente BR', tipo: 'Conteúdo' }, { nome: 'Mostra itinerante de verão', tipo: 'Evento próprio' }],
    canais: [{ canal: 'Base de assinantes', alcance: '650 mil assinantes' }],
    contatos: [{ nome: 'Tiago Prates', cargo: 'CEO', email: 'tiago@cineja.com.br', principal: true }],
    cadastradaEm: '2026-03-28',
  },
  'm-eco-parque': {
    papeis: ['parceiro'],
    pracas: ['Serra da Mantiqueira (SP/MG)'],
    ativos: [{ nome: 'Trilhas certificadas (500 mil visitantes/ano)', tipo: 'Propriedade física' }, { nome: 'Centro de visitantes', tipo: 'Espaço patrocinável' }],
    canais: [{ canal: 'Instagram', alcance: '420 mil seguidores' }],
    contatos: [{ nome: 'Helena Prado', cargo: 'Diretora de sustentabilidade', email: 'helena@ecoparque.eco.br', principal: true }],
    cadastradaEm: '2025-10-01',
  },
  'm-voz-ativa': {
    papeis: ['parceiro_potencial', 'veiculo_midia'],
    pracas: ['Nacional (digital)'],
    ativos: [{ nome: 'Rede de 85 creators', tipo: 'Talentos' }],
    canais: [{ canal: 'Alcance combinado', alcance: '30 mi seguidores' }],
    contatos: [{ nome: 'Júlia Neves', cargo: 'Head de contas', email: 'julia@vozativa.com.br', principal: true }],
    cadastradaEm: '2026-01-15',
  },
};

const PERFIL_PADRAO: Pick<Parte, 'papeis' | 'pracas' | 'ativos' | 'canais' | 'contatos' | 'cadastradaEm'> = {
  papeis: ['parceiro_potencial'],
  pracas: ['Nacional'],
  ativos: [],
  canais: [],
  contatos: [],
  cadastradaEm: '2026-02-01',
};

const PARTES_MARCAS: Parte[] = MARCAS.map((m) => ({
  id: m.id,
  tipo: 'organizacao' as const,
  nome: m.nome,
  categoria: m.categoria,
  territorio: m.territorio,
  publico: m.publico,
  descricao: m.descricao,
  ...PERFIL_PADRAO,
  ...PERFIS[m.id],
}));

const PARTES_CLIENTES: Parte[] = [
  {
    id: 'cli-aurora',
    tipo: 'organizacao',
    nome: 'Aurora Bebidas',
    categoria: 'Bebidas & Lifestyle',
    territorio: 'Verão & Litoral',
    publico: '18–34 · classes AB',
    descricao: 'Cervejaria premium em expansão nacional; cliente Cross desde mar/2024 no modelo fee mensal.',
    papeis: ['cliente'],
    pracas: ['São Paulo', 'Rio de Janeiro', 'Nordeste'],
    ativos: [{ nome: 'Linha premium + edições limitadas', tipo: 'Produto' }],
    canais: [{ canal: 'Instagram', alcance: '2,3 mi seguidores' }],
    contatos: [{ nome: 'Renata Vilela', cargo: 'CMO', email: 'renata@aurorabebidas.com.br', principal: true }],
    cadastradaEm: '2024-03-01',
  },
  {
    id: 'cli-vetor',
    tipo: 'organizacao',
    nome: 'Banco Vetor',
    categoria: 'Serviços Financeiros',
    territorio: 'Esporte & Juventude',
    publico: '20–39 · digital',
    descricao: 'Banco digital em crescimento; cliente Cross desde jan/2025 em projeto pontual de território.',
    papeis: ['cliente', 'patrocinador'],
    pracas: ['Nacional'],
    ativos: [{ nome: 'Conta digital + cartão universitário', tipo: 'Produto' }],
    canais: [{ canal: 'App', alcance: '3,8 mi contas ativas' }],
    contatos: [{ nome: 'Sérgio Antunes', cargo: 'Diretor de marca', email: 'sergio@bancovetor.com.br', principal: true }],
    cadastradaEm: '2025-01-15',
  },
  {
    id: 'cli-pulso',
    tipo: 'organizacao',
    nome: 'Pulso Energia',
    categoria: 'Energia & Patrocínios',
    territorio: 'Sustentabilidade',
    publico: 'residencial e empresarial',
    descricao: 'Distribuidora em reposicionamento para energia limpa; cliente Cross desde set/2025 em success fee.',
    papeis: ['cliente', 'patrocinador'],
    pracas: ['Sudeste', 'Sul'],
    ativos: [{ nome: 'Rede de eletropostos (piloto)', tipo: 'Infraestrutura' }],
    canais: [{ canal: 'Institucional', alcance: '1,1 mi clientes' }],
    contatos: [{ nome: 'Camila Rocha', cargo: 'Diretora de marca', email: 'camila@pulsoenergia.com.br', principal: true }],
    cadastradaEm: '2025-09-01',
  },
];

const PARTES_PESSOAS: Parte[] = [
  {
    id: 'p-lia-navarra',
    tipo: 'pessoa',
    nome: 'Lia Navarra',
    categoria: 'Artista · Nova MPB',
    territorio: 'Música & Verão',
    publico: '18–34 · nacional',
    descricao: 'Cantora do casting Discos Baía em ascensão; turnê "Maré Cheia" com 18 datas no verão 2026/2027 — Big Moment mapeado para marcas de bebidas e moda.',
    papeis: ['artista', 'parceiro_potencial'],
    pracas: ['São Paulo', 'Salvador', 'Recife'],
    ativos: [{ nome: 'Turnê Maré Cheia (18 datas)', tipo: 'Turnê' }, { nome: 'Lançamento de álbum em nov/2026', tipo: 'Big Moment' }],
    canais: [{ canal: 'Instagram', alcance: '1,1 mi seguidores' }, { canal: 'Spotify', alcance: '2,4 mi ouvintes/mês' }],
    contatos: [{ nome: 'Discos Baía (label)', cargo: 'Representação', email: 'contato@discosbaia.com.br', principal: true }],
    cadastradaEm: '2026-04-10',
  },
  {
    id: 'p-rafa-coutinho',
    tipo: 'pessoa',
    nome: 'Rafa Coutinho',
    categoria: 'Atleta · Basquete 3x3',
    territorio: 'Esporte & Juventude',
    publico: '16–29 · nacional',
    descricao: 'Atleta de basquete 3x3 e creator; destaque da Liga Metropolitana com audiência própria — mapeado para ativações do território esporte.',
    papeis: ['atleta', 'parceiro_potencial'],
    pracas: ['Rio de Janeiro', 'São Paulo'],
    ativos: [{ nome: 'Clínicas de basquete em escolas', tipo: 'Projeto social' }],
    canais: [{ canal: 'TikTok', alcance: '980 mil seguidores' }, { canal: 'YouTube', alcance: '350 mil inscritos' }],
    contatos: [{ nome: 'Agência CourtSide', cargo: 'Representação', email: 'rafa@courtside.com.br', principal: true }],
    cadastradaEm: '2026-05-22',
  },
];

export const PARTES: Parte[] = [...PARTES_CLIENTES, ...PARTES_MARCAS, ...PARTES_PESSOAS];

// ─────────────────────────────────────────────────────────────────────────────
// Inteligência de artistas — turnês, Big Moments e agenda (RF015)
// Big Moments são as janelas de oportunidade: grandes eventos, lançamentos e
// momentos de alta exposição em que uma parceria rende mais.
// ─────────────────────────────────────────────────────────────────────────────

export const PERFIS_ARTISTAS: PerfilArtista[] = [
  {
    parteId: 'p-lia-navarra',
    representacao: 'Discos Baía (label e agenciamento)',
    turnes: [
      {
        nome: 'Turnê Maré Cheia',
        inicio: '2026-11-14',
        fim: '2027-03-07',
        eventos: [
          { cidade: 'São Paulo', local: 'Arena Alvorada', data: '2026-11-14' },
          { cidade: 'Rio de Janeiro', local: 'Praça das Marés', data: '2026-11-28' },
          { cidade: 'Salvador', local: 'Parque do Farol', data: '2026-12-12' },
          { cidade: 'Recife', local: 'Cais da Música', data: '2026-12-19' },
          { cidade: 'Florianópolis', local: 'Festival Maré (palco principal)', data: '2027-01-16' },
        ],
      },
    ],
    bigMoments: [
      {
        titulo: 'Lançamento do álbum "Maré Cheia"',
        data: '2026-11-06',
        descricao: 'Terceiro álbum de estúdio, com pré-save recorde do selo e estreia em playlists editoriais.',
        oportunidade: 'Janela ideal para marca de bebidas ou moda assinar a turnê antes da alta de visibilidade.',
      },
      {
        titulo: 'Festival Planeta Som — palco principal',
        data: '2027-01-30',
        descricao: 'Estreia da artista no maior festival do país, com transmissão nacional.',
        oportunidade: 'Exposição de massa: ativação de marca no camarim/backstage e conteúdo co-criado.',
      },
    ],
    agenda: [
      { titulo: 'Show de encerramento do Festival Maré', data: '2026-12-20', tipo: 'festival', local: 'Florianópolis' },
      { titulo: 'Single com participação especial', data: '2026-08-21', tipo: 'lancamento' },
      { titulo: 'Documentário nos streamings', data: '2026-09-15', tipo: 'midia', local: 'CineJá' },
    ],
  },
  {
    parteId: 'p-rafa-coutinho',
    representacao: 'Agência CourtSide',
    turnes: [
      {
        nome: 'Circuito 3x3 de Verão',
        inicio: '2026-09-05',
        fim: '2026-12-13',
        eventos: [
          { cidade: 'Rio de Janeiro', local: 'Arena de Copacabana', data: '2026-09-05' },
          { cidade: 'São Paulo', local: 'Quadra Central do Ibira', data: '2026-10-10' },
          { cidade: 'Belo Horizonte', local: 'Praça da Estação', data: '2026-11-07' },
          { cidade: 'Recife', local: 'Marco Zero', data: '2026-12-12' },
        ],
      },
    ],
    bigMoments: [
      {
        titulo: 'Convocação para a seleção de basquete 3x3',
        data: '2026-08-10',
        descricao: 'Primeira convocação oficial, com cobertura nacional de esporte.',
        oportunidade: 'Momento de pico de mídia espontânea — ideal para banco ou marca esportiva fechar patrocínio.',
      },
      {
        titulo: 'Final da Liga Metropolitana (comentarista convidado)',
        data: '2026-09-27',
        descricao: 'Estreia como comentarista na transmissão da final, unindo quadra e audiência digital.',
        oportunidade: 'Conteúdo de marca em dose dupla: atleta em quadra + voz na transmissão.',
      },
    ],
    agenda: [
      { titulo: 'Clínica de basquete em escolas públicas', data: '2026-08-15', tipo: 'outro', local: 'Rio de Janeiro' },
      { titulo: 'Lançamento da série no canal próprio', data: '2026-07-30', tipo: 'lancamento' },
    ],
  },
];
