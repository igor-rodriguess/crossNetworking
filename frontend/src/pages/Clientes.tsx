import { useEffect } from 'react';
import { ArrowRight, Building2, Pencil } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ErroApi } from '../api/erros';
import { useStore } from '../store/useStore';
import { Botao, CabecalhoPagina, EstadoVazio, RotuloMono } from '../components/ui';
import { useToast } from '../components/Toast';

/** Entrada operacional para as empresas atendidas pela Cross. */
export function Clientes() {
  const clientes = useStore((s) => s.clientes);
  const clienteAtivoId = useStore((s) => s.clienteAtivoId);
  const clientesCarregando = useStore((s) => s.clientesCarregando);
  const carregarClientes = useStore((s) => s.carregarClientes);
  const setClienteAtivo = useStore((s) => s.setClienteAtivo);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    carregarClientes().catch((erro) =>
      toast(erro instanceof ErroApi ? erro.message : 'Não foi possível carregar os clientes.'),
    );
  }, [carregarClientes, toast]);

  function abrirPerfil(clienteId: string, parteId?: string) {
    setClienteAtivo(clienteId);
    if (!parteId) {
      toast('O perfil desta conta ainda não está vinculado à base de relacionamentos.', 'info');
      return;
    }
    navigate(`/partes/${parteId}`);
  }

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Contas atendidas pela Cross"
        titulo="Clientes"
        descricao="Abra uma conta para visualizar e completar o mesmo perfil estratégico padrão de todos os clientes."
      />

      {clientesCarregando && clientes.length === 0 ? (
        <EstadoVazio titulo="Carregando clientes…" descricao="Buscando as contas cadastradas no servidor." />
      ) : clientes.length === 0 ? (
        <EstadoVazio titulo="Nenhum cliente cadastrado" descricao="Cadastre a primeira conta pelo seletor de cliente no topo da tela." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map((cliente) => {
            const ativo = cliente.id === clienteAtivoId;
            return (
              <article
                key={cliente.id}
                className={`card flex min-h-56 flex-col p-6 transition-colors ${ativo ? 'border-accent ring-1 ring-accent/25' : 'hover:border-mist'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink font-mono text-sm font-bold text-paper">
                    {cliente.sigla}
                  </span>
                  {ativo && (
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-accent-deep">
                      Cliente ativo
                    </span>
                  )}
                </div>
                <div className="mt-5">
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">{cliente.nome}</h2>
                  <p className="mt-1 text-sm text-stone">
                    {cliente.segmento === '—' ? 'Informações estratégicas a completar' : cliente.segmento}
                  </p>
                </div>
                <div className="mt-5 border-t border-cloud pt-4">
                  <RotuloMono>Próxima ação</RotuloMono>
                  <p className="mt-1 text-sm leading-relaxed text-graphite">
                    Preencher resumo, objetivos, ativos, consumidores, territórios e responsável pela marca.
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-5">
                  <Botao pequeno onClick={() => abrirPerfil(cliente.id, cliente.parteId)}>
                    <Pencil size={13} strokeWidth={1.5} /> Abrir perfil
                  </Botao>
                  {cliente.parteId && (
                    <Link
                      to={`/partes/${cliente.parteId}`}
                      onClick={() => setClienteAtivo(cliente.id)}
                      className="inline-flex items-center gap-1 px-2 text-sm font-semibold text-graphite transition-colors hover:text-ink"
                    >
                      Abrir <ArrowRight size={15} strokeWidth={1.5} />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-cloud bg-off px-4 py-3 text-sm text-stone">
        <Building2 size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent-deep" />
        As informações preenchidas aqui dão contexto à equipe e às análises de oportunidade deste cliente.
      </div>
    </div>
  );
}
