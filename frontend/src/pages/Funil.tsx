import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useDadosCliente, type CandidaturaEnriquecida } from '../lib/useDadosCliente';
import { NIVEL, PRIORIDADE, STATUS_CANDIDATURA, diasDesde } from '../lib/format';
import { Botao, CabecalhoPagina, CampoSelecao, Chip, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import { transicoesValidas } from '../lib/funil';
import type { Nivel, Prioridade, StatusCandidatura } from '../types';

const FUNIL_ATIVO: StatusCandidatura[] = [
  'identificada',
  'em_analise',
  'recomendada',
  'apresentada',
  'em_negociacao',
  'aprovada',
];

const FORA_DO_FUNIL: StatusCandidatura[] = ['stand_by', 'recusada_cliente', 'recusada_parceiro', 'encerrada'];

const TODOS_STATUS = [...FUNIL_ATIVO, ...FORA_DO_FUNIL];

function CartaoCandidatura({
  item,
  aoArrastar,
}: {
  item: CandidaturaEnriquecida;
  aoArrastar: (id: string) => void;
}) {
  const moverCandidatura = useStore((s) => s.moverCandidatura);
  const { toast } = useToast();
  const dias = diasDesde(
    item.candidatura.historico[item.candidatura.historico.length - 1]?.data ?? item.candidatura.dataEntrada,
  );

  // Alternativa ao drag-and-drop por teclado: Ctrl/⌘ + ← → move entre etapas do funil.
  function moverPorTeclado(e: React.KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const idx = TODOS_STATUS.indexOf(item.candidatura.status);
    const alvo = TODOS_STATUS[idx + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!alvo) return;
    e.preventDefault();
    moverCandidatura(item.candidatura.id, alvo, 'Movida por teclado no funil.');
    toast(`${item.marca.nome}: ${STATUS_CANDIDATURA[alvo].rotulo}.`);
  }

  return (
    <div
      draggable
      tabIndex={0}
      role="group"
      aria-label={`${item.marca.nome}, etapa ${STATUS_CANDIDATURA[item.candidatura.status].rotulo}. Use Ctrl com as setas para mover.`}
      onKeyDown={moverPorTeclado}
      onDragStart={(e) => {
        aoArrastar(item.candidatura.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group cursor-grab rounded-lg border border-cloud bg-paper p-3.5 shadow-card transition-shadow hover:shadow-pop focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <Link
          to={`/marcas/${item.candidatura.id}`}
          className="text-sm font-semibold leading-tight text-ink transition-colors hover:text-accent-deep"
        >
          {item.marca.nome}
        </Link>
        <GripVertical size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist" />
      </div>
      <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
        {item.marca.categoria}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {item.score ? (
          <Chip tom={item.score.percentual >= 70 ? 'pos' : item.score.percentual >= 45 ? 'warn' : 'neutro'}>
            score {item.score.percentual}%
          </Chip>
        ) : (
          <Chip tom="neutro">sem score</Chip>
        )}
        <Chip tom={item.candidatura.prioridade === 'alta' ? 'info' : 'neutro'}>
          prioridade {PRIORIDADE[item.candidatura.prioridade].toLowerCase()}
        </Chip>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-cloud pt-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-stone">
          {dias === 0 ? 'hoje' : `${dias}d na etapa`}
        </span>
        {/* Fallback acessível ao drag-and-drop */}
        <select
          value={item.candidatura.status}
          onChange={(e) => {
            const novo = e.target.value as StatusCandidatura;
            moverCandidatura(item.candidatura.id, novo);
            toast(`${item.marca.nome}: ${STATUS_CANDIDATURA[novo].rotulo}.`);
          }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-32 cursor-pointer rounded border border-transparent bg-transparent py-0.5 text-[12px] text-stone transition-colors hover:border-mist hover:text-ink focus:border-accent"
          aria-label={`Mover ${item.marca.nome}`}
        >
          {transicoesValidas(item.candidatura.status).map((s) => (
            <option key={s} value={s}>
              {STATUS_CANDIDATURA[s].rotulo}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Coluna({
  status,
  itens,
  arrastandoId,
  aoArrastar,
  compacta = false,
}: {
  status: StatusCandidatura;
  itens: CandidaturaEnriquecida[];
  arrastandoId: string | null;
  aoArrastar: (id: string) => void;
  compacta?: boolean;
}) {
  const moverCandidatura = useStore((s) => s.moverCandidatura);
  const { toast } = useToast();
  const [sobre, setSobre] = useState(false);
  const meta = STATUS_CANDIDATURA[status];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        if (arrastandoId) {
          moverCandidatura(arrastandoId, status, 'Movida no funil comercial.');
          toast(`Candidatura movida para “${meta.rotulo}”.`);
        }
      }}
      className={`flex w-72 shrink-0 flex-col rounded-lg border transition-colors ${
        sobre ? 'border-accent bg-accent-soft' : 'border-cloud bg-off'
      } ${compacta ? 'min-h-40' : 'min-h-[420px]'}`}
    >
      <div className="flex items-center justify-between border-b border-cloud px-4 py-3">
        <div className="flex items-center gap-2">
          <Chip tom={meta.tom}>{meta.rotulo}</Chip>
        </div>
        <span className="font-mono text-xs font-bold text-stone">{itens.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {itens.map((item) => (
          <CartaoCandidatura key={item.candidatura.id} item={item} aoArrastar={aoArrastar} />
        ))}
        {itens.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-mist py-6 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            solte aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nova candidatura (RF025 — Parte + frente; nasce "identificada" com histórico RN017) ──

function FormNovaCandidatura({
  clienteId,
  aoFechar,
}: {
  clienteId: string;
  aoFechar: () => void;
}) {
  const partes = useStore((s) => s.partes);
  const candidaturas = useStore((s) => s.candidaturas);
  const projetos = useStore((s) => s.projetos);
  const frentes = useStore((s) => s.frentes);
  const adicionarCandidatura = useStore((s) => s.adicionarCandidatura);
  const { toast } = useToast();

  const frentesDoCliente = frentes.filter((f) =>
    projetos.some((p) => p.id === f.projetoId && p.clienteId === clienteId),
  );
  const [frenteId, setFrenteId] = useState(frentesDoCliente[0]?.id ?? '');
  const [marcaId, setMarcaId] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('media');
  const [interesse, setInteresse] = useState<Nivel>('medio');
  const [salvando, setSalvando] = useState(false);

  // RN015: a mesma Parte não pode ter duas candidaturas ativas na mesma frente
  const ENCERRADAS: StatusCandidatura[] = ['recusada_cliente', 'recusada_parceiro', 'encerrada'];
  const elegiveis = partes.filter(
    (p) =>
      !p.papeis.includes('cliente') &&
      !candidaturas.some(
        (c) => c.frenteId === frenteId && c.marcaId === p.id && !ENCERRADAS.includes(c.status),
      ),
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!frenteId || !marcaId || salvando) return;
    setSalvando(true);
    try {
      await adicionarCandidatura({ clienteId, frenteId, marcaId, prioridade, interesseCliente: interesse });
      const nomeMarca = partes.find((p) => p.id === marcaId)?.nome ?? 'Candidatura';
      toast(`${nomeMarca} entrou no funil como “Identificada”.`);
      aoFechar();
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível adicionar a candidatura.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="card mb-6 p-6">
      <RotuloMono className="mb-4">
        Nova candidatura — a Parte entra na frente como “identificada”, com histórico registrado
      </RotuloMono>
      <div className="grid gap-4 md:grid-cols-4">
        <CampoSelecao
          rotulo="Frente de oportunidade"
          value={frenteId}
          onChange={(e) => {
            setFrenteId(e.target.value);
            setMarcaId('');
          }}
        >
          {frentesDoCliente.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Parte candidata" value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
          <option value="">Selecione…</option>
          {elegiveis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} · {p.categoria}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Prioridade"
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value as Prioridade)}
        >
          {Object.entries(PRIORIDADE).map(([codigo, rotulo]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Interesse do cliente"
          value={interesse}
          onChange={(e) => setInteresse(e.target.value as Nivel)}
        >
          {(['alto', 'medio', 'baixo'] as Nivel[]).map((n) => (
            <option key={n} value={n}>
              {NIVEL[n]}
            </option>
          ))}
        </CampoSelecao>
      </div>
      <p className="mt-3 text-xs text-stone">
        Não achou a marca? <Link to="/partes" className="font-semibold text-accent-deep hover:underline">Cadastre uma nova Parte</Link>{' '}
        na Base de Relacionamentos e volte aqui.
      </p>
      <div className="mt-4 flex gap-2">
        <Botao type="submit" pequeno disabled={!marcaId || !frenteId || salvando}>
          {salvando ? 'Adicionando…' : 'Adicionar ao funil'}
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

export function Funil() {
  const { cliente, itens } = useDadosCliente();
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarFrentesDosProjetos = useStore((s) => s.carregarFrentesDosProjetos);
  const carregarPartes = useStore((s) => s.carregarPartes);
  const carregarCandidaturas = useStore((s) => s.carregarCandidaturas);
  const { toast } = useToast();
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  // Carrega a cadeia que o funil precisa: partes (as "marcas"), projetos e
  // frentes do cliente, e então as candidaturas. Refaz ao trocar de cliente.
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([carregarPartes(), carregarProjetos()]);
        await carregarFrentesDosProjetos();
        await carregarCandidaturas();
      } catch (e) {
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar o funil.');
      }
    })();
  }, [clienteAtivoId, carregarPartes, carregarProjetos, carregarFrentesDosProjetos, carregarCandidaturas, toast]);

  const porStatus = (status: StatusCandidatura) =>
    itens
      .filter((i) => i.candidatura.status === status)
      .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Prospecção · ${cliente.nome}`}
        titulo="Funil comercial"
        descricao="Arraste os cartões entre as etapas (ou use o seletor no cartão). Cada movimentação registra o histórico da candidatura — status anterior, novo, data e responsável."
        acoes={
          <Botao pequeno onClick={() => setFormAberto((v) => !v)}>
            <Plus size={14} strokeWidth={1.5} /> Nova candidatura
          </Botao>
        }
      />

      {formAberto && (
        <div className="anim-abre">
          <FormNovaCandidatura clienteId={cliente.id} aoFechar={() => setFormAberto(false)} />
        </div>
      )}

      <RotuloMono className="mb-3">Funil ativo</RotuloMono>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {FUNIL_ATIVO.map((status) => (
          <Coluna
            key={status}
            status={status}
            itens={porStatus(status)}
            arrastandoId={arrastandoId}
            aoArrastar={setArrastandoId}
          />
        ))}
      </div>

      <RotuloMono className="mb-3 mt-8">Fora do funil</RotuloMono>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {FORA_DO_FUNIL.map((status) => (
          <Coluna
            key={status}
            status={status}
            itens={porStatus(status)}
            arrastandoId={arrastandoId}
            aoArrastar={setArrastandoId}
            compacta
          />
        ))}
      </div>
    </div>
  );
}
