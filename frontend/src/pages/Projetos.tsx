import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CLIENTES, PROJETOS, useStore } from '../store/useStore';
import { FASES_PROJETO, formatarDataCurta } from '../lib/format';
import { CabecalhoPagina, Chip, EstadoVazio, type TomChip } from '../components/ui';
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


export function Projetos() {
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const [aba, setAba] = useState<Aba>('todos');
  const [busca, setBusca] = useState('');
  const [somenteClienteAtivo, setSomenteClienteAtivo] = useState(false);

  const clienteAtivo = CLIENTES.find((c) => c.id === clienteAtivoId);

  const filtrados = PROJETOS.filter((p) => {
    if (aba !== 'todos' && p.status !== aba) return false;
    if (somenteClienteAtivo && p.clienteId !== clienteAtivoId) return false;
    if (busca) {
      const cliente = CLIENTES.find((c) => c.id === p.clienteId);
      if (!normalizar(`${p.nome} ${cliente?.nome} ${p.produto}`).includes(normalizar(busca))) return false;
    }
    return true;
  }).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  const contagem = (id: Aba) =>
    id === 'todos' ? PROJETOS.length : PROJETOS.filter((p) => p.status === id).length;

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Base histórica da Cross"
        titulo="Projetos"
        descricao="Todos os projetos de todos os clientes — a memória completa da operação. Cada projeto percorre o ciclo briefing → planejamento → Crossability → Plano tático → Score Card → implementação → acompanhamento."
      />

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

      {filtrados.length === 0 ? (
        <EstadoVazio titulo="Nenhum projeto encontrado" descricao="Ajuste a busca, a aba ou o filtro de cliente." />
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
                  const cliente = CLIENTES.find((c) => c.id === projeto.clienteId)!;
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
                            {cliente.sigla}
                          </span>
                          <span className="text-graphite">{cliente.nome}</span>
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
