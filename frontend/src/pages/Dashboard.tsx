import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CalendarClock, FileWarning } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useToast } from '../components/Toast';
import { FASES_PROJETO, HOJE, formatarDataCurta, indiceFase } from '../lib/format';
import { Chip, FaixaEstatisticas, RotuloMono } from '../components/ui';
import { STATUS_PROJETO } from './Projetos';
import type { ReactNode } from 'react';

// Anel de progresso do ciclo (SVG puro, sem dependências)
function AnelProgresso({ percentual }: { percentual: number }) {
  const raio = 42;
  const circunferencia = 2 * Math.PI * raio;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={raio} fill="none" stroke="#26262B" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={raio}
          fill="none"
          stroke="#B98E4A"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - percentual / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-extrabold leading-none text-paper">{percentual}%</span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mist">do ciclo</span>
      </div>
    </div>
  );
}

function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

interface ItemAtencao {
  icone: ReactNode;
  titulo: string;
  detalhe: string;
  para: string;
}

export function Dashboard() {
  const usuario = useStore((s) => s.usuario);
  const candidaturas = useStore((s) => s.candidaturas);
  const partes = useStore((s) => s.partes);
  const PROJETOS = useStore((s) => s.projetos);
  const FRENTES = useStore((s) => s.frentes);
  const CLIENTES = useStore((s) => s.clientes);
  const PARCERIAS = useStore((s) => s.parcerias);
  const PAPERS = useStore((s) => s.papers);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarFrentesDosProjetos = useStore((s) => s.carregarFrentesDosProjetos);
  const carregarCandidaturas = useStore((s) => s.carregarCandidaturas);
  const carregarParcerias = useStore((s) => s.carregarParcerias);
  const carregarPartes = useStore((s) => s.carregarPartes);
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const { toast } = useToast();

  // Central de operação: consolida os dados reais do cliente ativo ao abrir.
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([carregarPartes(), carregarProjetos()]);
        await carregarFrentesDosProjetos();
        await Promise.all([carregarCandidaturas(), carregarParcerias()]);
      } catch (e) {
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar o painel.');
      }
    })();
  }, [clienteAtivoId, carregarPartes, carregarProjetos, carregarFrentesDosProjetos, carregarCandidaturas, carregarParcerias, toast]);

  const primeiroNome = (usuario?.nome ?? 'Equipe Cross').split(' ')[0];

  // ── KPIs globais (sem valores financeiros) ────────────────────────────────
  const projetosAndamento = PROJETOS.filter((p) => p.status === 'em_andamento').length;
  const emNegociacao = candidaturas.filter((c) => c.status === 'em_negociacao').length;
  const parceriasAtivas = PARCERIAS.filter((p) => p.status === 'ativa').length;

  // ── Ciclo dos projetos: quantos projetos ativos em cada fase ─────────────
  const ciclo = FASES_PROJETO.map((fase) => ({
    fase,
    total: PROJETOS.filter((p) => p.faseAtual === fase.id && p.status !== 'concluido').length,
  }));
  const maxCiclo = Math.max(1, ...ciclo.map((c) => c.total));

  // ── Requer atenção: validações pendentes, pendências e marcos próximos ───
  const atencao: ItemAtencao[] = [];

  for (const paper of PAPERS) {
    const frente = FRENTES.find((f) => f.id === paper.frenteId);
    for (const v of paper.validacoes) {
      if (v.status !== 'aprovada') {
        atencao.push({
          icone: <FileWarning size={15} strokeWidth={1.5} className="text-status-warn" />,
          titulo: `Validação ${v.tipo === 'cliente' ? 'do cliente' : 'interna'} pendente — ${paper.titulo}`,
          detalhe: `Plano tático v${v.versaoNumero} · responsável: ${v.responsavel}`,
          para: `/projetos/${frente?.projetoId ?? ''}`,
        });
      }
    }
  }

  for (const parceria of PARCERIAS) {
    for (const pend of parceria.pendencias ?? []) {
      if (pend.status !== 'resolvida') {
        atencao.push({
          icone: <AlertCircle size={15} strokeWidth={1.5} className="text-status-neg" />,
          titulo: pend.descricao,
          detalhe: `${parceria.nome} · ${pend.responsavel}${pend.prazo ? ` · até ${formatarDataCurta(pend.prazo)}` : ''}`,
          para: `/parcerias/${parceria.id}`,
        });
      }
    }
  }

  const em45Dias = new Date(HOJE.getTime() + 45 * 86_400_000);
  for (const parceria of PARCERIAS) {
    for (const fase of parceria.fases) {
      const fim = new Date(`${fase.fim}T12:00:00`);
      if (!fase.concluida && fim >= HOJE && fim <= em45Dias) {
        atencao.push({
          icone: <CalendarClock size={15} strokeWidth={1.5} className="text-accent" />,
          titulo: `Fase “${fase.nome}” termina em ${formatarDataCurta(fase.fim)}`,
          detalhe: parceria.nome,
          para: `/parcerias/${parceria.id}`,
        });
      }
    }
  }

  const projetosRecentes = [...PROJETOS]
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
    .slice(0, 5);

  // Progresso médio do ciclo dos projetos ativos (fase atual / total de fases)
  const ativos = PROJETOS.filter((p) => p.status !== 'concluido');
  const progressoCiclo =
    ativos.length > 0
      ? Math.round(
          (ativos.reduce((soma, p) => soma + indiceFase(p.faseAtual), 0) /
            (ativos.length * (FASES_PROJETO.length - 1))) *
            100,
        )
      : 0;

  return (
    <div>
      {/* Saudação */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          {saudacao()}, {primeiroNome}
        </h1>
        <p className="mt-1.5 text-sm text-stone">
          Panorama geral dos projetos e oportunidades de todos os clientes da Cross.
        </p>
      </div>

      {/* Hero da operação */}
      <section className="relative mb-6 overflow-hidden rounded-xl bg-ink px-8 py-7">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-block rounded-full border border-graphite px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-mist">
              Operação Cross · {new Date(HOJE).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-paper">
              {projetosAndamento} projetos em movimento.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              {emNegociacao} candidaturas em negociação e {parceriasAtivas} parcerias ativas em execução —
              acompanhe o ciclo de cada projeto do briefing ao acompanhamento.
            </p>
            <Link
              to="/projetos"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-accent-deep"
            >
              Ver todos os projetos <ArrowRight size={15} strokeWidth={1.5} />
            </Link>
          </div>
          <AnelProgresso percentual={progressoCiclo} />
        </div>
        {/* textura sutil */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-graphite" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-64 w-64 rounded-full border border-graphite" />
      </section>

      {/* Faixa de indicadores */}
      <FaixaEstatisticas
        itens={[
          { rotulo: 'Projetos em andamento', valor: projetosAndamento, detalhe: `${PROJETOS.length} na base histórica` },
          { rotulo: 'Em negociação', valor: emNegociacao, detalhe: 'candidaturas em tratativa' },
          { rotulo: 'Parcerias ativas', valor: parceriasAtivas, detalhe: `${PARCERIAS.length} no portfólio` },
          { rotulo: 'Partes na base', valor: partes.length, detalhe: 'clientes, marcas e talentos' },
        ]}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        {/* Ciclo dos projetos — leitura em barras, uma fase por linha */}
        <section className="card p-6 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <RotuloMono>Ciclo dos projetos</RotuloMono>
            <Link to="/projetos" className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep">
              Ver todos <ArrowRight size={12} strokeWidth={1.5} />
            </Link>
          </div>
          <ul className="space-y-3.5">
            {ciclo.map(({ fase, total }, idx) => (
              <li key={fase.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm text-graphite">
                    <span className="mr-1.5 font-mono text-[11px] text-stone">{idx + 1}</span>
                    {fase.rotulo}
                  </span>
                  <span className="font-mono text-xs font-bold text-ink">{total}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-cloud">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${(total / maxCiclo) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-cloud pt-4 text-xs leading-relaxed text-stone">
            Cada projeto percorre o ciclo briefing → planejamento → Crossability → Plano tático → Score Card →
            implementação → acompanhamento. As barras mostram onde os projetos ativos estão agora.
          </p>
        </section>

        {/* Requer atenção */}
        <section className="card overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
            <RotuloMono>Requer sua atenção</RotuloMono>
            <span className="font-mono text-xs text-stone">{atencao.length} itens</span>
          </div>
          {atencao.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-stone">
              Nada pendente — validações em dia, sem pendências abertas.
            </p>
          ) : (
            <ul className="divide-y divide-cloud">
              {atencao.slice(0, 6).map((item, idx) => (
                <li key={idx}>
                  <Link
                    to={item.para}
                    className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-off"
                  >
                    <span className="mt-0.5 shrink-0">{item.icone}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{item.titulo}</span>
                      <span className="block truncate text-xs text-stone">{item.detalhe}</span>
                    </span>
                    <ArrowRight size={14} strokeWidth={1.5} className="mt-1 shrink-0 text-mist" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Projetos recentes */}
      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
          <RotuloMono>Projetos recentes</RotuloMono>
          <Link to="/projetos" className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep">
            Base completa <ArrowRight size={12} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cloud">
                <th className="label-mono px-6 py-2.5 font-normal">Projeto</th>
                <th className="label-mono px-6 py-2.5 font-normal">Cliente</th>
                <th className="label-mono px-6 py-2.5 font-normal">Fase atual</th>
                <th className="label-mono px-6 py-2.5 font-normal">Status</th>
                <th className="label-mono px-6 py-2.5 text-right font-normal">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {projetosRecentes.map((projeto) => {
                const cliente = CLIENTES.find((c) => c.id === projeto.clienteId);
                const fase = FASES_PROJETO.find((f) => f.id === projeto.faseAtual)!;
                const st = STATUS_PROJETO[projeto.status];
                return (
                  <tr key={projeto.id} className="group transition-colors hover:bg-off">
                    <td className="px-6 py-3.5">
                      <Link
                        to={`/projetos/${projeto.id}`}
                        className="font-semibold text-ink transition-colors group-hover:text-accent-deep"
                      >
                        {projeto.nome}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-graphite">{cliente?.nome ?? '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-semibold text-accent">{fase.rotulo}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <Chip tom={st.tom}>{st.rotulo}</Chip>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-stone">
                      {formatarDataCurta(projeto.atualizadoEm)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
