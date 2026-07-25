import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDadosCliente } from '../lib/useDadosCliente';
import { HOJE, STATUS_PARCERIA, formatarDataCurta } from '../lib/format';
import { MARCAS, useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useToast } from '../components/Toast';
import { CabecalhoPagina, Chip, EstadoVazio, RotuloMono, type TomChip } from '../components/ui';
import type { FaseParceria, Parceria } from '../types';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const INICIO_ANO = new Date('2026-01-01T00:00:00').getTime();
const FIM_ANO = new Date('2026-12-31T23:59:59').getTime();
const DURACAO_ANO = FIM_ANO - INICIO_ANO;
const LARGURA_INFO = 264; // px da coluna de informações, usada no alinhamento das linhas-guia

function pct(iso: string): number {
  const t = new Date(`${iso}T12:00:00`).getTime();
  return Math.min(100, Math.max(0, ((t - INICIO_ANO) / DURACAO_ANO) * 100));
}

const TOM_PARCERIA: Record<Parceria['status'], TomChip> = {
  ativa: 'info',
  planejada: 'neutro',
  concluida: 'pos',
};

function faseFutura(fase: FaseParceria): boolean {
  return !fase.concluida && new Date(`${fase.inicio}T12:00:00`) > HOJE;
}

// Cores da trilha: azul = em andamento; preto = concluída; contorno = planejada.
// A identidade nunca é só cor: cada segmento tem tooltip e a legenda acompanha.
function estiloFase(fase: FaseParceria): string {
  if (fase.concluida) return 'bg-graphite';
  if (faseFutura(fase)) return 'border border-mist bg-paper';
  return 'bg-accent';
}

function faseAtualDe(parceria: Parceria): FaseParceria | undefined {
  return parceria.fases.find((f) => !f.concluida && !faseFutura(f)) ?? parceria.fases.find((f) => !f.concluida);
}

export function Cronograma() {
  const { cliente, parcerias } = useDadosCliente();
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const carregarParcerias = useStore((s) => s.carregarParcerias);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarPartes = useStore((s) => s.carregarPartes);
  const { toast } = useToast();

  // Carrega parcerias reais (via projetos do cliente) e as partes (marcas).
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([carregarPartes(), carregarProjetos()]);
        await carregarParcerias();
      } catch (e) {
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar as parcerias.');
      }
    })();
  }, [clienteAtivoId, carregarPartes, carregarProjetos, carregarParcerias, toast]);
  const fracaoHoje = (HOJE.getTime() - INICIO_ANO) / DURACAO_ANO;

  const ativas = parcerias.filter((p) => p.status === 'ativa').length;
  const planejadas = parcerias.filter((p) => p.status === 'planejada').length;
  const concluidas = parcerias.filter((p) => p.status === 'concluida').length;

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Parcerias fechadas · ${cliente.nome}`}
        titulo="Cronograma 2026"
        descricao="A linha do tempo das parcerias formalizadas. Cada trilha mostra as fases de execução ao longo do ano — clique na parceria para abrir entregas, reuniões, pendências e indicadores."
        acoes={
          <div className="flex items-center gap-2">
            <Chip tom="info">{ativas} ativas</Chip>
            <Chip tom="neutro">{planejadas} planejadas</Chip>
            <Chip tom="pos">{concluidas} concluídas</Chip>
          </div>
        }
      />

      {/* Legenda */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 text-xs text-graphite">
          <span className="h-2.5 w-7 rounded-full bg-accent" /> Fase em andamento
        </span>
        <span className="flex items-center gap-2 text-xs text-graphite">
          <span className="h-2.5 w-7 rounded-full bg-graphite" /> Concluída
        </span>
        <span className="flex items-center gap-2 text-xs text-graphite">
          <span className="h-2.5 w-7 rounded-full border border-mist bg-paper" /> Planejada
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-deep">
          <span className="h-3 w-px bg-accent" /> hoje · {formatarDataCurta('2026-07-15')}
        </span>
      </div>

      {parcerias.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma parceria fechada"
          descricao="Quando candidaturas aprovadas forem formalizadas, as parcerias e seus cronogramas aparecem aqui."
        />
      ) : (
        <div className="card overflow-hidden">
          {/* Régua de meses */}
          <div
            className="grid border-b border-cloud"
            style={{ gridTemplateColumns: `${LARGURA_INFO}px 1fr` }}
          >
            <div className="label-mono px-6 py-3.5">Parceria</div>
            <div className="grid grid-cols-12 pr-6">
              {MESES.map((m) => (
                <div key={m} className="py-3.5 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
                  {m}
                </div>
              ))}
            </div>
          </div>

          {/* Corpo com linha de hoje atravessando todas as trilhas */}
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent/60"
              style={{ left: `calc(${LARGURA_INFO}px + (100% - ${LARGURA_INFO + 24}px) * ${fracaoHoje})` }}
            />

            <div className="divide-y divide-cloud">
              {parcerias.map((parceria) => {
                const marca = MARCAS.find((m) => m.id === parceria.marcaId);
                const atual = faseAtualDe(parceria);
                return (
                  <div
                    key={parceria.id}
                    className="grid items-center transition-colors hover:bg-off/60"
                    style={{ gridTemplateColumns: `${LARGURA_INFO}px 1fr` }}
                  >
                    {/* Informações */}
                    <div className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/parcerias/${parceria.id}`}
                          className="text-sm font-bold text-ink transition-colors hover:text-accent-deep"
                        >
                          {parceria.nome}
                        </Link>
                      </div>
                      <div className="mt-0.5 text-xs text-stone">
                        {marca?.nome} · {parceria.tipo}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Chip tom={TOM_PARCERIA[parceria.status]}>{STATUS_PARCERIA[parceria.status]}</Chip>
                        <Link
                          to={`/parcerias/${parceria.id}`}
                          className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-deep"
                        >
                          execução <ArrowRight size={11} strokeWidth={1.5} />
                        </Link>
                      </div>
                    </div>

                    {/* Trilha do ano */}
                    <div className="py-5 pr-6">
                      <div className="relative h-6">
                        {/* período total da parceria */}
                        <div
                          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-cloud"
                          style={{
                            left: `${pct(parceria.dataInicio)}%`,
                            width: `${Math.max(1, pct(parceria.dataFim) - pct(parceria.dataInicio))}%`,
                          }}
                        />
                        {/* fases como segmentos */}
                        {parceria.fases.map((fase) => {
                          const inicio = pct(fase.inicio);
                          const largura = Math.max(1.5, pct(fase.fim) - inicio);
                          return (
                            <div
                              key={fase.nome}
                              className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ring-2 ring-paper ${estiloFase(fase)}`}
                              style={{ left: `${inicio}%`, width: `${largura}%` }}
                              title={`${fase.nome} · ${formatarDataCurta(fase.inicio)} – ${formatarDataCurta(fase.fim)}${
                                fase.concluida ? ' · concluída' : faseFutura(fase) ? ' · planejada' : ' · em andamento'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs text-stone">
                        {parceria.status === 'concluida' ? (
                          <>Concluída em {formatarDataCurta(parceria.dataFim)} — todas as fases entregues.</>
                        ) : atual ? (
                          <>
                            Agora: <strong className="font-semibold text-graphite">{atual.nome}</strong> · até{' '}
                            {formatarDataCurta(atual.fim)}
                          </>
                        ) : (
                          <>Início previsto em {formatarDataCurta(parceria.dataInicio)}.</>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <RotuloMono>{parcerias.length} parcerias no portfólio 2026</RotuloMono>
        <Link to="/resumo" className="text-xs font-semibold text-accent hover:text-accent-deep">
          Gerar resumo executivo →
        </Link>
      </div>
    </div>
  );
}
