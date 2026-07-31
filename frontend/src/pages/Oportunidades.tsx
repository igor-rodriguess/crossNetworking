import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Botao, CabecalhoPagina, Chip, MedidorScore, RotuloMono, type TomChip } from '../components/ui';
import { useToast } from '../components/Toast';
import { ErroApi } from '../api/erros';
import * as oportunidadesApi from '../api/oportunidades.api';
import { useStore } from '../store/useStore';

const DIMENSOES = [
  { chave: 'compatibilidade_publicos', rotulo: 'Públicos' },
  { chave: 'compatibilidade_territorios', rotulo: 'Territórios' },
  { chave: 'complementaridade_ativos', rotulo: 'Ativos' },
  { chave: 'sinergias', rotulo: 'Sinergias' },
  { chave: 'fit_estrategico', rotulo: 'Fit estratégico' },
  { chave: 'momento_estrategico', rotulo: 'Momento' },
] as const;

const NIVEL = {
  alta: { rotulo: 'Alta', cor: 'text-status-pos', barra: 'bg-status-pos', largura: '100%' },
  media: { rotulo: 'Média', cor: 'text-status-warn', barra: 'bg-status-warn', largura: '66%' },
  baixa: { rotulo: 'Baixa', cor: 'text-status-neg', barra: 'bg-status-neg', largura: '33%' },
};

const RECOMENDACAO: Record<oportunidadesApi.AnaliseOportunidadeApi['recomendacao'], { rotulo: string; tom: TomChip }> = {
  recomendada: { rotulo: 'Recomendada', tom: 'pos' },
  em_estudo: { rotulo: 'Em estudo', tom: 'warn' },
  nao_recomendada: { rotulo: 'Não recomendada', tom: 'neg' },
};

function mensagemErro(erro: unknown) {
  return erro instanceof ErroApi ? erro.message : 'Não foi possível consultar as oportunidades de IA.';
}

export function Oportunidades() {
  const clientes = useStore((s) => s.clientes);
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const projetos = useStore((s) => s.projetos);
  const frentes = useStore((s) => s.frentes);
  const carregarClientes = useStore((s) => s.carregarClientes);
  const carregarProjetos = useStore((s) => s.carregarProjetos);
  const carregarFrentesDosProjetos = useStore((s) => s.carregarFrentesDosProjetos);
  const { toast } = useToast();
  const [itens, setItens] = useState<oportunidadesApi.OportunidadeApi[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | oportunidadesApi.AnaliseOportunidadeApi['recomendacao']>('todas');
  const [selecionadaId, setSelecionadaId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [tarefa, setTarefa] = useState<oportunidadesApi.TarefaPipelineApi | null>(null);
  const [projetoId, setProjetoId] = useState('');
  const [frenteId, setFrenteId] = useState('');
  const [direcionadores, setDirecionadores] = useState('');

  const cliente = clientes.find((item) => item.id === clienteAtivoId) ?? clientes[0];
  const projetosDoCliente = projetos.filter((item) => item.clienteId === cliente?.id && item.status !== 'concluido');
  const projeto = projetosDoCliente.find((item) => item.id === projetoId) ?? projetosDoCliente[0];
  const frentesDoProjeto = frentes.filter((item) => item.projetoId === projeto?.id && item.status !== 'encerrada');
  const frenteSelecionada = frentesDoProjeto.find((item) => item.id === frenteId) ?? frentesDoProjeto[0];

  async function carregar() {
    setCarregando(true);
    try {
      const resposta = await oportunidadesApi.listarOportunidades({ porPagina: 100 });
      setItens(resposta.itens);
      setSelecionadaId((atual) => atual || resposta.itens[0]?.id || '');
    } catch (erro) {
      toast(mensagemErro(erro));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void Promise.all([carregarClientes(), carregarProjetos()])
      .then(() => carregarFrentesDosProjetos())
      .catch(() => undefined);
    void carregar();
  // Os carregadores Zustand são estáveis; a carga inicial não deve reiniciar ao trocar filtros.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projeto && projeto.id !== projetoId) setProjetoId(projeto.id);
  }, [projeto, projetoId]);

  useEffect(() => {
    if (frenteSelecionada && frenteSelecionada.id !== frenteId) setFrenteId(frenteSelecionada.id);
  }, [frenteSelecionada, frenteId]);

  // A pesquisa externa pode levar alguns segundos: agendamos e acompanhamos
  // por polling para a interface continuar responsiva durante a curadoria.
  async function mapearNovasOportunidades() {
    if (!cliente) {
      toast('Selecione ou cadastre um cliente antes de mapear oportunidades.');
      return;
    }
    if (!projeto || !frenteSelecionada) {
      toast('Selecione o projeto e o interesse da Aramis que devem orientar esta busca.');
      return;
    }
    const objetivo = frenteSelecionada.objetivo;
    setGerando(true);
    setTarefa(null);
    try {
      const agendada = await oportunidadesApi.agendarPartnerDiscovery({
        cliente: cliente.nome,
        objetivo,
        contexto: `Cliente: ${cliente.nome}. Projeto: ${projeto.nome}. Briefing selecionado: ${frenteSelecionada.nome}. Território/categoria: ${frenteSelecionada.territorio}. Objetivo do briefing: ${frenteSelecionada.objetivo}. Direcionadores estratégicos informados pela equipe: ${direcionadores.trim() || 'não informado; usar somente o briefing selecionado'}. Pesquise somente marcas externas que possam atender a este briefing.`,
        projeto_id: projeto.id,
        frente_id: frenteSelecionada.id,
        limite_consultas: 2,
        limite_resultados_por_consulta: 3,
        limite_urls: 3,
        limite_candidatos: 3,
      });
      setTarefa(agendada);
    } catch (erro) {
      toast(mensagemErro(erro));
      setGerando(false);
    }
  }

  useEffect(() => {
    if (!tarefa || tarefa.status === 'concluida' || tarefa.status === 'erro') return;
    const id = window.setInterval(() => {
      void oportunidadesApi
        .consultarTarefa(tarefa.id)
        .then(setTarefa)
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [tarefa]);

  // Ao fechar a tarefa, recarrega a lista e informa o desfecho.
  useEffect(() => {
    if (!tarefa) return;
    if (tarefa.status !== 'concluida' && tarefa.status !== 'erro') return;
    setGerando(false);
    if (tarefa.status === 'erro') {
      toast(tarefa.erro ?? 'A execução falhou.');
      return;
    }
    void carregar().then(() => {
      const semEvidencia = tarefa.resultado?.status === 'insufficient_evidence';
      toast(
        semEvidencia
          ? 'A execução terminou sem evidência suficiente para sugerir parceiros. Ajuste o objetivo ou as fontes e tente novamente.'
          : 'Descoberta concluída. As sugestões estão listadas para curadoria.'
      );
    });
  // `carregar` e `toast` são estáveis; reagir só à mudança de estado da tarefa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa?.status]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase();
    return itens.filter((item) => {
      const combinaBusca = !termo || `${item.cliente_nome} ${item.parceiro_nome} ${item.objetivo}`.toLocaleLowerCase().includes(termo);
      return combinaBusca && (filtro === 'todas' || item.analise.recomendacao === filtro);
    });
  }, [busca, filtro, itens]);

  const oportunidade = filtradas.find((item) => item.id === selecionadaId) ?? filtradas[0];
  const frenteDaOportunidade = oportunidade ? frentes.find((frente) => frente.id === oportunidade.frente_id) : undefined;

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Inteligência Cross · curadoria humana"
        titulo="Oportunidades de parceria"
        descricao="Sugestões reais produzidas pelo pipeline de IA, com fit Crossability, fontes utilizadas e briefing inicial para a equipe avaliar."
        acoes={
          <Botao pequeno disabled={gerando || !cliente || !frenteSelecionada} onClick={() => void mapearNovasOportunidades()}>
            <Sparkles size={14} strokeWidth={1.5} /> {gerando ? 'Pesquisando o briefing…' : 'Pesquisar este briefing'}
          </Botao>
        }
      />

      <section className="relative mb-6 overflow-hidden rounded-2xl bg-ink px-6 py-7 text-paper shadow-pop md:px-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border border-graphite" />
        <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent"><Radar size={14} strokeWidth={1.5} /> Radar de oportunidades orientado por briefing</div>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-extrabold tracking-tight md:text-3xl">Qual interesse da Aramis esta busca deve atender?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">Escolha um briefing antes de pesquisar. O radar procura marcas externas com sinais públicos de parceria para esse objetivo específico — não uma lista aleatória por categoria.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block"><span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-mist">Projeto da Aramis</span><select value={projeto?.id ?? ''} onChange={(e) => { setProjetoId(e.target.value); setFrenteId(''); }} className="w-full cursor-pointer rounded-lg border border-graphite bg-paper/10 px-3 py-2.5 text-sm text-paper outline-none transition focus:border-accent"><option value="" className="text-ink">Selecione um projeto</option>{projetosDoCliente.map((item) => <option key={item.id} value={item.id} className="text-ink">{item.nome}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-mist">Interesse / frente de oportunidade</span><select value={frenteSelecionada?.id ?? ''} disabled={!projeto} onChange={(e) => setFrenteId(e.target.value)} className="w-full cursor-pointer rounded-lg border border-graphite bg-paper/10 px-3 py-2.5 text-sm text-paper outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"><option value="" className="text-ink">Selecione o interesse</option>{frentesDoProjeto.map((item) => <option key={item.id} value={item.id} className="text-ink">{item.nome}</option>)}</select></label>
              <label className="block md:col-span-2"><span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-mist">Direcionadores estratégicos adicionais <span className="normal-case tracking-normal text-mist">(opcional)</span></span><textarea value={direcionadores} onChange={(e) => setDirecionadores(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: homem de 25–45 anos, lifestyle premium, corrida e bem-estar; evitar concorrentes diretos de moda." className="w-full resize-y rounded-lg border border-graphite bg-paper/10 px-3 py-2.5 text-sm leading-relaxed text-paper placeholder:text-mist outline-none transition focus:border-accent" /><span className="mt-1 block text-xs text-mist">Esses critérios refinam as pesquisas externas e ajudam a evitar sugestões genéricas. Eles não substituem as fontes verificáveis.</span></label>
            </div>
          </div>
          <div className="rounded-xl border border-graphite bg-paper/[0.06] p-5">
            <RotuloMono className="text-accent">Briefing que vai guiar o fit</RotuloMono>
            <h3 className="mt-2 font-display text-lg font-bold leading-tight text-paper">{frenteSelecionada?.nome ?? 'Selecione uma frente de oportunidade'}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">{frenteSelecionada?.objetivo ?? 'O objetivo da frente aparecerá aqui e será usado para direcionar as pesquisas e a análise.'}</p>
            <div className="mt-4 flex items-center gap-2 border-t border-graphite pt-3 text-xs text-mist"><ShieldCheck size={15} className="text-accent" strokeWidth={1.5} /> Fontes externas obrigatórias · curadoria humana obrigatória</div>
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="relative min-w-64 flex-1"><span className="label-mono mb-1.5 block">Buscar oportunidade</span><Search size={15} strokeWidth={1.5} className="pointer-events-none absolute bottom-2.5 left-3 text-stone" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, parceiro ou objetivo…" className="w-full rounded-md border border-mist bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-mist focus:border-accent" /></label>
        <label className="flex flex-col gap-1.5"><span className="label-mono">Leitura da IA</span><select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="w-56 cursor-pointer rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-accent"><option value="todas">Todas as sugestões</option><option value="recomendada">Recomendadas</option><option value="em_estudo">Em estudo</option></select></label>
        <div className="pb-2 font-mono text-[12px] uppercase tracking-[0.12em] text-stone">{filtradas.length} oportunidades</div>
      </div>

      {carregando ? (
        <div className="card flex items-center justify-center gap-3 px-8 py-14 text-sm text-stone"><span className="h-5 w-5 animate-spin rounded-full border-2 border-cloud border-t-accent" />Carregando oportunidades…</div>
      ) : filtradas.length === 0 ? (
        <div className="card px-8 py-14 text-center"><h3 className="font-display text-lg font-bold text-ink">Nenhuma oportunidade registrada</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone">Selecione um interesse da Aramis e pesquise o mercado. Marcas que já estão no funil são excluídas; só entram rascunhos com evidência externa verificável.</p></div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            {filtradas.map((item) => {
              const recomendacao = RECOMENDACAO[item.analise.recomendacao];
              const ativa = item.id === oportunidade?.id;
              const frenteDaSugestao = frentes.find((frente) => frente.id === item.frente_id);
              const origem = item.pipeline === 'partner_discovery' ? 'Pesquisa externa validada' : 'Inteligência de mercado';
              return (
                <button key={item.id} type="button" onClick={() => setSelecionadaId(item.id)} className={`card block w-full p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop ${ativa ? 'border-accent shadow-card' : ''}`}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0"><RotuloMono className="mb-1">{origem}</RotuloMono><h3 className="font-display text-xl font-bold leading-tight text-ink">{item.parceiro_nome}</h3><p className="mt-1 line-clamp-1 text-xs text-stone">Para: {frenteDaSugestao?.nome ?? item.objetivo}</p></div>
                    <ChevronRight size={17} className={`mt-1 shrink-0 ${ativa ? 'text-accent' : 'text-mist'}`} strokeWidth={1.5} />
                  </div>
                  <div className="mb-3 flex items-center justify-between gap-3"><Chip tom={recomendacao.tom}>{recomendacao.rotulo}</Chip><span className="font-mono text-xs text-stone">{item.score_fit}% aderência c/ evidência</span></div>
                  <MedidorScore percentual={item.score_fit} />
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-stone">{item.fontes[0]?.detalhe ?? item.analise.racional_recomendacao}</p>
                </button>
              );
            })}
          </div>

          {oportunidade && <article className="space-y-6">
            <div className="card overflow-hidden p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><RotuloMono className="mb-2">Oportunidade para um briefing da Aramis</RotuloMono><h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">{oportunidade.cliente_nome} <span className="text-accent">×</span> {oportunidade.parceiro_nome}</h2><div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3"><div className="label-mono mb-1 text-accent-deep">Interesse da Aramis que orientou a pesquisa</div><p className="text-sm font-semibold leading-relaxed text-ink">{frenteDaOportunidade?.nome ?? oportunidade.objetivo}</p><p className="mt-1 text-xs leading-relaxed text-stone">{frenteDaOportunidade?.objetivo ?? oportunidade.objetivo}</p></div></div><div className="text-right"><Chip tom={RECOMENDACAO[oportunidade.analise.recomendacao].tom}>{RECOMENDACAO[oportunidade.analise.recomendacao].rotulo}</Chip><div className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-stone">confiança: {oportunidade.confianca}%</div></div></div><div className="mt-5 border-l-2 border-accent pl-4"><div className="label-mono mb-1">Evidência que abriu esta hipótese</div><p className="text-sm leading-relaxed text-graphite">{oportunidade.fontes[0]?.detalhe ?? oportunidade.analise.racional_recomendacao}</p></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-cloud bg-off p-4"><div className="flex items-center gap-2 text-accent-deep"><Target size={15} strokeWidth={1.5} /><RotuloMono>Aderência com evidência</RotuloMono></div><div className="mt-2 font-display text-3xl font-extrabold text-ink">{oportunidade.score_fit}%</div><MedidorScore percentual={oportunidade.score_fit} className="mt-2" /></div><div className="rounded-xl border border-cloud bg-off p-4"><div className="flex items-center gap-2 text-accent-deep"><BookOpen size={15} strokeWidth={1.5} /><RotuloMono>Evidências externas</RotuloMono></div><div className="mt-2 font-display text-3xl font-extrabold text-ink">{oportunidade.fontes.length}</div><p className="mt-1 text-xs text-stone">fontes registradas para revisão</p></div><div className="rounded-xl border border-cloud bg-off p-4"><div className="flex items-center gap-2 text-accent-deep"><Users size={15} strokeWidth={1.5} /><RotuloMono>Próxima etapa</RotuloMono></div><div className="mt-2 text-lg font-bold text-ink">Curadoria</div><p className="mt-1 text-xs text-stone">validar disponibilidade e abordagem</p></div></div></div>

            <div className="grid gap-6 lg:grid-cols-2"><section className="card overflow-hidden"><div className="flex items-center gap-2 border-b border-cloud bg-off px-6 py-4"><Target size={15} className="text-accent" strokeWidth={1.5} /><RotuloMono>Leitura de aderência ao briefing</RotuloMono></div><div className="divide-y divide-cloud px-6">{DIMENSOES.map(({ chave, rotulo }) => { const dimensao = oportunidade.analise[chave]; const nivel = NIVEL[dimensao.nivel]; return <div key={chave} className="py-3"><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-graphite">{rotulo}</span><span className={`font-semibold ${nivel.cor}`}>{nivel.rotulo}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-cloud"><div className={`h-full rounded-full ${nivel.barra}`} style={{ width: nivel.largura }} /></div><p className="mt-1.5 text-xs leading-relaxed text-stone">{dimensao.texto}</p></div>; })}</div><p className="border-t border-cloud px-6 py-4 text-sm leading-relaxed text-stone">{oportunidade.analise.racional_recomendacao}</p></section>
              <section className="card overflow-hidden"><div className="flex items-center gap-2 border-b border-cloud bg-off px-6 py-4"><ShieldCheck size={15} className="text-accent" strokeWidth={1.5} /><RotuloMono>Evidências externas para revisão</RotuloMono></div><div className="divide-y divide-cloud">{oportunidade.fontes.length ? oportunidade.fontes.map((fonte, indice) => <div key={`${fonte.nome}-${indice}`} className="flex gap-3 px-6 py-4"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-pos" strokeWidth={1.5} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">{fonte.url ? <a href={fonte.url} target="_blank" rel="noreferrer" className="hover:text-accent-deep hover:underline">{fonte.nome}</a> : <span>{fonte.nome}</span>}{fonte.url && <ExternalLink size={12} className="text-stone" strokeWidth={1.5} />}</div><div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep">{fonte.tipo}</div><p className="mt-1 text-xs leading-relaxed text-stone">{fonte.detalhe}</p></div></div>) : <p className="px-6 py-10 text-center text-sm text-stone">A execução não retornou fontes suficientes para exibição.</p>}</div></section></div>

            <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud bg-off px-6 py-4"><div className="flex items-center gap-2"><FileText size={15} className="text-accent" strokeWidth={1.5} /><RotuloMono>Briefing sugerido para iniciar a conversa</RotuloMono></div><Chip tom="info">rascunho de IA</Chip></div><div className="grid gap-6 p-6 md:grid-cols-2 md:p-8"><div><div className="label-mono mb-1.5">Objetivo da parceria</div><p className="text-sm leading-relaxed text-ink">{oportunidade.briefing.objetivo}</p></div><div><div className="label-mono mb-1.5">Público e território</div><p className="text-sm leading-relaxed text-ink">{oportunidade.briefing.publico}</p></div><div className="md:col-span-2"><div className="label-mono mb-2">Ativações a investigar</div><ul className="grid gap-2 sm:grid-cols-3">{oportunidade.briefing.ativacoes.map((ativacao) => <li key={ativacao} className="flex gap-2 text-sm leading-relaxed text-graphite"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.5} />{ativacao}</li>)}</ul></div><div className="rounded-md border border-status-warn/30 bg-status-warnsoft p-4 md:col-span-2"><div className="label-mono mb-1.5 text-status-warn">Validação prioritária</div><p className="text-sm leading-relaxed text-graphite">{oportunidade.briefing.proxima_validacao}</p></div></div><div className="flex items-center justify-between gap-4 border-t border-cloud px-6 py-4 md:px-8"><p className="text-xs text-stone">Registro criado em {new Date(oportunidade.criado_em).toLocaleString('pt-BR')} · status: {oportunidade.status.replace('_', ' ')}.</p><span className="inline-flex items-center gap-2 text-sm font-semibold text-accent-deep">Aguardar curadoria <ArrowRight size={14} strokeWidth={1.5} /></span></div></section>
          </article>}
        </div>
      )}
    </div>
  );
}
