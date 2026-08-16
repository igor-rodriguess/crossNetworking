import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpenCheck,
  Building2,
  ChevronsUpDown,
  LayoutDashboard,
  Library,
  Menu,
  Music2,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useUI } from '../store/useUI';
import { ErroApi } from '../api/erros';
import { LogoCross } from './Logo';
import { RotuloMono } from './ui';
import { CommandPalette } from './CommandPalette';
import { useToast } from './Toast';
import { normalizar } from '../lib/texto';

const PERSONA_ROTULO: Record<string, string> = {
  administrador: 'Administrador',
  estrategista: 'Estrategista',
  gestor_contas: 'Gestor de contas',
  coordenador: 'Coordenador',
};

// Navegação da Cross Intelligence.
//
// A ordem comunica a lógica do produto — INTELIGÊNCIA → OPORTUNIDADE →
// DECISÃO → AÇÃO HUMANA — e não mais o fluxo operacional antigo
// (projeto → execução → entrega → resultado).
//
// Páginas do modelo antigo (cronograma, resumo, frentes, critérios, ranking,
// detalhe de parceria, funil) saíram DAQUI, não do sistema: as rotas seguem
// registradas em App.tsx e acessíveis por URL. Ver docs/product/06.
const NAVEGACAO = [
  {
    grupo: 'Início',
    itens: [{ para: '/', rotulo: 'Dashboard', icone: LayoutDashboard }],
  },
  {
    grupo: 'Oportunidades',
    // O funil é estágio DA oportunidade, não área própria: mora dentro desta
    // tela, com link para a visão completa em /funil.
    itens: [{ para: '/oportunidades', rotulo: 'Oportunidades', icone: Sparkles }],
  },
  {
    grupo: 'Relacionamentos',
    itens: [
      { para: '/partes', rotulo: 'Empresas', icone: Library },
      { para: '/clientes', rotulo: 'Clientes', icone: Building2 },
      { para: '/artistas', rotulo: 'Artistas', icone: Music2 },
    ],
  },
  {
    grupo: 'Inteligência',
    itens: [{ para: '/conhecimento', rotulo: 'Base de conhecimento', icone: BookOpenCheck }],
  },
  {
    grupo: 'Decisão',
    // Crossability não é item de menu: é motor metodológico, aplicado dentro
    // das análises. A rota e a página seguem preservadas.
    itens: [{ para: '/marcas', rotulo: 'Score Cards', icone: Trophy }],
  },
  {
    grupo: 'Administração',
    itens: [
      { para: '/importar', rotulo: 'Importar dados', icone: Upload },
      { para: '/usuarios', rotulo: 'Equipe & acessos', icone: Users },
    ],
  },
];

function SeletorCliente() {
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const setClienteAtivo = useStore((s) => s.setClienteAtivo);
  const clientes = useStore((s) => s.clientes);
  const adicionarCliente = useStore((s) => s.adicionarCliente);
  const carregarClientes = useStore((s) => s.carregarClientes);
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [segmento, setSegmento] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const cliente = clientes.find((c) => c.id === clienteAtivoId) ?? clientes[0];

  // Carrega os clientes reais do backend ao montar o shell.
  useEffect(() => {
    carregarClientes().catch((e) =>
      toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar os clientes.'),
    );
  }, [carregarClientes, toast]);

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setFormAberto(false);
      }
    }
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  // Busca tolerante a acentos — o seletor escala para dezenas de clientes sem poluir
  const filtrados = clientes.filter(
    (c) => !busca || normalizar(`${c.nome} ${c.segmento}`).includes(normalizar(busca)),
  );

  async function criarCliente(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      await adicionarCliente({
        nome: nome.trim(),
        segmento: segmento.trim() || undefined,
        responsavel: responsavel.trim() || undefined,
      });
      toast(`${nome.trim()} foi cadastrado como cliente.`);
      setNome('');
      setSegmento('');
      setResponsavel('');
      setFormAberto(false);
      setAberto(false);
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setAberto((v) => !v);
          setBusca('');
        }}
        className="flex items-center gap-3 rounded-full border border-cloud bg-paper py-1.5 pl-1.5 pr-3 shadow-card transition-colors hover:border-mist"
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-mono text-[12px] font-bold text-paper">
          {cliente?.sigla ?? '—'}
        </span>
        <span className="text-left">
          <span className="block text-sm font-semibold leading-tight text-ink">
            {cliente?.nome ?? 'Selecionar cliente'}
          </span>
          <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
            {cliente?.segmento ?? 'nenhum cliente cadastrado'}
          </span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.5} className="ml-1 text-stone" />
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-lg border border-cloud bg-paper shadow-pop" role="listbox">
          <div className="border-b border-cloud px-4 pb-3 pt-2.5">
            <RotuloMono className="mb-2">Cliente ativo — quem busca a parceria</RotuloMono>
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-md border border-mist bg-off px-3 py-1.5 text-sm text-ink placeholder:text-mist focus:border-accent"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtrados.map((c) => (
              <button
                key={c.id}
                role="option"
                aria-selected={c.id === clienteAtivoId}
                onClick={() => {
                  // Trocar o cliente ativo apenas troca o recorte da
                  // plataforma. Antes esta ação navegava para a ficha da Parte
                  // (ou desviava para /clientes quando não havia parteId) —
                  // comportamento surpreendente, e o único acesso a /clientes.
                  // Clientes agora tem item próprio em Relacionamentos.
                  setClienteAtivo(c.id);
                  setAberto(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-off ${
                  c.id === clienteAtivoId ? 'bg-accent-soft' : ''
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold ${
                    c.id === clienteAtivoId ? 'bg-accent text-paper' : 'bg-cloud text-graphite'
                  }`}
                >
                  {c.sigla}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{c.nome}</span>
                  <span className="block text-xs text-stone">
                    {c.segmento} · {c.modeloContratacao}
                  </span>
                </span>
              </button>
            ))}
            {filtrados.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-stone">Nenhum cliente encontrado.</p>
            )}
          </div>

          {/* Rodapé: cadastrar novo cliente sem sair da tela */}
          <div className="border-t border-cloud">
            {!formAberto ? (
              <button
                onClick={() => setFormAberto(true)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-accent-deep transition-colors hover:bg-off"
              >
                <Plus size={15} strokeWidth={1.5} /> Novo cliente
              </button>
            ) : (
              <form onSubmit={criarCliente} className="space-y-2.5 bg-off px-4 py-3.5">
                <RotuloMono>Cadastrar cliente</RotuloMono>
                <input
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full rounded-md border border-mist bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-mist focus:border-accent"
                />
                <input
                  value={segmento}
                  onChange={(e) => setSegmento(e.target.value)}
                  placeholder="Segmento (ex.: Bebidas & Lifestyle)"
                  className="w-full rounded-md border border-mist bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-mist focus:border-accent"
                />
                <input
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Responsável pela conta"
                  className="w-full rounded-md border border-mist bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-mist focus:border-accent"
                />
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvando ? 'Cadastrando…' : 'Cadastrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAberto(false)}
                    className="rounded-full px-4 py-1.5 text-sm font-semibold text-stone transition-colors hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-xs leading-snug text-stone">
                  O cliente entra ativo — configure os critérios do Score Card em seguida.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TITULOS: Record<string, string> = {
  '/': 'Dashboard',
  '/clientes': 'Clientes Cross',
  '/oportunidades': 'Oportunidades',
  '/conhecimento': 'Base de conhecimento',
  '/partes': 'Empresas & relacionamentos',
  '/artistas': 'Artistas & Big Moments',
  '/marcas': 'Score Cards',
  '/funil': 'Funil de oportunidades',
  '/usuarios': 'Equipe & acessos',
  '/importar': 'Importar dados',
  // Rotas fora da navegação principal, ainda acessíveis por URL.
  '/projetos': 'Projetos',
  '/criterios': 'Critérios & pesos',
  '/ranking': 'Ranking',
  '/frentes': 'Frentes de oportunidade',
  '/cronograma': 'Cronograma',
  '/resumo': 'Resumo executivo',
};

function tituloDaRota(pathname: string): string {
  if (TITULOS[pathname]) return TITULOS[pathname];
  if (pathname.startsWith('/marcas/')) return 'Candidatura · Cross Score Card';
  if (pathname.startsWith('/partes/')) return 'Parte · Base de relacionamentos';
  if (pathname.startsWith('/projetos/')) return 'Projeto';
  if (pathname.startsWith('/parcerias/')) return 'Parceria · Execução';
  return 'Plataforma Cross';
}

export function AppShell() {
  const usuario = useStore((s) => s.usuario);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  const titulo = tituloDaRota(pathname);

  // Fecha o drawer ao navegar (mobile)
  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  // Esc fecha o drawer
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAberto(false);
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Backdrop do drawer (só mobile) */}
      {menuAberto && (
        <div
          className="anim-overlay fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm lg:hidden print:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixa no desktop, drawer deslizante no mobile */}
      <aside
        className={`print-hidden fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-ink transition-transform duration-300 lg:z-20 lg:translate-x-0 ${
          menuAberto ? 'translate-x-0 shadow-pop' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-8 pt-7">
          <LogoCross claro altura={88} />
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            className="text-mist transition-colors hover:text-paper lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto px-3" aria-label="Navegação principal">
          {NAVEGACAO.map((grupo) => (
            <div key={grupo.grupo}>
              <div className="mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-mist">
                {grupo.grupo}
              </div>
              <ul className="space-y-0.5">
                {grupo.itens.map((item) => (
                  <li key={item.para}>
                    <NavLink
                      to={item.para}
                      end={item.para === '/'}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-carbon font-semibold text-paper shadow-[inset_2px_0_0_#B98E4A]'
                            : 'text-mist hover:bg-carbon hover:text-paper'
                        }`
                      }
                    >
                      <item.icone size={16} strokeWidth={1.5} />
                      {item.rotulo}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-graphite px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-bold text-paper">
              {(usuario?.nome ?? 'EC')
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-paper">{usuario?.nome ?? 'Equipe Cross'}</div>
              <div className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-mist">
                {PERSONA_ROTULO[usuario?.persona ?? ''] ?? usuario?.persona ?? 'Demo'}
              </div>
            </div>
          </div>
          {/*
            O botão "Demo" (restaurarDemo) saiu da interface: a plataforma opera
            com dados reais de clientes, e um clique acidental restauraria dados
            de demonstração sobre eles. A ação continua existindo no store, para
            desenvolvimento e testes — apenas não é mais alcançável pela UI.
          */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Sair"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-graphite px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-mist transition-colors hover:border-stone hover:text-paper"
            >
              <LogOut size={11} strokeWidth={1.5} /> Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="print-reset flex min-h-screen flex-1 flex-col lg:ml-60 print:ml-0">
        <header className="print-hidden sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cloud bg-off/90 px-4 py-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cloud bg-paper text-graphite transition-colors hover:text-ink lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
            <div className="flex min-w-0 items-center gap-3 text-sm text-stone">
              <BarChart3 size={15} strokeWidth={1.5} className="hidden shrink-0 sm:block" />
              <span className="hidden font-mono text-[12px] uppercase tracking-[0.14em] md:inline">
                Plataforma Cross
              </span>
              <span className="hidden text-mist md:inline">/</span>
              <span className="truncate font-semibold text-ink">{titulo}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => useUI.getState().abrirBusca()}
              className="hidden items-center gap-2 rounded-full border border-cloud bg-paper py-1.5 pl-3 pr-2 text-stone shadow-card transition-colors hover:border-mist hover:text-ink sm:flex"
              aria-label="Busca rápida"
              title="Busca rápida (Ctrl+K)"
            >
              <Search size={14} strokeWidth={1.5} />
              <span className="text-sm">Buscar</span>
              <kbd className="rounded border border-mist px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <SeletorCliente />
          </div>
        </header>

        <main className="print-reset flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {/* key no pathname remonta o conteúdo e dispara a transição de entrada */}
          <div key={pathname} className="anim-pagina">
            <Outlet />
          </div>
        </main>

        <footer className="print-hidden flex flex-wrap items-center justify-between gap-2 border-t border-cloud px-4 py-4 sm:px-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            © 2026 Crossnetworking
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Cross Intelligence
          </span>
        </footer>
      </div>

      {/* Busca rápida global (⌘K) */}
      <CommandPalette />
    </div>
  );
}
