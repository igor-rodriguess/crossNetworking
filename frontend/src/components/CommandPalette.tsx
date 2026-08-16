import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarRange,
  CornerDownLeft,
  Filter,
  FolderKanban,
  LayoutDashboard,
  Library,
  Music2,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useUI } from '../store/useUI';
import { normalizar } from '../lib/texto';

// Command palette (⌘/Ctrl + K): busca global e navegação por teclado — padrão
// Linear/Vercel/GitHub. Indexa rotas, projetos, candidaturas (marcas) e artistas.

interface Comando {
  id: string;
  titulo: string;
  subtitulo: string;
  grupo: string;
  icone: LucideIcon;
  ir: () => void;
}

const ROTAS: { titulo: string; para: string; icone: LucideIcon }[] = [
  { titulo: 'Dashboard', para: '/', icone: LayoutDashboard },
  { titulo: 'Relacionamentos', para: '/partes', icone: Library },
  { titulo: 'Mapa de oportunidades', para: '/marcas', icone: Building2 },
  { titulo: 'Artistas & momentos', para: '/artistas', icone: Music2 },
  { titulo: 'Projetos & briefings', para: '/projetos', icone: FolderKanban },
  { titulo: 'Funil de oportunidades', para: '/funil', icone: Filter },
  { titulo: 'Critérios & pesos', para: '/criterios', icone: SlidersHorizontal },
  { titulo: 'Ranking & decisões', para: '/ranking', icone: Trophy },
  { titulo: 'Cronograma de parcerias', para: '/cronograma', icone: CalendarRange },
  { titulo: 'Equipe & acessos', para: '/usuarios', icone: Users },
];

// Realça no texto o trecho que casa com a busca (case/acento-insensível),
// sem perder a grafia original exibida.
function realcar(texto: string, busca: string): ReactNode {
  const q = normalizar(busca.trim());
  if (!q) return texto;
  const alvo = normalizar(texto);
  const inicio = alvo.indexOf(q);
  if (inicio < 0) return texto;
  const fim = inicio + q.length;
  return (
    <>
      {texto.slice(0, inicio)}
      <mark className="bg-transparent font-bold text-accent-deep">{texto.slice(inicio, fim)}</mark>
      {texto.slice(fim)}
    </>
  );
}

export function CommandPalette() {
  const navigate = useNavigate();
  const partes = useStore((s) => s.partes);
  const candidaturas = useStore((s) => s.candidaturas);
  const perfisArtistas = useStore((s) => s.perfisArtistas);
  const clientes = useStore((s) => s.clientes);
  const projetos = useStore((s) => s.projetos);
  const frentes = useStore((s) => s.frentes);
  const setClienteAtivo = useStore((s) => s.setClienteAtivo);

  const aberto = useUI((s) => s.buscaAberta);
  const fechar = useUI((s) => s.fecharBusca);
  const alternar = useUI((s) => s.alternarBusca);

  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Atalho global de abertura/fechamento
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        alternar();
      }
      if (e.key === 'Escape') fechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [alternar, fechar]);

  // Ao abrir: limpa a busca, zera a seleção e foca o campo
  useEffect(() => {
    if (aberto) {
      setBusca('');
      setSelecionado(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [aberto]);

  const comandos = useMemo<Comando[]>(() => {
    const lista: Comando[] = [];
    for (const r of ROTAS) {
      lista.push({
        id: `rota-${r.para}`,
        titulo: r.titulo,
        subtitulo: 'Ir para a página',
        grupo: 'Navegação',
        icone: r.icone,
        ir: () => navigate(r.para),
      });
    }
    // Clientes, projetos e frentes reais do store (API). Antes esta lista vinha
    // de arrays de exemplo: a busca global oferecia clientes e projetos que não
    // existiam na base, e ativá-los levava a um cliente inexistente.
    for (const c of clientes) {
      lista.push({
        id: `cli-${c.id}`,
        titulo: c.nome,
        subtitulo: `Ativar cliente · ${c.segmento}`,
        grupo: 'Clientes',
        icone: Users,
        ir: () => {
          setClienteAtivo(c.id);
          navigate('/');
        },
      });
    }
    for (const p of projetos) {
      lista.push({
        id: `proj-${p.id}`,
        titulo: p.nome,
        subtitulo: `Projeto · ${clientes.find((c) => c.id === p.clienteId)?.nome ?? ''}`,
        grupo: 'Projetos',
        icone: FolderKanban,
        ir: () => navigate(`/projetos/${p.id}`),
      });
    }
    for (const cand of candidaturas) {
      const marca = partes.find((pp) => pp.id === cand.marcaId);
      const frente = frentes.find((f) => f.id === cand.frenteId);
      if (!marca) continue;
      lista.push({
        id: `cand-${cand.id}`,
        titulo: marca.nome,
        subtitulo: `Candidatura · ${frente?.nome ?? 'frente'}`,
        grupo: 'Marcas & candidaturas',
        icone: Building2,
        ir: () => navigate(`/marcas/${cand.id}`),
      });
    }
    for (const perfil of perfisArtistas) {
      const parte = partes.find((pp) => pp.id === perfil.parteId);
      if (!parte) continue;
      lista.push({
        id: `art-${parte.id}`,
        titulo: parte.nome,
        subtitulo: 'Artista · perfil e Big Moments',
        grupo: 'Artistas',
        icone: Music2,
        ir: () => navigate(`/partes/${parte.id}`),
      });
    }
    return lista;
  }, [navigate, partes, candidaturas, perfisArtistas, setClienteAtivo]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return comandos.slice(0, 8);
    const q = normalizar(busca);
    return comandos.filter((c) => normalizar(`${c.titulo} ${c.subtitulo} ${c.grupo}`).includes(q)).slice(0, 12);
  }, [busca, comandos]);

  // Reagrupa preservando a ordem
  const grupos = useMemo(() => {
    const mapa = new Map<string, Comando[]>();
    for (const c of filtrados) {
      const arr = mapa.get(c.grupo) ?? [];
      arr.push(c);
      mapa.set(c.grupo, arr);
    }
    return [...mapa.entries()];
  }, [filtrados]);

  function executar(cmd: Comando) {
    cmd.ir();
    fechar();
  }

  // Mantém o item selecionado visível ao navegar por teclado
  useEffect(() => {
    const alvo = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${selecionado}"]`);
    alvo?.scrollIntoView({ block: 'nearest' });
  }, [selecionado]);

  function aoTeclarLista(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelecionado((i) => (filtrados.length ? (i + 1) % filtrados.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelecionado((i) => (filtrados.length ? (i - 1 + filtrados.length) % filtrados.length : 0));
    } else if (e.key === 'Enter' && filtrados[selecionado]) {
      e.preventDefault();
      executar(filtrados[selecionado]);
    }
  }

  if (!aberto) return null;

  let indiceGlobal = -1;
  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-start justify-center bg-ink/50 px-4 pt-[12vh] backdrop-blur-sm print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="anim-dialog flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-cloud bg-paper shadow-pop"
      >
        {/* Campo de busca — o realce de foco fica no container (borda inferior),
            não num anel flutuante em volta do input */}
        <div className="flex items-center gap-3 border-b border-cloud px-4 transition-colors focus-within:border-accent">
          <Search size={18} strokeWidth={1.5} className="shrink-0 text-stone" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setSelecionado(0);
            }}
            onKeyDown={aoTeclarLista}
            placeholder="Buscar marcas, projetos, artistas, páginas…"
            // Suprime o anel global de foco (index.css) — aqui ele estoura o
            // layout do modal; o container já delimita o campo visualmente.
            className="w-full bg-transparent py-4 text-[15px] text-ink placeholder:text-mist focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Buscar"
          />
          {busca && (
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setSelecionado(0);
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-stone transition-colors hover:bg-off hover:text-ink"
              aria-label="Limpar busca"
            >
              limpar
            </button>
          )}
        </div>

        {/* Resultados */}
        <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto py-2">
          {filtrados.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search size={22} strokeWidth={1.5} className="mx-auto mb-3 text-mist" />
              <p className="text-sm text-stone">
                Nada encontrado para <span className="font-semibold text-ink">“{busca}”</span>.
              </p>
              <p className="mt-1 text-xs text-mist">Tente o nome de uma marca, projeto ou página.</p>
            </div>
          ) : (
            grupos.map(([grupo, itens]) => (
              <div key={grupo} className="mb-1">
                <div className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone">
                  {grupo}
                </div>
                {itens.map((cmd) => {
                  indiceGlobal += 1;
                  const ativo = indiceGlobal === selecionado;
                  const idx = indiceGlobal;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-idx={idx}
                      onMouseMove={() => setSelecionado(idx)}
                      onClick={() => executar(cmd)}
                      className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        ativo ? 'bg-accent-soft' : 'hover:bg-off'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          ativo ? 'bg-paper text-accent-deep shadow-card' : 'bg-off text-stone'
                        }`}
                      >
                        <cmd.icone size={16} strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {realcar(cmd.titulo, busca)}
                        </span>
                        <span className="block truncate text-xs text-stone">{cmd.subtitulo}</span>
                      </span>
                      <CornerDownLeft
                        size={14}
                        strokeWidth={1.5}
                        className={`shrink-0 transition-opacity ${ativo ? 'text-accent-deep opacity-100' : 'opacity-0'}`}
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between border-t border-cloud px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-stone">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-mist px-1 py-0.5">↑</kbd>
              <kbd className="rounded border border-mist px-1 py-0.5">↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-mist px-1 py-0.5">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-mist px-1 py-0.5">esc</kbd>
              fechar
            </span>
          </span>
          <span>{filtrados.length} resultado{filtrados.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
