import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, MapPin, Music2, Pencil, Plus, Radio, Trash2, UserRound } from 'lucide-react';
import { CLIENTES, useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import * as partesApi from '../api/partes.api';
import * as clientesApi from '../api/clientes.api';
import type { Parte } from '../types';
import { PARCERIAS } from '../data/mock';

// Ids reais do backend são UUID; ids de seed mock (ex.: "parte-...") não casam.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { STATUS_PARCERIA, formatarData, formatarDataCurta } from '../lib/format';
import { Botao, CampoTexto, Chip, RotuloMono } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { PAPEL_PARTE } from './Partes';

function paraLista(texto: string): string[] {
  return Array.from(new Set(texto.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)));
}

function separarMarcadores(texto: string): string[] {
  return Array.from(new Set(texto.split(/[\n,;·]+/).map((item) => item.trim()).filter(Boolean)));
}

function separarResponsavel(texto?: string): { nome: string; cargo?: string } | null {
  if (!texto?.trim()) return null;
  const [nome, ...resto] = texto.split('·').map((item) => item.trim()).filter(Boolean);
  return { nome, cargo: resto.join(' · ') || undefined };
}

function CardPerfilEstrategico({ parte, aoAtualizar }: { parte: Parte; aoAtualizar: () => Promise<void> }) {
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmarPromocao, setConfirmarPromocao] = useState(false);
  const [resumo, setResumo] = useState('');
  const [posicionamento, setPosicionamento] = useState('');
  const [objetivos, setObjetivos] = useState('');
  const [desafios, setDesafios] = useState('');
  const [frentesPrioritarias, setFrentesPrioritarias] = useState('');
  const [responsavelMarca, setResponsavelMarca] = useState('');
  const [territorios, setTerritorios] = useState('');
  const [publicos, setPublicos] = useState('');
  const [pracas, setPracas] = useState('');
  const ehCliente = parte.papeis.includes('cliente');
  const camposDoPerfil = ehCliente ? [
    parte.perfilEstrategico?.resumo || parte.descricao,
    parte.perfilEstrategico?.posicionamento,
    parte.perfilEstrategico?.objetivos,
    parte.perfilEstrategico?.frentesPrioritarias,
    parte.perfilEstrategico?.responsavelMarca,
    parte.territorio,
    parte.publico,
  ] : [
    parte.perfilEstrategico?.resumo || parte.descricao,
    parte.perfilEstrategico?.posicionamento,
    parte.perfilEstrategico?.objetivos,
    parte.territorio,
    parte.publico,
    parte.pracas.length > 0 ? 'preenchido' : '',
  ];
  const camposPreenchidos = camposDoPerfil.filter((valor) => valor?.trim()).length;
  const perfilIncompleto = camposPreenchidos < 4;
  const territoriosDaMarca = separarMarcadores(parte.territorio);
  const pracasDaMarca = parte.pracas;
  const responsavelDaMarca = separarResponsavel(parte.perfilEstrategico?.responsavelMarca);

  function preencherComParte() {
    setResumo(parte.perfilEstrategico?.resumo ?? parte.descricao);
    setPosicionamento(parte.perfilEstrategico?.posicionamento ?? '');
    setObjetivos(parte.perfilEstrategico?.objetivos ?? '');
    setDesafios(parte.perfilEstrategico?.desafios ?? '');
    setFrentesPrioritarias(parte.perfilEstrategico?.frentesPrioritarias ?? '');
    setResponsavelMarca(parte.perfilEstrategico?.responsavelMarca ?? '');
    setTerritorios(parte.territorio.split(' · ').filter(Boolean).join(', '));
    setPublicos(parte.publico.split(' · ').filter(Boolean).join(', '));
    setPracas(parte.pracas.join(', '));
  }

  function abrirEdicao() {
    preencherComParte();
    setEditando(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando || ![resumo, posicionamento, objetivos, desafios, frentesPrioritarias, territorios, publicos, pracas, ...(ehCliente ? [responsavelMarca] : [])].some((valor) => valor.trim())) {
      toast('Preencha ao menos uma informação da marca.', 'info');
      return;
    }
    setSalvando(true);
    try {
      await partesApi.salvarInteligenciaParte(parte.id, {
        resumo, posicionamento, objetivos, desafios, frentesPrioritarias, responsavelMarca: ehCliente ? responsavelMarca : undefined,
        territorios: paraLista(territorios), publicos: paraLista(publicos), pracas: paraLista(pracas),
      });
      await aoAtualizar();
      setEditando(false);
      toast('Informações da marca atualizadas.');
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar as informações da marca.');
    } finally {
      setSalvando(false);
    }
  }

  async function promoverACliente() {
    try {
      await clientesApi.promoverParteACliente(parte.id);
      await aoAtualizar();
      toast(`${parte.nome} agora é cliente Cross. O perfil de cliente foi liberado.`);
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível promover esta marca a cliente Cross.');
      throw erro;
    }
  }

  return (
    <div className="card p-6">
      <ConfirmDialog
        aberto={confirmarPromocao}
        titulo="Tornar esta marca cliente Cross?"
        descricao="A marca continuará disponível como parceira e preservará seu histórico. Apenas será adicionada a camada de cliente, com responsável pela marca e frentes prioritárias."
        rotuloConfirmar="Tornar cliente Cross"
        aoConfirmar={promoverACliente}
        aoFechar={() => setConfirmarPromocao(false)}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RotuloMono>{ehCliente ? 'Perfil de cliente Cross' : 'Perfil de parceiro'}</RotuloMono>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${perfilIncompleto ? 'bg-status-warnsoft text-status-warn' : 'bg-status-possoft text-status-pos'}`}>
            {camposPreenchidos}/{ehCliente ? 7 : 6} campos
          </span>
        </div>
        {!editando && <div className="flex flex-wrap gap-2">
          {!ehCliente && <Botao pequeno variante="ghost" onClick={() => setConfirmarPromocao(true)}>Tornar cliente Cross</Botao>}
          <Botao pequeno variante={perfilIncompleto ? 'primario' : 'ghost'} onClick={abrirEdicao}><Pencil size={13} strokeWidth={1.5} /> {perfilIncompleto ? 'Preencher informações' : 'Editar informações'}</Botao>
        </div>}
      </div>

      {editando ? (
        <form onSubmit={salvar} className="space-y-4">
          <div className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3 text-xs leading-relaxed text-graphite">{ehCliente ? 'Inclua o contexto estratégico que orienta o trabalho da Cross com esta marca.' : 'Registre dados públicos e comparáveis para avaliar esta marca em cruzamentos e parcerias.'} Você poderá evoluir estes campos depois, sem perder o histórico.</div>
          <label className="block text-xs font-semibold text-stone">Resumo curto da marca<textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} placeholder="Em poucas linhas, explique o que a marca é e sua proposta." className="mt-1 w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone/70 focus:border-accent" /></label>
          <div className={ehCliente ? 'grid gap-3 sm:grid-cols-2' : undefined}>
            <CampoTexto rotulo="Público-alvo e consumidores (separe por vírgulas)" value={publicos} onChange={(e) => setPublicos(e.target.value)} placeholder="Ex.: Homens 25–40, consumidores premium" />
            {ehCliente && <CampoTexto rotulo="Frentes prioritárias (separe por vírgulas)" value={frentesPrioritarias} onChange={(e) => setFrentesPrioritarias(e.target.value)} placeholder="Ex.: Tênis, camisaria, experiência em loja" />}
          </div>
          <label className="block text-xs font-semibold text-stone">Objetivos para a Crossability<textarea value={objetivos} onChange={(e) => setObjetivos(e.target.value)} rows={2} placeholder="O que a marca busca desenvolver em parcerias?" className="mt-1 w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone/70 focus:border-accent" /></label>
          <label className="block text-xs font-semibold text-stone">Posicionamento da marca<textarea value={posicionamento} onChange={(e) => setPosicionamento(e.target.value)} rows={2} placeholder="Como a marca quer ser percebida?" className="mt-1 w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone/70 focus:border-accent" /></label>
          <div className={ehCliente ? 'grid gap-3 sm:grid-cols-2' : undefined}>
            {ehCliente && <CampoTexto rotulo="Responsável pela marca" value={responsavelMarca} onChange={(e) => setResponsavelMarca(e.target.value)} placeholder="Ex.: Nome · cargo" />}
            <CampoTexto rotulo="Territórios de atuação (separe por vírgulas)" value={territorios} onChange={(e) => setTerritorios(e.target.value)} placeholder="Ex.: Moda, lifestyle, esporte" />
          </div>
          <CampoTexto rotulo="Praças de atuação (separe por vírgulas)" value={pracas} onChange={(e) => setPracas(e.target.value)} placeholder="Ex.: São Paulo · SP, Rio de Janeiro · RJ" />
          <label className="block text-xs font-semibold text-stone">Pontos de atenção<textarea value={desafios} onChange={(e) => setDesafios(e.target.value)} rows={2} placeholder="Contextos ou desafios que devem ser considerados nas parcerias." className="mt-1 w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone/70 focus:border-accent" /></label>
          <div className="flex gap-2"><Botao type="submit" pequeno disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar perfil'}</Botao><Botao type="button" pequeno variante="ghost" onClick={() => setEditando(false)}>Cancelar</Botao></div>
        </form>
      ) : (
        <>
          {perfilIncompleto && (
            <div className="mb-5 rounded-xl border border-dashed border-accent/40 bg-accent-soft/30 p-4">
              <p className="text-sm font-semibold text-ink">Comece pelo essencial desta marca</p>
              <p className="mt-1 text-xs leading-relaxed text-stone">{ehCliente ? 'Adicione o resumo, o público, os objetivos e as frentes prioritárias. Esses dados organizam a leitura da marca para as próximas etapas.' : 'Adicione o resumo, o público, os objetivos, os territórios e a praça de atuação. Esses dados apoiam os cruzamentos entre marcas.'}</p>
              <button type="button" onClick={abrirEdicao} className="mt-3 text-xs font-bold text-accent-deep hover:underline">Preencher informações da marca →</button>
            </div>
          )}
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            {(parte.perfilEstrategico?.resumo || parte.descricao) && <div className="sm:col-span-2"><dt className="text-xs text-stone">Resumo de marca</dt><dd className="mt-1 leading-relaxed text-graphite">{parte.perfilEstrategico?.resumo || parte.descricao}</dd></div>}
            <div className={ehCliente || pracasDaMarca.length > 0 ? undefined : 'sm:col-span-2'}><dt className="text-xs text-stone">Territórios</dt><dd className="mt-2 flex flex-wrap gap-1.5">{territoriosDaMarca.length > 0 ? territoriosDaMarca.map((territorio) => <span key={territorio} className="rounded-full bg-cloud px-2.5 py-1 text-xs font-medium text-graphite">{territorio}</span>) : <span className="text-sm text-stone">Não informado</span>}</dd></div>
            {!ehCliente && pracasDaMarca.length > 0 && <div><dt className="text-xs text-stone">Praça de atuação</dt><dd className="mt-2 flex flex-wrap gap-1.5">{pracasDaMarca.map((praca) => <span key={praca} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-deep">{praca}</span>)}</dd></div>}
            {ehCliente && <div><dt className="text-xs text-stone">Responsável pela marca</dt><dd className="mt-2 text-sm text-graphite">{responsavelDaMarca ? <><strong className="font-semibold text-ink">{responsavelDaMarca.nome}</strong>{responsavelDaMarca.cargo && <span className="text-stone"> · {responsavelDaMarca.cargo}</span>}</> : <span className="text-stone">Não informado</span>}</dd></div>}
          </dl>
        </>
      )}
    </div>
  );
}

function CardObjetivos({ parte }: { parte: Parte }) {
  const objetivos = parte.perfilEstrategico?.objetivos;
  const frentes = paraLista(parte.perfilEstrategico?.frentesPrioritarias ?? '');
  const ehCliente = parte.papeis.includes('cliente');
  return (
    <section className="card p-5">
      <RotuloMono className="mb-4">{ehCliente ? 'Objetivos' : 'Objetivos de parceria'}</RotuloMono>
      {objetivos ? <p className="text-sm leading-relaxed text-graphite">{objetivos}</p> : <p className="text-sm text-stone">Ainda não informado.</p>}
      {ehCliente && <div className="mt-5 border-t border-cloud pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone">Frentes prioritárias</p>
        {frentes.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">{frentes.map((frente) => <span key={frente} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-deep">{frente}</span>)}</div>
        ) : <p className="mt-2 text-sm text-stone">Ainda não informadas.</p>}
      </div>}
    </section>
  );
}

function CardConsumidores({ parte }: { parte: Parte }) {
  const consumidores = separarMarcadores(parte.publico);
  return (
    <section className="card p-5">
      <RotuloMono className="mb-4">Consumidores</RotuloMono>
      {consumidores.length > 0 ? (
        <ul className="space-y-3">{consumidores.map((consumidor) => <li key={consumidor} className="flex items-start gap-2 text-sm leading-relaxed text-graphite"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{consumidor}</li>)}</ul>
      ) : <p className="text-sm text-stone">Ainda não informado.</p>}
    </section>
  );
}

// ─── Card de ativos com cadastro inline (RF012 — propriedades, cotas, espaços) ─
function CardAtivos({ parteId, ativos }: { parteId: string; ativos: { nome: string; tipo: string }[] }) {
  const adicionarAtivo = useStore((s) => s.adicionarAtivoParte);
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      await adicionarAtivo(parteId, { nome: nome.trim(), tipo: tipo.trim() || 'Ativo' });
      toast(`Ativo “${nome.trim()}” adicionado.`);
      setNome('');
      setTipo('');
      setAberto(false);
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível adicionar o ativo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card p-5">
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
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {ativos.map((ativo) => (
            <li key={ativo.nome} className="flex items-start gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold text-ink">{ativo.nome}</div>
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-stone">{ativo.tipo}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-mist bg-off/70 p-4">
          <p className="text-sm font-semibold text-ink">Nenhum ativo cadastrado</p>
          <p className="mt-1 text-xs leading-relaxed text-stone">Cadastre propriedades, canais, eventos ou espaços que esta marca pode levar para uma parceria.</p>
          <button type="button" onClick={() => setAberto(true)} className="mt-3 text-xs font-bold text-accent-deep hover:underline">Adicionar primeiro ativo →</button>
        </div>
      )}
      {aberto && (
        <form onSubmit={salvar} className="anim-abre mt-4 space-y-2.5 rounded-lg bg-off p-3.5">
          <CampoTexto rotulo="Ativo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Festival Maré (propriedade)" autoFocus />
          <CampoTexto rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex.: Propriedade, Cota, Espaço, Mídia" />
          <div className="flex gap-2 pt-1">
            <Botao type="submit" pequeno disabled={salvando}>{salvando ? 'Adicionando…' : 'Adicionar'}</Botao>
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
  const [marcasDoGrupo, setMarcasDoGrupo] = useState<partesApi.MarcaDoGrupo[]>([]);

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

  useEffect(() => {
    if (!parteId || !UUID_RE.test(parteId)) return;
    partesApi.listarMarcasDoGrupo(parteId)
      .then(setMarcasDoGrupo)
      .catch(() => setMarcasDoGrupo([]));
  }, [parteId]);

  if (!parte) return <Navigate to="/partes" replace />;

  const historicoParcerias = PARCERIAS.filter((p) => p.marcaId === parte.id).map((p) => ({
    parceria: p,
    cliente: CLIENTES.find((cl) => cl.id === p.clienteId)!,
  }));

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
      toast(`${parte!.nome} foi removida da base ativa.`, 'info');
      navigate('/partes');
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível arquivar.');
      throw err;
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
        titulo="Excluir esta Parte da base?"
        descricao={`${parte.nome} deixará de aparecer nas listas e buscas. O histórico é preservado para manter a rastreabilidade da operação.`}
        rotuloConfirmar="Excluir da base"
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
                    title="Excluir da base ativa"
                  >
                    <Trash2 size={11} strokeWidth={1.5} /> Excluir
                  </button>
                </div>
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

      {marcasDoGrupo.length > 0 && (
        <section className="mb-8 rounded-xl border border-accent/30 bg-accent-soft/25 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <RotuloMono className="mb-1">Estrutura do grupo</RotuloMono>
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Marcas do {parte.nome}</h2>
              <p className="mt-1 text-sm text-stone">Cada marca possui perfil, objetivos e dados estratégicos próprios.</p>
            </div>
            <span className="font-mono text-xs text-accent-deep">{marcasDoGrupo.length} marcas</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {marcasDoGrupo.map((marca) => (
              <Link
                key={marca.id}
                to={`/partes/${marca.id}`}
                className="group rounded-lg border border-cloud bg-paper p-4 transition-colors hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper"><Building2 size={15} strokeWidth={1.5} /></span>
                  <ArrowRight size={16} strokeWidth={1.5} className="text-stone transition-transform group-hover:translate-x-0.5 group-hover:text-accent-deep" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{marca.nome}</h3>
                <p className="mt-1 text-xs text-stone">{marca.categoria ?? 'Perfil estratégico a preencher'}</p>
                <span className="mt-4 inline-block text-xs font-bold text-accent-deep">Preencher perfil →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {marcasDoGrupo.length === 0 && (
      <div className="space-y-5">
          <CardPerfilEstrategico parte={parte} aoAtualizar={() => carregarParte(parte.id)} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <div className="order-2 lg:order-1">
              <CardAtivos parteId={parte.id} ativos={parte.ativos} />
            </div>
            <div className="order-1 space-y-4 lg:order-2">
              <CardObjetivos parte={parte} />
              <CardConsumidores parte={parte} />
            </div>
          </div>

          {parte.canais.length > 0 && (
            <div className="card p-5">
              <RotuloMono className="mb-3">Canais de mídia & alcance</RotuloMono>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {parte.canais.map((canal) => (
                  <li key={canal.canal} className="flex items-center justify-between gap-3 rounded-lg bg-off px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-graphite"><Radio size={13} strokeWidth={1.5} className="text-stone" /> {canal.canal}</span>
                    {canal.url ? <a href={canal.url} target="_blank" rel="noreferrer" className="font-mono text-xs font-bold text-accent-deep hover:underline">{canal.alcance}</a> : <span className="font-mono text-xs font-bold text-ink">{canal.alcance}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
              <RotuloMono>Parcerias formalizadas</RotuloMono>
              <span className="font-mono text-xs text-stone">{historicoParcerias.length}</span>
            </div>
            {historicoParcerias.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-semibold text-ink">Nenhuma parceria formalizada ainda</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone">Acompanhe as candidaturas acima e formalize a parceria quando a negociação evoluir.</p>
              </div>
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
          </section>
          {parte.tipo === 'pessoa' && <EditorTurnes parteId={parte.id} />}
      </div>
      )}
    </div>
  );
}
