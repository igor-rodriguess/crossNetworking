import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as authApi from '../api/auth';
import * as partesApi from '../api/partes.api';
import { aoMudarSessao, definirSessao, type Sessao } from '../api/sessao';
import { AVALIACOES, CANDIDATURAS, CLIENTES, CRITERIOS, MARCAS, PARCERIAS } from '../data/mock';
import { ANALISES_CROSSABILITY, ANALISES_TRIADE, FRENTES, PAPERS, PARTES, PERFIS_ARTISTAS, PROJETOS } from '../data/mock-plataforma';
import type {
  AnaliseCrossability,
  AnaliseTriade,
  AtivoParte,
  Avaliacao,
  BigMoment,
  Candidatura,
  Cliente,
  Criterio,
  DimensaoCross,
  ItemCross,
  VereditoItem,
  EventoAgenda,
  EventoTurne,
  Nivel,
  Paper,
  Parceria,
  Parte,
  PerfilArtista,
  Persona,
  Prioridade,
  RespostaValor,
  StatusCandidatura,
  Turne,
  Usuario,
  UsuarioInterno,
  ValidacaoPaper,
} from '../types';

// Sessão guardada no localStorage (tokens + expiração). O usuário fica em
// `usuario`; aqui só o material que o cofre em memória (api/sessao) precisa
// reidratar após um refresh de página.
type SessaoPersistida = Sessao;

// Equipe interna inicial (RF002) — os mesmos responsáveis usados na operação
const USUARIOS_INICIAIS: UsuarioInterno[] = [
  { id: 'u-igor', nome: 'Igor Rodrigues', email: 'igor@crossnetworking.com.br', persona: 'administrador', ativo: true, criadoEm: '2025-09-01' },
  { id: 'u-marina', nome: 'Marina Duarte', email: 'marina.duarte@crossnetworking.com.br', persona: 'gestor_contas', ativo: true, criadoEm: '2025-09-01' },
  { id: 'u-caio', nome: 'Caio Nogueira', email: 'caio.nogueira@crossnetworking.com.br', persona: 'gestor_contas', ativo: true, criadoEm: '2025-09-15' },
  { id: 'u-ana', nome: 'Ana Beltrão', email: 'ana.beltrao@crossnetworking.com.br', persona: 'coordenador', ativo: true, criadoEm: '2025-10-01' },
  { id: 'u-luisa', nome: 'Luísa Prado', email: 'luisa.prado@crossnetworking.com.br', persona: 'estrategista', ativo: true, criadoEm: '2026-01-10' },
];

interface EstadoPlataforma {
  usuario: Usuario | null;
  sessao: SessaoPersistida | null;
  autenticando: boolean;
  clienteAtivoId: string;
  clientes: Cliente[];
  criterios: Criterio[];
  candidaturas: Candidatura[];
  avaliacoes: Avaliacao[];
  analises: AnaliseCrossability[];
  analisesTriade: AnaliseTriade[];
  perfisArtistas: PerfilArtista[];
  partes: Parte[];
  papers: Paper[];
  usuarios: UsuarioInterno[];
  parcerias: Parceria[];

  // Autenticação real (RF001 — /v1/auth). Lança ErroApi em falha.
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;

  setClienteAtivo: (clienteId: string) => void;
  adicionarCliente: (dados: Pick<Cliente, 'nome' | 'sigla' | 'segmento' | 'modeloContratacao' | 'responsavel'>) => void;

  // Critérios & pesos (RF031)
  atualizarCriterio: (id: string, mudancas: Partial<Criterio>) => void;
  adicionarCriterio: (clienteId: string, nome: string, descricao: string, pesoSim: number) => void;
  removerCriterio: (id: string) => void;
  moverCriterio: (id: string, direcao: -1 | 1) => void;

  // Score Card (RF032 — cálculo determinístico na engine, RN023)
  responder: (candidaturaId: string, criterioId: string, valor: RespostaValor) => void;
  justificarResposta: (candidaturaId: string, criterioId: string, justificativa: string) => void;
  setPotencialDisruptivo: (candidaturaId: string, potencial: number) => void;

  // Equipe & acessos (RF002 — criar conta, persona, ativar/desativar; RN006)
  adicionarUsuario: (nome: string, email: string, persona: Persona) => void;
  alternarAtivoUsuario: (id: string) => void;
  mudarPersonaUsuario: (id: string, persona: Persona) => void;
  removerUsuario: (id: string) => void;

  // Execução (RF039/RF042 — avançar entrega, resolver pendência)
  avancarEntrega: (parceriaId: string, nomeEtapa: string) => void;
  avancarPendencia: (parceriaId: string, descricao: string) => void;

  // Edição de parceria (status, vigência, fases) — RF de acompanhamento
  atualizarParceria: (parceriaId: string, mudancas: Partial<Pick<Parceria, 'status' | 'dataInicio' | 'dataFim' | 'nome' | 'tipo'>>) => void;
  alternarFaseConcluida: (parceriaId: string, nomeFase: string) => void;

  // Registrar validação do Paper (interna/cliente) — destrava o fluxo do Score Card (RN022)
  registrarValidacaoPaper: (paperId: string, tipo: 'interna' | 'cliente', status: ValidacaoPaper['status'], responsavel: string) => void;

  // Base de Relacionamentos (RF004–RF008) — integrada à API
  partesCarregando: boolean;
  carregarPartes: () => Promise<void>;
  carregarParte: (id: string) => Promise<void>;
  adicionarParte: (dados: { tipo: Parte['tipo']; nome: string; categoria: string; papel?: string }) => Promise<void>;
  adicionarContato: (parteId: string, nome: string, cargo: string, email: string) => Promise<void>;
  // Ativos/canais ainda não têm endpoint no backend de Partes — locais por ora.
  adicionarAtivoParte: (parteId: string, ativo: AtivoParte) => void;
  removerAtivoParte: (parteId: string, nomeAtivo: string) => void;

  // Funil (RF025 — nova candidatura · RF026 — movimentação com histórico, RN017)
  adicionarCandidatura: (dados: {
    clienteId: string;
    frenteId: string;
    marcaId: string;
    prioridade: Prioridade;
    interesseCliente: Nivel;
  }) => void;
  moverCandidatura: (candidaturaId: string, novoStatus: StatusCandidatura, justificativa?: string) => void;

  // Crossability (RF027 — versões nunca sobrescrevem anteriores, RN019)
  atualizarAnalise: (candidaturaId: string, mudancas: Partial<AnaliseCrossability>) => void;
  novaVersaoAnalise: (candidaturaId: string) => void;

  // Análise triádica (Objetivos · Ativos · Consumidores — metodologia fiel)
  adicionarItemTriade: (candidaturaId: string, dimensao: DimensaoCross, item: Omit<ItemCross, 'id'>) => void;
  removerItemTriade: (candidaturaId: string, dimensao: DimensaoCross, itemId: string) => void;
  atualizarItemTriade: (candidaturaId: string, dimensao: DimensaoCross, itemId: string, mudancas: Partial<ItemCross>) => void;
  setVereditoItem: (candidaturaId: string, dimensao: DimensaoCross, itemId: string, veredito: VereditoItem) => void;

  // Artistas (RF015 — agenda, Big Moments e turnês)
  adicionarEventoAgenda: (parteId: string, evento: EventoAgenda) => void;
  removerEventoAgenda: (parteId: string, titulo: string, data: string) => void;
  adicionarBigMoment: (parteId: string, momento: BigMoment) => void;
  editarBigMoment: (parteId: string, tituloOriginal: string, dataOriginal: string, momento: BigMoment) => void;
  removerBigMoment: (parteId: string, titulo: string, data: string) => void;
  adicionarTurne: (parteId: string, turne: Turne) => void;
  removerTurne: (parteId: string, nome: string) => void;
  adicionarEventoTurne: (parteId: string, turneNome: string, evento: EventoTurne) => void;
  removerEventoTurne: (parteId: string, turneNome: string, cidade: string, data: string) => void;

  restaurarDemo: () => void;
}

function garantirAvaliacao(avaliacoes: Avaliacao[], candidaturaId: string, responsavel: string): Avaliacao[] {
  if (avaliacoes.some((a) => a.candidaturaId === candidaturaId)) return avaliacoes;
  return [
    ...avaliacoes,
    {
      candidaturaId,
      respostas: {},
      potencialDisruptivo: 1,
      responsavel,
      atualizadoEm: new Date().toISOString(),
    },
  ];
}

export const useStore = create<EstadoPlataforma>()(
  persist(
    (set) => ({
      usuario: null,
      sessao: null,
      autenticando: false,
      clienteAtivoId: CLIENTES[0].id,
      clientes: CLIENTES,
      criterios: CRITERIOS,
      candidaturas: CANDIDATURAS,
      avaliacoes: AVALIACOES,
      analises: ANALISES_CROSSABILITY,
      analisesTriade: ANALISES_TRIADE,
      perfisArtistas: PERFIS_ARTISTAS,
      partes: PARTES,
      partesCarregando: false,
      papers: PAPERS,
      usuarios: USUARIOS_INICIAIS,
      parcerias: PARCERIAS,

      // Login real: autentica no backend, guarda usuário + sessão. Propaga o
      // ErroApi (mensagem PT-BR) para a tela tratar. `autenticando` cobre o
      // estado de carregando do botão.
      login: async (email, senha) => {
        set({ autenticando: true });
        try {
          const { usuario, sessao } = await authApi.login(email, senha);
          set({ usuario, sessao, autenticando: false });
        } catch (e) {
          set({ autenticando: false });
          throw e;
        }
      },
      logout: async () => {
        set({ usuario: null, sessao: null });
        await authApi.logout(); // revoga o refresh no servidor (best-effort)
      },

      setClienteAtivo: (clienteId) => set({ clienteAtivoId: clienteId }),

      adicionarCliente: (dados) =>
        set((s) => {
          const novo: Cliente = {
            id: `cli-${Date.now()}`,
            nome: dados.nome,
            sigla: dados.sigla.toUpperCase().slice(0, 3),
            segmento: dados.segmento,
            modeloContratacao: dados.modeloContratacao,
            responsavel: dados.responsavel,
            desde: new Date().toISOString().slice(0, 10),
          };
          // Já entra como cliente ativo, para o usuário configurar o modelo em seguida
          return { clientes: [...s.clientes, novo], clienteAtivoId: novo.id };
        }),

      atualizarCriterio: (id, mudancas) =>
        set((s) => ({
          criterios: s.criterios.map((c) => (c.id === id ? { ...c, ...mudancas } : c)),
        })),

      adicionarCriterio: (clienteId, nome, descricao, pesoSim) =>
        set((s) => {
          const doCliente = s.criterios.filter((c) => c.clienteId === clienteId);
          const novo: Criterio = {
            id: `custom-${Date.now()}`,
            clienteId,
            nome,
            descricao,
            pesoSim,
            pesoNao: 0,
            ordem: doCliente.length + 1,
            obrigatorio: false,
            ativo: true,
          };
          return { criterios: [...s.criterios, novo] };
        }),

      removerCriterio: (id) =>
        set((s) => ({ criterios: s.criterios.filter((c) => c.id !== id) })),

      moverCriterio: (id, direcao) =>
        set((s) => {
          const alvo = s.criterios.find((c) => c.id === id);
          if (!alvo) return s;
          const doCliente = s.criterios
            .filter((c) => c.clienteId === alvo.clienteId)
            .sort((a, b) => a.ordem - b.ordem);
          const idx = doCliente.findIndex((c) => c.id === id);
          const vizinho = doCliente[idx + direcao];
          if (!vizinho) return s;
          return {
            criterios: s.criterios.map((c) => {
              if (c.id === alvo.id) return { ...c, ordem: vizinho.ordem };
              if (c.id === vizinho.id) return { ...c, ordem: alvo.ordem };
              return c;
            }),
          };
        }),

      responder: (candidaturaId, criterioId, valor) =>
        set((s) => {
          const base = garantirAvaliacao(s.avaliacoes, candidaturaId, s.usuario?.nome ?? 'Equipe Cross');
          return {
            avaliacoes: base.map((a) =>
              a.candidaturaId === candidaturaId
                ? {
                    ...a,
                    respostas: {
                      ...a.respostas,
                      [criterioId]: { ...a.respostas[criterioId], valor },
                    },
                    responsavel: s.usuario?.nome ?? a.responsavel,
                    atualizadoEm: new Date().toISOString(),
                  }
                : a,
            ),
          };
        }),

      justificarResposta: (candidaturaId, criterioId, justificativa) =>
        set((s) => ({
          avaliacoes: s.avaliacoes.map((a) =>
            a.candidaturaId === candidaturaId
              ? {
                  ...a,
                  respostas: {
                    ...a.respostas,
                    [criterioId]: {
                      valor: a.respostas[criterioId]?.valor ?? 'nao_avaliado',
                      justificativa,
                    },
                  },
                }
              : a,
          ),
        })),

      setPotencialDisruptivo: (candidaturaId, potencial) =>
        set((s) => {
          const base = garantirAvaliacao(s.avaliacoes, candidaturaId, s.usuario?.nome ?? 'Equipe Cross');
          return {
            avaliacoes: base.map((a) =>
              a.candidaturaId === candidaturaId
                ? {
                    ...a,
                    potencialDisruptivo: Math.min(5, Math.max(1, potencial)),
                    atualizadoEm: new Date().toISOString(),
                  }
                : a,
            ),
          };
        }),

      adicionarUsuario: (nome, email, persona) =>
        set((s) => {
          // RN006: e-mail único, sem diferenciar maiúsculas/minúsculas
          const normalizado = email.trim().toLowerCase();
          if (s.usuarios.some((u) => u.email.toLowerCase() === normalizado)) return s;
          return {
            usuarios: [
              ...s.usuarios,
              {
                id: `u-${Date.now()}`,
                nome: nome.trim(),
                email: normalizado,
                persona,
                ativo: true,
                criadoEm: new Date().toISOString().slice(0, 10),
              },
            ],
          };
        }),

      alternarAtivoUsuario: (id) =>
        set((s) => ({
          usuarios: s.usuarios.map((u) => (u.id === id ? { ...u, ativo: !u.ativo } : u)),
        })),

      mudarPersonaUsuario: (id, persona) =>
        set((s) => ({
          usuarios: s.usuarios.map((u) => (u.id === id ? { ...u, persona } : u)),
        })),

      removerUsuario: (id) =>
        set((s) => ({ usuarios: s.usuarios.filter((u) => u.id !== id) })),

      avancarEntrega: (parceriaId, nomeEtapa) =>
        set((s) => ({
          parcerias: s.parcerias.map((p) =>
            p.id !== parceriaId
              ? p
              : {
                  ...p,
                  entregas: p.entregas?.map((e) =>
                    e.nome !== nomeEtapa
                      ? e
                      : {
                          ...e,
                          status:
                            e.status === 'pendente'
                              ? 'em_andamento'
                              : e.status === 'em_andamento'
                                ? 'concluida'
                                : 'concluida',
                        },
                  ),
                },
          ),
        })),

      avancarPendencia: (parceriaId, descricao) =>
        set((s) => ({
          parcerias: s.parcerias.map((p) =>
            p.id !== parceriaId
              ? p
              : {
                  ...p,
                  pendencias: p.pendencias?.map((pend) =>
                    pend.descricao !== descricao
                      ? pend
                      : {
                          ...pend,
                          status:
                            pend.status === 'aberta'
                              ? 'em_tratamento'
                              : pend.status === 'em_tratamento'
                                ? 'resolvida'
                                : 'resolvida',
                        },
                  ),
                },
          ),
        })),

      atualizarParceria: (parceriaId, mudancas) =>
        set((s) => ({
          parcerias: s.parcerias.map((p) => (p.id === parceriaId ? { ...p, ...mudancas } : p)),
        })),

      alternarFaseConcluida: (parceriaId, nomeFase) =>
        set((s) => ({
          parcerias: s.parcerias.map((p) =>
            p.id !== parceriaId
              ? p
              : {
                  ...p,
                  fases: p.fases.map((f) =>
                    f.nome === nomeFase ? { ...f, concluida: !f.concluida } : f,
                  ),
                },
          ),
        })),

      registrarValidacaoPaper: (paperId, tipo, status, responsavel) =>
        set((s) => ({
          papers: s.papers.map((paper) => {
            if (paper.id !== paperId) return paper;
            // Aplica sobre a última versão do Paper
            const versaoNumero = paper.versoes[paper.versoes.length - 1]?.numero ?? 1;
            const hoje = new Date().toISOString().slice(0, 10);
            const existe = paper.validacoes.some((v) => v.tipo === tipo);
            const validacoes = existe
              ? paper.validacoes.map((v) => (v.tipo === tipo ? { ...v, status, data: hoje, responsavel, versaoNumero } : v))
              : [...paper.validacoes, { tipo, status, data: hoje, responsavel, versaoNumero }];
            return { ...paper, validacoes };
          }),
        })),

      // Carrega a base de Partes do backend (RF004/RF008). Substitui o seed
      // mock por dados reais — a partir daqui `partes` reflete a API.
      carregarPartes: async () => {
        set({ partesCarregando: true });
        try {
          const { itens } = await partesApi.listarPartes({ porPagina: 100 });
          set({ partes: itens, partesCarregando: false });
        } catch (e) {
          set({ partesCarregando: false });
          throw e;
        }
      },

      // Recarrega uma Parte completa (detalhe + papéis + contatos) e a mescla
      // na lista — usado ao abrir o detalhe.
      carregarParte: async (id) => {
        const completa = await partesApi.obterParte(id);
        set((s) => ({
          partes: s.partes.some((p) => p.id === id)
            ? s.partes.map((p) => (p.id === id ? completa : p))
            : [completa, ...s.partes],
        }));
      },

      adicionarParte: async ({ tipo, nome, categoria, papel }) => {
        const criada = await partesApi.criarParte({ tipo, nome, categoria });
        if (papel) {
          await partesApi.adicionarPapel(criada.id, papel);
          // Reflete o papel efetivamente guardado (o backend normaliza, ex.:
          // parceiro_potencial → parceiro).
          criada.papeis = [partesApi.papelParaBackend(papel) as Parte['papeis'][number]];
        }
        set((s) => ({ partes: [criada, ...s.partes] }));
      },

      adicionarContato: async (parteId, nome, cargo, email) => {
        const contato = await partesApi.adicionarContato(parteId, { nome, cargo, email });
        set((s) => ({
          partes: s.partes.map((p) =>
            p.id !== parteId ? p : { ...p, contatos: [...p.contatos, contato] },
          ),
        }));
      },

      adicionarAtivoParte: (parteId, ativo) =>
        set((s) => ({
          partes: s.partes.map((p) => (p.id === parteId ? { ...p, ativos: [...p.ativos, ativo] } : p)),
        })),

      removerAtivoParte: (parteId, nomeAtivo) =>
        set((s) => ({
          partes: s.partes.map((p) =>
            p.id === parteId ? { ...p, ativos: p.ativos.filter((a) => a.nome !== nomeAtivo) } : p,
          ),
        })),

      adicionarCandidatura: ({ clienteId, frenteId, marcaId, prioridade, interesseCliente }) =>
        set((s) => {
          const hoje = new Date().toISOString().slice(0, 10);
          const nova: Candidatura = {
            id: `cand-${Date.now()}`,
            clienteId,
            frenteId,
            marcaId,
            status: 'identificada',
            interesseCliente,
            interesseParceiro: 'desconhecido',
            prioridade,
            dataEntrada: hoje,
            historico: [
              {
                data: hoje,
                de: null,
                para: 'identificada',
                responsavel: s.usuario?.nome ?? 'Equipe Cross',
                justificativa: 'Candidatura registrada na plataforma.',
              },
            ],
          };
          return { candidaturas: [...s.candidaturas, nova] };
        }),

      moverCandidatura: (candidaturaId, novoStatus, justificativa) =>
        set((s) => ({
          candidaturas: s.candidaturas.map((c) => {
            if (c.id !== candidaturaId || c.status === novoStatus) return c;
            return {
              ...c,
              status: novoStatus,
              historico: [
                ...c.historico,
                {
                  data: new Date().toISOString().slice(0, 10),
                  de: c.status,
                  para: novoStatus,
                  responsavel: s.usuario?.nome ?? 'Equipe Cross',
                  justificativa,
                },
              ],
            };
          }),
        })),

      atualizarAnalise: (candidaturaId, mudancas) =>
        set((s) => {
          const daCandidatura = s.analises.filter((a) => a.candidaturaId === candidaturaId);
          // Sem análise ainda: cria a versão 1 com defaults + mudanças
          if (daCandidatura.length === 0) {
            const nova: AnaliseCrossability = {
              candidaturaId,
              numeroVersao: 1,
              publicos: 'media',
              territorios: 'media',
              ativos: 'media',
              sinergias: 'media',
              fit: 'media',
              momento: 'media',
              racional: '',
              recomendacao: 'em_estudo',
              responsavel: s.usuario?.nome ?? 'Equipe Cross',
              data: new Date().toISOString().slice(0, 10),
              ...mudancas,
            };
            return { analises: [...s.analises, nova] };
          }
          // Edita apenas a versão mais recente; anteriores permanecem imutáveis (RN019)
          const maisRecente = Math.max(...daCandidatura.map((a) => a.numeroVersao));
          return {
            analises: s.analises.map((a) =>
              a.candidaturaId === candidaturaId && a.numeroVersao === maisRecente
                ? {
                    ...a,
                    ...mudancas,
                    responsavel: s.usuario?.nome ?? a.responsavel,
                    data: new Date().toISOString().slice(0, 10),
                  }
                : a,
            ),
          };
        }),

      novaVersaoAnalise: (candidaturaId) =>
        set((s) => {
          const daCandidatura = s.analises.filter((a) => a.candidaturaId === candidaturaId);
          if (daCandidatura.length === 0) return s;
          const atual = daCandidatura.reduce((m, a) => (a.numeroVersao > m.numeroVersao ? a : m));
          return {
            analises: [
              ...s.analises,
              {
                ...atual,
                numeroVersao: atual.numeroVersao + 1,
                responsavel: s.usuario?.nome ?? atual.responsavel,
                data: new Date().toISOString().slice(0, 10),
              },
            ],
          };
        }),

      // ── Análise triádica (Objetivos · Ativos · Consumidores) ──────────────
      adicionarItemTriade: (candidaturaId, dimensao, item) =>
        set((s) => {
          const novoItem: ItemCross = { ...item, id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
          const existente = s.analisesTriade.find((a) => a.candidaturaId === candidaturaId);
          const base: AnaliseTriade = existente ?? {
            candidaturaId,
            objetivos: [],
            ativos: [],
            consumidores: [],
            responsavel: s.usuario?.nome ?? 'Equipe Cross',
            atualizadoEm: new Date().toISOString(),
          };
          const atualizada: AnaliseTriade = {
            ...base,
            [dimensao]: [...base[dimensao], novoItem],
            responsavel: s.usuario?.nome ?? base.responsavel,
            atualizadoEm: new Date().toISOString(),
          };
          return {
            analisesTriade: existente
              ? s.analisesTriade.map((a) => (a.candidaturaId === candidaturaId ? atualizada : a))
              : [...s.analisesTriade, atualizada],
          };
        }),

      removerItemTriade: (candidaturaId, dimensao, itemId) =>
        set((s) => ({
          analisesTriade: s.analisesTriade.map((a) =>
            a.candidaturaId === candidaturaId
              ? { ...a, [dimensao]: a[dimensao].filter((it) => it.id !== itemId), atualizadoEm: new Date().toISOString() }
              : a,
          ),
        })),

      atualizarItemTriade: (candidaturaId, dimensao, itemId, mudancas) =>
        set((s) => ({
          analisesTriade: s.analisesTriade.map((a) =>
            a.candidaturaId === candidaturaId
              ? {
                  ...a,
                  [dimensao]: a[dimensao].map((it) => (it.id === itemId ? { ...it, ...mudancas } : it)),
                  atualizadoEm: new Date().toISOString(),
                }
              : a,
          ),
        })),

      setVereditoItem: (candidaturaId, dimensao, itemId, veredito) =>
        set((s) => ({
          analisesTriade: s.analisesTriade.map((a) =>
            a.candidaturaId === candidaturaId
              ? {
                  ...a,
                  [dimensao]: a[dimensao].map((it) => (it.id === itemId ? { ...it, veredito } : it)),
                  atualizadoEm: new Date().toISOString(),
                }
              : a,
          ),
        })),

      adicionarEventoAgenda: (parteId, evento) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId ? { ...p, agenda: [...p.agenda, evento] } : p,
          ),
        })),

      removerEventoAgenda: (parteId, titulo, data) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId
              ? { ...p, agenda: p.agenda.filter((e) => !(e.titulo === titulo && e.data === data)) }
              : p,
          ),
        })),

      adicionarBigMoment: (parteId, momento) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId ? { ...p, bigMoments: [...p.bigMoments, momento] } : p,
          ),
        })),

      editarBigMoment: (parteId, tituloOriginal, dataOriginal, momento) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId
              ? {
                  ...p,
                  bigMoments: p.bigMoments.map((m) =>
                    m.titulo === tituloOriginal && m.data === dataOriginal ? momento : m,
                  ),
                }
              : p,
          ),
        })),

      removerBigMoment: (parteId, titulo, data) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId
              ? { ...p, bigMoments: p.bigMoments.filter((m) => !(m.titulo === titulo && m.data === data)) }
              : p,
          ),
        })),

      adicionarTurne: (parteId, turne) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId ? { ...p, turnes: [...p.turnes, turne] } : p,
          ),
        })),

      removerTurne: (parteId, nome) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId ? { ...p, turnes: p.turnes.filter((t) => t.nome !== nome) } : p,
          ),
        })),

      adicionarEventoTurne: (parteId, turneNome, evento) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId
              ? {
                  ...p,
                  turnes: p.turnes.map((t) =>
                    t.nome === turneNome
                      ? {
                          ...t,
                          eventos: [...t.eventos, evento].sort((a, b) => a.data.localeCompare(b.data)),
                        }
                      : t,
                  ),
                }
              : p,
          ),
        })),

      removerEventoTurne: (parteId, turneNome, cidade, data) =>
        set((s) => ({
          perfisArtistas: s.perfisArtistas.map((p) =>
            p.parteId === parteId
              ? {
                  ...p,
                  turnes: p.turnes.map((t) =>
                    t.nome === turneNome
                      ? { ...t, eventos: t.eventos.filter((e) => !(e.cidade === cidade && e.data === data)) }
                      : t,
                  ),
                }
              : p,
          ),
        })),

      restaurarDemo: () =>
        set({
          clientes: CLIENTES,
          criterios: CRITERIOS,
          candidaturas: CANDIDATURAS,
          avaliacoes: AVALIACOES,
          analises: ANALISES_CROSSABILITY,
          analisesTriade: ANALISES_TRIADE,
          perfisArtistas: PERFIS_ARTISTAS,
          partes: PARTES,
          papers: PAPERS,
          usuarios: USUARIOS_INICIAIS,
          parcerias: PARCERIAS,
          clienteAtivoId: CLIENTES[0].id,
        }),
    }),
    {
      name: 'plataforma-cross-demo',
      version: 11,
      // Ao reidratar do localStorage, devolve a sessão salva ao cofre em
      // memória (api/sessao) — é dele que o client.ts lê o Bearer. Sem isto,
      // um F5 manteria `usuario` mas perderia os tokens.
      onRehydrateStorage: () => (estado) => {
        if (estado?.sessao) definirSessao(estado.sessao);
      },
    },
  ),
);

// Quando o refresh automático rotaciona os tokens (fora do fluxo do store),
// espelha a nova sessão no store para persistir e sobreviver a um F5. Também
// zera `usuario` se a sessão morrer (refresh inválido → logout implícito).
aoMudarSessao((sessao) => {
  const atual = useStore.getState();
  if (sessao) {
    if (atual.sessao !== sessao) useStore.setState({ sessao });
  } else if (atual.usuario || atual.sessao) {
    useStore.setState({ usuario: null, sessao: null });
  }
});

// Dados estáticos da base (somente leitura na demo).
// Partes, parcerias e papers vivem no ESTADO do store (editáveis pela UI).
// CLIENTES é reexportado para lookups pontuais (histórico); a LISTA reativa de
// clientes (que reflete cadastros novos) vem de useStore((s) => s.clientes).
export { CLIENTES, MARCAS, PROJETOS, FRENTES, PERFIS_ARTISTAS };
