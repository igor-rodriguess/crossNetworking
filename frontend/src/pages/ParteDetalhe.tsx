import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, MapPin, Music2, Pencil, Plus, Radio, Trash2, UserRound } from 'lucide-react';
import { CLIENTES, useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { PARCERIAS } from '../data/mock';

// Ids reais do backend são UUID; ids de seed mock (ex.: "parte-...") não casam.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { calcularScore } from '../lib/score';
import { STATUS_CANDIDATURA, STATUS_PARCERIA, formatarData, formatarDataCurta } from '../lib/format';
import { Botao, CampoTexto, Chip, RotuloMono } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { PAPEL_PARTE } from './Partes';

// ─── Card de contatos com cadastro inline (RF007 / RN004) ───────────────────
function CardContatos({ parteId, contatos }: { parteId: string; contatos: { nome: string; cargo: string; email: string; principal: boolean }[] }) {
  const adicionarContato = useStore((s) => s.adicionarContato);
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.includes('@') || salvando) return;
    setSalvando(true);
    try {
      await adicionarContato(parteId, nome.trim(), cargo.trim() || 'Contato', email.trim().toLowerCase());
      toast(`Contato ${nome.trim()} adicionado.`);
      setNome('');
      setCargo('');
      setEmail('');
      setAberto(false);
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível adicionar o contato.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <RotuloMono>Contatos</RotuloMono>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
        >
          <Plus size={11} strokeWidth={1.5} /> Contato
        </button>
      </div>
      {contatos.length > 0 ? (
        <ul className="space-y-3">
          {contatos.map((contato) => (
            <li key={contato.email} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{contato.nome}</span>
                {contato.principal && <Chip tom="info">principal</Chip>}
              </div>
              <div className="text-xs text-stone">{contato.cargo}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-accent-deep">
                <Mail size={11} strokeWidth={1.5} /> {contato.email}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone">Nenhum contato cadastrado.</p>
      )}
      {aberto && (
        <form onSubmit={salvar} className="anim-abre mt-4 space-y-2.5 rounded-lg bg-off p-3.5">
          <CampoTexto rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contato" autoFocus />
          <CampoTexto rotulo="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Diretora de marketing" />
          <CampoTexto rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
          <div className="flex gap-2 pt-1">
            <Botao type="submit" pequeno disabled={salvando}>{salvando ? 'Adicionando…' : 'Adicionar'}</Botao>
            <Botao type="button" variante="ghost" pequeno onClick={() => setAberto(false)}>Cancelar</Botao>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Card de ativos com cadastro inline (RF012 — propriedades, cotas, espaços) ─
function CardAtivos({ parteId, ativos }: { parteId: string; ativos: { nome: string; tipo: string }[] }) {
  const adicionarAtivo = useStore((s) => s.adicionarAtivoParte);
  const removerAtivo = useStore((s) => s.removerAtivoParte);
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    adicionarAtivo(parteId, { nome: nome.trim(), tipo: tipo.trim() || 'Ativo' });
    toast(`Ativo “${nome.trim()}” adicionado.`);
    setNome('');
    setTipo('');
    setAberto(false);
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <RotuloMono>Ativos</RotuloMono>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
        >
          <Plus size={11} strokeWidth={1.5} /> Ativo
        </button>
      </div>
      {ativos.length > 0 ? (
        <ul className="space-y-3">
          {ativos.map((ativo) => (
            <li key={ativo.nome} className="group flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold text-ink">{ativo.nome}</div>
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-stone">{ativo.tipo}</div>
              </div>
              <button
                type="button"
                onClick={() => removerAtivo(parteId, ativo.nome)}
                className="shrink-0 rounded-full p-1 text-mist opacity-0 transition-all hover:bg-status-negsoft hover:text-status-neg group-hover:opacity-100"
                title="Remover ativo"
                aria-label={`Remover ${ativo.nome}`}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone">Nenhum ativo cadastrado.</p>
      )}
      {aberto && (
        <form onSubmit={salvar} className="anim-abre mt-4 space-y-2.5 rounded-lg bg-off p-3.5">
          <CampoTexto rotulo="Ativo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Festival Maré (propriedade)" autoFocus />
          <CampoTexto rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex.: Propriedade, Cota, Espaço, Mídia" />
          <div className="flex gap-2 pt-1">
            <Botao type="submit" pequeno>Adicionar</Botao>
            <Botao type="button" variante="ghost" pequeno onClick={() => setAberto(false)}>Cancelar</Botao>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Editor de turnês do artista (RF015 — turnês e eventos de turnê) ─────────

function EditorTurnes({ parteId }: { parteId: string }) {
  const perfil = useStore((s) => s.perfisArtistas.find((p) => p.parteId === parteId));
  const adicionarTurne = useStore((s) => s.adicionarTurne);
  const removerTurne = useStore((s) => s.removerTurne);
  const adicionarEventoTurne = useStore((s) => s.adicionarEventoTurne);
  const removerEventoTurne = useStore((s) => s.removerEventoTurne);

  const [formTurneAberto, setFormTurneAberto] = useState(false);
  const [nomeTurne, setNomeTurne] = useState('');
  const [inicioTurne, setInicioTurne] = useState('2026-09-01');
  const [fimTurne, setFimTurne] = useState('2026-12-31');

  const [formEventoDe, setFormEventoDe] = useState<string | null>(null);
  const [cidade, setCidade] = useState('');
  const [local, setLocal] = useState('');
  const [dataEvento, setDataEvento] = useState('2026-10-01');

  if (!perfil) return null;

  function criarTurne(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeTurne.trim() || !inicioTurne || !fimTurne || fimTurne < inicioTurne) return;
    adicionarTurne(parteId, { nome: nomeTurne.trim(), inicio: inicioTurne, fim: fimTurne, eventos: [] });
    setNomeTurne('');
    setFormTurneAberto(false);
  }

  function criarEvento(e: React.FormEvent, turneNome: string) {
    e.preventDefault();
    if (!cidade.trim() || !dataEvento) return;
    adicionarEventoTurne(parteId, turneNome, {
      cidade: cidade.trim(),
      local: local.trim() || 'A confirmar',
      data: dataEvento,
    });
    setCidade('');
    setLocal('');
    setFormEventoDe(null);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
        <div className="flex items-center gap-2">
          <Music2 size={14} strokeWidth={1.5} className="text-accent" />
          <RotuloMono>Turnês & datas</RotuloMono>
        </div>
        <Botao variante="ghost" pequeno onClick={() => setFormTurneAberto((v) => !v)}>
          <Plus size={13} strokeWidth={1.5} /> Turnê
        </Botao>
      </div>

      {formTurneAberto && (
        <form onSubmit={criarTurne} className="space-y-3 border-b border-cloud bg-off/70 px-6 py-4">
          <CampoTexto
            rotulo="Nome da turnê"
            value={nomeTurne}
            onChange={(e) => setNomeTurne(e.target.value)}
            placeholder="Ex.: Turnê Maré Cheia"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto rotulo="Início" type="date" value={inicioTurne} onChange={(e) => setInicioTurne(e.target.value)} />
            <CampoTexto rotulo="Fim" type="date" value={fimTurne} onChange={(e) => setFimTurne(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Botao type="submit" pequeno>
              Criar turnê
            </Botao>
            <Botao type="button" variante="ghost" pequeno onClick={() => setFormTurneAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {perfil.turnes.length === 0 && !formTurneAberto && (
        <p className="px-6 py-8 text-center text-sm text-stone">
          Nenhuma turnê registrada — crie a primeira com o botão acima.
        </p>
      )}

      {perfil.turnes.map((turne) => (
        <div key={turne.nome} className="border-b border-cloud px-6 py-4 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-ink">{turne.nome}</h4>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-stone">
                {formatarDataCurta(turne.inicio)} – {formatarDataCurta(turne.fim)} · {turne.eventos.length} datas
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFormEventoDe(formEventoDe === turne.nome ? null : turne.nome)}
                className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
              >
                <Plus size={11} strokeWidth={1.5} /> Data
              </button>
              <button
                type="button"
                onClick={() => removerTurne(parteId, turne.nome)}
                className="rounded-full p-1.5 text-mist transition-colors hover:bg-status-negsoft hover:text-status-neg"
                title="Remover turnê"
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <ul className="mt-2.5 space-y-1.5">
            {turne.eventos.map((evento) => (
              <li key={`${evento.cidade}-${evento.data}`} className="group flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-graphite">
                  <MapPin size={11} strokeWidth={1.5} className="shrink-0 text-stone" />
                  <strong className="font-semibold">{evento.cidade}</strong>
                  <span className="truncate text-stone">· {evento.local}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="font-mono text-[11px] text-stone">{formatarData(evento.data)}</span>
                  <button
                    type="button"
                    onClick={() => removerEventoTurne(parteId, turne.nome, evento.cidade, evento.data)}
                    className="rounded-full p-1 text-mist opacity-0 transition-all hover:bg-status-negsoft hover:text-status-neg group-hover:opacity-100"
                    title="Remover data"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </span>
              </li>
            ))}
            {turne.eventos.length === 0 && <li className="text-xs text-stone">Sem datas — adicione a primeira.</li>}
          </ul>

          {formEventoDe === turne.nome && (
            <form onSubmit={(e) => criarEvento(e, turne.nome)} className="mt-3 space-y-2.5 rounded-lg bg-off p-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <CampoTexto rotulo="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Salvador" autoFocus />
                <CampoTexto rotulo="Data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
              </div>
              <CampoTexto rotulo="Local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Casa de show, arena ou festival" />
              <div className="flex gap-2 pt-1">
                <Botao type="submit" pequeno>
                  Adicionar data
                </Botao>
                <Botao type="button" variante="ghost" pequeno onClick={() => setFormEventoDe(null)}>
                  Cancelar
                </Botao>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function ParteDetalhe() {
  const { parteId } = useParams();
  const candidaturas = useStore((s) => s.candidaturas);
  const criterios = useStore((s) => s.criterios);
  const avaliacoes = useStore((s) => s.avaliacoes);
  const carregarParte = useStore((s) => s.carregarParte);
  const editarParte = useStore((s) => s.editarParte);
  const arquivarParte = useStore((s) => s.arquivarParte);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [editando, setEditando] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [confirmarArquivar, setConfirmarArquivar] = useState(false);

  const parte = useStore((s) => s.partes.find((p) => p.id === parteId));

  // Carrega a Parte completa do backend (papéis + contatos) ao abrir. Só
  // dispara para ids reais (UUID); ignora os ids de seed mock ainda presentes.
  useEffect(() => {
    if (parteId && UUID_RE.test(parteId)) {
      carregarParte(parteId).catch((e) =>
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar a Parte.'),
      );
    }
  }, [parteId, carregarParte, toast]);

  if (!parte) return <Navigate to="/partes" replace />;

  // Histórico transversal: participações desta Parte em todos os clientes
  const historicoCandidaturas = candidaturas
    .filter((c) => c.marcaId === parte.id)
    .map((c) => {
      const cliente = CLIENTES.find((cl) => cl.id === c.clienteId)!;
      const ativos = criterios.filter((cr) => cr.clienteId === c.clienteId && cr.ativo);
      const score = calcularScore(ativos, avaliacoes.find((a) => a.candidaturaId === c.id));
      return { candidatura: c, cliente, score };
    })
    .sort((a, b) => b.candidatura.dataEntrada.localeCompare(a.candidatura.dataEntrada));

  const historicoParcerias = PARCERIAS.filter((p) => p.marcaId === parte.id).map((p) => ({
    parceria: p,
    cliente: CLIENTES.find((cl) => cl.id === p.clienteId)!,
  }));

  const ehCliente = parte.papeis.includes('cliente');

  function abrirEdicao() {
    setEditNome(parte!.nome);
    setEditCategoria(parte!.categoria);
    setEditando(true);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editNome.trim() || salvandoEdicao) return;
    setSalvandoEdicao(true);
    try {
      await editarParte(parte!.id, parte!.tipo, { nome: editNome.trim(), categoria: editCategoria.trim() || undefined });
      toast('Dados atualizados.');
      setEditando(false);
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function confirmarArquivamento() {
    try {
      await arquivarParte(parte!.id);
      toast(`${parte!.nome} foi arquivada.`, 'info');
      navigate('/partes');
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível arquivar.');
    }
  }

  return (
    <div>
      <Link
        to="/partes"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.5} /> Base de relacionamentos
      </Link>

      <ConfirmDialog
        aberto={confirmarArquivar}
        titulo="Arquivar esta Parte?"
        descricao={`${parte.nome} sai da base ativa. O histórico é preservado (exclusão lógica), mas ela deixa de aparecer nas listas e buscas.`}
        rotuloConfirmar="Arquivar"
        perigo
        aoConfirmar={confirmarArquivamento}
        aoFechar={() => setConfirmarArquivar(false)}
      />

      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
            {parte.tipo === 'organizacao' ? (
              <Building2 size={22} strokeWidth={1.5} />
            ) : (
              <UserRound size={22} strokeWidth={1.5} />
            )}
          </span>
          <div>
            <RotuloMono className="mb-1">
              {parte.tipo === 'organizacao' ? 'Organização' : 'Pessoa'} · {parte.categoria} · na base desde{' '}
              {formatarData(parte.cadastradaEm)}
            </RotuloMono>
            {editando ? (
              <form onSubmit={salvarEdicao} className="mt-1 space-y-2">
                <input
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-mist bg-paper px-3 py-2 font-display text-2xl font-extrabold text-ink focus:border-accent"
                  autoFocus
                  aria-label="Nome da Parte"
                />
                <input
                  value={editCategoria}
                  onChange={(e) => setEditCategoria(e.target.value)}
                  placeholder={parte.tipo === 'organizacao' ? 'Segmento' : 'Nacionalidade'}
                  className="w-full max-w-md rounded-md border border-mist bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-mist focus:border-accent"
                  aria-label="Categoria"
                />
                <div className="flex gap-2 pt-1">
                  <Botao type="submit" pequeno disabled={salvandoEdicao}>{salvandoEdicao ? 'Salvando…' : 'Salvar'}</Botao>
                  <Botao type="button" variante="ghost" pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">{parte.nome}</h1>
                  <button
                    type="button"
                    onClick={abrirEdicao}
                    className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
                    title="Editar nome e categoria"
                  >
                    <Pencil size={11} strokeWidth={1.5} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarArquivar(true)}
                    className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-status-neg hover:text-status-neg"
                    title="Arquivar esta Parte"
                  >
                    <Trash2 size={11} strokeWidth={1.5} /> Arquivar
                  </button>
                </div>
                {parte.descricao && <p className="mt-2 max-w-2xl text-sm text-stone">{parte.descricao}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {parte.papeis.map((papel) => (
                    <Chip key={papel} tom={papel === 'cliente' ? 'info' : 'neutro'}>
                      {PAPEL_PARTE[papel]}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Inteligência estratégica */}
        <div className="space-y-4">
          <div className="card p-6">
            <RotuloMono className="mb-4">Perfil estratégico</RotuloMono>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-stone">Território</dt>
                <dd className="font-semibold text-ink">{parte.territorio}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone">Público</dt>
                <dd className="font-semibold text-ink">{parte.publico}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-stone">
                  <MapPin size={11} strokeWidth={1.5} /> Praças de atuação
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {parte.pracas.map((praca) => (
                    <span key={praca} className="rounded-full bg-cloud px-2.5 py-0.5 text-xs text-graphite">
                      {praca}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          <CardAtivos parteId={parte.id} ativos={parte.ativos} />

          {parte.canais.length > 0 && (
            <div className="card p-6">
              <RotuloMono className="mb-4">Canais de mídia & alcance</RotuloMono>
              <ul className="space-y-2.5">
                {parte.canais.map((canal) => (
                  <li key={canal.canal} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-graphite">
                      <Radio size={13} strokeWidth={1.5} className="text-stone" /> {canal.canal}
                    </span>
                    <span className="font-mono text-xs font-bold text-ink">{canal.alcance}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CardContatos parteId={parte.id} contatos={parte.contatos} />
        </div>

        {/* Histórico na Cross */}
        <div className="space-y-4 xl:col-span-2">
          {ehCliente && (
            <div className="card border-l-2 border-l-accent p-6">
              <RotuloMono className="mb-2">Vínculo comercial</RotuloMono>
              <p className="text-sm text-graphite">
                Esta Parte mantém vínculo ativo como <strong className="font-semibold text-ink">cliente Cross</strong>.
                Projetos, funil e score card ficam disponíveis ao selecioná-la no topo da plataforma.
              </p>
            </div>
          )}

          {/* Turnês editáveis — apenas para pessoas/artistas */}
          {parte.tipo === 'pessoa' && <EditorTurnes parteId={parte.id} />}

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
              <RotuloMono>Histórico como candidata a parceira</RotuloMono>
              <span className="font-mono text-xs text-stone">{historicoCandidaturas.length} participações</span>
            </div>
            {historicoCandidaturas.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-stone">
                Esta Parte ainda não participou de frentes de oportunidade como candidata.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-cloud">
                    <th className="label-mono px-6 py-3 font-normal">Cliente / projeto</th>
                    <th className="label-mono px-6 py-3 font-normal">Entrada</th>
                    <th className="label-mono px-6 py-3 font-normal">Status</th>
                    <th className="label-mono px-6 py-3 text-right font-normal">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud">
                  {historicoCandidaturas.map(({ candidatura, cliente, score }) => {
                    const st = STATUS_CANDIDATURA[candidatura.status];
                    return (
                      <tr key={candidatura.id} className="group transition-colors hover:bg-off">
                        <td className="px-6 py-3.5">
                          <Link
                            to={`/marcas/${candidatura.id}`}
                            className="font-semibold text-ink transition-colors group-hover:text-accent-deep"
                          >
                            {cliente.nome}
                          </Link>
                          <div className="text-xs text-stone">{cliente.segmento}</div>
                        </td>
                        <td className="px-6 py-3.5 text-stone">{formatarData(candidatura.dataEntrada)}</td>
                        <td className="px-6 py-3.5">
                          <Chip tom={st.tom}>{st.rotulo}</Chip>
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-sm">
                          {score ? (
                            <span className="font-bold text-ink">{score.percentual}%</span>
                          ) : (
                            <span className="text-mist">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
              <RotuloMono>Parcerias formalizadas</RotuloMono>
              <span className="font-mono text-xs text-stone">{historicoParcerias.length}</span>
            </div>
            {historicoParcerias.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-stone">Nenhuma parceria formalizada até o momento.</p>
            ) : (
              <ul className="divide-y divide-cloud">
                {historicoParcerias.map(({ parceria, cliente }) => (
                  <li key={parceria.id}>
                    <Link
                      to={`/parcerias/${parceria.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-off"
                    >
                      <div>
                        <div className="text-sm font-semibold text-ink">{parceria.nome}</div>
                        <div className="text-xs text-stone">
                          com {cliente.nome} · {parceria.tipo} · {formatarData(parceria.dataInicio)} a{' '}
                          {formatarData(parceria.dataFim)}
                        </div>
                      </div>
                      <Chip tom={parceria.status === 'ativa' ? 'info' : parceria.status === 'concluida' ? 'pos' : 'neutro'}>
                        {STATUS_PARCERIA[parceria.status]}
                      </Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
