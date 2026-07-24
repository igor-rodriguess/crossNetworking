import { Printer } from 'lucide-react';
import { useDadosCliente } from '../lib/useDadosCliente';
import { STATUS_CANDIDATURA, STATUS_PARCERIA, formatarData } from '../lib/format';
import { classificarScore } from '../lib/score';
import { FRENTES, MARCAS, PROJETOS } from '../store/useStore';
import { LogoCross } from '../components/Logo';
import { Botao, CabecalhoPagina, Chip, RotuloMono } from '../components/ui';
import type { StatusCandidatura } from '../types';

const ETAPAS: StatusCandidatura[] = [
  'identificada',
  'em_analise',
  'recomendada',
  'apresentada',
  'em_negociacao',
  'aprovada',
];

export function Resumo() {
  const { cliente, itens, ranking, parcerias } = useDadosCliente();

  const avaliadas = ranking.length;
  const scoreMedio =
    avaliadas > 0 ? Math.round(ranking.reduce((s, i) => s + (i.score?.percentual ?? 0), 0) / avaliadas) : 0;
  const parceriasAtivas = parcerias.filter((p) => p.status === 'ativa').length;

  // Frentes abertas para o cliente: todas as frentes dos projetos deste cliente.
  const projetosCliente = PROJETOS.filter((p) => p.clienteId === cliente.id);
  const frentesCliente = FRENTES.filter((f) => projetosCliente.some((p) => p.id === f.projetoId));
  const frentesAtivas = frentesCliente.filter((f) => f.status !== 'encerrada').length;

  return (
    <div>
      <div className="print-hidden">
        <CabecalhoPagina
          sobretitulo={`Entrega ao cliente · ${cliente.nome}`}
          titulo="Resumo executivo"
          descricao="Documento consolidado para apresentação ao cliente — priorização do Score Card, panorama do funil e parcerias em execução. Use “Exportar PDF” para gerar o arquivo."
          acoes={
            <Botao onClick={() => window.print()}>
              <Printer size={15} strokeWidth={1.5} /> Exportar PDF
            </Botao>
          }
        />
      </div>

      {/* Folha A4 */}
      <div className="print-sheet card mx-auto max-w-3xl overflow-hidden">
        {/* Cabeçalho da folha */}
        <div className="flex items-start justify-between bg-ink px-10 py-8">
          <div>
            <LogoCross claro />
            <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-stone">
              Resumo executivo · Curadoria de parcerias
            </div>
            <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-paper">{cliente.nome}</h2>
          </div>
          <div className="text-right font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-stone">
            Emitido em {formatarData('2026-07-15')}
            <br />
            Conta: {cliente.responsavel}
            <br />
            Modelo: {cliente.modeloContratacao}
          </div>
        </div>

        <div className="space-y-9 px-10 py-9">
          {/* Indicadores */}
          <section>
            <RotuloMono className="mb-4">Indicadores do ciclo</RotuloMono>
            <div className="grid grid-cols-5 divide-x divide-cloud rounded-lg border border-cloud">
              {[
                { rotulo: 'Frentes abertas', valor: `${frentesAtivas}/${frentesCliente.length}` },
                { rotulo: 'Marcas mapeadas', valor: String(itens.length) },
                { rotulo: 'Avaliadas', valor: String(avaliadas) },
                { rotulo: 'Score médio', valor: `${scoreMedio}%` },
                { rotulo: 'Parcerias ativas', valor: String(parceriasAtivas) },
              ].map((kpi) => (
                <div key={kpi.rotulo} className="px-4 py-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone">{kpi.rotulo}</div>
                  <div className="mt-1.5 font-display text-2xl font-extrabold text-ink">{kpi.valor}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Frentes de trabalho abertas para o cliente */}
          <section>
            <RotuloMono className="mb-4">
              Frentes de trabalho abertas ({frentesAtivas} de {frentesCliente.length})
            </RotuloMono>
            {frentesCliente.length === 0 ? (
              <p className="py-3 text-sm text-stone">Nenhuma frente aberta para este cliente.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {frentesCliente.map((f) => {
                  const projeto = projetosCliente.find((p) => p.id === f.projetoId);
                  const encerrada = f.status === 'encerrada';
                  return (
                    <div
                      key={f.id}
                      className={`rounded-lg border border-cloud px-4 py-3 ${encerrada ? 'opacity-55' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">{f.nome}</span>
                        <Chip tom={f.status === 'em_andamento' ? 'info' : f.status === 'aberta' ? 'warn' : 'neutro'}>
                          {f.status === 'em_andamento' ? 'Em andamento' : f.status === 'aberta' ? 'Aberta' : 'Encerrada'}
                        </Chip>
                      </div>
                      <div className="mt-0.5 text-xs text-stone">
                        {f.territorio}
                        {projeto ? ` · ${projeto.nome}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Top 5 */}
          <section>
            <RotuloMono className="mb-4">Priorização · Cross Score Card (Top 5)</RotuloMono>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink">
                  <th className="w-8 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">#</th>
                  <th className="py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">Marca</th>
                  <th className="py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">Categoria</th>
                  <th className="py-2 text-right font-mono text-[11px] uppercase tracking-[0.1em] text-stone">Score</th>
                  <th className="py-2 text-right font-mono text-[11px] uppercase tracking-[0.1em] text-stone">%</th>
                  <th className="py-2 pl-4 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">Leitura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {ranking.slice(0, 5).map((item, idx) => (
                  <tr key={item.candidatura.id}>
                    <td className="py-2.5 font-mono text-xs font-bold text-stone">{idx + 1}</td>
                    <td className="py-2.5 font-semibold text-ink">{item.marca.nome}</td>
                    <td className="py-2.5 text-stone">{item.marca.categoria}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-graphite">
                      {item.score!.total.toFixed(0)} pts
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs font-bold text-ink">
                      {item.score!.percentual}%
                    </td>
                    <td className="py-2.5 pl-4">
                      <Chip
                        tom={
                          classificarScore(item.score!.percentual).tom === 'pos'
                            ? 'pos'
                            : classificarScore(item.score!.percentual).tom === 'warn'
                              ? 'warn'
                              : 'neutro'
                        }
                      >
                        {classificarScore(item.score!.percentual).rotulo}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Funil */}
          <section>
            <RotuloMono className="mb-4">Panorama do funil de prospecção</RotuloMono>
            <div className="grid grid-cols-6 gap-2">
              {ETAPAS.map((status) => {
                const total = itens.filter((i) => i.candidatura.status === status).length;
                return (
                  <div key={status} className="rounded-lg border border-cloud px-3 py-3 text-center">
                    <div className="font-display text-2xl font-extrabold text-ink">{total}</div>
                    <div className="mt-1 font-mono text-[9.5px] uppercase leading-tight tracking-[0.08em] text-stone">
                      {STATUS_CANDIDATURA[status].rotulo}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Parcerias */}
          <section>
            <RotuloMono className="mb-4">Parcerias formalizadas · 2026</RotuloMono>
            <div className="space-y-3">
              {parcerias.map((p) => {
                const marca = MARCAS.find((m) => m.id === p.marcaId);
                const proximaFase = p.fases.find((f) => !f.concluida);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-4 rounded-lg border border-cloud px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ink">{p.nome}</span>
                        <Chip tom={p.status === 'ativa' ? 'info' : p.status === 'concluida' ? 'pos' : 'neutro'}>
                          {STATUS_PARCERIA[p.status]}
                        </Chip>
                      </div>
                      <div className="mt-0.5 text-xs text-stone">
                        {marca?.nome} · {p.tipo} · {formatarData(p.dataInicio)} a {formatarData(p.dataFim)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-stone">
                      {proximaFase ? `Próxima fase: ${proximaFase.nome}` : 'Todas as fases concluídas'}
                    </div>
                  </div>
                );
              })}
              {parcerias.length === 0 && (
                <p className="py-4 text-center text-sm text-stone">Nenhuma parceria formalizada neste ciclo.</p>
              )}
            </div>
          </section>
        </div>

        {/* Rodapé da folha */}
        <div className="flex items-center justify-between border-t border-cloud px-10 py-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone">
            © 2026 Crossnetworking · Metodologias proprietárias Crossability e Cross Score Card
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone">Confidencial</span>
        </div>
      </div>
    </div>
  );
}
