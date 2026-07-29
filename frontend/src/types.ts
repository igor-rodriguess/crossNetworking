// Modelo de domínio do frontend — espelha o vocabulário do WAD (seções 6 e 7),
// simplificado para a demo offline com dados mockados.

export type RespostaValor = 'sim' | 'nao' | 'nao_avaliado';

export type Nivel = 'alto' | 'medio' | 'baixo';

export type Prioridade = 'alta' | 'media' | 'baixa';

export type StatusCandidatura =
  | 'identificada'
  | 'em_analise'
  | 'recomendada'
  | 'apresentada'
  | 'em_negociacao'
  | 'aprovada'
  | 'stand_by'
  | 'recusada_cliente'
  | 'recusada_parceiro'
  | 'encerrada';

export type StatusParceria = 'planejada' | 'ativa' | 'concluida';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  persona: string | null;
}

// Usuários internos e personas (RF002 / WAD 5.1)
export type Persona = 'estrategista' | 'gestor_contas' | 'coordenador' | 'administrador';

export interface UsuarioInterno {
  id: string;
  nome: string;
  email: string;
  persona: Persona;
  ativo: boolean;
  criadoEm: string; // ISO date
}

export interface Cliente {
  id: string;
  nome: string;
  sigla: string;
  segmento: string;
  modeloContratacao: string;
  responsavel: string;
  desde: string; // ISO date
}

export interface Criterio {
  id: string;
  clienteId: string;
  nome: string;
  descricao: string;
  pesoSim: number;
  pesoNao: number;
  ordem: number;
  obrigatorio: boolean;
  ativo: boolean;
}

export interface Marca {
  id: string;
  nome: string;
  categoria: string;
  territorio: string;
  publico: string;
  descricao: string;
}

// ─── Base de Relacionamentos (Partes — WAD 7.3.4) ───────────────────────────

export type PapelParte =
  | 'cliente'
  | 'parceiro'
  | 'parceiro_potencial'
  | 'patrocinador'
  | 'artista'
  | 'atleta'
  | 'veiculo_midia';

export interface AtivoParte {
  id?: string;
  nome: string;
  tipo: string;
  descricao?: string;
  valorReferencia?: number;
  moeda?: string;
}

export interface CanalMidia {
  id?: string;
  canal: string;
  alcance: string;
  url?: string;
}

export interface PerfilEstrategicoParte {
  numeroVersao: number;
  resumo?: string;
  posicionamento?: string;
  objetivos?: string;
  desafios?: string;
}

export interface ContatoParte {
  nome: string;
  cargo: string;
  email: string;
  principal: boolean;
}

export interface Parte {
  id: string;
  tipo: 'organizacao' | 'pessoa';
  nome: string;
  categoria: string;
  territorio: string;
  publico: string;
  descricao: string;
  papeis: PapelParte[];
  pracas: string[];
  ativos: AtivoParte[];
  canais: CanalMidia[];
  perfilEstrategico?: PerfilEstrategicoParte;
  contatos: ContatoParte[];
  cadastradaEm: string; // ISO date
}

// ─── Artistas e Talentos (WAD 7.3.25 / RF015) ────────────────────────────────

export interface EventoTurne {
  cidade: string;
  local: string;
  data: string; // ISO date
}

export interface Turne {
  nome: string;
  inicio: string;
  fim: string;
  eventos: EventoTurne[];
}

export interface BigMoment {
  titulo: string;
  data: string; // ISO date
  descricao: string;
  oportunidade: string; // leitura estratégica: por que isso abre janela para marcas
}

export interface EventoAgenda {
  titulo: string;
  data: string; // ISO date
  tipo: 'show' | 'lancamento' | 'festival' | 'midia' | 'outro';
  local?: string;
}

export interface PerfilArtista {
  parteId: string; // aponta para a Parte (pessoa)
  representacao: string;
  turnes: Turne[];
  bigMoments: BigMoment[];
  agenda: EventoAgenda[];
}

// ─── Projetos, Briefings e Frentes (WAD 7.3.10) ─────────────────────────────

export type OrigemDemanda = 'briefing_cliente' | 'oportunidade_cross';
export type StatusProjeto = 'planejamento' | 'em_andamento' | 'concluido';

// Ciclo do projeto (README: briefing → planejamento → Crossability → Paper →
// Score Card → implementação → acompanhamento)
export type FaseProjeto =
  | 'briefing'
  | 'planejamento'
  | 'crossability'
  | 'paper'
  | 'score_card'
  | 'implementacao'
  | 'acompanhamento';

export interface VersaoBriefing {
  versao: number;
  status: 'vigente' | 'substituida';
  data: string; // ISO date
  responsavel: string;
  conteudo: string;
}

export interface PlanejamentoEstrategico {
  diagnostico: string;
  territorios: string[];
  oportunidades: string;
}

export interface Projeto {
  id: string;
  clienteId: string;
  nome: string;
  objetivo: string;
  produto: string;
  origem: OrigemDemanda;
  status: StatusProjeto;
  faseAtual: FaseProjeto;
  dataInicio: string;
  atualizadoEm: string; // ISO date
  prazoEstimado: string; // ex.: "Q4 2026"
  valorPotencial?: number;
  responsaveis: string[];
  briefings: VersaoBriefing[];
  planejamento: PlanejamentoEstrategico;
}

export type StatusFrente = 'aberta' | 'em_andamento' | 'encerrada';

export interface Frente {
  id: string;
  projetoId: string;
  nome: string;
  territorio: string;
  objetivo: string;
  status: StatusFrente;
}

// ─── Crossability (WAD 7.3.11) ───────────────────────────────────────────────

export type NivelCompat = 'alta' | 'media' | 'baixa';

// Perfil por dimensão: quanto o cliente/parceiro TEM hoje em cada eixo.
// Usado para a leitura de complementaridade — onde o parceiro é forte e o
// cliente é fraco, a parceria preenche uma lacuna.
export interface PerfilDimensoes {
  publicos: NivelCompat;
  territorios: NivelCompat;
  ativos: NivelCompat;
  sinergias: NivelCompat;
  fit: NivelCompat;
  momento: NivelCompat;
}

export interface AnaliseCrossability {
  candidaturaId: string;
  numeroVersao: number;
  publicos: NivelCompat;
  territorios: NivelCompat;
  ativos: NivelCompat;
  sinergias: NivelCompat;
  fit: NivelCompat;
  momento: NivelCompat;
  racional: string;
  recomendacao: 'recomendada' | 'em_estudo' | 'nao_recomendada';
  responsavel: string;
  data: string; // ISO date
  // Complementaridade (opcionais — análises antigas continuam válidas):
  forcaCliente?: PerfilDimensoes; // o que o cliente já tem hoje
  forcaParceiro?: PerfilDimensoes; // o que o parceiro oferece
}

// ─── Análise Crossability fiel à metodologia — 3 dimensões, item a item ──────
// Objetivos (onde a marca quer chegar) · Ativos (o que pode oferecer) ·
// Consumidores (o público que tem/quer). Match sai da análise item a item.

export type DimensaoCross = 'objetivos' | 'ativos' | 'consumidores';

// Veredito da análise de um item específico da parceria.
//   casa       — alinhado com o outro lado (mesmo objetivo/público)
//   complementa— preenche/soma ao outro lado (o parceiro tem o que o cliente busca)
//   nao_casa   — não contribui para a parceria
export type VereditoItem = 'casa' | 'complementa' | 'nao_casa';

export interface ItemCross {
  id: string;
  descricao: string; // ex.: "Turnê Maré Cheia (18 datas)"
  origem: 'cliente' | 'parceiro'; // de quem é o item
  veredito?: VereditoItem;
  nota?: string; // racional livre da análise
}

// Análise das 3 dimensões para uma candidatura (coexiste com AnaliseCrossability).
export interface AnaliseTriade {
  candidaturaId: string;
  objetivos: ItemCross[];
  ativos: ItemCross[];
  consumidores: ItemCross[];
  responsavel: string;
  atualizadoEm: string; // ISO datetime
}

// ─── Paper e Validações (WAD 7.3.12) ─────────────────────────────────────────

export type StatusVersaoPaper = 'rascunho' | 'em_revisao' | 'vigente' | 'substituida';

export interface VersaoPaper {
  numero: number;
  status: StatusVersaoPaper;
  estrategia: string;
  criadoEm: string;
  responsavel: string;
}

export interface ValidacaoPaper {
  tipo: 'interna' | 'cliente';
  status: 'aprovada' | 'pendente' | 'ajustes_solicitados';
  data: string;
  responsavel: string;
  versaoNumero: number;
}

export interface Paper {
  id: string;
  frenteId: string;
  titulo: string;
  versoes: VersaoPaper[];
  recomendacoes: { candidaturaId: string; ordem: number; justificativa: string }[];
  validacoes: ValidacaoPaper[];
}

// ─── Candidaturas ────────────────────────────────────────────────────────────

export interface Movimentacao {
  data: string; // ISO date
  de: StatusCandidatura | null;
  para: StatusCandidatura;
  responsavel: string;
  justificativa?: string;
}

export interface Candidatura {
  id: string;
  clienteId: string;
  frenteId: string;
  marcaId: string;
  status: StatusCandidatura;
  interesseCliente: Nivel;
  interesseParceiro: Nivel | 'desconhecido';
  prioridade: Prioridade;
  dataEntrada: string; // ISO date
  observacoes?: string;
  historico: Movimentacao[];
}

export interface RespostaCriterio {
  valor: RespostaValor;
  justificativa?: string;
}

export interface Avaliacao {
  candidaturaId: string;
  respostas: Record<string, RespostaCriterio>; // criterioId -> resposta
  potencialDisruptivo: number; // 1..5
  responsavel: string;
  atualizadoEm: string; // ISO datetime
}

export interface FaseParceria {
  nome: string;
  inicio: string; // ISO date
  fim: string; // ISO date
  concluida: boolean;
}

// ─── Execução e Acompanhamento (WAD 7.3.17–7.3.18) ──────────────────────────

export interface Entrega {
  nome: string;
  responsavel: string;
  prazo: string; // ISO date
  status: 'pendente' | 'em_andamento' | 'concluida';
}

export interface Reuniao {
  titulo: string;
  data: string; // ISO date
  participantes: string[];
}

export interface Pendencia {
  descricao: string;
  responsavel: string;
  status: 'aberta' | 'em_tratamento' | 'resolvida';
  prazo?: string;
}

export interface Indicador {
  nome: string;
  unidade: string;
  medicoes: { periodo: string; valor: number }[];
}

export interface CalculoRoi {
  investimento: number;
  retornoEstimado: number;
  retornoRealizado?: number;
  data: string;
  responsavel: string;
}

export interface Parceria {
  id: string;
  clienteId: string;
  marcaId: string;
  candidaturaId?: string;
  nome: string;
  tipo: string;
  status: StatusParceria;
  dataInicio: string;
  dataFim: string;
  valorEstimado?: number;
  fases: FaseParceria[];
  entregas?: Entrega[];
  reunioes?: Reuniao[];
  pendencias?: Pendencia[];
  indicadores?: Indicador[];
  roi?: CalculoRoi[];
}
