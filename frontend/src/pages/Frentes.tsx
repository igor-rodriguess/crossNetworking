import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Filter, Search } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { useDadosCliente, type CandidaturaEnriquecida } from '../lib/useDadosCliente';
import { RESPONSAVEL_ACAO, STATUS_CANDIDATURA, diasDesde } from '../lib/format';
import { transicoesValidas } from '../lib/funil';
import { CabecalhoPagina, Chip, EstadoVazio, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import type { StatusCandidatura } from '../types';

// ─── Mapeamento de oportunidades ────────────────────────────────────────────
//
// Traduz a planilha de trabalho da Cross para dentro da plataforma. A planilha
// organiza o mapeamento como TERRITÓRIO → SETOR → MARCA, com o status de cada
// conversa; o funil em colunas perdia esse agrupamento, espalhando as marcas de
// um mesmo setor entre as etapas.
//
// Vocabulário: seguimos a planilha. "Frente" aqui significa a CONVERSA com a
// marca ("frente aberta", "abrir frente"), e é por isso que a tela se chama
// Mapeamento — o agrupamento é por território e setor, não por "frente".
// No banco a tabela se chama frente_oportunidade por razões históricas.
//
// O recorte do cliente vem do seletor no topo do app — esta tela nunca mostra
// outro cliente.

/**
 * Os registros foram nomeados no padrão "COLLABS · MODA · ACESSÓRIOS", que é a
 * mesma leitura da planilha. Quebramos o nome para agrupar por território e
 * exibir o setor; se o nome não seguir o padrão, tudo cai em "Outros" — a tela
 * nunca esconde um setor por não conseguir classificá-lo.
 */
function decompor(nome: string): { territorio: string; setor: string } {
  const partes = nome.split('·').map((p) => p.trim()).filter(Boolean);
  if (partes.length >= 3) return { territorio: `${partes[0]} · ${partes[1]}`, setor: partes.slice(2).join(' · ') };
  if (partes.length === 2) return { territorio: partes[0], setor: partes[1] };
  return { territorio: 'Outros', setor: nome };
}

const FILTROS_ACAO = [
  { id: 'todos', rotulo: 'Todas' },
  { id: 'cross', rotulo: 'Ação da Cross' },
  { id: 'cliente', rotulo: 'Aguardando cliente' },
  { id: 'parceiro', rotulo: 'Aguardando parceiro' },
] as const;

type FiltroAcao = (typeof FILTROS_ACAO)[number]['id'];

/** Uma linha de candidata: marca, status editável e tempo parado. */
function LinhaCandidata({ item, nomeCliente }: { item: CandidaturaEnriquecida; nomeCliente: string }) {
  const moverCandidatura = useStore((s) => s.moverCandidatura);
  const { toast } = useToast();
  const { candidatura, marca, score } = item;
  const dias = diasDesde(
    candidatura.historico[candidatura.historico.length - 1]?.data ?? candidatura.dataEntrada,
  );
  const meta = STATUS_CANDIDATURA[candidatura.status];
  const quem = RESPONSAVEL_ACAO[candidatura.status];

  async function mover(novo: StatusCandidatura) {
    if (novo === candidatura.status) return;
    try {
      await moverCandidatura(candidatura.id, novo, 'Atualizado na tela de frentes.');
      toast(`${marca.nome}: ${STATUS_CANDIDATURA[novo].rotulo}.`);
    } catch (e) {
      toast(e instanceof ErroApi ? e.message : 'Não foi possível mover a candidatura.');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-cloud px-5 py-2.5 transition-colors hover:bg-off">
      <Link
        to={`/marcas/${candidatura.id}`}
        className="min-w-44 flex-1 text-sm font-semibold text-ink transition-colors hover:text-accent-deep"
      >
        {marca.nome}
      </Link>

      {/* De quem é a bola — a leitura que a planilha dá e o funil não dava */}
      <span className="w-36 font-mono text-[10px] uppercase tracking-[0.08em] text-stone">
        {quem === 'cliente' ? `aguarda ${nomeCliente}` : quem === 'parceiro' ? 'aguarda parceiro' : quem === 'cross' ? 'ação da Cross' : '—'}
      </span>

      {score ? (
        <Chip tom={score.percentual >= 70 ? 'pos' : score.percentual >= 45 ? 'warn' : 'neutro'}>
          {score.percentual}%
        </Chip>
      ) : (
        <span className="w-12 text-center font-mono text-[11px] text-mist">—</span>
      )}

      <span className="w-16 text-right font-mono text-[11px] text-stone">
        {dias === 0 ? 'hoje' : `${dias}d`}
      </span>

      <select
        value={candidatura.status}
        onChange={(e) => mover(e.target.value as StatusCandidatura)}
        aria-label={`Status de ${marca.nome}`}
        className={`w-52 cursor-pointer rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors focus:border-accent ${
          meta.tom === 'pos'
            ? 'border-status-pos/40 bg-status-possoft text-status-pos'
            : meta.tom === 'neg'
              ? 'border-status-neg/40 bg-status-negsoft text-status-neg'
              : meta.tom === 'warn'
                ? 'border-status-warn/40 bg-status-warnsoft text-status-warn'
                : meta.tom === 'info'
                  ? 'border-accent/30 bg-accent-soft text-accent-deep'
                  : 'border-mist bg-paper text-stone'
        }`}
      >
        {transicoesValidas(candidatura.status).map((s) => (
          <option key={s} value={s}>
            {STATUS_CANDIDATURA[s].rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Frentes() {
  const { cliente, itens } = useDadosCliente();
  const frentes = useStore((s) => s.frentes);
  const projetos = useStore((s) => s.projetos);
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const carregarPartes = useStore((s) => s.carregarPartes);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarFrentesDosProjetos = useStore((s) => s.carregarFrentesDosProjetos);
  const carregarCandidaturas = useStore((s) => s.carregarCandidaturas);
  const { toast } = useToast();

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroAcao>('todos');
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([carregarPartes(), carregarProjetos()]);
        await carregarFrentesDosProjetos();
        await carregarCandidaturas();
      } catch (e) {
        toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar o mapeamento.');
      }
    })();
  }, [clienteAtivoId, carregarPartes, carregarProjetos, carregarFrentesDosProjetos, carregarCandidaturas, toast]);

  // Frentes do cliente ativo, agrupadas por território (a leitura da planilha).
  const grupos = useMemo(() => {
    const idsProjetos = new Set(projetos.filter((p) => p.clienteId === cliente.id).map((p) => p.id));
    const doCliente = frentes.filter((f) => idsProjetos.has(f.projetoId));

    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const mapa = new Map<string, { setor: string; frente: (typeof doCliente)[number]; itens: CandidaturaEnriquecida[] }[]>();

    for (const frente of doCliente) {
      const candidatas = itens
        .filter((i) => i.candidatura.frenteId === frente.id)
        .filter((i) => (filtro === 'todos' ? true : RESPONSAVEL_ACAO[i.candidatura.status] === filtro))
        .filter((i) => !termo || i.marca.nome.toLocaleLowerCase('pt-BR').includes(termo))
        .sort((a, b) => (b.score?.percentual ?? -1) - (a.score?.percentual ?? -1));

      // Com filtro ou busca ativos, frentes sem resultado saem da tela.
      const filtrando = filtro !== 'todos' || termo.length > 0;
      if (filtrando && candidatas.length === 0) continue;

      const { territorio, setor } = decompor(frente.nome);
      const lista = mapa.get(territorio) ?? [];
      lista.push({ setor, frente, itens: candidatas });
      mapa.set(territorio, lista);
    }

    return [...mapa.entries()]
      .map(([territorio, linhas]) => ({
        territorio,
        linhas: linhas.sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR')),
        total: linhas.reduce((n, l) => n + l.itens.length, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [frentes, projetos, itens, cliente.id, busca, filtro]);

  const totalCandidatas = grupos.reduce((n, g) => n + g.total, 0);
  const totalFrentes = grupos.reduce((n, g) => n + g.linhas.length, 0);

  // Resumo por responsável pela próxima ação — o "onde eu ajo agora".
  const resumo = useMemo(() => {
    const r = { cross: 0, cliente: 0, parceiro: 0, nenhum: 0 };
    for (const i of itens) r[RESPONSAVEL_ACAO[i.candidatura.status]] += 1;
    return r;
  }, [itens]);

  function alternar(chave: string) {
    setRecolhidas((antes) => {
      const novo = new Set(antes);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Oportunidades · ${cliente.nome}`}
        titulo="Mapeamento de oportunidades"
        descricao="As marcas mapeadas por território e setor, como na planilha de trabalho. Altere o status direto na linha — a movimentação entra no histórico da candidatura."
      />

      {/* Onde está a bola: leitura rápida antes de descer para as frentes */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: 'Ação da Cross', valor: resumo.cross, tom: 'info' as const },
          { rotulo: `Aguardando ${cliente.nome}`, valor: resumo.cliente, tom: 'warn' as const },
          { rotulo: 'Aguardando parceiro', valor: resumo.parceiro, tom: 'warn' as const },
          { rotulo: 'Sem ação pendente', valor: resumo.nenhum, tom: 'neutro' as const },
        ].map((c) => (
          <div key={c.rotulo} className="card px-5 py-4">
            <RotuloMono>{c.rotulo}</RotuloMono>
            <div className="mt-1 font-display text-3xl font-extrabold text-ink">{c.valor}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca…"
            className="w-full rounded-full border border-mist bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-mist focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={13} strokeWidth={1.5} className="text-stone" />
          {FILTROS_ACAO.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
                filtro === f.id ? 'bg-ink text-paper' : 'border border-mist bg-paper text-stone hover:text-ink'
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
          {totalFrentes} setor(es) · {totalCandidatas} marca(s)
        </span>
      </div>

      {grupos.length === 0 ? (
        <EstadoVazio
          titulo={itens.length === 0 ? 'Nada mapeado ainda' : 'Nada encontrado'}
          descricao={
            itens.length === 0
              ? `Ainda não há oportunidades mapeadas para ${cliente.nome}. Verifique se a conta selecionada no topo é a correta, ou crie os territórios em Projetos & briefings.`
              : 'Nenhuma marca corresponde ao filtro ou à busca. Ajuste os critérios acima.'
          }
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.territorio}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">{grupo.territorio}</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
                  {grupo.linhas.length} setor(es) · {grupo.total} marca(s)
                </span>
              </div>

              <div className="space-y-2.5">
                {grupo.linhas.map(({ setor, frente, itens: candidatas }) => {
                  const chave = frente.id;
                  const aberta = !recolhidas.has(chave);
                  return (
                    <div key={chave} className="card overflow-hidden">
                      <button
                        onClick={() => alternar(chave)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-off"
                        aria-expanded={aberta}
                      >
                        <ChevronRight
                          size={15}
                          strokeWidth={1.5}
                          className={`shrink-0 text-stone transition-transform ${aberta ? 'rotate-90' : ''}`}
                        />
                        <span className="flex-1 text-sm font-semibold text-ink">{setor}</span>
                        <Chip tom={frente.status === 'em_andamento' ? 'info' : 'neutro'}>{frente.status.replace('_', ' ')}</Chip>
                        <span className="w-8 text-right font-mono text-xs font-bold text-stone">{candidatas.length}</span>
                      </button>

                      {aberta &&
                        (candidatas.length > 0 ? (
                          candidatas.map((item) => (
                            <LinhaCandidata key={item.candidatura.id} item={item} nomeCliente={cliente.nome} />
                          ))
                        ) : (
                          <p className="border-t border-cloud px-5 py-3 text-xs text-stone">
                            Nenhuma marca neste setor ainda.{' '}
                            <Link to="/funil" className="font-semibold text-accent-deep hover:underline">
                              Adicionar candidatura
                            </Link>
                          </p>
                        ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
