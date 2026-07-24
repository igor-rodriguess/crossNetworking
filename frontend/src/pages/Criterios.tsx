import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useDadosCliente } from '../lib/useDadosCliente';
import { Botao, CabecalhoPagina, CampoTexto, Chip, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Criterio } from '../types';

// Pesos vão de -10 a 10 (negativos penalizam o score).
function limitarPeso(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(10, Math.max(-10, Math.round(v)));
}

export function Criterios() {
  const { cliente, todosCriterios, criterios } = useDadosCliente();
  const atualizarCriterio = useStore((s) => s.atualizarCriterio);
  const adicionarCriterio = useStore((s) => s.adicionarCriterio);
  const removerCriterio = useStore((s) => s.removerCriterio);
  const moverCriterio = useStore((s) => s.moverCriterio);
  const { toast } = useToast();

  const [novoNome, setNovoNome] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novoPeso, setNovoPeso] = useState(8);
  const [formAberto, setFormAberto] = useState(false);
  const [aRemover, setARemover] = useState<Criterio | null>(null);

  // Máximo do modelo: melhor caso de cada critério, ignorando os que só penalizam.
  const somaPesos = criterios.reduce((soma, c) => soma + Math.max(0, c.pesoSim, c.pesoNao), 0);

  function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim() || novoPeso === 0) return;
    adicionarCriterio(cliente.id, novoNome.trim(), novaDescricao.trim(), limitarPeso(novoPeso));
    toast(`Critério “${novoNome.trim()}” adicionado ao modelo de ${cliente.nome}.`);
    setNovoNome('');
    setNovaDescricao('');
    setNovoPeso(8);
    setFormAberto(false);
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo={`Cross Score Card · modelo exclusivo de ${cliente.nome}`}
        titulo="Critérios & pesos"
        descricao={`Cada cliente que chega à Cross tem seu próprio conjunto de critérios e pesos, configurado aqui conforme o produto (collab, patrocínio, naming…). Estes critérios valem só para ${cliente.nome} — troque o cliente no topo para configurar outro modelo. Alterar um peso recalcula na hora o score de todas as marcas avaliadas.`}
        acoes={
          <Botao onClick={() => setFormAberto((v) => !v)} pequeno>
            <Plus size={14} strokeWidth={1.5} /> Novo critério
          </Botao>
        }
      />

      {/* Resumo do modelo */}
      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-cloud bg-paper px-6 py-4 shadow-card">
        <div>
          <RotuloMono>Versão do modelo</RotuloMono>
          <div className="mt-1 font-display text-xl font-bold text-ink">
            v2 <Chip tom="info">vigente</Chip>
          </div>
        </div>
        <div>
          <RotuloMono>Critérios ativos</RotuloMono>
          <div className="mt-1 font-display text-xl font-bold text-ink">{criterios.length}</div>
        </div>
        <div>
          <RotuloMono>Pontuação máxima</RotuloMono>
          <div className="mt-1 font-display text-xl font-bold text-ink">
            {somaPesos} <span className="text-sm font-normal text-stone">+ 5 de potencial disruptivo</span>
          </div>
        </div>
        <p className="ml-auto max-w-xs text-xs leading-relaxed text-stone">
          Regra determinística (RN023): SIM → peso, NÃO → peso alternativo, N/A → 0. Pesos vão de −10 a 10 —
          use negativos para <strong className="font-semibold text-graphite">penalizar</strong> (ex.: concorrente
          do cliente). Score total = soma das pontuações + potencial disruptivo (1–5).
        </p>
      </div>

      {/* Formulário de novo critério */}
      {formAberto && (
        <form onSubmit={criar} className="card mb-6 flex flex-wrap items-end gap-4 p-6">
          <CampoTexto
            rotulo="Nome do critério"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Ex.: Alinhamento de território"
            className="min-w-56 flex-1"
            autoFocus
          />
          <CampoTexto
            rotulo="Descrição"
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
            placeholder="O que este critério avalia"
            className="min-w-72 flex-[2]"
          />
          <CampoTexto
            rotulo="Peso SIM (-10 a 10)"
            type="number"
            min={-10}
            max={10}
            value={novoPeso}
            onChange={(e) => setNovoPeso(Number(e.target.value))}
            className="w-36"
          />
          <div className="flex gap-2">
            <Botao type="submit" pequeno>
              Adicionar
            </Botao>
            <Botao type="button" variante="ghost" pequeno onClick={() => setFormAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {/* Tabela de critérios */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cloud">
                <th className="label-mono px-5 py-3.5 font-normal">Ordem</th>
                <th className="label-mono px-5 py-3.5 font-normal">Critério</th>
                <th className="label-mono px-5 py-3.5 text-right font-normal">Peso SIM</th>
                <th className="label-mono px-5 py-3.5 text-right font-normal">Peso NÃO</th>
                <th className="label-mono px-5 py-3.5 text-center font-normal">Obrigatório</th>
                <th className="label-mono px-5 py-3.5 text-center font-normal">Ativo</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {todosCriterios.map((c, idx) => (
                <tr key={c.id} className={c.ativo ? '' : 'opacity-45'}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 font-mono text-xs font-bold text-stone">{idx + 1}</span>
                      <div className="flex flex-col">
                        <button
                          onClick={() => moverCriterio(c.id, -1)}
                          disabled={idx === 0}
                          className="text-stone transition-colors hover:text-ink disabled:opacity-25"
                          aria-label="Subir critério"
                        >
                          <ChevronUp size={13} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => moverCriterio(c.id, 1)}
                          disabled={idx === todosCriterios.length - 1}
                          className="text-stone transition-colors hover:text-ink disabled:opacity-25"
                          aria-label="Descer critério"
                        >
                          <ChevronDown size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-md px-5 py-3">
                    <div className="font-semibold text-ink">{c.nome}</div>
                    <div className="text-xs text-stone">{c.descricao}</div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      min={-10}
                      max={10}
                      value={c.pesoSim}
                      onChange={(e) => atualizarCriterio(c.id, { pesoSim: limitarPeso(Number(e.target.value)) })}
                      className="w-20 rounded-md border border-mist bg-paper px-2 py-1.5 text-right font-mono text-sm text-ink focus:border-accent"
                      aria-label={`Peso SIM de ${c.nome}`}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      min={-10}
                      max={10}
                      value={c.pesoNao}
                      onChange={(e) => atualizarCriterio(c.id, { pesoNao: limitarPeso(Number(e.target.value)) })}
                      className="w-20 rounded-md border border-mist bg-paper px-2 py-1.5 text-right font-mono text-sm text-ink focus:border-accent"
                      aria-label={`Peso NÃO de ${c.nome}`}
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={c.obrigatorio}
                      onChange={(e) => atualizarCriterio(c.id, { obrigatorio: e.target.checked })}
                      className="h-4 w-4 accent-[#B98E4A]"
                      aria-label={`Critério ${c.nome} obrigatório`}
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={c.ativo}
                      onChange={(e) => atualizarCriterio(c.id, { ativo: e.target.checked })}
                      className="h-4 w-4 accent-[#B98E4A]"
                      aria-label={`Critério ${c.nome} ativo`}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setARemover(c)}
                      className="rounded-full p-1.5 text-stone transition-colors hover:bg-status-negsoft hover:text-status-neg"
                      title="Remover critério"
                      aria-label={`Remover critério ${c.nome}`}
                    >
                      <Trash2 size={15} strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        aberto={aRemover !== null}
        titulo="Remover critério?"
        descricao={
          <>
            O critério <strong className="font-semibold text-graphite">“{aRemover?.nome}”</strong> sairá do
            modelo de {cliente.nome} e o score de todas as marcas avaliadas será recalculado. Esta ação não
            pode ser desfeita.
          </>
        }
        rotuloConfirmar="Remover"
        perigo
        aoConfirmar={() => {
          if (aRemover) {
            removerCriterio(aRemover.id);
            toast(`Critério “${aRemover.nome}” removido.`, 'info');
          }
        }}
        aoFechar={() => setARemover(null)}
      />
    </div>
  );
}
