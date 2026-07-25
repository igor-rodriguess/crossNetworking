import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, Clock3, FileText, Plus, Undo2, Users } from 'lucide-react';
import { MARCAS, useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useToast } from '../components/Toast';
import {
  FASES_PROJETO,
  STATUS_CANDIDATURA,
  formatarData,
  formatarDataCurta,
  indiceFase,
} from '../lib/format';
import { calcularScore } from '../lib/score';
import { Botao, CampoTexto, Chip, RotuloMono, type TomChip } from '../components/ui';
import { ORIGEM_DEMANDA, STATUS_PROJETO } from './Projetos';
import type { StatusFrente, StatusVersaoPaper, ValidacaoPaper } from '../types';

const STATUS_FRENTE: Record<StatusFrente, { rotulo: string; tom: TomChip }> = {
  aberta: { rotulo: 'Aberta', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'info' },
  encerrada: { rotulo: 'Encerrada', tom: 'neutro' },
};

const STATUS_VERSAO: Record<StatusVersaoPaper, { rotulo: string; tom: TomChip }> = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
  em_revisao: { rotulo: 'Em revisão', tom: 'warn' },
  vigente: { rotulo: 'Vigente', tom: 'info' },
  substituida: { rotulo: 'Substituída', tom: 'neutro' },
};

const STATUS_VALIDACAO: Record<ValidacaoPaper['status'], { rotulo: string; tom: TomChip }> = {
  aprovada: { rotulo: 'Aprovada', tom: 'pos' },
  pendente: { rotulo: 'Pendente', tom: 'warn' },
  ajustes_solicitados: { rotulo: 'Ajustes solicitados', tom: 'neg' },
};

// ─── Nova frente de oportunidade (RF024) ────────────────────────────────────
function FormNovaFrente({ projetoId, aoFechar }: { projetoId: string; aoFechar: () => void }) {
  const criarFrente = useStore((s) => s.criarFrente);
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !objetivo.trim() || salvando) return;
    setSalvando(true);
    try {
      await criarFrente(projetoId, { nome: nome.trim(), objetivo: objetivo.trim(), categoria: categoria.trim() || undefined });
      toast(`Frente “${nome.trim()}” aberta.`);
      aoFechar();
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível abrir a frente.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="card anim-abre mb-4 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <CampoTexto rotulo="Nome da frente" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Público jovem urbano" autoFocus />
        <CampoTexto rotulo="Objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="O que esta frente busca" />
        <CampoTexto rotulo="Território / categoria (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Cultura urbana" />
      </div>
      <div className="mt-4 flex gap-2">
        <Botao type="submit" pequeno disabled={salvando}>{salvando ? 'Abrindo…' : 'Abrir frente'}</Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>Cancelar</Botao>
      </div>
    </form>
  );
}

export function ProjetoDetalhe() {
  const { projetoId } = useParams();
  const [formFrenteAberto, setFormFrenteAberto] = useState(false);
  const todosCriterios = useStore((s) => s.criterios);
  const candidaturas = useStore((s) => s.candidaturas);
  const avaliacoes = useStore((s) => s.avaliacoes);
  const papers = useStore((s) => s.papers);
  const projetos = useStore((s) => s.projetos);
  const frentesStore = useStore((s) => s.frentes);
  const clientes = useStore((s) => s.clientes);
  const partes = useStore((s) => s.partes);
  const registrarValidacaoPaper = useStore((s) => s.registrarValidacaoPaper);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarClientes = useStore((s) => s.carregarClientes);
  const carregarFrentesDosProjetos = useStore((s) => s.carregarFrentesDosProjetos);
  const atualizarProjeto = useStore((s) => s.atualizarProjeto);
  const usuario = useStore((s) => s.usuario);
  const { toast } = useToast();

  // Garante que projeto, clientes e frentes reais estejam carregados ao abrir.
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([carregarProjetos(), carregarClientes()]);
        await carregarFrentesDosProjetos();
      } catch (e) {
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar o projeto.');
      }
    })();
  }, [carregarProjetos, carregarClientes, carregarFrentesDosProjetos, toast]);

  const projeto = projetos.find((p) => p.id === projetoId);
  if (!projeto) return <Navigate to="/projetos" replace />;

  // Critérios do cliente dono do projeto (não do cliente ativo no topo)
  const criterios = todosCriterios.filter((c) => c.clienteId === projeto.clienteId && c.ativo);

  const frentes = frentesStore.filter((f) => f.projetoId === projeto.id);
  const st = STATUS_PROJETO[projeto.status];
  const briefingsOrdenados = [...projeto.briefings].sort((a, b) => b.versao - a.versao);

  return (
    <div>
      <Link
        to="/projetos"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.5} /> Projetos
      </Link>

      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <RotuloMono className="mb-2">
            {ORIGEM_DEMANDA[projeto.origem]} · início em {formatarData(projeto.dataInicio)}
          </RotuloMono>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">{projeto.nome}</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">{projeto.objetivo}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-stone">
            <span>
              <strong className="font-semibold text-graphite">Produto:</strong> {projeto.produto}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={12} strokeWidth={1.5} />
              <strong className="font-semibold text-graphite">Responsáveis:</strong>{' '}
              {projeto.responsaveis.join(', ')}
            </span>
          </div>
        </div>
        <label className="flex flex-col items-end gap-1">
          <span className="label-mono">Status do projeto</span>
          <select
            value={projeto.status}
            onChange={(e) => {
              const novo = e.target.value as typeof projeto.status;
              atualizarProjeto(projeto.id, { status: novo })
                .then(() => toast(`Projeto movido para “${STATUS_PROJETO[novo].rotulo}”.`))
                .catch((err) => toast(err instanceof ErroApi ? err.message : 'Não foi possível mudar o status.'));
            }}
            className={`cursor-pointer rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-colors focus:border-accent ${
              st.tom === 'pos' ? 'border-status-pos text-status-pos' : st.tom === 'info' ? 'border-accent text-accent-deep' : 'border-ink text-ink'
            } bg-paper hover:bg-off`}
            title="Mudar o status do projeto"
          >
            {(['planejamento', 'em_andamento', 'concluido'] as const).map((s) => (
              <option key={s} value={s}>
                {STATUS_PROJETO[s].rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Stepper do ciclo do projeto */}
      <div className="card mb-8 overflow-x-auto px-6 py-5">
        <ol className="flex min-w-[760px] items-center">
          {FASES_PROJETO.map((fase, idx) => {
            const atual = indiceFase(projeto.faseAtual);
            const estado = idx < atual ? 'feita' : idx === atual ? 'atual' : 'futura';
            return (
              <li key={fase.id} className={`flex items-center ${idx < FASES_PROJETO.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-[12px] font-bold transition-colors ${
                      estado === 'feita'
                        ? 'bg-ink text-paper'
                        : estado === 'atual'
                          ? 'bg-accent text-paper ring-4 ring-accent-soft'
                          : 'border border-mist bg-paper text-stone'
                    }`}
                  >
                    {estado === 'feita' ? <Check size={14} strokeWidth={2} /> : idx + 1}
                  </span>
                  <span
                    className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] ${
                      estado === 'atual' ? 'font-bold text-ink' : 'text-stone'
                    }`}
                  >
                    {fase.rotulo}
                  </span>
                </div>
                {idx < FASES_PROJETO.length - 1 && (
                  <div className={`mx-2 mb-5 h-px flex-1 ${idx < atual ? 'bg-ink' : 'bg-cloud'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Coluna principal: briefings, planejamento e frentes */}
        <div className="space-y-5 xl:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
              <RotuloMono>Briefings do projeto</RotuloMono>
              <span className="font-mono text-xs text-stone">{projeto.briefings.length} versões</span>
            </div>
            <div className="divide-y divide-cloud">
              {briefingsOrdenados.map((briefing) => (
                <div key={briefing.versao} className={`px-6 py-4 ${briefing.status === 'vigente' ? '' : 'opacity-70'}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} strokeWidth={1.5} className="text-stone" />
                      <span className="text-sm font-bold text-ink">Briefing v{briefing.versao}</span>
                      <Chip tom={briefing.status === 'vigente' ? 'info' : 'neutro'}>
                        {briefing.status === 'vigente' ? 'vigente' : 'substituída'}
                      </Chip>
                    </div>
                  </div>
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
                    {formatarData(briefing.data)} · {briefing.responsavel}
                  </div>
                  <p className="text-sm leading-relaxed text-graphite">{briefing.conteudo}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <RotuloMono className="mb-4">Planejamento estratégico</RotuloMono>
            <div className="space-y-4 text-sm">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone">Diagnóstico</div>
                <p className="leading-relaxed text-graphite">{projeto.planejamento.diagnostico}</p>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone">Territórios</div>
                <div className="flex flex-wrap gap-1.5">
                  {projeto.planejamento.territorios.map((t) => (
                    <span key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent-deep">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone">Oportunidades</div>
                <p className="leading-relaxed text-graphite">{projeto.planejamento.oportunidades}</p>
              </div>
            </div>
          </div>
          {/* Frentes com candidaturas e Papers */}
          <div className="mb-3 flex items-center justify-between">
            <RotuloMono>Frentes de oportunidade</RotuloMono>
            <Botao variante="ghost" pequeno onClick={() => setFormFrenteAberto((v) => !v)}>
              <Plus size={13} strokeWidth={1.5} /> Nova frente
            </Botao>
          </div>
          {formFrenteAberto && <FormNovaFrente projetoId={projeto.id} aoFechar={() => setFormFrenteAberto(false)} />}
          {frentes.length === 0 && !formFrenteAberto && (
            <p className="mb-4 rounded-lg border border-dashed border-mist px-4 py-6 text-center text-sm text-stone">
              Nenhuma frente ainda — abra a primeira para começar a mapear candidatos.
            </p>
          )}
          {frentes.map((frente) => {
            const cands = candidaturas
              .filter((c) => c.frenteId === frente.id)
              .map((c) => ({
                candidatura: c,
                marca: partes.find((m) => m.id === c.marcaId) ?? MARCAS.find((m) => m.id === c.marcaId) ?? { id: c.marcaId, nome: 'Parceiro', categoria: '—', territorio: '', publico: '', descricao: '' },
                score: calcularScore(criterios, avaliacoes.find((a) => a.candidaturaId === c.id)),
              }))
              .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
            const paper = papers.find((p) => p.frenteId === frente.id);
            const stf = STATUS_FRENTE[frente.status];

            return (
              <section key={frente.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud bg-off/70 px-6 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-ink">{frente.nome}</h2>
                      <Chip tom={stf.tom}>{stf.rotulo}</Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-stone">
                      {frente.objetivo} · Território: {frente.territorio}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-stone">{cands.length} candidaturas</span>
                </div>

                {/* Candidaturas da frente */}
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-cloud">
                    {cands.map(({ candidatura, marca, score }) => {
                      const stc = STATUS_CANDIDATURA[candidatura.status];
                      return (
                        <tr key={candidatura.id} className="group transition-colors hover:bg-off">
                          <td className="px-6 py-3">
                            <Link
                              to={`/marcas/${candidatura.id}`}
                              className="font-semibold text-ink transition-colors group-hover:text-accent-deep"
                            >
                              {marca.nome}
                            </Link>
                            <span className="ml-2 text-xs text-stone">{marca.categoria}</span>
                          </td>
                          <td className="px-6 py-3">
                            <Chip tom={stc.tom}>{stc.rotulo}</Chip>
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-xs">
                            {score ? (
                              <span className="font-bold text-ink">{score.percentual}%</span>
                            ) : (
                              <span className="text-mist">sem score</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Paper da frente */}
                {paper && (
                  <div className="border-t border-cloud bg-accent-soft/40 px-6 py-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText size={14} strokeWidth={1.5} className="text-accent-deep" />
                        <span className="text-sm font-bold text-ink">Plano tático: {paper.titulo}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {paper.versoes.map((v) => (
                          <Chip key={v.numero} tom={STATUS_VERSAO[v.status].tom}>
                            v{v.numero} · {STATUS_VERSAO[v.status].rotulo}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <p className="mb-3 text-sm leading-relaxed text-graphite">
                      {paper.versoes.find((v) => v.status === 'vigente')?.estrategia ??
                        paper.versoes[paper.versoes.length - 1].estrategia}
                    </p>
                    {/* Validações do Paper — registráveis aqui (destrava o Score Card, RN022) */}
                    <div className="flex flex-col gap-2">
                      {(['interna', 'cliente'] as const).map((tipo) => {
                        const val = paper.validacoes.find((v) => v.tipo === tipo);
                        const aprovada = val?.status === 'aprovada';
                        const sv = val ? STATUS_VALIDACAO[val.status] : null;
                        return (
                          <div key={tipo} className="flex flex-wrap items-center gap-2 text-xs text-stone">
                            {aprovada ? (
                              <CheckCircle2 size={13} strokeWidth={1.5} className="text-status-pos" />
                            ) : (
                              <Clock3 size={13} strokeWidth={1.5} className="text-status-warn" />
                            )}
                            <span className="font-semibold text-graphite">
                              Validação {tipo === 'interna' ? 'interna' : 'do cliente'}:
                            </span>
                            {sv ? <Chip tom={sv.tom}>{sv.rotulo}</Chip> : <Chip tom="neutro">não registrada</Chip>}
                            {val?.data && <span className="text-mist">· {formatarData(val.data)} · {val.responsavel}</span>}
                            <button
                              type="button"
                              onClick={() => {
                                const novo = aprovada ? 'pendente' : 'aprovada';
                                registrarValidacaoPaper(paper.id, tipo, novo, usuario?.nome ?? 'Equipe Cross');
                                toast(
                                  novo === 'aprovada'
                                    ? `Validação ${tipo === 'interna' ? 'interna' : 'do cliente'} registrada como aprovada.`
                                    : `Validação ${tipo === 'interna' ? 'interna' : 'do cliente'} marcada como pendente.`,
                                );
                              }}
                              className="ml-1 flex items-center gap-1 rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-stone transition-colors hover:border-graphite hover:text-ink"
                              title={aprovada ? 'Reverter para pendente' : 'Registrar como aprovada'}
                            >
                              {aprovada ? (
                                <>
                                  <Undo2 size={11} strokeWidth={1.5} /> Reverter
                                </>
                              ) : (
                                <>
                                  <Check size={11} strokeWidth={1.5} /> Aprovar
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Resumo do projeto + atividades */}
        <div className="space-y-4">
          <div className="card p-6">
            <RotuloMono className="mb-4">Resumo do projeto</RotuloMono>
            <dl className="space-y-3.5 text-sm">
              <div>
                <dt className="text-xs text-stone">Cliente (quem busca a parceria)</dt>
                <dd className="font-semibold text-ink">
                  {clientes.find((c) => c.id === projeto.clienteId)?.nome}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone">Produto / serviço</dt>
                <dd className="font-semibold text-ink">{projeto.produto}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone">Territórios</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {projeto.planejamento.territorios.map((t) => (
                    <span key={t} className="rounded-full bg-cloud px-2.5 py-0.5 text-xs text-graphite">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-stone">Prazo estimado</dt>
                  <dd className="font-mono text-sm font-bold text-ink">{projeto.prazoEstimado}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone">Início</dt>
                  <dd className="font-mono text-sm font-bold text-ink">{formatarDataCurta(projeto.dataInicio)}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-stone">Última atualização</dt>
                <dd className="text-graphite">{formatarData(projeto.atualizadoEm)}</dd>
              </div>
              <div>
                <dt className="mb-1.5 text-xs text-stone">Membros da equipe</dt>
                <dd className="flex items-center gap-2">
                  <span className="flex items-center -space-x-1.5">
                    {projeto.responsaveis.map((resp) => (
                      <span
                        key={resp}
                        title={resp}
                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper bg-ink font-mono text-[11px] font-bold text-paper"
                      >
                        {resp
                          .split(' ')
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-stone">{projeto.responsaveis.length} pessoas</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Atividades recentes do projeto */}
          <div className="card p-6">
            <RotuloMono className="mb-4">Atividades recentes</RotuloMono>
            <ul className="space-y-3">
              {candidaturas
                .filter((c) => frentes.some((f) => f.id === c.frenteId))
                .flatMap((c) =>
                  c.historico.map((mov) => ({
                    mov,
                    marca: partes.find((m) => m.id === c.marcaId) ?? MARCAS.find((m) => m.id === c.marcaId) ?? { id: c.marcaId, nome: 'Parceiro', categoria: '—', territorio: '', publico: '', descricao: '' },
                  })),
                )
                .sort((a, b) => b.mov.data.localeCompare(a.mov.data))
                .slice(0, 6)
                .map(({ mov, marca }, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-status-pos" />
                    <div className="min-w-0">
                      <span className="text-graphite">
                        <strong className="font-semibold text-ink">{marca.nome}</strong> →{' '}
                        {STATUS_CANDIDATURA[mov.para].rotulo.toLowerCase()}
                      </span>
                      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-stone">
                        {formatarDataCurta(mov.data)} · {mov.responsavel}
                      </div>
                    </div>
                  </li>
                ))}
              {candidaturas.filter((c) => frentes.some((f) => f.id === c.frenteId)).length === 0 && (
                <li className="text-sm text-stone">Sem movimentações — projeto em fase inicial do ciclo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
