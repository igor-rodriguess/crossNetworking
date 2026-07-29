import { useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, FileSearch, FileUp, Search, Sparkles, Upload } from 'lucide-react';
import * as ragApi from '../api/rag.api';
import { extrairTextoArquivo, fatiarParaRag } from '../lib/documento-rag';
import { Botao, CabecalhoPagina, CampoTexto, Chip, RotuloMono } from '../components/ui';
import { ErroApi } from '../api/erros';
import { useToast } from '../components/Toast';

const MAX_TRECHOS = 500;

export function Conhecimento() {
  const { toast } = useToast();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState('');
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [paginas, setPaginas] = useState<number | undefined>();
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [indexando, setIndexando] = useState(false);
  const [resultado, setResultado] = useState<{ inseridos: number; origem: string } | null>(null);
  const [consulta, setConsulta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState<ragApi.BuscaRag | null>(null);

  const trechos = useMemo(() => fatiarParaRag(texto), [texto]);
  const trechosParaIndexar = trechos.slice(0, MAX_TRECHOS);
  const excedeuLimite = trechos.length > MAX_TRECHOS;

  async function escolherArquivo(arquivo: File) {
    setProcessandoArquivo(true);
    setResultado(null);
    try {
      const extraido = await extrairTextoArquivo(arquivo);
      setTexto(extraido.texto);
      setArquivoNome(arquivo.name);
      setPaginas(extraido.paginas);
      if (!titulo.trim()) setTitulo(arquivo.name.replace(/\.[^.]+$/, ''));
      toast('Texto extraído localmente. Revise a prévia antes de indexar.');
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : 'Não foi possível ler o arquivo.');
    } finally {
      setProcessandoArquivo(false);
    }
  }

  async function indexar() {
    if (!titulo.trim() || !trechosParaIndexar.length || indexando) return;
    setIndexando(true);
    setResultado(null);
    try {
      let inseridos = 0;
      let origem = 'mock';
      for (let inicio = 0; inicio < trechosParaIndexar.length; inicio += 100) {
        const resposta = await ragApi.ingerirRag({
          origem: 'relatorio',
          trechos: trechosParaIndexar.slice(inicio, inicio + 100),
          metadados: {
            titulo: titulo.trim(),
            arquivo: arquivoNome,
            paginas: paginas ?? null,
            indexado_via: 'central_de_conhecimento',
          },
        });
        inseridos += resposta.inseridos;
        origem = resposta.embedding_origem;
      }
      setResultado({ inseridos, origem });
      toast(`${inseridos} trechos do relatório foram adicionados à base de conhecimento.`);
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível indexar o relatório.');
    } finally {
      setIndexando(false);
    }
  }

  async function pesquisar(e: React.FormEvent) {
    e.preventDefault();
    if (!consulta.trim() || buscando) return;
    setBuscando(true);
    try {
      setBusca(await ragApi.buscarRag(consulta.trim()));
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível consultar a base.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Conhecimento que alimenta a IA"
        titulo="Relatórios & base RAG"
        descricao="Indexe relatórios de mercado, perfis de marca e materiais estratégicos para que os agentes usem o contexto da Cross ao avaliar parcerias."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="mb-5 flex items-start justify-between gap-4"><div><RotuloMono>Adicionar um relatório</RotuloMono><p className="mt-2 text-sm leading-relaxed text-stone">PDF com texto selecionável, TXT, MD ou CSV. O arquivo é lido no navegador; apenas trechos confirmados são enviados ao RAG.</p></div><BookOpenCheck size={22} strokeWidth={1.4} className="shrink-0 text-accent" /></div>
          <input ref={arquivoRef} type="file" accept=".pdf,.txt,.md,.csv,text/plain,text/markdown,text/csv,application/pdf" className="hidden" onChange={(e) => { const arquivo = e.target.files?.[0]; if (arquivo) void escolherArquivo(arquivo); e.target.value = ''; }} />
          <div className="rounded-xl border border-dashed border-mist bg-off p-5">
            <Botao pequeno onClick={() => arquivoRef.current?.click()} disabled={processandoArquivo}><FileUp size={14} strokeWidth={1.5} /> {processandoArquivo ? 'Extraindo texto…' : 'Escolher relatório'}</Botao>
            {arquivoNome ? <p className="mt-3 text-sm font-semibold text-ink">{arquivoNome}{paginas ? <span className="ml-2 text-xs font-normal text-stone">· {paginas} páginas</span> : null}</p> : <p className="mt-3 text-xs text-stone">Limite por arquivo: 15 MB. PDFs escaneados exigem OCR.</p>}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><CampoTexto rotulo="Título da fonte" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Panorama de marcas 2026" /><div className="rounded-md border border-cloud bg-off px-3 py-2"><span className="label-mono">Trechos para a IA</span><p className="mt-1 text-sm font-semibold text-ink">{trechosParaIndexar.length} {trechosParaIndexar.length === 1 ? 'trecho' : 'trechos'}</p></div></div>
          <label className="mt-4 flex flex-col gap-1.5"><span className="label-mono">Texto extraído — revisável</span><textarea value={texto} onChange={(e) => { setTexto(e.target.value); setResultado(null); }} rows={12} placeholder="Envie um arquivo ou cole o conteúdo do relatório aqui." className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-mist focus:border-accent" /></label>
          {excedeuLimite && <p className="mt-3 text-xs text-status-warn">O material foi limitado aos primeiros {MAX_TRECHOS} trechos. Divida relatórios muito extensos para preservar o conteúdo integral.</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-stone">{texto.length.toLocaleString('pt-BR')} caracteres · cada trecho preserva contexto com sobreposição.</span><Botao onClick={indexar} disabled={!titulo.trim() || !trechosParaIndexar.length || indexando}><Upload size={14} strokeWidth={1.5} /> {indexando ? 'Indexando no RAG…' : 'Adicionar à base de IA'}</Botao></div>
          {resultado && <div className="mt-5 flex items-start gap-3 rounded-lg border-l-2 border-l-status-pos bg-status-possoft/30 px-4 py-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-status-pos" /><p className="text-sm text-graphite"><strong className="text-ink">{resultado.inseridos} trechos indexados.</strong> Embeddings: {resultado.origem === 'mock' ? 'modo local determinístico' : 'vetoriais'}.</p></div>}
        </section>

        <section className="card p-6">
          <RotuloMono>Validar o que a IA encontra</RotuloMono>
          <p className="mt-2 text-sm leading-relaxed text-stone">Pesquise como um agente pesquisaria. Isso confirma se o relatório entrou na base antes de gerar oportunidades.</p>
          <form onSubmit={pesquisar} className="mt-5 flex gap-2"><input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Ex.: marcas com público jovem no Nordeste" className="min-w-0 flex-1 rounded-full border border-mist bg-paper px-4 py-2 text-sm text-ink placeholder:text-mist focus:border-accent" /><Botao pequeno type="submit" disabled={buscando}><Search size={14} /> {buscando ? 'Buscando…' : 'Consultar'}</Botao></form>
          {busca ? <div className="mt-5"><div className="mb-3 flex items-center justify-between"><RotuloMono>Trechos recuperados</RotuloMono><Chip tom={busca.total ? 'pos' : 'warn'}>{busca.total} encontrados</Chip></div><div className="space-y-3">{busca.trechos.map((trecho) => { const metadados = trecho.metadados as { titulo?: string; arquivo?: string } | null; return <article key={trecho.id} className="rounded-lg border border-cloud bg-off p-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-xs font-semibold text-ink">{metadados?.titulo ?? metadados?.arquivo ?? trecho.origem}</span><span className="shrink-0 font-mono text-[11px] text-accent-deep">{Math.round(trecho.similaridade * 100)}% fit</span></div><p className="line-clamp-5 text-sm leading-relaxed text-graphite">{trecho.conteudo}</p></article>; })}</div>{busca.total === 0 && <div className="mt-8 text-center text-sm text-stone"><FileSearch size={22} className="mx-auto mb-2" />Nenhum trecho relevante ainda.</div>}</div> : <div className="mt-10 rounded-lg bg-off p-5 text-center text-sm text-stone"><Sparkles size={20} className="mx-auto mb-2 text-accent" />A busca é a última checagem antes de usar a IA em uma recomendação.</div>}
        </section>
      </div>
    </div>
  );
}
