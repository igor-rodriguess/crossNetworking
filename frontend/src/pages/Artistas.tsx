import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin, Mic2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { HOJE, formatarData, formatarDataCurta } from '../lib/format';
import { Botao, CabecalhoPagina, CampoSelecao, CampoTexto, Chip, FaixaEstatisticas, RotuloMono } from '../components/ui';
import type { BigMoment, EventoAgenda } from '../types';

const TIPO_AGENDA: Record<EventoAgenda['tipo'], string> = {
  show: 'Show',
  lancamento: 'Lançamento',
  festival: 'Festival',
  midia: 'Mídia',
  outro: 'Agenda',
};

function DataBloco({ iso, destaque = false }: { iso: string; destaque?: boolean }) {
  const d = new Date(`${iso}T12:00:00`);
  return (
    <div
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${
        destaque ? 'bg-ink text-paper' : 'border border-cloud bg-off text-graphite'
      }`}
    >
      <span className="font-display text-xl font-extrabold leading-none">{d.getDate()}</span>
      <span className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${destaque ? 'text-mist' : 'text-stone'}`}>
        {d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} {String(d.getFullYear()).slice(2)}
      </span>
    </div>
  );
}

// ─── Formulário de novo Big Moment ───────────────────────────────────────────

// `edicao` presente = editar um Big Moment existente; ausente = criar um novo.
function FormBigMoment({
  aoFechar,
  edicao,
}: {
  aoFechar: () => void;
  edicao?: { parteId: string; momento: BigMoment };
}) {
  const perfis = useStore((s) => s.perfisArtistas);
  const partes = useStore((s) => s.partes);
  const adicionarBigMoment = useStore((s) => s.adicionarBigMoment);
  const editarBigMoment = useStore((s) => s.editarBigMoment);
  const emEdicao = !!edicao;

  const [parteId, setParteId] = useState(edicao?.parteId ?? perfis[0]?.parteId ?? '');
  const [titulo, setTitulo] = useState(edicao?.momento.titulo ?? '');
  const [data, setData] = useState(edicao?.momento.data ?? '2026-10-01');
  const [descricao, setDescricao] = useState(edicao?.momento.descricao ?? '');
  const [oportunidade, setOportunidade] = useState(edicao?.momento.oportunidade ?? '');

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !data || !parteId) return;
    const momento: BigMoment = {
      titulo: titulo.trim(),
      data,
      descricao: descricao.trim() || 'Registrado pela equipe Cross.',
      oportunidade: oportunidade.trim() || 'Janela de oportunidade a detalhar com o time de estratégia.',
    };
    if (edicao) {
      editarBigMoment(edicao.parteId, edicao.momento.titulo, edicao.momento.data, momento);
    } else {
      adicionarBigMoment(parteId, momento);
    }
    aoFechar();
  }

  return (
    <form onSubmit={salvar} className="space-y-3 border-b border-cloud bg-off/70 px-6 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelecao
          rotulo="Artista"
          value={parteId}
          onChange={(e) => setParteId(e.target.value)}
          disabled={emEdicao}
        >
          {perfis.map((p) => (
            <option key={p.parteId} value={p.parteId}>
              {partes.find((parte) => parte.id === p.parteId)?.nome}
            </option>
          ))}
        </CampoSelecao>
        <CampoTexto rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      <CampoTexto
        rotulo="Título do Big Moment"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ex.: Festival Planeta Som — palco principal"
        autoFocus
      />
      <CampoTexto
        rotulo="Descrição"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="O que acontece nessa data"
      />
      <CampoTexto
        rotulo="Oportunidade para marcas"
        value={oportunidade}
        onChange={(e) => setOportunidade(e.target.value)}
        placeholder="Por que essa janela importa para uma parceria"
      />
      <div className="flex gap-2 pt-1">
        <Botao type="submit" pequeno>
          {emEdicao ? 'Salvar alterações' : 'Salvar Big Moment'}
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

// ─── Formulário de nova data na agenda ───────────────────────────────────────

function FormAgenda({ parteId, aoFechar }: { parteId: string; aoFechar: () => void }) {
  const adicionarEventoAgenda = useStore((s) => s.adicionarEventoAgenda);
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('2026-09-01');
  const [tipo, setTipo] = useState<EventoAgenda['tipo']>('show');
  const [local, setLocal] = useState('');

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !data) return;
    adicionarEventoAgenda(parteId, { titulo: titulo.trim(), data, tipo, local: local.trim() || undefined });
    aoFechar();
  }

  return (
    <form onSubmit={salvar} className="mt-3 space-y-2.5 rounded-lg bg-off p-3.5">
      <CampoTexto
        rotulo="Evento"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ex.: Show no Festival Maré"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2.5">
        <CampoTexto rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <CampoSelecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as EventoAgenda['tipo'])}>
          {Object.entries(TIPO_AGENDA).map(([codigo, rotulo]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </CampoSelecao>
      </div>
      <CampoTexto rotulo="Local (opcional)" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Cidade ou palco" />
      <div className="flex gap-2 pt-1">
        <Botao type="submit" pequeno>
          Adicionar
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export function Artistas() {
  const perfisArtistas = useStore((s) => s.perfisArtistas);
  const partesDaBase = useStore((s) => s.partes);
  const removerEventoAgenda = useStore((s) => s.removerEventoAgenda);
  const removerBigMoment = useStore((s) => s.removerBigMoment);
  const [formMomentoAberto, setFormMomentoAberto] = useState(false);
  const [formAgendaAberto, setFormAgendaAberto] = useState<string | null>(null);
  // Big Moment sendo editado (parte + chave original) — null = nenhum
  const [momentoEmEdicao, setMomentoEmEdicao] = useState<{ parteId: string; momento: BigMoment } | null>(null);

  const artistas = perfisArtistas.map((perfil) => ({
    perfil,
    parte: partesDaBase.find((p) => p.id === perfil.parteId)!,
  }));

  const momentos = artistas
    .flatMap(({ perfil, parte }) => perfil.bigMoments.map((momento) => ({ momento, parte })))
    .sort((a, b) => a.momento.data.localeCompare(b.momento.data));
  const futuros = momentos.filter((m) => new Date(`${m.momento.data}T12:00:00`) >= HOJE);

  const totalTurnes = perfisArtistas.reduce((s, p) => s + p.turnes.length, 0);
  const totalDatas = perfisArtistas.reduce(
    (s, p) => s + p.turnes.reduce((s2, t) => s2 + t.eventos.length, 0) + p.agenda.length,
    0,
  );

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Inteligência estratégica · Artistas e talentos"
        titulo="Artistas & Big Moments"
        descricao="Turnês, lançamentos e grandes eventos dos talentos mapeados. Cada Big Moment é uma janela de oportunidade — o momento certo de conectar uma marca a um artista antes do pico de visibilidade."
        acoes={
          <Botao
            pequeno
            onClick={() => {
              setMomentoEmEdicao(null);
              setFormMomentoAberto((v) => !v);
            }}
          >
            <Plus size={14} strokeWidth={1.5} /> Novo Big Moment
          </Botao>
        }
      />

      <div className="mb-6">
        <FaixaEstatisticas
          itens={[
            { rotulo: 'Artistas mapeados', valor: artistas.length, detalhe: 'pessoas na base de relacionamentos' },
            { rotulo: 'Big Moments', valor: momentos.length, detalhe: `${futuros.length} ainda por vir` },
            { rotulo: 'Turnês', valor: totalTurnes, detalhe: 'em andamento ou confirmadas' },
            { rotulo: 'Datas na agenda', valor: totalDatas, detalhe: 'shows, lançamentos e eventos' },
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Linha do tempo de Big Moments */}
        <section className="space-y-4 xl:col-span-3">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
              <RotuloMono>Próximos Big Moments — janelas de oportunidade</RotuloMono>
            </div>

            {formMomentoAberto && !momentoEmEdicao && (
              <FormBigMoment aoFechar={() => setFormMomentoAberto(false)} />
            )}

            <ul className="divide-y divide-cloud">
              {momentos.map(({ momento, parte }) => {
                const futuro = new Date(`${momento.data}T12:00:00`) >= HOJE;
                const editando =
                  momentoEmEdicao?.parteId === parte.id &&
                  momentoEmEdicao.momento.titulo === momento.titulo &&
                  momentoEmEdicao.momento.data === momento.data;

                // Em edição, o item vira o formulário no mesmo lugar
                if (editando) {
                  return (
                    <li key={`${parte.id}-${momento.titulo}-${momento.data}-edit`}>
                      <FormBigMoment
                        edicao={{ parteId: parte.id, momento }}
                        aoFechar={() => setMomentoEmEdicao(null)}
                      />
                    </li>
                  );
                }

                return (
                  <li key={`${parte.id}-${momento.titulo}-${momento.data}`} className={`group flex gap-4 px-6 py-5 ${futuro ? '' : 'opacity-60'}`}>
                    <DataBloco iso={momento.data} destaque={futuro} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">{momento.titulo}</h3>
                        {futuro ? <Chip tom="info">janela aberta</Chip> : <Chip tom="neutro">passado</Chip>}
                      </div>
                      <Link
                        to={`/partes/${parte.id}`}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep"
                      >
                        <Mic2 size={11} strokeWidth={1.5} /> {parte.nome}
                      </Link>
                      <p className="mt-1.5 text-sm leading-relaxed text-stone">{momento.descricao}</p>
                      <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-deep">
                        <strong className="font-semibold">Oportunidade:</strong> {momento.oportunidade}
                      </p>
                    </div>
                    {/* Ações sempre visíveis (antes só no hover — pouco descobríveis) */}
                    <div className="flex h-fit shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFormMomentoAberto(false);
                          setMomentoEmEdicao({ parteId: parte.id, momento });
                        }}
                        className="rounded-full p-1.5 text-stone transition-colors hover:bg-cloud hover:text-ink"
                        title="Editar Big Moment"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerBigMoment(parte.id, momento.titulo, momento.data)}
                        className="rounded-full p-1.5 text-stone transition-colors hover:bg-status-negsoft hover:text-status-neg"
                        title="Remover Big Moment"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                );
              })}
              {momentos.length === 0 && (
                <li className="px-6 py-10 text-center text-sm text-stone">
                  Nenhum Big Moment registrado — use “Novo Big Moment” para anotar a próxima grande data.
                </li>
              )}
            </ul>
          </div>

          <div className="card flex items-start gap-3 border-dashed p-5">
            <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <RotuloMono className="mb-1">Roadmap · IA da plataforma</RotuloMono>
              <p className="text-sm leading-relaxed text-stone">
                A próxima etapa cruza automaticamente estes Big Moments com os objetivos e territórios dos
                clientes — sugerindo qual marca deveria estar em cada janela, sempre com validação humana.
              </p>
            </div>
          </div>
        </section>

        {/* Cards dos artistas */}
        <div className="space-y-4 xl:col-span-2">
          {artistas.map(({ perfil, parte }) => (
            <div key={parte.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-cloud px-6 py-4">
                <div>
                  <Link
                    to={`/partes/${parte.id}`}
                    className="font-display text-lg font-bold text-ink transition-colors hover:text-accent-deep"
                  >
                    {parte.nome}
                  </Link>
                  <div className="text-xs text-stone">{parte.categoria}</div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
                    {perfil.representacao}
                  </div>
                </div>
                <Link
                  to={`/partes/${parte.id}`}
                  className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-accent hover:text-accent-deep"
                >
                  perfil <ArrowRight size={11} strokeWidth={1.5} />
                </Link>
              </div>

              {/* Turnês com eventos */}
              {perfil.turnes.map((turne) => (
                <div key={turne.nome} className="border-b border-cloud px-6 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">{turne.nome}</h4>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-stone">
                      {formatarDataCurta(turne.inicio)} – {formatarDataCurta(turne.fim)}
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {turne.eventos.map((evento) => (
                      <li key={`${evento.cidade}-${evento.data}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-graphite">
                          <MapPin size={11} strokeWidth={1.5} className="shrink-0 text-stone" />
                          <strong className="font-semibold">{evento.cidade}</strong>
                          <span className="truncate text-stone">· {evento.local}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-stone">{formatarData(evento.data)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/partes/${parte.id}`}
                    className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-deep"
                  >
                    gerenciar datas no perfil <ArrowRight size={11} strokeWidth={1.5} />
                  </Link>
                </div>
              ))}

              {/* Agenda editável */}
              <div className="px-6 py-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <RotuloMono>Agenda</RotuloMono>
                  <button
                    type="button"
                    onClick={() => setFormAgendaAberto(formAgendaAberto === parte.id ? null : parte.id)}
                    className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
                  >
                    <Plus size={11} strokeWidth={1.5} /> Data
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {perfil.agenda
                    .slice()
                    .sort((a, b) => a.data.localeCompare(b.data))
                    .map((evento) => (
                      <li key={`${evento.titulo}-${evento.data}`} className="group flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-graphite">
                          <CalendarDays size={11} strokeWidth={1.5} className="shrink-0 text-stone" />
                          <span className="truncate">{evento.titulo}</span>
                          <Chip tom="neutro">{TIPO_AGENDA[evento.tipo]}</Chip>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="font-mono text-[11px] text-stone">{formatarDataCurta(evento.data)}</span>
                          <button
                            type="button"
                            onClick={() => removerEventoAgenda(parte.id, evento.titulo, evento.data)}
                            className="rounded-full p-1 text-mist opacity-0 transition-all hover:bg-status-negsoft hover:text-status-neg group-hover:opacity-100"
                            title="Remover data"
                          >
                            <Trash2 size={12} strokeWidth={1.5} />
                          </button>
                        </span>
                      </li>
                    ))}
                  {perfil.agenda.length === 0 && (
                    <li className="text-xs text-stone">Sem datas na agenda — adicione a primeira.</li>
                  )}
                </ul>

                {formAgendaAberto === parte.id && (
                  <FormAgenda parteId={parte.id} aoFechar={() => setFormAgendaAberto(null)} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
