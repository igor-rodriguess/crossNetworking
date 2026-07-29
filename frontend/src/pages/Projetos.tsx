import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useToast } from '../components/Toast';
import { FASES_PROJETO, formatarDataCurta } from '../lib/format';
import { Botao, CabecalhoPagina, CampoSelecao, CampoTexto, Chip, EstadoVazio, RotuloMono, type TomChip } from '../components/ui';
import { iniciais, normalizar } from '../lib/texto';
import type { StatusProjeto } from '../types';

export const STATUS_PROJETO: Record<StatusProjeto, { rotulo: string; tom: TomChip }> = {
  planejamento: { rotulo: 'Planejamento', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'info' },
  concluido: { rotulo: 'Concluído', tom: 'pos' },
};

export const ORIGEM_DEMANDA = {
  briefing_cliente: 'Briefing do cliente',
  oportunidade_cross: 'Oportunidade identificada pela Cross',
} as const;

type Aba = 'todos' | StatusProjeto;

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'em_andamento', rotulo: 'Em andamento' },
  { id: 'planejamento', rotulo: 'Planejamento' },
  { id: 'concluido', rotulo: 'Concluídos' },
];

// ─── Novo projeto (RF019 — vinculado ao cliente ativo) ──────────────────────
function FormNovoProjeto({ clienteId, nomeCliente, aoFechar }: { clienteId: string; nomeCliente: string; aoFechar: () => void }) {
  const criarProjeto = useStore((s) => s.criarProjeto);
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [produto, setProduto] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataPrevisaoFim, setDataPrevisaoFim] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !objetivo.trim() || salvando) return;
    setSalvando(true);
    try {
      await criarProjeto({
        clienteId, nome: nome.trim(), objetivo: objetivo.trim(), descricao: descricao.trim() || undefined,
        produto: produto.trim() || undefined, dataInicio: dataInicio || undefined,
        dataPrevisaoFim: dataPrevisaoFim || undefined, prioridade: prioridade || undefined,
      });
      toast(`Projeto “${nome.trim()}” criado para ${nomeCliente}.`);
      aoFechar();
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível criar o projeto.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="card anim-abre mb-6 p-6">
      <RotuloMono className="mb-4">Novo projeto — para {nomeCliente}</RotuloMono>
      <div className="grid gap-4 md:grid-cols-3">
        <CampoTexto rotulo="Nome do projeto" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plataforma de Verão 2026" autoFocus />
        <CampoTexto rotulo="Objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="O que o projeto busca alcançar" />
        <CampoTexto rotulo="Produto / marca (opcional)" value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex.: Aurora Zero" />
        <CampoTexto rotulo="Descrição estratégica" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Contexto, desafio e escopo" />
        <CampoTexto rotulo="Data de início" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <CampoTexto rotulo="Previsão de fim" type="date" value={dataPrevisaoFim} onChange={(e) => setDataPrevisaoFim(e.target.value)} />
        <CampoSelecao rotulo="Prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
          <option value="">A definir</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
        </CampoSelecao>
      </div>
      <div className="mt-5 flex gap-2">
        <Botao type="submit" pequeno disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar projeto'}
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}


export function Projetos() {
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const projetos = useStore((s) => s.projetos);
  const clientes = useStore((s) => s.clientes);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarClientes = useStore((s) => s.carregarClientes);
  const projetosCarregando = useStore((s) => s.projetosCarregando);
  const { toast } = useToast();
  const [aba, setAba] = useState<Aba>('todos');
  const [busca, setBusca] = useState('');
  const [somenteClienteAtivo, setSomenteClienteAtivo] = useState(false);
  const [formAberto, setFormAberto] = useState(false);

  // Carrega projetos e clientes reais ao abrir a tela.
  useEffect(() => {
    Promise.all([carregarProjetos(), carregarClientes()]).catch((e) =>
      toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar os projetos.'),
    );
  }, [carregarProjetos, carregarClientes, toast]);

  const clienteAtivo = clientes.find((c) => c.id === clienteAtivoId) ?? clientes[0];

  const filtrados = projetos.filter((p) => {
    if (aba !== 'todos' && p.status !== aba) return false;
    if (somenteClienteAtivo && p.clienteId !== clienteAtivoId) return false;
    if (busca) {
      const cliente = clientes.find((c) => c.id === p.clienteId);
      if (!normalizar(`${p.nome} ${cliente?.nome} ${p.produto}`).includes(normalizar(busca))) return false;
    }
    return true;
  }).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  const contagem = (id: Aba) =>
    id === 'todos' ? projetos.length : projetos.filter((p) => p.status === id).length;

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Base histórica da Cross"
        titulo="Projetos"
        descricao="Todos os projetos de todos os clientes — a memória completa da operação. Cada projeto percorre o ciclo briefing → planejamento → Crossability → Plano tático → Score Card → implementação → acompanhamento."
        acoes={
          clienteAtivo ? (
            <Botao pequeno onClick={() => setFormAberto((v) => !v)}>
              <Plus size={14} strokeWidth={1.5} /> Novo projeto
            </Botao>
          ) : undefined
        }
      />

      {formAberto && clienteAtivo && (
        <FormNovoProjeto clienteId={clienteAtivo.id} nomeCliente={clienteAtivo.nome} aoFechar={() => setFormAberto(false)} />
      )}

      {/* Abas + filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex overflow-hidden rounded-full border border-mist bg-paper">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                aba === a.id ? 'bg-ink text-paper' : 'text-stone hover:bg-off hover:text-ink'
              }`}
            >
              {a.rotulo} <span className="font-mono text-xs opacity-70">{contagem(a.id)}</span>
            </button>
          ))}
        </div>

        <label className="relative min-w-56 flex-1">
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar projetos, clientes…"
            className="w-full rounded-full border border-mist bg-paper py-2 pl-9 pr-4 text-sm text-ink placeholder:text-mist focus:border-accent"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-graphite">
          <input
            type="checkbox"
            checked={somenteClienteAtivo}
            onChange={(e) => setSomenteClienteAtivo(e.target.checked)}
            className="h-4 w-4 accent-[#B98E4A]"
          />
          Somente {clienteAtivo?.nome ?? 'cliente ativo'}
        </label>
      </div>

      {projetosCarregando && projetos.length === 0 ? (
        <EstadoVazio titulo="Carregando projetos…" descricao="Buscando os projetos no servidor." />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum projeto encontrado"
          descricao={projetos.length === 0 ? 'Nenhum projeto cadastrado no servidor ainda.' : 'Ajuste a busca, a aba ou o filtro de cliente.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cloud">
                  <th className="label-mono px-6 py-3.5 font-normal">Projeto</th>
                  <th className="label-mono px-6 py-3.5 font-normal">Cliente</th>
                  <th className="label-mono px-6 py-3.5 font-normal">Fase atual</th>
                  <th className="label-mono px-6 py-3.5 font-normal">Status</th>
                  <th className="label-mono px-6 py-3.5 font-normal">Responsável</th>
                  <th className="label-mono px-6 py-3.5 text-right font-normal">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {filtrados.map((projeto) => {
                  const cliente = clientes.find((c) => c.id === projeto.clienteId);
                  const fase = FASES_PROJETO.find((f) => f.id === projeto.faseAtual)!;
                  const st = STATUS_PROJETO[projeto.status];
                  return (
                    <tr key={projeto.id} className="group transition-colors hover:bg-off">
                      <td className="px-6 py-4">
                        <Link
                          to={`/projetos/${projeto.id}`}
                          className="font-semibold text-ink transition-colors group-hover:text-accent-deep"
                        >
                          {projeto.nome}
                        </Link>
                        <div className="text-xs text-stone">{projeto.produto}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-paper">
                            {cliente?.sigla ?? '—'}
                          </span>
                          <span className="text-graphite">{cliente?.nome ?? 'Cliente'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-accent">{fase.rotulo}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Chip tom={st.tom}>{st.rotulo}</Chip>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center -space-x-1.5" title={projeto.responsaveis.join(', ')}>
                          {projeto.responsaveis.slice(0, 3).map((resp) => (
                            <span
                              key={resp}
                              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper bg-cloud font-mono text-[10px] font-bold text-graphite"
                            >
                              {iniciais(resp)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs text-stone">
                        {formatarDataCurta(projeto.atualizadoEm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
