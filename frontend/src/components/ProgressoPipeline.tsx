import type { ReactNode } from 'react';
import { AlertTriangle, Check, Loader2, Minus } from 'lucide-react';
import { RotuloMono } from './ui';
import type { EtapaTarefaApi, TarefaPipelineApi } from '../api/oportunidades.api';

// -----------------------------------------------------------------------------
// Linha do tempo de um pipeline de IA em execução.
//
// O pipeline leva minutos (várias chamadas de LLM em sequência). Sem retorno
// visual, a tela parecia travada e não havia como saber se algo estava
// acontecendo — ou em que etapa. Aqui mostramos cada nó, o que já concluiu e
// onde estamos agora.
// -----------------------------------------------------------------------------

// Todas as etapas do pipeline, na ordem de execução. Mantido aqui (e não vindo
// do backend) para desenhar as etapas futuras em cinza antes de elas rodarem.
const ETAPAS = [
  { nome: 'search_planning', rotulo: 'Planejar pesquisa', detalhe: 'Decompõe o objetivo em perguntas e consultas' },
  { nome: 'source_collector', rotulo: 'Coletar fontes', detalhe: 'Busca na web os termos planejados' },
  { nome: 'source_credibility', rotulo: 'Avaliar credibilidade', detalhe: 'Pesa a reputação de cada fonte' },
  { nome: 'fact_verifier', rotulo: 'Verificar fatos', detalhe: 'Confere afirmações contra fontes independentes' },
  { nome: 'information_extractor', rotulo: 'Extrair informações', detalhe: 'Estrutura setor, públicos, territórios e ativos' },
  { nome: 'entity_resolver', rotulo: 'Resolver entidades', detalhe: 'Casa os nomes encontrados com a base Cross' },
  { nome: 'rag_retrieval', rotulo: 'Recuperar conhecimento', detalhe: 'Traz contexto da base vetorial' },
  { nome: 'crossability_reasoning', rotulo: 'Raciocínio Crossability', detalhe: 'Avalia as 6 dimensões de cada candidato' },
  { nome: 'recommendation', rotulo: 'Recomendar', detalhe: 'Ranqueia os parceiros pelo fit' },
] as const;

type EstadoEtapa = 'concluida' | 'atual' | 'pendente' | 'parcial' | 'ignorada' | 'erro';

function estadoDaEtapa(nome: string, tarefa: TarefaPipelineApi): EstadoEtapa {
  const registrada = tarefa.etapas.find((e: EtapaTarefaApi) => e.nome === nome);
  if (registrada) {
    if (registrada.status === 'sucesso') return 'concluida';
    if (registrada.status === 'parcial') return 'parcial';
    if (registrada.status === 'erro') return 'erro';
    return 'ignorada';
  }
  if (tarefa.etapa_atual === nome && tarefa.status === 'executando') return 'atual';
  return 'pendente';
}

const APARENCIA: Record<EstadoEtapa, { icone: ReactNode; texto: string; nota?: string }> = {
  concluida: { icone: <Check size={13} strokeWidth={2.5} className="text-status-pos" />, texto: 'text-ink' },
  parcial: { icone: <AlertTriangle size={13} strokeWidth={2} className="text-status-warn" />, texto: 'text-ink', nota: 'sem resultados' },
  ignorada: { icone: <Minus size={13} strokeWidth={2} className="text-mist" />, texto: 'text-stone', nota: 'não aplicável' },
  erro: { icone: <AlertTriangle size={13} strokeWidth={2} className="text-status-neg" />, texto: 'text-ink', nota: 'falhou' },
  atual: { icone: <Loader2 size={13} strokeWidth={2} className="animate-spin text-accent" />, texto: 'text-ink font-semibold' },
  pendente: { icone: <span className="block h-1.5 w-1.5 rounded-full bg-mist" />, texto: 'text-mist' },
};

export function ProgressoPipeline({ tarefa }: { tarefa: TarefaPipelineApi }) {
  const emErro = tarefa.status === 'erro';
  const concluida = tarefa.status === 'concluida';

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud bg-off px-6 py-4">
        <div>
          <RotuloMono>
            {emErro ? 'Execução interrompida' : concluida ? 'Execução concluída' : 'Executando pipeline de IA'}
          </RotuloMono>
          <p className="mt-1 text-xs text-stone">
            {emErro
              ? 'Veja abaixo em qual etapa parou.'
              : concluida
                ? 'Todas as etapas foram percorridas.'
                : 'O modelo local leva alguns minutos por etapa — pode acompanhar por aqui.'}
          </p>
        </div>
        <span className="font-mono text-2xl font-bold tabular-nums text-ink">{tarefa.progresso}%</span>
      </div>

      {/* Barra de progresso */}
      <div className="h-1.5 w-full bg-cloud">
        <div
          className={`h-full transition-[width] duration-500 ease-out ${emErro ? 'bg-status-neg' : 'bg-accent'}`}
          style={{ width: `${Math.max(2, tarefa.progresso)}%` }}
        />
      </div>

      <ol className="divide-y divide-cloud">
        {ETAPAS.map((etapa) => {
          const estado = estadoDaEtapa(etapa.nome, tarefa);
          const visual = APARENCIA[estado];
          const registrada = tarefa.etapas.find((e: EtapaTarefaApi) => e.nome === etapa.nome);
          return (
            <li key={etapa.nome} className="flex items-start gap-3 px-6 py-3">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">{visual.icone}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${visual.texto}`}>{etapa.rotulo}</span>
                  {registrada?.origem && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep">{registrada.origem}</span>
                  )}
                  {visual.nota && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-stone">{visual.nota}</span>}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-stone">{registrada?.observacao ?? etapa.detalhe}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {emErro && tarefa.erro && (
        <p className="border-t border-cloud bg-status-negsoft/30 px-6 py-3 text-xs leading-relaxed text-status-neg">{tarefa.erro}</p>
      )}
    </section>
  );
}
