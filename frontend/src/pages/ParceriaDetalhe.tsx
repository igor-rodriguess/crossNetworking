import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarCheck2, CheckCircle2, Circle, CircleDashed, Pencil, RotateCcw, TrendingUp } from 'lucide-react';
import { CLIENTES, MARCAS, useStore } from '../store/useStore';
import { STATUS_PARCERIA, formatarData, formatarMoeda } from '../lib/format';
import { useToast } from '../components/Toast';
import { Botao, CampoTexto, Chip, RotuloMono, TileEstatistica, type TomChip } from '../components/ui';
import type { Entrega, Pendencia, StatusParceria } from '../types';

const STATUS_ENTREGA: Record<Entrega['status'], { rotulo: string; tom: TomChip }> = {
  pendente: { rotulo: 'Pendente', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'info' },
  concluida: { rotulo: 'Concluída', tom: 'pos' },
};

const STATUS_PENDENCIA: Record<Pendencia['status'], { rotulo: string; tom: TomChip }> = {
  aberta: { rotulo: 'Aberta', tom: 'warn' },
  em_tratamento: { rotulo: 'Em tratamento', tom: 'info' },
  resolvida: { rotulo: 'Resolvida', tom: 'pos' },
};

const STATUS_OPCOES: StatusParceria[] = ['planejada', 'ativa', 'concluida'];

export function ParceriaDetalhe() {
  const { parceriaId } = useParams();
  const parceria = useStore((s) => s.parcerias.find((p) => p.id === parceriaId));
  const avancarEntrega = useStore((s) => s.avancarEntrega);
  const avancarPendencia = useStore((s) => s.avancarPendencia);
  const atualizarParceria = useStore((s) => s.atualizarParceria);
  const alternarFaseConcluida = useStore((s) => s.alternarFaseConcluida);
  const { toast } = useToast();

  // Edição da vigência (datas) — aberta sob demanda para não poluir o cabeçalho
  const [editandoVigencia, setEditandoVigencia] = useState(false);
  if (!parceria) return <Navigate to="/cronograma" replace />;

  const marca = MARCAS.find((m) => m.id === parceria.marcaId);
  const cliente = CLIENTES.find((c) => c.id === parceria.clienteId);
  const roiMaisRecente = parceria.roi?.[parceria.roi.length - 1];
  const roiCalculado = roiMaisRecente
    ? ((roiMaisRecente.retornoRealizado ?? roiMaisRecente.retornoEstimado) - roiMaisRecente.investimento) /
      roiMaisRecente.investimento
    : null;

  return (
    <div>
      <Link
        to="/cronograma"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.5} /> Cronograma
      </Link>

      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <RotuloMono className="mb-2">
            {cliente?.nome} × {marca?.nome} · {parceria.tipo}
          </RotuloMono>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">{parceria.nome}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-stone">
            {!editandoVigencia ? (
              <span className="flex items-center gap-1.5">
                <strong className="font-semibold text-graphite">Vigência:</strong>{' '}
                {formatarData(parceria.dataInicio)} a {formatarData(parceria.dataFim)}
                <button
                  type="button"
                  onClick={() => setEditandoVigencia(true)}
                  className="rounded-full p-1 text-stone transition-colors hover:bg-cloud hover:text-ink"
                  title="Editar vigência"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
              </span>
            ) : (
              <span className="flex flex-wrap items-end gap-2">
                <CampoTexto
                  rotulo="Início"
                  type="date"
                  value={parceria.dataInicio}
                  onChange={(e) => atualizarParceria(parceria.id, { dataInicio: e.target.value })}
                />
                <CampoTexto
                  rotulo="Fim"
                  type="date"
                  value={parceria.dataFim}
                  onChange={(e) => atualizarParceria(parceria.id, { dataFim: e.target.value })}
                />
                <Botao pequeno variante="ghost" onClick={() => setEditandoVigencia(false)}>
                  Pronto
                </Botao>
              </span>
            )}
            <span>
              <strong className="font-semibold text-graphite">Fases:</strong>{' '}
              {parceria.fases.filter((f) => f.concluida).length} de {parceria.fases.length} concluídas
            </span>
          </div>
        </div>
        {/* Status editável — muda o estado da parceria com histórico visual imediato */}
        <label className="flex flex-col items-end gap-1.5">
          <span className="label-mono">Status</span>
          <select
            value={parceria.status}
            onChange={(e) => {
              const novo = e.target.value as StatusParceria;
              atualizarParceria(parceria.id, { status: novo });
              toast(`Status da parceria alterado para “${STATUS_PARCERIA[novo]}”.`);
            }}
            className="cursor-pointer rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-off focus:border-accent"
          >
            {STATUS_OPCOES.map((st) => (
              <option key={st} value={st}>
                {STATUS_PARCERIA[st]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Indicadores de acompanhamento */}
      {(parceria.indicadores?.length || roiCalculado !== null) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {parceria.indicadores?.map((ind) => {
            const ultima = ind.medicoes[ind.medicoes.length - 1];
            return (
              <TileEstatistica
                key={ind.nome}
                rotulo={ind.nome}
                valor={`${ultima.valor.toLocaleString('pt-BR')}`}
                detalhe={`${ind.unidade} · medição ${ultima.periodo} (${ind.medicoes.length} registros)`}
                icone={<TrendingUp size={16} strokeWidth={1.5} />}
              />
            );
          })}
          {roiCalculado !== null && roiMaisRecente && (
            <TileEstatistica
              rotulo={roiMaisRecente.retornoRealizado ? 'ROI parcial realizado' : 'ROI estimado'}
              valor={`${roiCalculado.toFixed(2)}x`}
              detalhe={`(retorno − investimento) / investimento · ${formatarData(roiMaisRecente.data)}`}
              icone={<CalendarCheck2 size={16} strokeWidth={1.5} />}
            />
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Plano de execução (fases) */}
        <section className="card p-6">
          <RotuloMono className="mb-5">Plano de execução</RotuloMono>
          <ol className="relative space-y-5 border-l border-cloud pl-6">
            {parceria.fases.map((fase) => (
              <li key={fase.nome} className="group relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="absolute -left-[31px] top-0.5 bg-paper">
                    {fase.concluida ? (
                      <CheckCircle2 size={16} strokeWidth={1.5} className="text-status-pos" />
                    ) : new Date(`${fase.inicio}T12:00:00`) > new Date('2026-07-15T12:00:00') ? (
                      <CircleDashed size={16} strokeWidth={1.5} className="text-mist" />
                    ) : (
                      <Circle size={16} strokeWidth={1.5} className="text-accent" />
                    )}
                  </span>
                  <div className="text-sm font-semibold text-ink">{fase.nome}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
                    {formatarData(fase.inicio)} – {formatarData(fase.fim)} ·{' '}
                    {fase.concluida ? 'concluída' : 'em aberto'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    alternarFaseConcluida(parceria.id, fase.nome);
                    toast(fase.concluida ? `Fase “${fase.nome}” reaberta.` : `Fase “${fase.nome}” concluída.`);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-stone transition-colors hover:border-graphite hover:text-ink"
                  title={fase.concluida ? 'Reabrir fase' : 'Marcar como concluída'}
                >
                  {fase.concluida ? (
                    <>
                      <RotateCcw size={11} strokeWidth={1.5} /> Reabrir
                    </>
                  ) : (
                    <>
                      Concluir <CheckCircle2 size={11} strokeWidth={1.5} />
                    </>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* Entregas */}
        <section className="card overflow-hidden">
          <div className="border-b border-cloud px-6 py-4">
            <RotuloMono>Entregas</RotuloMono>
          </div>
          {parceria.entregas?.length ? (
            <ul className="divide-y divide-cloud">
              {parceria.entregas.map((entrega) => {
                const se = STATUS_ENTREGA[entrega.status];
                return (
                  <li key={entrega.nome} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{entrega.nome}</div>
                      <div className="text-xs text-stone">
                        {entrega.responsavel} · prazo {formatarData(entrega.prazo)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip tom={se.tom}>{se.rotulo}</Chip>
                      {entrega.status !== 'concluida' && (
                        <button
                          type="button"
                          onClick={() => {
                            avancarEntrega(parceria.id, entrega.nome);
                            toast(
                              entrega.status === 'pendente'
                                ? `“${entrega.nome}” em andamento.`
                                : `“${entrega.nome}” concluída.`,
                            );
                          }}
                          className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-stone transition-colors hover:border-graphite hover:text-ink"
                          title="Avançar status da entrega"
                        >
                          {entrega.status === 'pendente' ? 'Iniciar' : 'Concluir'}
                          <ArrowRight size={11} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-stone">Nenhuma entrega registrada.</p>
          )}
        </section>

        {/* Reuniões e touchpoints */}
        <section className="card overflow-hidden">
          <div className="border-b border-cloud px-6 py-4">
            <RotuloMono>Reuniões & touchpoints</RotuloMono>
          </div>
          {parceria.reunioes?.length ? (
            <ul className="divide-y divide-cloud">
              {parceria.reunioes.map((reuniao) => (
                <li key={reuniao.titulo} className="px-6 py-3.5">
                  <div className="text-sm font-semibold text-ink">{reuniao.titulo}</div>
                  <div className="text-xs text-stone">
                    {formatarData(reuniao.data)} · {reuniao.participantes.join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-stone">Nenhuma reunião registrada.</p>
          )}
        </section>

        {/* Pendências */}
        <section className="card overflow-hidden">
          <div className="border-b border-cloud px-6 py-4">
            <RotuloMono>Pendências</RotuloMono>
          </div>
          {parceria.pendencias?.length ? (
            <ul className="divide-y divide-cloud">
              {parceria.pendencias.map((pendencia) => {
                const sp = STATUS_PENDENCIA[pendencia.status];
                return (
                  <li key={pendencia.descricao} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{pendencia.descricao}</div>
                      <div className="text-xs text-stone">
                        {pendencia.responsavel}
                        {pendencia.prazo ? ` · até ${formatarData(pendencia.prazo)}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip tom={sp.tom}>{sp.rotulo}</Chip>
                      {pendencia.status !== 'resolvida' && (
                        <button
                          type="button"
                          onClick={() => {
                            avancarPendencia(parceria.id, pendencia.descricao);
                            toast(
                              pendencia.status === 'aberta'
                                ? 'Pendência em tratamento.'
                                : 'Pendência resolvida.',
                            );
                          }}
                          className="flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-stone transition-colors hover:border-graphite hover:text-ink"
                          title="Avançar status da pendência"
                        >
                          {pendencia.status === 'aberta' ? 'Tratar' : 'Resolver'}
                          <ArrowRight size={11} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-stone">Nenhuma pendência aberta.</p>
          )}
        </section>
      </div>

      {/* Histórico de ROI (registros independentes — RN033) */}
      {parceria.roi && parceria.roi.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-cloud px-6 py-4">
            <RotuloMono>Cálculos de ROI — registros históricos independentes (RN033)</RotuloMono>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cloud">
                <th className="label-mono px-6 py-3 font-normal">Data</th>
                <th className="label-mono px-6 py-3 text-right font-normal">Investimento</th>
                <th className="label-mono px-6 py-3 text-right font-normal">Retorno estimado</th>
                <th className="label-mono px-6 py-3 text-right font-normal">Retorno realizado</th>
                <th className="label-mono px-6 py-3 text-right font-normal">ROI</th>
                <th className="label-mono px-6 py-3 font-normal">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {parceria.roi.map((calculo, i) => {
                const base = calculo.retornoRealizado ?? calculo.retornoEstimado;
                const roi = (base - calculo.investimento) / calculo.investimento;
                return (
                  <tr key={i}>
                    <td className="px-6 py-3 text-stone">{formatarData(calculo.data)}</td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-graphite">
                      {formatarMoeda(calculo.investimento)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-graphite">
                      {formatarMoeda(calculo.retornoEstimado)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-graphite">
                      {calculo.retornoRealizado ? formatarMoeda(calculo.retornoRealizado) : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs font-bold text-ink">{roi.toFixed(2)}x</td>
                    <td className="px-6 py-3 text-stone">{calculo.responsavel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
