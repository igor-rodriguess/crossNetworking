import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, GitBranch, Lock, MessageSquarePlus, Sparkles, Zap } from 'lucide-react';
import { FRENTES, PROJETOS, useStore } from '../store/useStore';
import { useDadosCliente } from '../lib/useDadosCliente';
import { NIVEL, STATUS_CANDIDATURA, formatarData, formatarDataHora } from '../lib/format';
import { classificarScore, pontuacaoResposta } from '../lib/score';
import { Chip, MedidorScore, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import { transicoesValidas } from '../lib/funil';
import { etapasDaCandidatura, paperValidadoPeloCliente } from '../lib/etapa';
import type { RespostaValor, StatusCandidatura as TStatus } from '../types';

const OPCOES: { valor: RespostaValor; rotulo: string; ativo: string }[] = [
  { valor: 'sim', rotulo: 'SIM', ativo: 'bg-accent text-paper' },
  { valor: 'nao', rotulo: 'NÃO', ativo: 'bg-ink text-paper' },
  { valor: 'nao_avaliado', rotulo: 'N/A', ativo: 'bg-stone text-paper' },
];

export function ScoreCard() {
  const { candidaturaId } = useParams();
  const { cliente, criterios, itens } = useDadosCliente();
  const papers = useStore((s) => s.papers);
  const responder = useStore((s) => s.responder);
  const justificarResposta = useStore((s) => s.justificarResposta);
  const setPotencial = useStore((s) => s.setPotencialDisruptivo);
  const moverCandidatura = useStore((s) => s.moverCandidatura);
  const { toast } = useToast();
  const [justificativaAberta, setJustificativaAberta] = useState<string | null>(null);
  // O Score Card é a única etapa visual da candidatura. A Crossability continua
  // valendo como metodologia (e é aplicada pelo agente de IA), mas não tem mais
  // aba própria nesta tela.
  const item = itens.find((i) => i.candidatura.id === candidaturaId);

  // Contexto de projeto/frente e Paper (fluxo: Plano tático → Validação → Score Card).
  // Calculado aqui em cima porque a etapa liberada depende dele.
  const candidatura = item?.candidatura;
  const frente = candidatura ? FRENTES.find((f) => f.id === candidatura.frenteId) : undefined;
  const projeto = frente ? PROJETOS.find((p) => p.id === frente.projetoId) : undefined;
  const paper = frente ? papers.find((p) => p.frenteId === frente.id) : undefined;

  // Etapa da metodologia derivada do estado real (status no funil + Paper validado).
  // É a fonte de verdade sobre o que está liberado — a aba nunca é um estado solto.
  const etapas = candidatura ? etapasDaCandidatura(candidatura, paper) : null;
  // "Paper validado" é só sobre a validação do Paper — não confundir com a
  // liberação do Score Card, que também exige avanço no funil.
  const paperValidado = paperValidadoPeloCliente(paper);

  // Ao (re)entrar numa candidatura, fecha qualquer justificativa aberta.
  useEffect(() => {
    setJustificativaAberta(null);
  }, [candidaturaId]);

  if (!item || !candidatura || !etapas) return <Navigate to="/marcas" replace />;

  const { marca, avaliacao, score } = item;
  const potencial = avaliacao?.potencialDisruptivo ?? 1;
  const classe = score ? classificarScore(score.percentual) : null;

  return (
    <div>
      <Link
        to="/marcas"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.5} /> Base de marcas
      </Link>

      {/* Cabeçalho da marca */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <RotuloMono className="mb-2">
            {marca.categoria} · {marca.territorio}
          </RotuloMono>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            <Link to={`/partes/${marca.id}`} className="transition-colors hover:text-accent-deep" title="Abrir na Base de Relacionamentos">
              {marca.nome}
            </Link>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">{marca.descricao}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone">
            {projeto && frente && (
              <span className="flex items-center gap-1.5">
                <GitBranch size={12} strokeWidth={1.5} />
                <strong className="font-semibold text-graphite">{projeto.nome}</strong> · frente{' '}
                <Link to={`/projetos/${projeto.id}`} className="font-semibold text-accent-deep hover:underline">
                  {frente.nome}
                </Link>
              </span>
            )}
            <span>
              <strong className="font-semibold text-graphite">Interesse do cliente:</strong>{' '}
              {NIVEL[candidatura.interesseCliente]}
            </span>
            <span>
              <strong className="font-semibold text-graphite">Interesse do parceiro:</strong>{' '}
              {NIVEL[candidatura.interesseParceiro]}
            </span>
            <span>
              <strong className="font-semibold text-graphite">No funil desde:</strong>{' '}
              {formatarData(candidatura.dataEntrada)}
            </span>
          </div>
        </div>
        {/* Status editável direto da página (RF026 — movimentação com histórico) */}
        <div className="flex flex-col items-end gap-2">
          <label className="flex flex-col items-end gap-1.5">
            <span className="label-mono">Status no funil</span>
            <select
              value={candidatura.status}
              onChange={(e) => {
                const novo = e.target.value as TStatus;
                moverCandidatura(candidatura.id, novo, 'Status alterado na página da candidatura.');
                toast(`${marca.nome}: status alterado para “${STATUS_CANDIDATURA[novo].rotulo}”.`);
              }}
              className="cursor-pointer rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-off focus:border-accent"
              title="Mover a candidatura de etapa — a movimentação entra no histórico"
            >
              {transicoesValidas(candidatura.status).map((codigo) => (
                <option key={codigo} value={codigo}>
                  {STATUS_CANDIDATURA[codigo].rotulo}
                </option>
              ))}
            </select>
          </label>
          {candidatura.status === 'aprovada' && (
            <span className="inline-flex items-center rounded-full bg-ink px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-paper">
              Deu Cross
            </span>
          )}
        </div>
      </div>

      {/* Etapa única da tela — o Cross Score Card. A Crossability segue sendo
          aplicada pela metodologia (e pelo agente de IA), mas não é mais uma
          etapa visual da candidatura. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-cloud">
        <div className="flex items-center gap-1.5 border-b-2 border-accent px-4 py-2.5 text-sm font-semibold text-ink">
          {!etapas.scorecard.liberada && (
            <Lock size={13} strokeWidth={1.5} className="text-mist" />
          )}
          Cross Score Card
        </div>
        <span className="pb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-stone">
          Fluxo: Plano tático → Validação → Score Card
        </span>
      </div>

      {/* Por que o Score Card ainda está travado — deixa a etapa explícita, não só um cadeado */}
      {!etapas.scorecard.liberada && (
        <div className="mb-6 flex items-start gap-2.5 rounded-md border border-l-2 border-cloud border-l-status-warn bg-off px-4 py-3">
          <Lock size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-status-warn" />
          <p className="text-sm text-graphite">
            <strong className="font-semibold text-ink">Cross Score Card ainda bloqueado.</strong>{' '}
            {etapas.scorecard.motivo}
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* ─── Cross Score Card ─────────────────────────────────────── */}
          <>
            <div className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft/65 via-paper to-paper p-5 shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex max-w-2xl gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-paper"><Sparkles size={17} strokeWidth={1.5} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><RotuloMono>Radar IA · oportunidades externas</RotuloMono><Chip tom="pos">disponível</Chip></div>
                    <p className="mt-2 text-sm leading-relaxed text-graphite">Leve o objetivo desta frente ao Radar para investigar marcas fora da Base Cross. Cada resultado traz evidências externas, justificativa do fit e um briefing inicial para revisão humana.</p>
                  </div>
                </div>
                <Link to="/oportunidades" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-graphite">Abrir Radar <Zap size={14} strokeWidth={1.5} /></Link>
              </div>
            </div>

              {!paperValidado && (
                <div className="card border-l-2 border-l-status-warn px-6 py-4">
                  <p className="text-sm text-graphite">
                    <strong className="font-semibold text-status-warn">Plano tático ainda não validado pelo cliente.</strong>{' '}
                    Pela metodologia (RN022), a avaliação oficial do Cross Score Card só é registrada sobre uma
                    validação de Plano tático aprovada — a avaliação abaixo é preparatória.
                  </p>
                </div>
              )}

              <div className="card divide-y divide-cloud">
                <div className="flex items-center justify-between px-6 py-4">
                  <RotuloMono>Critérios · modelo {cliente.nome}</RotuloMono>
                  <span className="font-mono text-xs text-stone">
                    {score?.respondidos ?? 0}/{criterios.length} respondidos
                  </span>
                </div>

                {criterios.map((criterio) => {
                  const resposta = avaliacao?.respostas[criterio.id];
                  const valor = resposta?.valor;
                  const pontos = valor ? pontuacaoResposta(criterio, valor) : null;
                  const aberta = justificativaAberta === criterio.id;

                  return (
                    <div key={criterio.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-ink">{criterio.nome}</h3>
                            {criterio.obrigatorio && <Chip tom="info">obrigatório</Chip>}
                          </div>
                          <p className="mt-0.5 text-xs text-stone">{criterio.descricao}</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] text-stone">
                            SIM +{criterio.pesoSim} · NÃO +{criterio.pesoNao}
                          </span>
                          <div className="flex overflow-hidden rounded-full border border-mist" role="radiogroup" aria-label={criterio.nome}>
                            {OPCOES.map((op) => (
                              <button
                                key={op.valor}
                                role="radio"
                                aria-checked={valor === op.valor}
                                onClick={() => responder(candidatura.id, criterio.id, op.valor)}
                                className={`px-3.5 py-1.5 font-mono text-[12px] font-bold tracking-[0.06em] transition-colors ${
                                  valor === op.valor ? op.ativo : 'bg-paper text-stone hover:bg-off hover:text-ink'
                                }`}
                              >
                                {op.rotulo}
                              </button>
                            ))}
                          </div>
                          <span
                            className={`w-12 text-right font-mono text-sm font-bold ${
                              pontos === null ? 'text-mist' : pontos > 0 ? 'text-accent-deep' : 'text-stone'
                            }`}
                          >
                            {pontos === null ? '—' : `+${pontos}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setJustificativaAberta(aberta ? null : criterio.id)}
                            className={`relative rounded-full p-1.5 transition-colors ${
                              aberta
                                ? 'bg-ink text-paper'
                                : resposta?.justificativa
                                  ? 'bg-accent-soft text-accent-deep'
                                  : 'text-stone hover:bg-cloud hover:text-ink'
                            }`}
                            title={aberta ? 'Fechar justificativa' : 'Justificativa'}
                          >
                            <MessageSquarePlus size={15} strokeWidth={1.5} />
                            {resposta?.justificativa && !aberta && (
                              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
                            )}
                          </button>
                        </div>
                      </div>

                      {aberta && (
                        <textarea
                          value={resposta?.justificativa ?? ''}
                          onChange={(e) => justificarResposta(candidatura.id, criterio.id, e.target.value)}
                          placeholder="Racional desta resposta (evidências, fontes, contexto)…"
                          rows={2}
                          className="mt-3 w-full rounded-md border border-mist bg-off px-3 py-2 text-sm text-ink placeholder:text-mist focus:border-accent"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Potencial disruptivo */}
              <div className="card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap size={15} strokeWidth={1.5} className="text-accent" />
                    <h3 className="text-sm font-semibold text-ink">Potencial disruptivo</h3>
                  </div>
                  <p className="mt-0.5 text-xs text-stone">
                    Capacidade da parceria de gerar impacto além do previsto (1 a 5) — somado ao score.
                  </p>
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Potencial disruptivo">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={potencial === n}
                      onClick={() => setPotencial(candidatura.id, n)}
                      className={`h-10 w-10 rounded-full font-mono text-sm font-bold transition-colors ${
                        n <= potencial
                          ? 'bg-accent text-paper'
                          : 'border border-mist bg-paper text-stone hover:border-graphite hover:text-ink'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
          </>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="bg-ink px-6 py-6">
              <RotuloMono className="!text-mist">Score total</RotuloMono>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-6xl font-extrabold leading-none text-paper">
                  {score ? score.total.toFixed(0) : '—'}
                </span>
                <span className="font-mono text-sm text-mist">/ {score ? score.maximo.toFixed(0) : '—'} pts</span>
              </div>
              <div className="mt-4">
                <MedidorScore percentual={score?.percentual ?? 0} altura="h-2" />
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-mist">{score?.percentual ?? 0}% do máximo</span>
                  {classe && <Chip tom={classe.tom === 'neutro' ? 'neutro' : classe.tom}>{classe.rotulo}</Chip>}
                </div>
              </div>
            </div>

            <dl className="divide-y divide-cloud text-sm">
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-stone">Soma dos critérios</dt>
                <dd className="font-mono font-bold text-ink">{score ? score.pontos.toFixed(0) : '—'}</dd>
              </div>
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-stone">Potencial disruptivo</dt>
                <dd className="font-mono font-bold text-ink">+{potencial}</dd>
              </div>
              <div className="flex items-center justify-between px-6 py-3">
                <dt className="text-stone">Plano tático da frente</dt>
                <dd>
                  {paper ? (
                    <Chip tom={paperValidado ? 'pos' : 'warn'}>
                      {paperValidado ? 'Validado pelo cliente' : 'Validação pendente'}
                    </Chip>
                  ) : (
                    <span className="text-xs text-mist">sem Plano tático</span>
                  )}
                </dd>
              </div>
              {avaliacao && (
                <div className="px-6 py-3 text-xs text-stone">
                  Última atualização por <strong className="font-semibold text-graphite">{avaliacao.responsavel}</strong>
                  <br />
                  {formatarDataHora(avaliacao.atualizadoEm)}
                </div>
              )}
            </dl>
          </div>

          {/* Histórico de movimentações (RN017) */}
          <div className="card p-6">
            <RotuloMono className="mb-4">Histórico no funil</RotuloMono>
            <ol className="relative space-y-4 border-l border-cloud pl-5">
              {[...candidatura.historico].reverse().map((mov, idx) => (
                <li key={idx} className="relative">
                  <span
                    className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ${
                      idx === 0 ? 'bg-accent' : 'bg-mist'
                    }`}
                  />
                  <div className="text-sm font-semibold text-ink">{STATUS_CANDIDATURA[mov.para].rotulo}</div>
                  <div className="text-xs text-stone">
                    {formatarData(mov.data)} · {mov.responsavel}
                  </div>
                  {mov.justificativa && <p className="mt-1 text-xs italic text-stone">“{mov.justificativa}”</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
