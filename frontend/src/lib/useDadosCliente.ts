import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { calcularScore, type ResumoScore } from './score';
import type { Avaliacao, Candidatura, Cliente, Criterio, Marca, Parceria } from '../types';

export interface CandidaturaEnriquecida {
  candidatura: Candidatura;
  marca: Marca;
  avaliacao: Avaliacao | undefined;
  score: ResumoScore | null;
}

export interface DadosCliente {
  cliente: Cliente;
  criterios: Criterio[]; // ativos, ordenados
  todosCriterios: Criterio[]; // inclusive inativos, ordenados
  itens: CandidaturaEnriquecida[];
  ranking: CandidaturaEnriquecida[]; // apenas avaliados, por score desc
  parcerias: Parceria[];
}

export function useDadosCliente(): DadosCliente {
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const clientes = useStore((s) => s.clientes);
  const criterios = useStore((s) => s.criterios);
  const candidaturas = useStore((s) => s.candidaturas);
  const avaliacoes = useStore((s) => s.avaliacoes);
  const partes = useStore((s) => s.partes);
  const todasParcerias = useStore((s) => s.parcerias);

  return useMemo(() => {
    const cliente = clientes.find((c) => c.id === clienteAtivoId) ?? clientes[0];
    const todosCriterios = criterios
      .filter((c) => c.clienteId === cliente.id)
      .sort((a, b) => a.ordem - b.ordem);
    const ativos = todosCriterios.filter((c) => c.ativo);

    const itens: CandidaturaEnriquecida[] = candidaturas
      .filter((c) => c.clienteId === cliente.id)
      .map((candidatura) => {
        // A Parte é a fonte da identidade da marca — cobre também as cadastradas pela UI
        const marca = partes.find((p) => p.id === candidatura.marcaId)!;
        const avaliacao = avaliacoes.find((a) => a.candidaturaId === candidatura.id);
        return { candidatura, marca, avaliacao, score: calcularScore(ativos, avaliacao) };
      });

    const ranking = itens
      .filter((i) => i.score !== null)
      .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

    const parcerias = todasParcerias.filter((p) => p.clienteId === cliente.id);

    return { cliente, criterios: ativos, todosCriterios, itens, ranking, parcerias };
  }, [clienteAtivoId, clientes, criterios, candidaturas, avaliacoes, partes, todasParcerias]);
}
