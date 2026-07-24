import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { useDadosCliente } from '../lib/useDadosCliente';
import { NIVEL, STATUS_CANDIDATURA } from '../lib/format';
import { CabecalhoPagina, CampoSelecao, Chip, EstadoVazio, MedidorScore, RotuloMono } from '../components/ui';
import { normalizar } from '../lib/texto';

export function Marcas() {
  const { cliente, itens } = useDadosCliente();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [status, setStatus] = useState('todos');

  const categorias = useMemo(
    () => [...new Set(itens.map((i) => i.marca.categoria))].sort(),
    [itens],
  );

  const filtrados = itens.filter((i) => {
    if (busca && !normalizar(`${i.marca.nome} ${i.marca.categoria} ${i.marca.territorio}`).includes(normalizar(busca))) return false;
    if (categoria !== 'todas' && i.marca.categoria !== categoria) return false;
    if (status !== 'todos' && i.candidatura.status !== status) return false;
    return true;
  });

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Base de relacionamentos · ${cliente.nome}`}
        titulo="Base de marcas"
        descricao="Marcas mapeadas como candidatas a parceiras deste cliente, com o estado no funil e o score da metodologia Cross Score Card."
      />

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="relative min-w-64 flex-1">
          <span className="label-mono mb-1.5 block">Buscar marca</span>
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute bottom-2.5 left-3 text-stone" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, categoria ou território…"
            className="w-full rounded-md border border-mist bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-mist focus:border-accent"
          />
        </label>
        <CampoSelecao rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-56">
          <option value="todas">Todas</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Status no funil" value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
          <option value="todos">Todos</option>
          {Object.entries(STATUS_CANDIDATURA).map(([codigo, { rotulo }]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </CampoSelecao>
        <div className="pb-2 font-mono text-[12px] uppercase tracking-[0.12em] text-stone">
          {filtrados.length} de {itens.length}
        </div>
      </div>

      {/* Grade de marcas */}
      {filtrados.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma marca encontrada"
          descricao="Ajuste a busca ou os filtros para encontrar marcas mapeadas para este cliente."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((item) => {
            const st = STATUS_CANDIDATURA[item.candidatura.status];
            return (
              <Link
                key={item.candidatura.id}
                to={`/marcas/${item.candidatura.id}`}
                className="card group flex flex-col p-5 transition-shadow hover:shadow-pop"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <RotuloMono className="mb-1">{item.marca.categoria}</RotuloMono>
                    <h3 className="font-display text-lg font-bold leading-tight text-ink">{item.marca.nome}</h3>
                  </div>
                  <Chip tom={st.tom}>{st.rotulo}</Chip>
                </div>

                <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-stone">{item.marca.descricao}</p>

                <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone">
                  <span>
                    <strong className="font-semibold text-graphite">Território:</strong> {item.marca.territorio}
                  </span>
                  <span>
                    <strong className="font-semibold text-graphite">Público:</strong> {item.marca.publico}
                  </span>
                  <span>
                    <strong className="font-semibold text-graphite">Interesse do cliente:</strong>{' '}
                    {NIVEL[item.candidatura.interesseCliente]}
                  </span>
                </div>

                <div className="mt-auto border-t border-cloud pt-4">
                  {item.score ? (
                    <div className="flex items-center gap-3">
                      <MedidorScore percentual={item.score.percentual} className="flex-1" />
                      <span className="font-mono text-xs text-stone">
                        <strong className="text-ink">{item.score.percentual}%</strong> · {item.score.total.toFixed(0)} pts
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-stone">
                      <span>Score Card ainda não aplicado</span>
                      <span className="flex items-center gap-1 font-semibold text-accent group-hover:text-accent-deep">
                        Avaliar <ArrowRight size={12} strokeWidth={1.5} />
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
