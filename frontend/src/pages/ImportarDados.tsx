import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, Sparkles, Upload } from 'lucide-react';
import * as importacaoApi from '../api/importacao-csv.api';
import { parseCsv } from '../lib/csv';
import { Botao, CabecalhoPagina, CampoSelecao, Chip, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import { ErroApi } from '../api/erros';

type Entidade = importacaoApi.EntidadeCsv;
type DestinoImportacao = Entidade | 'funil_historico';

const CONFIG: Record<Entidade, {
  rotulo: string;
  descricao: string;
  campos: { id: string; rotulo: string; obrigatorio?: boolean }[];
  modelo: string;
}> = {
  partes: {
    rotulo: 'Marcas, parceiros e talentos',
    descricao: 'Empresas, marcas, pessoas e seus contatos estratégicos.',
    campos: [
      { id: 'nome', rotulo: 'Nome', obrigatorio: true }, { id: 'tipo', rotulo: 'Tipo (organização ou pessoa)' },
      { id: 'categoria', rotulo: 'Segmento / categoria' }, { id: 'papel', rotulo: 'Papel na Cross' },
      { id: 'razao_social', rotulo: 'Razão social' }, { id: 'cnpj', rotulo: 'CNPJ' }, { id: 'site', rotulo: 'Site' },
      { id: 'nome_artistico', rotulo: 'Nome artístico' }, { id: 'cpf', rotulo: 'CPF' }, { id: 'nacionalidade', rotulo: 'Nacionalidade' },
      { id: 'contato_nome', rotulo: 'Nome do contato' }, { id: 'contato_cargo', rotulo: 'Cargo do contato' },
      { id: 'contato_email', rotulo: 'E-mail do contato' }, { id: 'contato_telefone', rotulo: 'Telefone do contato' },
    ],
    modelo: 'nome,tipo,categoria,papel,site,contato_nome,contato_email\nMarca Exemplo,organizacao,Bebidas & Lifestyle,parceiro,https://exemplo.com,Ana Silva,ana@exemplo.com',
  },
  clientes: {
    rotulo: 'Clientes Cross',
    descricao: 'Cria a organização e o vínculo comercial de cliente.',
    campos: [
      { id: 'nome', rotulo: 'Nome do cliente', obrigatorio: true }, { id: 'segmento', rotulo: 'Segmento' },
      { id: 'site', rotulo: 'Site' }, { id: 'inicio_relacionamento', rotulo: 'Início do relacionamento' },
      { id: 'observacoes', rotulo: 'Observações' },
    ],
    modelo: 'nome,segmento,site,inicio_relacionamento,observacoes\nCliente Exemplo,Varejo,https://exemplo.com,01/07/2026,Importado da base comercial',
  },
  projetos: {
    rotulo: 'Projetos',
    descricao: 'Vincula projetos a clientes já cadastrados pelo nome exato.',
    campos: [
      { id: 'cliente', rotulo: 'Cliente', obrigatorio: true }, { id: 'nome', rotulo: 'Nome do projeto', obrigatorio: true },
      { id: 'objetivo', rotulo: 'Objetivo', obrigatorio: true }, { id: 'descricao', rotulo: 'Descrição' },
      { id: 'produto', rotulo: 'Produto' }, { id: 'data_inicio', rotulo: 'Data de início' },
      { id: 'data_previsao_fim', rotulo: 'Previsão de fim' }, { id: 'prioridade', rotulo: 'Prioridade (código)' },
      { id: 'status', rotulo: 'Status (código)' },
    ],
    modelo: 'cliente,nome,objetivo,produto,data_inicio,data_previsao_fim\nCliente Exemplo,Verão 2027,Construir parceria de verão,Experiência de marca,2026-08-01,2027-02-28',
  },
  frentes: {
    rotulo: 'Frentes de oportunidade',
    descricao: 'Cria frentes vinculadas a um projeto e ao seu cliente.',
    campos: [
      { id: 'cliente', rotulo: 'Cliente', obrigatorio: true }, { id: 'projeto', rotulo: 'Projeto', obrigatorio: true },
      { id: 'nome', rotulo: 'Nome da frente', obrigatorio: true }, { id: 'objetivo', rotulo: 'Objetivo', obrigatorio: true },
      { id: 'descricao', rotulo: 'Descrição' }, { id: 'categoria', rotulo: 'Categoria' },
      { id: 'data_abertura', rotulo: 'Data de abertura' }, { id: 'data_encerramento', rotulo: 'Data de encerramento' }, { id: 'status', rotulo: 'Status (código)' },
    ],
    modelo: 'cliente,projeto,nome,objetivo,categoria,data_abertura\nCliente Exemplo,Verão 2027,Frente Festival,Identificar parceiros para experiência de marca,Entretenimento,2026-08-01',
  },
  candidaturas: {
    rotulo: 'Candidaturas no funil',
    descricao: 'Coloca marcas e parceiros em uma frente já existente.',
    campos: [
      { id: 'cliente', rotulo: 'Cliente', obrigatorio: true }, { id: 'projeto', rotulo: 'Projeto', obrigatorio: true },
      { id: 'frente', rotulo: 'Frente', obrigatorio: true }, { id: 'parte', rotulo: 'Marca / Parte', obrigatorio: true },
      { id: 'interesse_cliente', rotulo: 'Interesse do cliente (código)' }, { id: 'interesse_parceiro', rotulo: 'Interesse do parceiro (código)' },
      { id: 'prioridade', rotulo: 'Prioridade (alta, media ou baixa)' }, { id: 'disponibilidade_confirmada', rotulo: 'Disponibilidade confirmada (sim/não)' },
      { id: 'observacoes', rotulo: 'Observações' }, { id: 'status', rotulo: 'Status (código)' },
    ],
    modelo: 'cliente,projeto,frente,parte,interesse_cliente,prioridade,disponibilidade_confirmada\nCliente Exemplo,Verão 2027,Frente Festival,Marca Parceira,alto,alta,sim',
  },
  ativos: {
    rotulo: 'Ativos estratégicos',
    descricao: 'Registra propriedades, canais proprietários e ativos de cada marca ou talento.',
    campos: [
      { id: 'parte', rotulo: 'Marca / Parte', obrigatorio: true }, { id: 'nome', rotulo: 'Nome do ativo', obrigatorio: true },
      { id: 'categoria', rotulo: 'Categoria' }, { id: 'descricao', rotulo: 'Descrição' }, { id: 'valor_referencia', rotulo: 'Valor de referência' }, { id: 'moeda', rotulo: 'Moeda (BRL, USD…)' },
    ],
    modelo: 'parte,nome,categoria,descricao,valor_referencia,moeda\nMarca Parceira,Festival Aurora,Propriedade cultural,Festival proprietário anual,250000,BRL',
  },
  canais: {
    rotulo: 'Canais de mídia',
    descricao: 'Adiciona os canais e perfis que pertencem a cada Parte.',
    campos: [
      { id: 'parte', rotulo: 'Marca / Parte', obrigatorio: true }, { id: 'plataforma', rotulo: 'Plataforma', obrigatorio: true },
      { id: 'identificador', rotulo: 'Identificador / @' }, { id: 'url', rotulo: 'URL' },
    ],
    modelo: 'parte,plataforma,identificador,url\nMarca Parceira,Instagram,@marcaparceira,https://instagram.com/marcaparceira',
  },
  perfis_estrategicos: {
    rotulo: 'Perfis estratégicos',
    descricao: 'Registra posicionamento, objetivos e desafios para enriquecer cada Parte.',
    campos: [
      { id: 'parte', rotulo: 'Marca / Parte', obrigatorio: true }, { id: 'resumo', rotulo: 'Resumo' },
      { id: 'posicionamento', rotulo: 'Posicionamento' }, { id: 'objetivos', rotulo: 'Objetivos' }, { id: 'desafios', rotulo: 'Desafios' },
    ],
    modelo: 'parte,resumo,posicionamento,objetivos,desafios\nMarca Parceira,Marca nacional de lifestyle,Experiências urbanas para jovens adultos,Expandir presença no Nordeste,Consolidar novas comunidades',
  },
};

function baixar(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportarDados() {
  const { toast } = useToast();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [entidade, setEntidade] = useState<DestinoImportacao>('funil_historico');
  const [texto, setTexto] = useState('');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState<string[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<importacaoApi.ResultadoImportacaoCsv | null>(null);
  const [previaFunil, setPreviaFunil] = useState<importacaoApi.PreviaFunilHistorico | null>(null);
  const [resultadoFunil, setResultadoFunil] = useState<importacaoApi.ResultadoFunilHistorico | null>(null);

  const csv = useMemo(() => parseCsv(texto), [texto]);
  const ehFunilHistorico = entidade === 'funil_historico';
  const config = ehFunilHistorico ? null : CONFIG[entidade];
  const campos = config?.campos ?? [];
  const obrigatorios = campos.filter((c) => c.obrigatorio).map((c) => c.id);
  const camposMapeados = Object.entries(mapeamento).filter(([, coluna]) => Boolean(coluna));
  const faltando = obrigatorios.filter((campo) => !mapeamento[campo]);
  const linhasValidas = useMemo(() => csv.linhas.filter((linha) =>
    obrigatorios.every((campo) => (linha[mapeamento[campo] ?? ''] ?? '').trim()),
  ), [csv.linhas, mapeamento, obrigatorios]);

  function limparParaNovaPlanilha() {
    setMapeamento({});
    setObservacoes([]);
    setResultado(null);
    setPreviaFunil(null);
    setResultadoFunil(null);
  }

  function lerArquivo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0);
      let conteudo = new TextDecoder('utf-8').decode(bytes);
      // Arquivos exportados por Excel em Windows podem estar em Windows-1252.
      // Se UTF-8 gerar o caractere de substituição, tentamos a codificação local.
      if (conteudo.includes('\uFFFD')) conteudo = new TextDecoder('windows-1252').decode(bytes);
      setTexto(conteudo);
      limparParaNovaPlanilha();
    };
    reader.readAsArrayBuffer(file);
  }

  function alterarMapeamento(campo: string, coluna: string) {
    setMapeamento((atual) => {
      const proximo = { ...atual, [campo]: coluna };
      // Uma coluna não pode alimentar dois campos. Isso evita uma prévia
      // enganosa e espelha a proteção aplicada novamente no backend.
      if (coluna) {
        Object.keys(proximo).forEach((outroCampo) => {
          if (outroCampo !== campo && proximo[outroCampo] === coluna) proximo[outroCampo] = '';
        });
      }
      return proximo;
    });
  }

  async function sugerirMapeamento() {
    if (ehFunilHistorico) {
      if (!texto.trim() || analisando) return;
      setAnalisando(true);
      try {
        const resposta = await importacaoApi.analisarFunilHistorico({ conteudo: texto });
        setPreviaFunil(resposta);
        toast(`Funil reconhecido: ${resposta.candidaturas} oportunidade(s) prontas para revisão.`);
      } catch (erro) {
        toast(erro instanceof ErroApi ? erro.message : 'Não foi possível interpretar a planilha de parcerias.');
      } finally {
        setAnalisando(false);
      }
      return;
    }
    if (!csv.cabecalho.length || !csv.linhas.length || analisando) return;
    setAnalisando(true);
    try {
      const resposta = await importacaoApi.analisarCsv({ entidade, cabecalhos: csv.cabecalho, amostra: csv.linhas.slice(0, 20) });
      setMapeamento(Object.fromEntries(resposta.mapeamento.campos.map((campo) => [campo.campo_destino, campo.coluna_origem])));
      setObservacoes(resposta.mapeamento.observacoes);
      toast(`Mapeamento sugerido pelo ${resposta.origem === 'ollama' ? 'Ollama' : 'reconhecimento local'}. Revise antes de importar.`);
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível analisar a planilha.');
    } finally {
      setAnalisando(false);
    }
  }

  async function confirmar() {
    if (ehFunilHistorico) {
      if (!previaFunil || importando) return;
      setImportando(true);
      try {
        const resposta = await importacaoApi.confirmarFunilHistorico({ conteudo: texto });
        setResultadoFunil(resposta);
        toast(`${resposta.candidaturas.criados} candidatura(s) criada(s) no funil.`);
      } catch (erro) {
        toast(erro instanceof ErroApi ? erro.message : 'Não foi possível concluir a importação do funil.');
      } finally {
        setImportando(false);
      }
      return;
    }
    if (!csv.linhas.length || faltando.length || importando) return;
    setImportando(true);
    try {
      const resposta = await importacaoApi.confirmarImportacaoCsv({
        entidade,
        cabecalhos: csv.cabecalho,
        linhas: csv.linhas,
        mapeamento: {
          campos: camposMapeados.map(([campo_destino, coluna_origem]) => ({ campo_destino, coluna_origem, confianca: 'media' })),
          observacoes,
        },
      });
      setResultado(resposta);
      toast(`${resposta.criadas.length} registro(s) criado(s) na plataforma.`);
    } catch (erro) {
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível concluir a importação.');
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Carga inteligente"
        titulo="Importar dados com IA"
        descricao="Envie um CSV, revise a leitura e confirme a prévia. Nada é gravado até sua revisão."
        acoes={!ehFunilHistorico && config ? <Botao pequeno variante="ghost" onClick={() => baixar(`modelo-${entidade}.csv`, config.modelo)}><Download size={14} strokeWidth={1.5} /> Baixar modelo</Botao> : undefined}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <section className="card p-5">
          <RotuloMono className="mb-3">Destino da importação</RotuloMono>
          <CampoSelecao value={entidade} onChange={(e) => { setEntidade(e.target.value as DestinoImportacao); limparParaNovaPlanilha(); }}>
            <option value="funil_historico">Funil histórico de parcerias</option>
            {Object.entries(CONFIG).map(([id, item]) => <option key={id} value={id}>{item.rotulo}</option>)}
          </CampoSelecao>
          <p className="mt-3 text-sm leading-relaxed text-stone">{ehFunilHistorico ? 'Lê a estrutura completa de acompanhamento e cria cliente, projetos, frentes, marcas e candidaturas.' : config?.descricao}</p>
          <div className="mt-4 rounded-lg border border-accent/20 bg-accent-soft/40 p-3 text-xs leading-relaxed text-graphite">
            {ehFunilHistorico ? 'Reconhece títulos como Aramis, Urban e Aramis Next, além de seções, territórios, setores, status e observações.' : 'A IA propõe o mapeamento; títulos, cabeçalhos repetidos e blocos de acompanhamento são reconhecidos antes da revisão.'}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input ref={inputArquivo} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
              const arquivo = e.target.files?.[0]; if (arquivo) lerArquivo(arquivo); e.target.value = '';
            }} />
            <Botao pequeno onClick={() => inputArquivo.current?.click()}><FileUp size={14} strokeWidth={1.5} /> Escolher CSV</Botao>
            <span className="text-xs text-stone">ou cole o conteúdo abaixo</span>
            {!ehFunilHistorico && config && <button type="button" className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-accent hover:text-accent-deep" onClick={() => { setTexto(config.modelo); limparParaNovaPlanilha(); }}>usar modelo</button>}
          </div>
          <textarea value={texto} onChange={(e) => { setTexto(e.target.value); limparParaNovaPlanilha(); }} rows={7} spellCheck={false}
            placeholder={ehFunilHistorico ? 'Cole a planilha completa de acompanhamento aqui. Vírgula e ponto-e-vírgula são aceitos.' : 'Cole o CSV aqui. Vírgula e ponto-e-vírgula são aceitos.'}
            className="w-full rounded-md border border-mist bg-off px-3 py-2 font-mono text-xs text-ink placeholder:text-mist focus:border-accent" />
          {!ehFunilHistorico && csv.cabecalho.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{csv.cabecalho.map((cabecalho) => <Chip key={cabecalho}>{cabecalho}</Chip>)}</div>}
          {!ehFunilHistorico && csv.avisos.length > 0 && <p className="mt-3 text-xs leading-relaxed text-status-warn">{csv.avisos.join(' ')}</p>}
          {ehFunilHistorico && texto.trim() && <div className="mt-3 text-xs text-stone">Envie a planilha completa, incluindo os títulos e cabeçalhos repetidos.</div>}
        </section>
      </div>

      {ehFunilHistorico && texto.trim() && !previaFunil && (
        <section className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div><RotuloMono>Leitura estrutural</RotuloMono><p className="mt-1 text-sm text-stone">Analise a hierarquia antes de gravar qualquer dado.</p></div>
          <Botao pequeno onClick={sugerirMapeamento} disabled={analisando}><Sparkles size={14} strokeWidth={1.5} /> {analisando ? 'Lendo a planilha…' : 'Preparar importação completa'}</Botao>
        </section>
      )}

      {ehFunilHistorico && previaFunil && (
        <section className="card mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-6 py-4">
            <div><RotuloMono>Prévia do funil completo</RotuloMono><p className="mt-1 text-sm text-stone">Cliente identificado: <span className="font-semibold text-ink">{previaFunil.cliente}</span>. Revise a amostra antes de confirmar.</p></div>
            <div className="flex flex-wrap gap-2"><Chip tom="pos">{previaFunil.projetos} projetos</Chip><Chip>{previaFunil.frentes} frentes</Chip><Chip>{previaFunil.marcas} marcas</Chip><Chip tom="warn">{previaFunil.candidaturas} candidaturas</Chip></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-cloud"><th className="label-mono px-5 py-3 font-normal">Projeto</th><th className="label-mono px-5 py-3 font-normal">Frente</th><th className="label-mono px-5 py-3 font-normal">Marca / talento</th><th className="label-mono px-5 py-3 font-normal">Status original</th><th className="label-mono px-5 py-3 font-normal">Status no funil</th></tr></thead>
              <tbody className="divide-y divide-cloud">{previaFunil.amostra.map((linha) => <tr key={`${linha.linha}-${linha.marca}`}><td className="px-5 py-3 text-graphite">{linha.projeto}</td><td className="max-w-64 truncate px-5 py-3 text-graphite">{linha.frente}</td><td className="px-5 py-3 font-semibold text-ink">{linha.marca}</td><td className="px-5 py-3 text-graphite">{linha.status_origem || '—'}</td><td className="px-5 py-3"><Chip>{linha.status_plataforma}</Chip></td></tr>)}</tbody>
            </table>
          </div>
          {previaFunil.avisos.length > 0 && <div className="border-t border-cloud bg-status-warnsoft/30 px-6 py-3 text-xs leading-relaxed text-status-warn">{previaFunil.avisos.join(' ')}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cloud px-6 py-4"><span className="text-xs text-stone">Serão mantidos nas candidaturas: status original, observações, objetivo, modelo de parceria e histórico.</span><Botao onClick={confirmar} disabled={importando}><Upload size={14} strokeWidth={1.5} /> {importando ? 'Importando funil…' : `Criar ${previaFunil.candidaturas} candidaturas`}</Botao></div>
        </section>
      )}

      {/* Testa `config` (e não `!ehFunilHistorico`) para o TypeScript estreitar o
          tipo: as duas condições são equivalentes, mas só esta ele consegue seguir. */}
      {config && csv.linhas.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-6 py-4">
            <div><RotuloMono>Assistente de mapeamento</RotuloMono><p className="mt-1 text-xs text-stone">{csv.linhas.length} linhas encontradas · analisa uma amostra de até 20 linhas.</p></div>
            <Botao pequeno onClick={sugerirMapeamento} disabled={analisando}><Sparkles size={14} strokeWidth={1.5} /> {analisando ? 'Analisando no Ollama…' : 'Sugerir com IA'}</Botao>
          </div>
          <div className="grid divide-y divide-cloud md:grid-cols-2 md:divide-x md:divide-y-0">
            {campos.map((campo) => (
              <div key={campo.id} className="flex items-center gap-3 px-6 py-3.5">
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{campo.rotulo}{campo.obrigatorio && <span className="ml-1 text-status-neg">*</span>}</span>
                <select value={mapeamento[campo.id] ?? ''} onChange={(e) => alterarMapeamento(campo.id, e.target.value)}
                  className="w-48 rounded-md border border-mist bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-accent">
                  <option value="">Não importar</option>
                  {csv.cabecalho.map((cabecalho) => <option key={cabecalho} value={cabecalho}>{cabecalho}</option>)}
                </select>
              </div>
            ))}
          </div>
          {observacoes.length > 0 && <div className="border-t border-cloud bg-off px-6 py-3 text-xs text-stone">{observacoes.join(' · ')}</div>}
        </section>
      )}

      {config && csv.linhas.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-6 py-4">
            <div><RotuloMono>Prévia e confirmação</RotuloMono><p className="mt-1 text-xs text-stone">Linhas sem os campos obrigatórios retornam como erro, sem interromper os demais registros.</p></div>
            <div className="flex gap-2"><Chip tom="pos">{linhasValidas.length} prontas</Chip>{csv.linhas.length !== linhasValidas.length && <Chip tom="warn">{csv.linhas.length - linhasValidas.length} incompletas</Chip>}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-cloud"><th className="label-mono px-5 py-3 font-normal">Linha</th>{campos.filter((c) => mapeamento[c.id]).slice(0, 5).map((c) => <th key={c.id} className="label-mono px-5 py-3 font-normal">{c.rotulo}</th>)}<th className="label-mono px-5 py-3 font-normal">Situação</th></tr></thead>
              <tbody className="divide-y divide-cloud">{csv.linhas.slice(0, 8).map((linha, indice) => { const ok = obrigatorios.every((campo) => (linha[mapeamento[campo] ?? ''] ?? '').trim()); return <tr key={indice} className={ok ? '' : 'bg-status-warnsoft/25'}><td className="px-5 py-3 font-mono text-xs text-stone">{indice + 2}</td>{campos.filter((c) => mapeamento[c.id]).slice(0, 5).map((c) => <td key={c.id} className="max-w-48 truncate px-5 py-3 text-graphite">{linha[mapeamento[c.id]] || '—'}</td>)}<td className="px-5 py-3">{ok ? <span className="flex items-center gap-1.5 text-xs text-status-pos"><CheckCircle2 size={13} /> pronta</span> : <span className="flex items-center gap-1.5 text-xs text-status-warn"><AlertTriangle size={13} /> obrigatórios ausentes</span>}</td></tr>; })}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cloud px-6 py-4">
            <span className="text-xs text-stone">{faltando.length ? `Mapeie: ${faltando.join(', ')}.` : 'Revise a prévia e confirme para gravar os dados reais.'}</span>
            <Botao onClick={confirmar} disabled={Boolean(faltando.length) || importando}><Upload size={14} strokeWidth={1.5} /> {importando ? 'Importando…' : `Importar ${csv.linhas.length} linhas`}</Botao>
          </div>
        </section>
      )}

      {resultado && <section className="card mt-6 border-l-2 border-l-status-pos p-5"><div className="flex gap-3"><FileSpreadsheet size={19} strokeWidth={1.5} className="shrink-0 text-status-pos" /><div><p className="text-sm font-semibold text-ink">{resultado.criadas.length} registro(s) criado(s) em {CONFIG[resultado.entidade].rotulo}.</p><p className="mt-1 text-xs text-stone">{resultado.erros.length ? `${resultado.erros.length} linha(s) precisam de correção.` : 'Todas as linhas foram processadas com sucesso.'}</p>{resultado.erros.length > 0 && <ul className="mt-3 space-y-1 text-xs text-status-neg">{resultado.erros.slice(0, 8).map((erro) => <li key={erro.linha}>Linha {erro.linha}: {erro.mensagem}</li>)}</ul>}</div></div></section>}
      {resultadoFunil && <section className="card mt-6 border-l-2 border-l-status-pos p-5"><div className="flex gap-3"><FileSpreadsheet size={19} strokeWidth={1.5} className="shrink-0 text-status-pos" /><div><p className="text-sm font-semibold text-ink">Funil de {resultadoFunil.cliente.nome} importado.</p><p className="mt-1 text-xs text-stone">{resultadoFunil.projetos.criados} projeto(s), {resultadoFunil.frentes.criados} frente(s), {resultadoFunil.partes.criados} marca(s) e {resultadoFunil.candidaturas.criados} candidatura(s) foram criados.</p><p className="mt-1 text-xs text-stone">{resultadoFunil.projetos.existentes + resultadoFunil.frentes.existentes + resultadoFunil.partes.existentes + resultadoFunil.candidaturas.existentes} registro(s) já existiam e não foram duplicados.</p>{resultadoFunil.erros.length > 0 && <ul className="mt-3 space-y-1 text-xs text-status-neg">{resultadoFunil.erros.slice(0, 8).map((erro) => <li key={erro.linha}>Linha {erro.linha}: {erro.mensagem}</li>)}</ul>}</div></div></section>}
    </div>
  );
}
