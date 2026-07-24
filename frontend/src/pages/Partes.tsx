import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, Search, UserRound } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { PARCERIAS } from '../data/mock';
import {
  Botao,
  CabecalhoPagina,
  CampoSelecao,
  CampoTexto,
  Chip,
  EstadoVazio,
  FaixaEstatisticas,
  RotuloMono,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { normalizar } from '../lib/texto';
import type { PapelParte, Parte } from '../types';

export const PAPEL_PARTE: Record<PapelParte, string> = {
  cliente: 'Cliente Cross',
  parceiro: 'Parceiro',
  parceiro_potencial: 'Parceiro potencial',
  patrocinador: 'Patrocinador',
  artista: 'Artista',
  atleta: 'Atleta',
  veiculo_midia: 'Veículo de mídia',
};


type Visao = 'todos' | 'clientes' | 'organizacoes' | 'pessoas';

const VISOES: { id: Visao; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'clientes', rotulo: 'Clientes — quem busca a Cross' },
  { id: 'organizacoes', rotulo: 'Marcas & organizações — parceiros' },
  { id: 'pessoas', rotulo: 'Pessoas & talentos' },
];

// ─── Formulário de nova Parte (RF004/RF005 — tipo + especialização) ─────────

function FormNovaParte({ aoFechar }: { aoFechar: () => void }) {
  const adicionarParte = useStore((s) => s.adicionarParte);
  const { toast } = useToast();
  const [tipo, setTipo] = useState<Parte['tipo']>('organizacao');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [papel, setPapel] = useState<PapelParte>('parceiro_potencial');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !categoria.trim() || salvando) return;
    setSalvando(true);
    try {
      await adicionarParte({ tipo, nome: nome.trim(), categoria: categoria.trim(), papel });
      toast(`${nome.trim()} foi adicionada à base de relacionamentos.`);
      aoFechar();
    } catch (err) {
      toast(err instanceof ErroApi ? err.message : 'Não foi possível cadastrar a Parte.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="card anim-abre mb-6 p-6">
      <RotuloMono className="mb-4">Nova Parte — organização ou pessoa (RN001: exatamente uma especialização)</RotuloMono>
      <div className="grid gap-4 md:grid-cols-3">
        <CampoSelecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Parte['tipo'])}>
          <option value="organizacao">Organização</option>
          <option value="pessoa">Pessoa</option>
        </CampoSelecao>
        <CampoTexto
          rotulo={tipo === 'organizacao' ? 'Nome da organização' : 'Nome da pessoa'}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={tipo === 'organizacao' ? 'Ex.: Rede Vale Verde' : 'Ex.: Marina Duarte'}
          autoFocus
        />
        <CampoSelecao rotulo="Papel inicial" value={papel} onChange={(e) => setPapel(e.target.value as PapelParte)}>
          {Object.entries(PAPEL_PARTE).map(([codigo, rotulo]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </CampoSelecao>
        <CampoTexto
          rotulo={tipo === 'organizacao' ? 'Segmento principal' : 'Nacionalidade'}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder={tipo === 'organizacao' ? 'Ex.: Varejo & Consumo' : 'Ex.: Brasileira'}
        />
      </div>
      <div className="mt-5 flex gap-2">
        <Botao type="submit" pequeno disabled={salvando}>
          {salvando ? 'Cadastrando…' : 'Cadastrar Parte'}
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

export function Partes() {
  const candidaturas = useStore((s) => s.candidaturas);
  const partes = useStore((s) => s.partes);
  const carregarPartes = useStore((s) => s.carregarPartes);
  const partesCarregando = useStore((s) => s.partesCarregando);
  const { toast } = useToast();
  const [busca, setBusca] = useState('');
  const [visao, setVisao] = useState<Visao>('todos');
  const [papel, setPapel] = useState('todos');
  const [formAberto, setFormAberto] = useState(false);

  // Ao abrir a tela, busca a base real do backend (substitui o seed mock).
  useEffect(() => {
    carregarPartes().catch((e) =>
      toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar as Partes.'),
    );
  }, [carregarPartes, toast]);

  const participacao = useMemo(() => {
    const mapa = new Map<string, { candidaturas: number; parcerias: number }>();
    for (const p of partes) mapa.set(p.id, { candidaturas: 0, parcerias: 0 });
    for (const c of candidaturas) {
      const reg = mapa.get(c.marcaId);
      if (reg) reg.candidaturas += 1;
    }
    for (const p of PARCERIAS) {
      const reg = mapa.get(p.marcaId);
      if (reg) reg.parcerias += 1;
    }
    return mapa;
  }, [candidaturas, partes]);

  const filtradas = partes.filter((p) => {
    if (busca && !normalizar(`${p.nome} ${p.categoria} ${p.territorio}`).includes(normalizar(busca))) return false;
    if (visao === 'clientes' && !p.papeis.includes('cliente')) return false;
    if (visao === 'organizacoes' && (p.tipo !== 'organizacao' || p.papeis.includes('cliente'))) return false;
    if (visao === 'pessoas' && p.tipo !== 'pessoa') return false;
    if (papel !== 'todos' && !p.papeis.includes(papel as PapelParte)) return false;
    return true;
  });

  const organizacoes = partes.filter((p) => p.tipo === 'organizacao').length;
  const pessoas = partes.filter((p) => p.tipo === 'pessoa').length;
  const clientes = partes.filter((p) => p.papeis.includes('cliente')).length;
  const comParceria = partes.filter((p) => (participacao.get(p.id)?.parcerias ?? 0) > 0).length;

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Base de conhecimento da Cross"
        titulo="Base de relacionamentos"
        descricao="Dois lados do ecossistema em uma base única: os clientes — empresas que chegam à Cross buscando uma parceria — e as marcas, organizações e talentos que a Cross mapeia como potenciais parceiros para elas. Cada Parte é cadastrada uma vez e participa de vários projetos ao longo do tempo."
        acoes={
          <Botao pequeno onClick={() => setFormAberto((v) => !v)}>
            <Plus size={14} strokeWidth={1.5} /> Nova Parte
          </Botao>
        }
      />

      {formAberto && <FormNovaParte aoFechar={() => setFormAberto(false)} />}

      <div className="mb-6">
        <FaixaEstatisticas
          itens={[
            { rotulo: 'Partes cadastradas', valor: partes.length, detalhe: 'base histórica completa' },
            { rotulo: 'Organizações', valor: organizacoes, detalhe: 'marcas e empresas' },
            { rotulo: 'Pessoas', valor: pessoas, detalhe: 'artistas e talentos' },
            { rotulo: 'Clientes Cross', valor: clientes, detalhe: 'vínculos comerciais ativos' },
            { rotulo: 'Com parceria', valor: comParceria, detalhe: 'já formalizaram parceria' },
          ]}
        />
      </div>

      {/* Visões: quem busca a Cross × quem entra nas parcerias */}
      <div className="mb-4 flex flex-wrap overflow-hidden rounded-full border border-mist bg-paper">
        {VISOES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVisao(v.id)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              visao === v.id ? 'bg-ink text-paper' : 'text-stone hover:bg-off hover:text-ink'
            }`}
          >
            {v.rotulo}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="relative min-w-64 flex-1">
          <span className="label-mono mb-1.5 block">Buscar Parte</span>
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute bottom-2.5 left-3 text-stone" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, categoria ou território…"
            className="w-full rounded-md border border-mist bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-mist focus:border-accent"
          />
        </label>
        <CampoSelecao rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value)} className="w-56">
          <option value="todos">Todos</option>
          {Object.entries(PAPEL_PARTE).map(([codigo, rotulo]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </CampoSelecao>
        <div className="pb-2 font-mono text-[12px] uppercase tracking-[0.12em] text-stone">
          {filtradas.length} de {partes.length}
        </div>
      </div>

      {partesCarregando && partes.length === 0 ? (
        <EstadoVazio titulo="Carregando a base…" descricao="Buscando as Partes cadastradas no servidor." />
      ) : filtradas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma Parte encontrada"
          descricao={partes.length === 0 ? 'Cadastre a primeira Parte com “Nova Parte”.' : 'Ajuste a busca ou os filtros.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cloud">
                  <th className="label-mono px-5 py-3.5 font-normal">Parte</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Tipo</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Papéis</th>
                  <th className="label-mono px-5 py-3.5 font-normal">Território</th>
                  <th className="label-mono px-5 py-3.5 text-center font-normal">Candidaturas</th>
                  <th className="label-mono px-5 py-3.5 text-center font-normal">Parcerias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {filtradas.map((p) => {
                  const part = participacao.get(p.id)!;
                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-off">
                      <td className="px-5 py-3.5">
                        <Link to={`/partes/${p.id}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cloud text-graphite">
                            {p.tipo === 'organizacao' ? (
                              <Building2 size={15} strokeWidth={1.5} />
                            ) : (
                              <UserRound size={15} strokeWidth={1.5} />
                            )}
                          </span>
                          <span>
                            <span className="block font-semibold text-ink transition-colors group-hover:text-accent-deep">
                              {p.nome}
                            </span>
                            <span className="block text-xs text-stone">{p.categoria}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <Chip tom="neutro">{p.tipo === 'organizacao' ? 'Organização' : 'Pessoa'}</Chip>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {p.papeis.map((papelP) => (
                            <Chip key={papelP} tom={papelP === 'cliente' ? 'info' : 'neutro'}>
                              {PAPEL_PARTE[papelP]}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-stone">{p.territorio}</td>
                      <td className="px-5 py-3.5 text-center font-mono text-sm text-graphite">
                        {part.candidaturas || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono text-sm text-graphite">
                        {part.parcerias || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RotuloMono className="mt-5">
        Governança: partes usam exclusão lógica e histórico preservado (RN035) — nada é apagado da base.
      </RotuloMono>
    </div>
  );
}
