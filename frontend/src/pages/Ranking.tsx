import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useDadosCliente } from '../lib/useDadosCliente';
import { STATUS_CANDIDATURA } from '../lib/format';
import { classificarScore } from '../lib/score';
import { CabecalhoPagina, CampoSelecao, Chip, EstadoVazio, MedidorScore } from '../components/ui';

export function Ranking() {
  const { cliente, ranking, criterios } = useDadosCliente();
  const [categoria, setCategoria] = useState('todas');
  const [status, setStatus] = useState('todos');
  const [scoreMinimo, setScoreMinimo] = useState(0);
  const [somenteCompletas, setSomenteCompletas] = useState(false);

  const categorias = useMemo(
    () => [...new Set(ranking.map((i) => i.marca.categoria))].sort(),
    [ranking],
  );

  const filtrados = ranking.filter((i) => {
    if (categoria !== 'todas' && i.marca.categoria !== categoria) return false;
    if (status !== 'todos' && i.candidatura.status !== status) return false;
    if ((i.score?.percentual ?? 0) < scoreMinimo) return false;
    if (somenteCompletas && !i.score?.completa) return false;
    return true;
  });

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Cross Score Card · ${cliente.nome}`}
        titulo="Ranking de marcas"
        descricao="Priorização quantitativa das candidaturas avaliadas. O score é determinístico: soma dos pesos conforme as respostas, mais o potencial disruptivo."
      />

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
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
        <label className="flex w-56 flex-col gap-1.5">
          <span className="label-mono">Score mínimo · {scoreMinimo}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={scoreMinimo}
            onChange={(e) => setScoreMinimo(Number(e.target.value))}
            className="accent-[#B98E4A]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-graphite">
          <input
            type="checkbox"
            checked={somenteCompletas}
            onChange={(e) => setSomenteCompletas(e.target.checked)}
            className="h-4 w-4 accent-[#B98E4A]"
          />
          Somente avaliações completas
        </label>
        <div className="ml-auto pb-2 font-mono text-[12px] uppercase tracking-[0.12em] text-stone">
          {filtrados.length} marcas
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma marca no ranking"
          descricao="Nenhuma avaliação corresponde aos filtros. Aplique o Score Card às marcas na Base de Marcas para compor o ranking."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cloud">
                  <th className="label-mono w-16 px-5 py-3.5 text-center font-normal">#</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Marca</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Categoria</th>
                  <th className="label-mono w-64 px-5 py-3.5 font-normal">Score</th>
                  <th className="label-mono px-5 py-3.5 text-right font-normal">Pontos</th>
                  <th className="label-mono px-5 py-3.5 text-center font-normal">Respostas</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Classificação</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {filtrados.map((item, idx) => {
                  const classe = classificarScore(item.score!.percentual);
                  const st = STATUS_CANDIDATURA[item.candidatura.status];
                  return (
                    <tr key={item.candidatura.id} className="group transition-colors hover:bg-off">
                      <td className="px-5 py-4 text-center">
                        {idx === 0 ? (
                          <Trophy size={16} strokeWidth={1.5} className="mx-auto text-accent" />
                        ) : (
                          <span className="font-mono text-sm font-bold text-stone">{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/marcas/${item.candidatura.id}`}
                          className="font-semibold text-ink transition-colors group-hover:text-accent-deep"
                        >
                          {item.marca.nome}
                        </Link>
                        <div className="text-xs text-stone">{item.marca.territorio}</div>
                      </td>
                      <td className="px-5 py-4 text-stone">{item.marca.categoria}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <MedidorScore percentual={item.score!.percentual} className="flex-1" />
                          <span className="w-10 text-right font-mono text-xs font-bold text-ink">
                            {item.score!.percentual}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-graphite">
                        {item.score!.total.toFixed(0)}
                        <span className="text-stone"> / {item.score!.maximo.toFixed(0)}</span>
                      </td>
                      <td className="px-5 py-4 text-center font-mono text-xs text-stone">
                        {item.score!.respondidos}/{criterios.length}
                      </td>
                      <td className="px-5 py-4">
                        <Chip tom={classe.tom === 'neutro' ? 'neutro' : classe.tom}>{classe.rotulo}</Chip>
                      </td>
                      <td className="px-5 py-4">
                        <Chip tom={st.tom}>{st.rotulo}</Chip>
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
