import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { parseCsv } from '../lib/csv';
import { Botao, CabecalhoPagina, Chip, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import { PAPEL_PARTE } from './Partes';
import type { PapelParte, Parte } from '../types';

// Importação de dados por CSV — fatia da demo focada em Partes (Relacionamentos),
// a entidade mais central. Colunas aceitas (cabeçalho, em qualquer ordem):
//   nome, tipo, categoria, territorio, publico, papel, descricao
// Só `nome` e `categoria` são obrigatórios; o resto tem valor padrão.

const COLUNAS = ['nome', 'tipo', 'categoria', 'territorio', 'publico', 'papel', 'descricao'];

const EXEMPLO = `nome,tipo,categoria,territorio,publico,papel,descricao
Rede Vale Verde,organizacao,Varejo & Consumo,Casa & Decoração,25-45 · classes AB,parceiro_potencial,Rede regional de casa e construção em expansão.
Estúdio Maré,organizacao,Produtora audiovisual,Cultura & Entretenimento,creators e marcas,parceiro,Produtora de conteúdo com foco em cultura litorânea.
Bruno Sales,pessoa,Atleta · Surfe,Esporte & Verão,16-30 · litoral,atleta,Atleta de surfe com audiência jovem no litoral.`;

type Tipo = Parte['tipo'];

interface LinhaValidada {
  linha: number;
  dados: Partial<Record<string, string>>;
  erros: string[];
  parte?: Parte;
}

function validarTipo(v: string): Tipo | null {
  const t = v.trim().toLowerCase();
  if (t === 'organizacao' || t === 'organização' || t === '') return 'organizacao';
  if (t === 'pessoa') return 'pessoa';
  return null;
}

function validarPapel(v: string): PapelParte | null {
  const p = v.trim().toLowerCase() as PapelParte;
  if (!p) return 'parceiro_potencial';
  return p in PAPEL_PARTE ? p : null;
}

export function ImportarDados() {
  const adicionarParte = useStore((s) => s.adicionarParte);
  const { toast } = useToast();
  const [texto, setTexto] = useState('');
  const [importado, setImportado] = useState<number | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const validado = useMemo<LinhaValidada[]>(() => {
    if (!texto.trim()) return [];
    const { cabecalho, linhas } = parseCsv(texto);
    if (!cabecalho.includes('nome')) return [];

    return linhas.map((dados, i) => {
      const erros: string[] = [];
      const nome = (dados.nome ?? '').trim();
      const categoria = (dados.categoria ?? '').trim();
      if (!nome) erros.push('nome vazio');
      if (!categoria) erros.push('categoria vazia');

      const tipo = validarTipo(dados.tipo ?? '');
      if (tipo === null) erros.push(`tipo inválido ("${dados.tipo}")`);

      const papel = validarPapel(dados.papel ?? '');
      if (papel === null) erros.push(`papel inválido ("${dados.papel}")`);

      const parte: Parte | undefined =
        erros.length === 0 && tipo && papel
          ? {
              id: `parte-imp-${Date.now()}-${i}`,
              tipo,
              nome,
              categoria,
              territorio: (dados.territorio ?? '').trim() || 'A mapear',
              publico: (dados.publico ?? '').trim() || 'A mapear',
              descricao: (dados.descricao ?? '').trim() || 'Parte importada — perfil estratégico a completar.',
              papeis: [papel],
              pracas: ['Nacional'],
              ativos: [],
              canais: [],
              contatos: [],
              cadastradaEm: new Date().toISOString().slice(0, 10),
            }
          : undefined;

      return { linha: i + 2, dados, erros, parte };
    });
  }, [texto]);

  const validas = validado.filter((l) => l.erros.length === 0);
  const invalidas = validado.filter((l) => l.erros.length > 0);

  function lerArquivo(file: File) {
    const reader = new FileReader();
    reader.onload = () => setTexto(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  }

  function confirmar() {
    // Insere na ordem do arquivo (as mais recentes vão para o topo da base)
    for (const l of [...validas].reverse()) {
      if (l.parte) adicionarParte(l.parte);
    }
    setImportado(validas.length);
    toast(`${validas.length} parte(s) importada(s) para a base de relacionamentos.`);
    setTexto('');
  }

  function baixarModelo() {
    const blob = new Blob([EXEMPLO], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-partes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Carga de dados"
        titulo="Importar dados"
        descricao="Suba uma planilha (CSV) para cadastrar várias Partes de uma vez na Base de relacionamentos. Confira a prévia — só as linhas válidas são importadas ao confirmar. Edição de dados existentes continua nas telas de cada entidade."
        acoes={
          <Botao pequeno variante="ghost" onClick={baixarModelo}>
            <Download size={14} strokeWidth={1.5} /> Baixar modelo CSV
          </Botao>
        }
      />

      {/* Entrada: arquivo ou colar */}
      <div className="card mb-6 p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            ref={inputArquivo}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) lerArquivo(f);
              e.target.value = '';
            }}
          />
          <Botao pequeno onClick={() => inputArquivo.current?.click()}>
            <FileUp size={14} strokeWidth={1.5} /> Escolher arquivo CSV
          </Botao>
          <span className="text-xs text-stone">ou cole o conteúdo abaixo</span>
          <button
            type="button"
            onClick={() => setTexto(EXEMPLO)}
            className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-accent hover:text-accent-deep"
          >
            usar exemplo
          </button>
        </div>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setImportado(null);
          }}
          rows={7}
          spellCheck={false}
          placeholder={`Cole aqui o CSV. Colunas: ${COLUNAS.join(', ')}`}
          className="w-full rounded-md border border-mist bg-off px-3 py-2 font-mono text-xs text-ink placeholder:text-mist focus:border-accent"
        />
        <p className="mt-2 text-xs text-stone">
          Obrigatórios: <strong className="text-graphite">nome</strong> e{' '}
          <strong className="text-graphite">categoria</strong>. <strong className="text-graphite">tipo</strong>:
          organizacao ou pessoa. <strong className="text-graphite">papel</strong>:{' '}
          {Object.keys(PAPEL_PARTE).join(', ')}.
        </p>
      </div>

      {/* Confirmação de importação bem-sucedida */}
      {importado !== null && (
        <div className="card mb-6 flex items-center gap-3 border-l-2 border-l-status-pos px-6 py-4">
          <CheckCircle2 size={18} strokeWidth={1.5} className="shrink-0 text-status-pos" />
          <p className="text-sm text-graphite">
            <strong className="font-semibold text-ink">{importado} parte(s) importada(s)</strong> com sucesso.
            Elas já aparecem na Base de relacionamentos.
          </p>
        </div>
      )}

      {/* Prévia */}
      {validado.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-6 py-4">
            <RotuloMono>Prévia da importação</RotuloMono>
            <div className="flex items-center gap-2">
              <Chip tom="pos">{validas.length} válidas</Chip>
              {invalidas.length > 0 && <Chip tom="neg">{invalidas.length} com erro</Chip>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cloud">
                  <th className="label-mono px-5 py-3 font-normal">Linha</th>
                  <th className="label-mono px-5 py-3 font-normal">Nome</th>
                  <th className="label-mono px-5 py-3 font-normal">Tipo</th>
                  <th className="label-mono px-5 py-3 font-normal">Categoria</th>
                  <th className="label-mono px-5 py-3 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {validado.map((l) => {
                  const ok = l.erros.length === 0;
                  return (
                    <tr key={l.linha} className={ok ? '' : 'bg-status-negsoft/30'}>
                      <td className="px-5 py-3 font-mono text-xs text-stone">{l.linha}</td>
                      <td className="px-5 py-3 font-semibold text-ink">{l.dados.nome || <span className="text-mist">—</span>}</td>
                      <td className="px-5 py-3 text-stone">{l.dados.tipo || 'organizacao'}</td>
                      <td className="px-5 py-3 text-stone">{l.dados.categoria || <span className="text-mist">—</span>}</td>
                      <td className="px-5 py-3">
                        {ok ? (
                          <span className="flex items-center gap-1.5 text-xs text-status-pos">
                            <CheckCircle2 size={13} strokeWidth={1.5} /> pronta para importar
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-status-neg">
                            <AlertTriangle size={13} strokeWidth={1.5} /> {l.erros.join(' · ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cloud px-6 py-4">
            <span className="text-xs text-stone">
              {invalidas.length > 0
                ? `${invalidas.length} linha(s) com erro serão ignoradas.`
                : 'Todas as linhas estão válidas.'}
            </span>
            <Botao onClick={confirmar} disabled={validas.length === 0}>
              <Upload size={14} strokeWidth={1.5} /> Importar {validas.length} parte(s)
            </Botao>
          </div>
        </div>
      )}

      {texto.trim() && validado.length === 0 && (
        <div className="card border-l-2 border-l-status-warn px-6 py-4">
          <p className="text-sm text-graphite">
            Não foi possível ler o CSV. Confira se a primeira linha é o cabeçalho e contém a coluna{' '}
            <strong className="font-semibold text-ink">nome</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
