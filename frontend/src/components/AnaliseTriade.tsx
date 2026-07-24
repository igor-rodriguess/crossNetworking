import { useState } from 'react';
import { Package, Plus, Target, Trash2, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Chip, RotuloMono } from './ui';
import { RadarTriade } from './RadarTriade';
import type { AnaliseTriade as TAnaliseTriade, DimensaoCross, ItemCross, VereditoItem } from '../types';

// Análise Crossability fiel à metodologia: 3 dimensões, item a item.
//   Objetivos     — onde a marca quer chegar (casam ou se complementam?)
//   Ativos        — o que cada uma oferece (um a um: complementam?)
//   Consumidores  — o público que tem/quer (alinhado ou complementar?)

const DIMENSOES: {
  chave: DimensaoCross;
  rotulo: string;
  descricao: string;
  icone: typeof Target;
}[] = [
  { chave: 'objetivos', rotulo: 'Objetivos', descricao: 'Onde cada marca quer chegar. Casa se querem o mesmo; complementa se o objetivo de um impulsiona o do outro.', icone: Target },
  { chave: 'ativos', rotulo: 'Ativos', descricao: 'O que cada marca pode oferecer. Item a item: o ativo de um soma ou preenche o que falta no outro?', icone: Package },
  { chave: 'consumidores', rotulo: 'Consumidores', descricao: 'O público que cada uma tem ou quer. Casa se miram o mesmo público; complementa se um tem quem o outro busca.', icone: Users },
];

const VEREDITOS: { valor: VereditoItem; rotulo: string; tom: 'pos' | 'info' | 'neg' }[] = [
  { valor: 'casa', rotulo: 'Casa', tom: 'pos' },
  { valor: 'complementa', rotulo: 'Complementa', tom: 'info' },
  { valor: 'nao_casa', rotulo: 'Não casa', tom: 'neg' },
];

// O que cada veredito significa EM CADA dimensão — "casa" em Objetivos é
// diferente de "casa" em Consumidores. Aparece como tooltip nos botões.
const EXPLICACAO: Record<DimensaoCross, Record<VereditoItem, string>> = {
  objetivos: {
    casa: 'Os dois querem a mesma coisa — objetivos iguais ou muito próximos.',
    complementa: 'O objetivo de um impulsiona o do outro. Ex.: a Aurora quer ser "a bebida do verão" e o Festival quer ser "o festival do verão" — um serve ao outro.',
    nao_casa: 'Os objetivos não se ajudam nem se cruzam.',
  },
  ativos: {
    casa: 'Ativos equivalentes ou do mesmo tipo dos dois lados.',
    complementa: 'O ativo de um soma ao outro e preenche o que falta. Ex.: o Festival tem o palco e o público presencial que a Aurora não tem.',
    nao_casa: 'O ativo não interessa nem agrega à outra marca.',
  },
  consumidores: {
    casa: 'Os dois já têm ou miram o mesmo público.',
    complementa: 'Um tem o público que o outro quer alcançar. Ex.: o Festival entrega o jovem que a Aurora ainda não atinge.',
    nao_casa: 'Públicos sem conexão entre si.',
  },
};

const COR_VEREDITO: Record<VereditoItem, string> = {
  casa: 'bg-status-pos',
  complementa: 'bg-accent',
  nao_casa: 'bg-status-neg',
};

function ListaItens({
  candidaturaId,
  dimensao,
  origem,
  titulo,
  itens,
}: {
  candidaturaId: string;
  dimensao: DimensaoCross;
  origem: 'cliente' | 'parceiro';
  titulo: string;
  itens: ItemCross[];
}) {
  const adicionarItem = useStore((s) => s.adicionarItemTriade);
  const removerItem = useStore((s) => s.removerItemTriade);
  const setVeredito = useStore((s) => s.setVereditoItem);
  const [novo, setNovo] = useState('');

  const doLado = itens.filter((it) => it.origem === origem);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    adicionarItem(candidaturaId, dimensao, { descricao: novo.trim(), origem });
    setNovo('');
  }

  return (
    <div className="rounded-lg border border-cloud bg-off/50 p-3">
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-stone">{titulo}</div>
      <ul className="space-y-1.5">
        {doLado.map((it) => (
          <li key={it.id} className="group rounded-md bg-paper p-2 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm leading-snug text-ink">{it.descricao}</span>
              <button
                type="button"
                onClick={() => removerItem(candidaturaId, dimensao, it.id)}
                className="shrink-0 rounded-full p-1 text-mist opacity-0 transition-all hover:bg-status-negsoft hover:text-status-neg group-hover:opacity-100"
                title="Remover item"
                aria-label={`Remover ${it.descricao}`}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
            {/* Veredito por item */}
            <div className="mt-1.5 flex overflow-hidden rounded-full border border-mist" role="radiogroup" aria-label={`Veredito de ${it.descricao}`}>
              {VEREDITOS.map((v) => (
                <button
                  key={v.valor}
                  type="button"
                  role="radio"
                  aria-checked={it.veredito === v.valor}
                  title={`${v.rotulo} — ${EXPLICACAO[dimensao][v.valor]}`}
                  onClick={() => setVeredito(candidaturaId, dimensao, it.id, v.valor)}
                  className={`flex-1 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] transition-colors ${
                    it.veredito === v.valor
                      ? v.tom === 'pos'
                        ? 'bg-status-pos text-paper'
                        : v.tom === 'info'
                          ? 'bg-accent text-paper'
                          : 'bg-status-neg text-paper'
                      : 'bg-paper text-stone hover:bg-off hover:text-ink'
                  }`}
                >
                  {v.rotulo}
                </button>
              ))}
            </div>
          </li>
        ))}
        {doLado.length === 0 && <li className="px-1 py-1 text-xs text-mist">Nenhum item — adicione abaixo.</li>}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-1.5">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Detalhar item…"
          className="min-w-0 flex-1 rounded-md border border-mist bg-paper px-2 py-1 text-xs text-ink placeholder:text-mist focus:border-accent"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1 rounded-md bg-ink px-2 py-1 font-mono text-[10px] font-bold uppercase text-paper transition-colors hover:bg-graphite"
        >
          <Plus size={11} strokeWidth={1.5} /> Add
        </button>
      </form>
    </div>
  );
}

export function AnaliseTriade({
  candidaturaId,
  nomeCliente,
  nomeParceiro,
  analise,
}: {
  candidaturaId: string;
  nomeCliente: string;
  nomeParceiro: string;
  analise: TAnaliseTriade | undefined;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-cloud px-6 py-4">
        <RotuloMono>Análise Crossability — Objetivos · Ativos · Consumidores</RotuloMono>
        <p className="mt-1 text-xs text-stone">
          A leitura fiel da metodologia: detalhe item a item o que cada marca traz e marque se{' '}
          <strong className="font-semibold text-status-pos">casa</strong>,{' '}
          <strong className="font-semibold text-accent-deep">complementa</strong> ou{' '}
          <strong className="font-semibold text-status-neg">não casa</strong>.
        </p>
      </div>

      {/* Leitura visual da análise: onde o parceiro preenche a lacuna do cliente */}
      {analise && (
        <div className="border-b border-cloud bg-off/40 px-6 py-4">
          <RadarTriade analise={analise} />
          <p className="mt-1 text-center text-xs text-stone">
            O gráfico reflete os vereditos abaixo — os vértices dourados destacam onde o parceiro
            preenche uma lacuna do cliente.
          </p>
        </div>
      )}

      <div className="divide-y divide-cloud">
        {DIMENSOES.map((dim) => {
          const itens = analise?.[dim.chave] ?? [];
          const avaliados = itens.filter((it) => it.veredito);
          const positivos = itens.filter((it) => it.veredito === 'casa' || it.veredito === 'complementa').length;

          return (
            <div key={dim.chave} className="px-6 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <dim.icone size={15} strokeWidth={1.5} className="text-accent" />
                  <h3 className="text-sm font-bold text-ink">{dim.rotulo}</h3>
                  {/* Barrinha-resumo dos vereditos */}
                  {avaliados.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {avaliados.map((it) => (
                        <span key={it.id} className={`h-1.5 w-4 rounded-full ${COR_VEREDITO[it.veredito!]}`} />
                      ))}
                    </span>
                  )}
                </div>
                <Chip tom={positivos > 0 ? 'pos' : 'neutro'}>
                  {positivos} de {itens.length} favoráveis
                </Chip>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-stone">{dim.descricao}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <ListaItens candidaturaId={candidaturaId} dimensao={dim.chave} origem="cliente" titulo={nomeCliente} itens={itens} />
                <ListaItens candidaturaId={candidaturaId} dimensao={dim.chave} origem="parceiro" titulo={nomeParceiro} itens={itens} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
