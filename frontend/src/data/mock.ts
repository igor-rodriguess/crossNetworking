import type {
  Avaliacao,
  Candidatura,
  Cliente,
  Criterio,
  Marca,
  Movimentacao,
  Parceria,
  RespostaCriterio,
  RespostaValor,
  StatusCandidatura,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Clientes Cross
// ─────────────────────────────────────────────────────────────────────────────

export const CLIENTES: Cliente[] = [
  {
    id: 'cli-aurora',
    nome: 'Aurora Bebidas',
    sigla: 'AB',
    segmento: 'Bebidas & Lifestyle',
    modeloContratacao: 'Fee mensal',
    responsavel: 'Marina Duarte',
    desde: '2024-03-01',
  },
  {
    id: 'cli-vetor',
    nome: 'Banco Vetor',
    sigla: 'BV',
    segmento: 'Serviços Financeiros',
    modeloContratacao: 'Projeto pontual',
    responsavel: 'Caio Nogueira',
    desde: '2025-01-15',
  },
  {
    id: 'cli-pulso',
    nome: 'Pulso Energia',
    sigla: 'PE',
    segmento: 'Energia & Patrocínios',
    modeloContratacao: 'Success fee',
    responsavel: 'Ana Beltrão',
    desde: '2025-09-01',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Critérios do Cross Score Card (por cliente, com pesos próprios)
// ─────────────────────────────────────────────────────────────────────────────

function criterio(
  id: string,
  clienteId: string,
  ordem: number,
  nome: string,
  descricao: string,
  pesoSim: number,
  obrigatorio = false,
  pesoNao = 0,
): Criterio {
  return { id, clienteId, ordem, nome, descricao, pesoSim, pesoNao, obrigatorio, ativo: true };
}

export const CRITERIOS: Criterio[] = [
  // Aurora Bebidas — território de música, verão e lifestyle premium
  criterio('ab1', 'cli-aurora', 1, 'Sobreposição de público-alvo', 'Audiência da marca conversa com o público 18–34 da Aurora.', 15),
  criterio('ab2', 'cli-aurora', 2, 'Alinhamento de território', 'Presença nos territórios de música, verão e litoral.', 12),
  criterio('ab3', 'cli-aurora', 3, 'Complementaridade de ativos', 'Ativos próprios (eventos, espaços, mídia) que somam ao portfólio.', 10),
  criterio('ab4', 'cli-aurora', 4, 'Momento estratégico favorável', 'Lançamentos, turnês ou expansão que criem janela de oportunidade.', 10),
  criterio('ab5', 'cli-aurora', 5, 'Capilaridade nas praças prioritárias', 'Atuação forte em SP, RJ e capitais do Nordeste.', 8),
  criterio('ab6', 'cli-aurora', 6, 'Fit de posicionamento premium', 'Percepção de marca compatível com o segmento premium.', 8),
  criterio('ab7', 'cli-aurora', 7, 'Histórico de parcerias relevante', 'Cases anteriores de co-branding ou patrocínio bem-sucedidos.', 6),
  criterio('ab8', 'cli-aurora', 8, 'Exclusividade de categoria disponível', 'Sem concorrente de bebidas ativo na propriedade.', 6, true),

  // Banco Vetor — credibilidade, esporte e geração de negócio
  criterio('bv1', 'cli-vetor', 1, 'Alcance no público jovem adulto', 'Audiência relevante na faixa 20–39, foco em bancarização digital.', 15),
  criterio('bv2', 'cli-vetor', 2, 'Credibilidade institucional', 'Reputação sólida e governança compatível com o setor financeiro.', 12, true),
  criterio('bv3', 'cli-vetor', 3, 'Potencial de geração de leads', 'Capacidade de converter audiência em contas e produtos.', 12),
  criterio('bv4', 'cli-vetor', 4, 'Alinhamento com território de esporte', 'Conexão com basquete, corrida ou esporte universitário.', 10),
  criterio('bv5', 'cli-vetor', 5, 'Risco reputacional baixo', 'Sem passivos de imagem ou controvérsias recentes.', 10, true),
  criterio('bv6', 'cli-vetor', 6, 'Cobertura nacional', 'Presença ou audiência distribuída em todas as regiões.', 8),
  criterio('bv7', 'cli-vetor', 7, 'Sinergia de canais digitais', 'Canais próprios fortes para ativações conjuntas.', 8),
  criterio('bv8', 'cli-vetor', 8, 'Momento de crescimento', 'Marca em expansão de audiência ou receita.', 6),

  // Pulso Energia — sustentabilidade, eventos e visibilidade
  criterio('pe1', 'cli-pulso', 1, 'Aderência ao território de sustentabilidade', 'Narrativa e prática ambiental consistentes.', 14),
  criterio('pe2', 'cli-pulso', 2, 'Volume de audiência presencial', 'Público presencial expressivo para ativações de energia.', 12),
  criterio('pe3', 'cli-pulso', 3, 'Compatibilidade de públicos', 'Público aderente ao consumidor residencial e empresarial Pulso.', 12),
  criterio('pe4', 'cli-pulso', 4, 'Ativos de mídia próprios', 'Canais e propriedades de mídia relevantes para contrapartidas.', 10),
  criterio('pe5', 'cli-pulso', 5, 'Janela de disponibilidade em 2026', 'Agenda compatível com o calendário de ativações do ano.', 8),
  criterio('pe6', 'cli-pulso', 6, 'Fit com posicionamento de inovação', 'Marca percebida como inovadora e tecnológica.', 8),
  criterio('pe7', 'cli-pulso', 7, 'Contrapartidas de visibilidade', 'Espaços de marca claros (placas, naming, mídia).', 6),
];

// ─────────────────────────────────────────────────────────────────────────────
// Base de marcas (Partes candidatas a parceiras)
// ─────────────────────────────────────────────────────────────────────────────

export const MARCAS: Marca[] = [
  { id: 'm-festival-mare', nome: 'Festival Maré', categoria: 'Música & Entretenimento', territorio: 'Verão & Litoral', publico: '18–34 · classes AB', descricao: 'Maior festival de música do litoral, com três dias de programação e vila gastronômica.' },
  { id: 'm-liga-metropolitana', nome: 'Liga Metropolitana', categoria: 'Esporte', territorio: 'Basquete urbano', publico: '16–39 · nacional', descricao: 'Liga de basquete com 12 franquias e transmissão em streaming próprio.' },
  { id: 'm-onda-surf', nome: 'Onda Surfwear', categoria: 'Moda & Lifestyle', territorio: 'Verão & Litoral', publico: '18–29 · litorâneo', descricao: 'Marca de surfwear em expansão nacional, forte em colaborações de produto.' },
  { id: 'm-technave', nome: 'TechNave', categoria: 'Tecnologia', territorio: 'Inovação', publico: '25–44 · early adopters', descricao: 'Plataforma de eventos e conteúdo sobre tecnologia com conferência anual.' },
  { id: 'm-sabor-cerrado', nome: 'Sabor do Cerrado', categoria: 'Alimentação', territorio: 'Gastronomia regional', publico: '25–54 · centro-oeste', descricao: 'Rede de restaurantes de culinária regional com 40 unidades.' },
  { id: 'm-radio-horizonte', nome: 'Rádio Horizonte', categoria: 'Mídia', territorio: 'Música & Cultura', publico: '25–49 · sudeste', descricao: 'Rede de rádio e portal de cultura com programação musical premiada.' },
  { id: 'm-arena-pixel', nome: 'Arena Pixel', categoria: 'Games & E-sports', territorio: 'Cultura gamer', publico: '16–29 · nacional', descricao: 'Arena de e-sports com campeonatos próprios e audiência em streaming.' },
  { id: 'm-vitta-club', nome: 'Vitta Club', categoria: 'Bem-estar & Fitness', territorio: 'Saúde & Performance', publico: '25–44 · capitais', descricao: 'Rede de clubes de bem-estar com programação de eventos ao ar livre.' },
  { id: 'm-cine-ja', nome: 'CineJá', categoria: 'Streaming & Entretenimento', territorio: 'Cinema nacional', publico: '18–49 · nacional', descricao: 'Streaming de cinema independente brasileiro em crescimento acelerado.' },
  { id: 'm-rota-livre', nome: 'Rota Livre', categoria: 'Mobilidade', territorio: 'Cidades inteligentes', publico: '20–39 · metrópoles', descricao: 'Aplicativo de mobilidade urbana multimodal com 2 mi de usuários ativos.' },
  { id: 'm-discos-baia', nome: 'Discos Baía', categoria: 'Música & Entretenimento', territorio: 'Nova MPB', publico: '20–39 · urbano', descricao: 'Selo independente com casting de artistas em ascensão e festival próprio.' },
  { id: 'm-atletica-nacional', nome: 'Atlética Nacional', categoria: 'Esporte universitário', territorio: 'Universidades', publico: '18–24 · estudantes', descricao: 'Circuito esportivo universitário presente em 80 instituições.' },
  { id: 'm-voz-ativa', nome: 'Rede Voz Ativa', categoria: 'Creators & Influência', territorio: 'Conteúdo digital', publico: '16–34 · nacional', descricao: 'Rede de creators com alcance combinado de 30 mi de seguidores.' },
  { id: 'm-cafe-verao', nome: 'Café Alto Verão', categoria: 'Alimentação', territorio: 'Cafés especiais', publico: '25–44 · capitais', descricao: 'Marca de cafés especiais com cafeterias-conceito e e-commerce forte.' },
  { id: 'm-corpo-livre', nome: 'Studio Corpo Livre', categoria: 'Bem-estar & Fitness', territorio: 'Saúde & Performance', publico: '25–39 · feminino', descricao: 'Rede de estúdios boutique de treino funcional e yoga.' },
  { id: 'm-trilhos', nome: 'Coletivo Trilhos', categoria: 'Cultura urbana', territorio: 'Arte de rua', publico: '18–34 · urbano', descricao: 'Coletivo de arte urbana que produz circuitos culturais em 6 capitais.' },
  { id: 'm-eco-parque', nome: 'EcoParque Serra Azul', categoria: 'Turismo & Sustentabilidade', territorio: 'Ecoturismo', publico: 'famílias · sudeste', descricao: 'Parque de ecoturismo com 500 mil visitantes/ano e trilhas certificadas.' },
  { id: 'm-game-street', nome: 'Circuito Game Street', categoria: 'Games & E-sports', territorio: 'Cultura gamer', publico: '14–29 · nacional', descricao: 'Circuito itinerante que une games, música e cultura de rua.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Candidaturas (funil por cliente) com histórico de movimentações
// ─────────────────────────────────────────────────────────────────────────────

type Passo = [data: string, para: StatusCandidatura, justificativa?: string];

// Frente de oportunidade de cada candidatura (as frentes vivem em mock-plataforma.ts)
const FRENTE_DE: Record<string, string> = {
  'cand-ab-mare': 'fr-ab-musica',
  'cand-ab-baia': 'fr-ab-musica',
  'cand-ab-radio': 'fr-ab-musica',
  'cand-ab-onda': 'fr-ab-lifestyle',
  'cand-ab-cafe': 'fr-ab-lifestyle',
  'cand-ab-vitta': 'fr-ab-lifestyle',
  'cand-ab-technave': 'fr-ab-lifestyle',
  'cand-ab-cerrado': 'fr-ab-lifestyle',
  'cand-ab-trilhos': 'fr-ab-cultura',
  'cand-ab-voz': 'fr-ab-cultura',
  'cand-ab-cineja': 'fr-ab-cultura',
  'cand-bv-liga': 'fr-bv-esporte',
  'cand-bv-atletica': 'fr-bv-esporte',
  'cand-bv-technave': 'fr-bv-digital',
  'cand-bv-cineja': 'fr-bv-digital',
  'cand-bv-rota': 'fr-bv-digital',
  'cand-bv-gamestreet': 'fr-bv-digital',
  'cand-bv-voz': 'fr-bv-digital',
  'cand-bv-pixel': 'fr-bv-digital',
  'cand-bv-mare': 'fr-bv-digital',
  'cand-pe-eco': 'fr-pe-sustent',
  'cand-pe-mare': 'fr-pe-sustent',
  'cand-pe-trilhos': 'fr-pe-sustent',
  'cand-pe-corpo': 'fr-pe-sustent',
  'cand-pe-rota': 'fr-pe-inova',
  'cand-pe-pixel': 'fr-pe-inova',
  'cand-pe-liga': 'fr-pe-inova',
  'cand-pe-onda': 'fr-pe-inova',
};

function candidatura(
  id: string,
  clienteId: string,
  marcaId: string,
  opts: {
    interesseCliente: Candidatura['interesseCliente'];
    interesseParceiro: Candidatura['interesseParceiro'];
    prioridade: Candidatura['prioridade'];
    responsavel: string;
    passos: Passo[];
    observacoes?: string;
  },
): Candidatura {
  const historico: Movimentacao[] = opts.passos.map(([data, para, justificativa], i) => ({
    data,
    de: i === 0 ? null : opts.passos[i - 1][1],
    para,
    responsavel: opts.responsavel,
    justificativa,
  }));
  const ultimo = opts.passos[opts.passos.length - 1];
  return {
    id,
    clienteId,
    frenteId: FRENTE_DE[id] ?? '',
    marcaId,
    status: ultimo[1],
    interesseCliente: opts.interesseCliente,
    interesseParceiro: opts.interesseParceiro,
    prioridade: opts.prioridade,
    dataEntrada: opts.passos[0][0],
    observacoes: opts.observacoes,
    historico,
  };
}

export const CANDIDATURAS: Candidatura[] = [
  // ── Aurora Bebidas ──────────────────────────────────────────────────────
  candidatura('cand-ab-mare', 'cli-aurora', 'm-festival-mare', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'alta', responsavel: 'Marina Duarte',
    passos: [
      ['2025-11-10', 'identificada', 'Mapeada no planejamento do território Verão.'],
      ['2025-11-25', 'em_analise'],
      ['2025-12-05', 'recomendada', 'Melhor fit do território no Crossability.'],
      ['2025-12-12', 'apresentada'],
      ['2025-12-18', 'em_negociacao'],
      ['2026-01-05', 'aprovada', 'Cota master aprovada pelo comitê da Aurora.'],
    ],
  }),
  candidatura('cand-ab-onda', 'cli-aurora', 'm-onda-surf', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'alta', responsavel: 'Marina Duarte',
    passos: [
      ['2025-12-08', 'identificada'],
      ['2026-01-12', 'em_analise'],
      ['2026-01-28', 'recomendada'],
      ['2026-02-10', 'apresentada'],
      ['2026-02-20', 'em_negociacao'],
      ['2026-03-02', 'aprovada', 'Cápsula de produto co-assinada aprovada.'],
    ],
  }),
  candidatura('cand-ab-trilhos', 'cli-aurora', 'm-trilhos', {
    interesseCliente: 'alto', interesseParceiro: 'medio', prioridade: 'media', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-03-15', 'identificada'],
      ['2026-04-02', 'em_analise'],
      ['2026-04-25', 'recomendada'],
      ['2026-05-14', 'apresentada'],
      ['2026-06-20', 'em_negociacao', 'Negociando contrapartidas de mídia no circuito.'],
    ],
    observacoes: 'Coletivo pediu exclusividade de categoria por praça.',
  }),
  candidatura('cand-ab-cineja', 'cli-aurora', 'm-cine-ja', {
    interesseCliente: 'medio', interesseParceiro: 'alto', prioridade: 'media', responsavel: 'Marina Duarte',
    passos: [
      ['2026-04-10', 'identificada'],
      ['2026-05-05', 'em_analise'],
      ['2026-06-01', 'recomendada'],
      ['2026-06-28', 'apresentada', 'Plano tático apresentado na reunião mensal.'],
    ],
  }),
  candidatura('cand-ab-voz', 'cli-aurora', 'm-voz-ativa', {
    interesseCliente: 'medio', interesseParceiro: 'desconhecido', prioridade: 'media', responsavel: 'Luísa Prado',
    passos: [
      ['2026-05-20', 'identificada'],
      ['2026-06-10', 'em_analise'],
      ['2026-07-01', 'recomendada'],
    ],
  }),
  candidatura('cand-ab-baia', 'cli-aurora', 'm-discos-baia', {
    interesseCliente: 'alto', interesseParceiro: 'desconhecido', prioridade: 'media', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-06-05', 'identificada'],
      ['2026-06-25', 'em_analise'],
    ],
  }),
  candidatura('cand-ab-cafe', 'cli-aurora', 'm-cafe-verao', {
    interesseCliente: 'medio', interesseParceiro: 'medio', prioridade: 'baixa', responsavel: 'Luísa Prado',
    passos: [
      ['2026-06-18', 'identificada'],
      ['2026-07-08', 'em_analise'],
    ],
  }),
  candidatura('cand-ab-vitta', 'cli-aurora', 'm-vitta-club', {
    interesseCliente: 'baixo', interesseParceiro: 'desconhecido', prioridade: 'baixa', responsavel: 'Marina Duarte',
    passos: [['2026-07-02', 'identificada']],
  }),
  candidatura('cand-ab-radio', 'cli-aurora', 'm-radio-horizonte', {
    interesseCliente: 'medio', interesseParceiro: 'medio', prioridade: 'baixa', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-02-12', 'identificada'],
      ['2026-03-01', 'em_analise'],
      ['2026-04-18', 'stand_by', 'Aguardando definição da grade de programação 2027.'],
    ],
  }),
  candidatura('cand-ab-technave', 'cli-aurora', 'm-technave', {
    interesseCliente: 'baixo', interesseParceiro: 'alto', prioridade: 'baixa', responsavel: 'Marina Duarte',
    passos: [
      ['2026-01-20', 'identificada'],
      ['2026-02-05', 'em_analise'],
      ['2026-03-10', 'recusada_cliente', 'Fora do território prioritário de verão e música.'],
    ],
  }),
  candidatura('cand-ab-cerrado', 'cli-aurora', 'm-sabor-cerrado', {
    interesseCliente: 'medio', interesseParceiro: 'baixo', prioridade: 'baixa', responsavel: 'Luísa Prado',
    passos: [
      ['2026-02-25', 'identificada'],
      ['2026-03-20', 'em_analise'],
      ['2026-04-30', 'recusada_parceiro', 'Rede priorizou parceria com marca regional.'],
    ],
  }),

  // ── Banco Vetor ─────────────────────────────────────────────────────────
  candidatura('cand-bv-liga', 'cli-vetor', 'm-liga-metropolitana', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'alta', responsavel: 'Caio Nogueira',
    passos: [
      ['2025-10-05', 'identificada'],
      ['2025-10-22', 'em_analise'],
      ['2025-11-12', 'recomendada'],
      ['2025-11-26', 'apresentada'],
      ['2025-12-10', 'em_negociacao'],
      ['2026-01-20', 'aprovada', 'Naming rights da temporada 2026 aprovado.'],
    ],
  }),
  candidatura('cand-bv-atletica', 'cli-vetor', 'm-atletica-nacional', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'alta', responsavel: 'Caio Nogueira',
    passos: [
      ['2026-03-08', 'identificada'],
      ['2026-03-30', 'em_analise'],
      ['2026-04-22', 'recomendada'],
      ['2026-05-18', 'apresentada'],
      ['2026-06-25', 'em_negociacao', 'Discussão de metas de abertura de contas universitárias.'],
    ],
  }),
  candidatura('cand-bv-technave', 'cli-vetor', 'm-technave', {
    interesseCliente: 'medio', interesseParceiro: 'alto', prioridade: 'media', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-04-14', 'identificada'],
      ['2026-05-06', 'em_analise'],
      ['2026-06-02', 'recomendada'],
      ['2026-07-03', 'apresentada'],
    ],
  }),
  candidatura('cand-bv-cineja', 'cli-vetor', 'm-cine-ja', {
    interesseCliente: 'medio', interesseParceiro: 'medio', prioridade: 'media', responsavel: 'Luísa Prado',
    passos: [
      ['2026-05-12', 'identificada'],
      ['2026-06-08', 'em_analise'],
      ['2026-07-06', 'recomendada'],
    ],
  }),
  candidatura('cand-bv-rota', 'cli-vetor', 'm-rota-livre', {
    interesseCliente: 'alto', interesseParceiro: 'desconhecido', prioridade: 'media', responsavel: 'Caio Nogueira',
    passos: [
      ['2026-06-15', 'identificada'],
      ['2026-07-05', 'em_analise'],
    ],
  }),
  candidatura('cand-bv-gamestreet', 'cli-vetor', 'm-game-street', {
    interesseCliente: 'medio', interesseParceiro: 'desconhecido', prioridade: 'baixa', responsavel: 'Igor Rodrigues',
    passos: [['2026-07-09', 'identificada']],
  }),
  candidatura('cand-bv-voz', 'cli-vetor', 'm-voz-ativa', {
    interesseCliente: 'medio', interesseParceiro: 'medio', prioridade: 'baixa', responsavel: 'Luísa Prado',
    passos: [
      ['2026-02-18', 'identificada'],
      ['2026-03-12', 'em_analise'],
      ['2026-05-02', 'stand_by', 'Aguardando revisão da política de creators do banco.'],
    ],
  }),
  candidatura('cand-bv-pixel', 'cli-vetor', 'm-arena-pixel', {
    interesseCliente: 'baixo', interesseParceiro: 'alto', prioridade: 'baixa', responsavel: 'Caio Nogueira',
    passos: [
      ['2026-01-28', 'identificada'],
      ['2026-02-15', 'em_analise'],
      ['2026-03-25', 'recusada_cliente', 'Comitê avaliou risco reputacional acima do apetite.'],
    ],
  }),
  candidatura('cand-bv-mare', 'cli-vetor', 'm-festival-mare', {
    interesseCliente: 'baixo', interesseParceiro: 'baixo', prioridade: 'baixa', responsavel: 'Igor Rodrigues',
    passos: [
      ['2025-11-15', 'identificada'],
      ['2025-12-02', 'em_analise'],
      ['2026-01-15', 'encerrada', 'Cota de patrocínio incompatível com o orçamento do ciclo.'],
    ],
  }),

  // ── Pulso Energia ───────────────────────────────────────────────────────
  candidatura('cand-pe-eco', 'cli-pulso', 'm-eco-parque', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'alta', responsavel: 'Ana Beltrão',
    passos: [
      ['2025-10-20', 'identificada'],
      ['2025-11-10', 'em_analise'],
      ['2025-12-01', 'recomendada'],
      ['2026-01-08', 'apresentada'],
      ['2026-02-02', 'em_negociacao'],
      ['2026-03-05', 'aprovada', 'Patrocínio da trilha certificada aprovado.'],
    ],
  }),
  candidatura('cand-pe-pixel', 'cli-pulso', 'm-arena-pixel', {
    interesseCliente: 'alto', interesseParceiro: 'alto', prioridade: 'media', responsavel: 'Ana Beltrão',
    passos: [
      ['2025-09-15', 'identificada'],
      ['2025-10-02', 'em_analise'],
      ['2025-10-28', 'recomendada'],
      ['2025-11-20', 'apresentada'],
      ['2025-12-05', 'em_negociacao'],
      ['2025-12-22', 'aprovada', 'Naming da arena para o primeiro semestre de 2026.'],
    ],
  }),
  candidatura('cand-pe-rota', 'cli-pulso', 'm-rota-livre', {
    interesseCliente: 'alto', interesseParceiro: 'medio', prioridade: 'alta', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-03-18', 'identificada'],
      ['2026-04-08', 'em_analise'],
      ['2026-05-06', 'recomendada'],
      ['2026-05-28', 'apresentada'],
      ['2026-06-30', 'em_negociacao', 'Proposta de eletropostos co-brandados em análise.'],
    ],
  }),
  candidatura('cand-pe-mare', 'cli-pulso', 'm-festival-mare', {
    interesseCliente: 'medio', interesseParceiro: 'alto', prioridade: 'media', responsavel: 'Ana Beltrão',
    passos: [
      ['2026-04-20', 'identificada'],
      ['2026-05-15', 'em_analise'],
      ['2026-06-12', 'recomendada'],
      ['2026-07-07', 'apresentada'],
    ],
  }),
  candidatura('cand-pe-liga', 'cli-pulso', 'm-liga-metropolitana', {
    interesseCliente: 'medio', interesseParceiro: 'desconhecido', prioridade: 'media', responsavel: 'Igor Rodrigues',
    passos: [
      ['2026-06-08', 'identificada'],
      ['2026-07-01', 'em_analise'],
    ],
  }),
  candidatura('cand-pe-trilhos', 'cli-pulso', 'm-trilhos', {
    interesseCliente: 'medio', interesseParceiro: 'medio', prioridade: 'baixa', responsavel: 'Ana Beltrão',
    passos: [
      ['2026-05-22', 'identificada'],
      ['2026-06-15', 'em_analise'],
      ['2026-07-10', 'recomendada'],
    ],
  }),
  candidatura('cand-pe-corpo', 'cli-pulso', 'm-corpo-livre', {
    interesseCliente: 'baixo', interesseParceiro: 'desconhecido', prioridade: 'baixa', responsavel: 'Luísa Prado',
    passos: [['2026-07-06', 'identificada']],
  }),
  candidatura('cand-pe-onda', 'cli-pulso', 'm-onda-surf', {
    interesseCliente: 'medio', interesseParceiro: 'baixo', prioridade: 'baixa', responsavel: 'Ana Beltrão',
    passos: [
      ['2026-02-10', 'identificada'],
      ['2026-03-05', 'em_analise'],
      ['2026-04-12', 'recusada_parceiro', 'Marca fechou exclusividade com outra empresa de energia.'],
    ],
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Avaliações de Score Card (respostas na ordem dos critérios do cliente)
// ─────────────────────────────────────────────────────────────────────────────

function avaliacao(
  candidaturaId: string,
  prefixoCriterio: string,
  valores: (RespostaValor | [RespostaValor, string])[],
  potencialDisruptivo: number,
  responsavel: string,
  atualizadoEm: string,
): Avaliacao {
  const respostas: Record<string, RespostaCriterio> = {};
  valores.forEach((v, i) => {
    const [valor, justificativa] = Array.isArray(v) ? v : [v, undefined];
    respostas[`${prefixoCriterio}${i + 1}`] = { valor, justificativa };
  });
  return { candidaturaId, respostas, potencialDisruptivo, responsavel, atualizadoEm };
}

export const AVALIACOES: Avaliacao[] = [
  // Aurora
  avaliacao('cand-ab-mare', 'ab', [
    ['sim', 'Pesquisa de público do festival: 78% na faixa 18–34.'],
    'sim', 'sim',
    ['sim', 'Edição 2026 com expansão para segunda praça.'],
    'sim', 'sim', 'sim', 'sim',
  ], 5, 'Marina Duarte', '2025-12-04T15:20:00'),
  avaliacao('cand-ab-onda', 'ab', ['sim', 'sim', 'sim', 'sim', 'nao', 'sim', 'sim', 'sim'], 4, 'Marina Duarte', '2026-01-26T11:00:00'),
  avaliacao('cand-ab-trilhos', 'ab', ['sim', 'sim', 'sim', 'nao', 'sim', 'nao', 'sim', 'sim'], 4, 'Igor Rodrigues', '2026-04-22T17:45:00'),
  avaliacao('cand-ab-cineja', 'ab', ['sim', 'nao', 'sim', 'sim', 'sim', 'sim', 'nao', 'sim'], 3, 'Marina Duarte', '2026-05-28T10:30:00'),
  avaliacao('cand-ab-voz', 'ab', ['sim', 'sim', 'nao', 'sim', 'nao', 'nao', 'nao_avaliado', 'sim'], 3, 'Luísa Prado', '2026-06-28T14:10:00'),
  avaliacao('cand-ab-baia', 'ab', ['sim', 'sim', 'nao_avaliado', 'sim', 'nao', 'nao_avaliado', 'nao_avaliado', 'sim'], 3, 'Igor Rodrigues', '2026-07-05T09:40:00'),
  avaliacao('cand-ab-cafe', 'ab', ['nao', 'nao', 'sim', 'nao_avaliado', 'sim', 'sim', 'nao_avaliado', 'sim'], 2, 'Luísa Prado', '2026-07-10T16:00:00'),
  avaliacao('cand-ab-radio', 'ab', ['nao', 'sim', 'nao', 'nao', 'sim', 'nao', 'sim', 'sim'], 2, 'Igor Rodrigues', '2026-04-15T13:00:00'),
  avaliacao('cand-ab-technave', 'ab', [['nao', 'Público majoritariamente corporativo.'], 'nao', 'sim', 'sim', 'nao', 'nao', 'nao', 'sim'], 3, 'Marina Duarte', '2026-03-08T10:00:00'),

  // Banco Vetor
  avaliacao('cand-bv-liga', 'bv', [
    'sim',
    ['sim', 'Liga com governança auditada e 8 anos de operação.'],
    'sim', 'sim', 'sim', 'sim', 'sim', 'nao',
  ], 4, 'Caio Nogueira', '2025-11-10T15:00:00'),
  avaliacao('cand-bv-atletica', 'bv', ['sim', 'sim', ['sim', 'Base de 120 mil estudantes cadastrados no circuito.'], 'sim', 'sim', 'nao', 'sim', 'sim'], 3, 'Caio Nogueira', '2026-04-20T11:30:00'),
  avaliacao('cand-bv-technave', 'bv', ['nao', 'sim', 'sim', 'nao', 'sim', 'sim', 'sim', 'sim'], 4, 'Igor Rodrigues', '2026-05-30T14:20:00'),
  avaliacao('cand-bv-cineja', 'bv', ['sim', 'sim', 'nao', 'nao', 'sim', 'sim', 'nao', 'sim'], 3, 'Luísa Prado', '2026-07-04T10:15:00'),
  avaliacao('cand-bv-rota', 'bv', ['sim', 'nao_avaliado', 'sim', 'nao', 'nao_avaliado', 'sim', 'sim', 'sim'], 4, 'Caio Nogueira', '2026-07-12T09:00:00'),
  avaliacao('cand-bv-voz', 'bv', ['sim', 'nao', 'sim', 'nao', 'nao', 'sim', 'sim', 'sim'], 3, 'Luísa Prado', '2026-04-28T16:40:00'),
  avaliacao('cand-bv-pixel', 'bv', ['sim', 'nao', 'nao', 'nao', ['nao', 'Histórico recente de disputas com jogadores.'], 'sim', 'sim', 'sim'], 3, 'Caio Nogueira', '2026-03-20T11:00:00'),

  // Pulso Energia
  avaliacao('cand-pe-eco', 'pe', [
    ['sim', 'Certificação ambiental renovada em 2025.'],
    'sim', 'sim', 'nao', 'sim', 'sim', 'sim',
  ], 4, 'Ana Beltrão', '2025-11-28T10:00:00'),
  avaliacao('cand-pe-pixel', 'pe', ['nao', 'sim', 'sim', 'sim', 'sim', 'sim', 'sim'], 5, 'Ana Beltrão', '2025-10-25T15:30:00'),
  avaliacao('cand-pe-rota', 'pe', ['sim', 'nao', 'sim', 'sim', 'sim', 'sim', 'nao'], 5, 'Igor Rodrigues', '2026-05-04T14:00:00'),
  avaliacao('cand-pe-mare', 'pe', ['nao', 'sim', 'sim', 'sim', 'sim', 'nao', 'sim'], 3, 'Ana Beltrão', '2026-06-10T11:20:00'),
  avaliacao('cand-pe-liga', 'pe', ['nao_avaliado', 'sim', 'sim', 'sim', 'nao_avaliado', 'nao', 'sim'], 3, 'Igor Rodrigues', '2026-07-08T17:00:00'),
  avaliacao('cand-pe-trilhos', 'pe', ['sim', 'nao', 'sim', 'nao', 'sim', 'sim', 'nao'], 4, 'Ana Beltrão', '2026-07-09T10:45:00'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Parcerias fechadas (cronograma)
// ─────────────────────────────────────────────────────────────────────────────

export const PARCERIAS: Parceria[] = [
  {
    id: 'p-mare',
    clienteId: 'cli-aurora',
    marcaId: 'm-festival-mare',
    nome: 'Ativação Verão Maré 2026',
    tipo: 'Patrocínio master + co-branding',
    status: 'ativa',
    dataInicio: '2026-01-10',
    dataFim: '2026-12-20',
    valorEstimado: 850_000,
    fases: [
      { nome: 'Planejamento', inicio: '2026-01-10', fim: '2026-02-15', concluida: true },
      { nome: 'Negociação de cotas', inicio: '2026-02-16', fim: '2026-03-20', concluida: true },
      { nome: 'Ativação em PDV', inicio: '2026-04-01', fim: '2026-07-31', concluida: false },
      { nome: 'Campanha de mídia', inicio: '2026-08-01', fim: '2026-10-31', concluida: false },
      { nome: 'Evento principal', inicio: '2026-11-01', fim: '2026-12-20', concluida: false },
    ],
    entregas: [
      { nome: 'Kit de materiais para PDV', responsavel: 'Marina Duarte', prazo: '2026-04-15', status: 'concluida' },
      { nome: 'Ativação em 120 pontos de venda', responsavel: 'Festival Maré', prazo: '2026-07-31', status: 'em_andamento' },
      { nome: 'Plano de mídia da campanha', responsavel: 'Igor Rodrigues', prazo: '2026-08-10', status: 'pendente' },
      { nome: 'Espaço Aurora no evento', responsavel: 'Festival Maré', prazo: '2026-11-20', status: 'pendente' },
    ],
    reunioes: [
      { titulo: 'Kick-off da parceria', data: '2026-01-15', participantes: ['Marina Duarte', 'Igor Rodrigues', 'Direção Festival Maré'] },
      { titulo: 'Checkpoint mensal — ativação PDV', data: '2026-06-30', participantes: ['Marina Duarte', 'Comercial Maré'] },
      { titulo: 'Alinhamento da campanha de mídia', data: '2026-07-20', participantes: ['Igor Rodrigues', 'Agência Aurora', 'Comercial Maré'] },
    ],
    pendencias: [
      { descricao: 'Aprovação das artes de PDV da segunda onda', responsavel: 'Aurora Bebidas', status: 'em_tratamento', prazo: '2026-07-25' },
      { descricao: 'Definição do line-up para o espaço Aurora', responsavel: 'Festival Maré', status: 'aberta', prazo: '2026-09-01' },
    ],
    indicadores: [
      { nome: 'PDVs ativados', unidade: 'pontos', medicoes: [{ periodo: 'Abr/26', valor: 32 }, { periodo: 'Mai/26', valor: 61 }, { periodo: 'Jun/26', valor: 87 }] },
      { nome: 'Alcance da campanha', unidade: 'milhões', medicoes: [{ periodo: 'Jun/26', valor: 4.2 }] },
    ],
    roi: [
      { investimento: 850_000, retornoEstimado: 2_400_000, data: '2026-01-20', responsavel: 'Marina Duarte' },
      { investimento: 850_000, retornoEstimado: 2_650_000, retornoRealizado: 1_180_000, data: '2026-07-01', responsavel: 'Igor Rodrigues' },
    ],
  },
  {
    id: 'p-onda',
    clienteId: 'cli-aurora',
    marcaId: 'm-onda-surf',
    nome: 'Cápsula Aurora × Onda',
    tipo: 'Co-branding de produto',
    status: 'ativa',
    dataInicio: '2026-03-10',
    dataFim: '2026-09-30',
    valorEstimado: 320_000,
    fases: [
      { nome: 'Desenvolvimento de produto', inicio: '2026-03-10', fim: '2026-05-20', concluida: true },
      { nome: 'Lançamento', inicio: '2026-06-01', fim: '2026-06-30', concluida: true },
      { nome: 'Varejo & mídia', inicio: '2026-07-01', fim: '2026-09-30', concluida: false },
    ],
  },
  {
    id: 'p-trilhos',
    clienteId: 'cli-aurora',
    marcaId: 'm-trilhos',
    nome: 'Circuito Cultura Urbana',
    tipo: 'Patrocínio de circuito',
    status: 'planejada',
    dataInicio: '2026-09-01',
    dataFim: '2026-12-15',
    valorEstimado: 180_000,
    fases: [
      { nome: 'Formalização', inicio: '2026-09-01', fim: '2026-09-30', concluida: false },
      { nome: 'Circuito em 4 capitais', inicio: '2026-10-01', fim: '2026-12-15', concluida: false },
    ],
  },
  {
    id: 'p-liga',
    clienteId: 'cli-vetor',
    marcaId: 'm-liga-metropolitana',
    nome: 'Naming rights — Temporada 2026',
    tipo: 'Naming rights',
    status: 'ativa',
    dataInicio: '2026-02-01',
    dataFim: '2026-11-30',
    valorEstimado: 1_200_000,
    fases: [
      { nome: 'Formalização', inicio: '2026-02-01', fim: '2026-02-28', concluida: true },
      { nome: 'Ativação nas arenas', inicio: '2026-03-01', fim: '2026-06-30', concluida: true },
      { nome: 'Playoffs & hospitality', inicio: '2026-07-01', fim: '2026-09-30', concluida: false },
      { nome: 'Balanço e renovação', inicio: '2026-10-01', fim: '2026-11-30', concluida: false },
    ],
    entregas: [
      { nome: 'Aplicação da marca nas 12 arenas', responsavel: 'Liga Metropolitana', prazo: '2026-03-31', status: 'concluida' },
      { nome: 'Programa de hospitality dos playoffs', responsavel: 'Caio Nogueira', prazo: '2026-08-15', status: 'em_andamento' },
      { nome: 'Relatório de exposição de marca', responsavel: 'Liga Metropolitana', prazo: '2026-10-15', status: 'pendente' },
    ],
    reunioes: [
      { titulo: 'Kick-off naming rights', data: '2026-02-05', participantes: ['Caio Nogueira', 'Diretoria da Liga'] },
      { titulo: 'Checkpoint pré-playoffs', data: '2026-06-24', participantes: ['Caio Nogueira', 'Marketing Vetor', 'Liga'] },
    ],
    pendencias: [
      { descricao: 'Lista de convidados do camarote Vetor', responsavel: 'Banco Vetor', status: 'aberta', prazo: '2026-07-30' },
    ],
    indicadores: [
      { nome: 'Contas abertas via campanha', unidade: 'contas', medicoes: [{ periodo: 'Mar/26', valor: 3400 }, { periodo: 'Mai/26', valor: 9100 }, { periodo: 'Jun/26', valor: 14200 }] },
      { nome: 'Audiência média por rodada', unidade: 'mil', medicoes: [{ periodo: 'Abr/26', valor: 320 }, { periodo: 'Jun/26', valor: 410 }] },
    ],
    roi: [
      { investimento: 1_200_000, retornoEstimado: 3_100_000, retornoRealizado: 1_450_000, data: '2026-06-30', responsavel: 'Caio Nogueira' },
    ],
  },
  {
    id: 'p-atletica',
    clienteId: 'cli-vetor',
    marcaId: 'm-atletica-nacional',
    nome: 'Programa Universitário Vetor',
    tipo: 'Patrocínio + geração de contas',
    status: 'planejada',
    dataInicio: '2026-08-01',
    dataFim: '2026-12-15',
    valorEstimado: 450_000,
    fases: [
      { nome: 'Onboarding das atléticas', inicio: '2026-08-01', fim: '2026-08-31', concluida: false },
      { nome: 'Circuito de jogos', inicio: '2026-09-01', fim: '2026-11-30', concluida: false },
      { nome: 'Final nacional', inicio: '2026-12-01', fim: '2026-12-15', concluida: false },
    ],
  },
  {
    id: 'p-eco',
    clienteId: 'cli-pulso',
    marcaId: 'm-eco-parque',
    nome: 'Trilha de Energia Limpa',
    tipo: 'Patrocínio de propriedade',
    status: 'ativa',
    dataInicio: '2026-04-01',
    dataFim: '2026-10-31',
    valorEstimado: 260_000,
    fases: [
      { nome: 'Instalação e sinalização', inicio: '2026-04-01', fim: '2026-05-15', concluida: true },
      { nome: 'Temporada de visitação', inicio: '2026-05-16', fim: '2026-09-30', concluida: false },
      { nome: 'Encerramento e medição', inicio: '2026-10-01', fim: '2026-10-31', concluida: false },
    ],
    entregas: [
      { nome: 'Sinalização da trilha com marca Pulso', responsavel: 'EcoParque', prazo: '2026-05-10', status: 'concluida' },
      { nome: 'Estação de recarga solar', responsavel: 'Pulso Energia', prazo: '2026-08-20', status: 'em_andamento' },
    ],
    reunioes: [
      { titulo: 'Kick-off Trilha de Energia Limpa', data: '2026-04-08', participantes: ['Ana Beltrão', 'Gestão EcoParque'] },
    ],
    pendencias: [
      { descricao: 'Laudo ambiental da estação de recarga', responsavel: 'Pulso Energia', status: 'em_tratamento', prazo: '2026-08-01' },
    ],
    indicadores: [
      { nome: 'Visitantes impactados', unidade: 'mil', medicoes: [{ periodo: 'Mai/26', valor: 38 }, { periodo: 'Jun/26', valor: 55 }] },
    ],
    roi: [
      { investimento: 260_000, retornoEstimado: 700_000, data: '2026-04-05', responsavel: 'Ana Beltrão' },
    ],
  },
  {
    id: 'p-pixel',
    clienteId: 'cli-pulso',
    marcaId: 'm-arena-pixel',
    nome: 'Arena Pulso E-sports',
    tipo: 'Naming rights',
    status: 'concluida',
    dataInicio: '2026-01-15',
    dataFim: '2026-06-30',
    valorEstimado: 390_000,
    fases: [
      { nome: 'Formalização', inicio: '2026-01-15', fim: '2026-02-10', concluida: true },
      { nome: 'Temporada de campeonatos', inicio: '2026-02-11', fim: '2026-06-10', concluida: true },
      { nome: 'Balanço final', inicio: '2026-06-11', fim: '2026-06-30', concluida: true },
    ],
  },
];
