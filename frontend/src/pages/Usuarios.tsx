import { useEffect, useState } from 'react';
import { Plus, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErroApi } from '../api/erros';
import { formatarData } from '../lib/format';
import {
  Botao,
  CabecalhoPagina,
  CampoSelecao,
  CampoTexto,
  Chip,
  FaixaEstatisticas,
  RotuloMono,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { iniciais, normalizar } from '../lib/texto';
import type { Persona, UsuarioInterno } from '../types';

export const PERSONAS: Record<Persona, { rotulo: string; descricao: string }> = {
  estrategista: { rotulo: 'Estrategista', descricao: 'Conduz projetos, Crossability, Planos táticos e Score Card' },
  gestor_contas: { rotulo: 'Gestor de contas', descricao: 'Relacionamento comercial, clientes e contratos' },
  coordenador: { rotulo: 'Coordenador', descricao: 'Validações, decisões e acompanhamento de parcerias' },
  administrador: { rotulo: 'Administrador', descricao: 'Gestão de usuários, papéis e auditoria' },
};


function FormNovoUsuario({ aoFechar }: { aoFechar: () => void }) {
  const usuarios = useStore((s) => s.usuarios);
  const adicionarUsuario = useStore((s) => s.adicionarUsuario);
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [persona, setPersona] = useState<Persona>('estrategista');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const normalizado = email.trim().toLowerCase();
    if (!nome.trim() || !normalizado.includes('@')) {
      setErro('Informe nome e um e-mail válido.');
      return;
    }
    // RN006: e-mail único, sem diferenciar maiúsculas de minúsculas
    if (usuarios.some((u) => u.email.toLowerCase() === normalizado)) {
      setErro('Já existe um usuário com este e-mail (RN006 — e-mail único).');
      return;
    }
    // Senha opcional; se informada, o backend exige ≥10 caracteres com letras e números.
    if (senha && (senha.length < 10 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha))) {
      setErro('A senha deve ter ao menos 10 caracteres, com letras e números.');
      return;
    }
    setSalvando(true);
    try {
      await adicionarUsuario(nome, normalizado, persona, senha || undefined);
      toast(
        senha
          ? `Conta de ${nome.trim()} criada com acesso de ${PERSONAS[persona].rotulo.toLowerCase()}.`
          : `Conta de ${nome.trim()} criada. Defina uma senha para habilitar o login.`,
      );
      aoFechar();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível criar a conta.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="card anim-abre mb-6 p-6">
      <RotuloMono className="mb-4">Nova conta de acesso — usuária(o) interna(o) da Cross</RotuloMono>
      <div className="grid gap-4 md:grid-cols-3">
        <CampoTexto
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome completo"
          autoFocus
        />
        <CampoTexto
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pessoa@crossnetworking.com.br"
        />
        <CampoSelecao rotulo="Cargo" value={persona} onChange={(e) => setPersona(e.target.value as Persona)}>
          {Object.entries(PERSONAS).map(([codigo, p]) => (
            <option key={codigo} value={codigo}>
              {p.rotulo}
            </option>
          ))}
        </CampoSelecao>
        <CampoTexto
          rotulo="Senha inicial (opcional)"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="mín. 10 caracteres, com letras e números"
        />
      </div>
      <p className="mt-2 text-xs text-stone">{PERSONAS[persona].descricao}. Sem senha, a conta é criada mas só entra após definir uma.</p>
      {erro && <p className="mt-3 rounded-md bg-status-negsoft px-3 py-2 text-xs text-status-neg">{erro}</p>}
      <div className="mt-4 flex gap-2">
        <Botao type="submit" pequeno disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar conta'}
        </Botao>
        <Botao type="button" variante="ghost" pequeno onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

export function Usuarios() {
  const usuarios = useStore((s) => s.usuarios);
  const carregarUsuarios = useStore((s) => s.carregarUsuarios);
  const alternarAtivoUsuario = useStore((s) => s.alternarAtivoUsuario);
  const mudarPersonaUsuario = useStore((s) => s.mudarPersonaUsuario);
  const removerUsuario = useStore((s) => s.removerUsuario);
  const { toast } = useToast();

  // Carrega a equipe real do backend ao abrir a tela.
  useEffect(() => {
    carregarUsuarios().catch((e) =>
      toast(e instanceof ErroApi ? e.message : 'Não foi possível carregar a equipe.'),
    );
  }, [carregarUsuarios, toast]);
  const [formAberto, setFormAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [aDesativar, setADesativar] = useState<UsuarioInterno | null>(null);
  const [aApagar, setAApagar] = useState<UsuarioInterno | null>(null);

  const ativos = usuarios.filter((u) => u.ativo).length;
  const administradores = usuarios.filter((u) => u.persona === 'administrador').length;

  // Busca tolerante a acentos por nome, e-mail ou cargo
  const filtrados = usuarios.filter(
    (u) => !busca || normalizar(`${u.nome} ${u.email} ${PERSONAS[u.persona].rotulo}`).includes(normalizar(busca)),
  );

  return (
    <div>
      <CabecalhoPagina
        sobretitulo="Administração da plataforma"
        titulo="Equipe & acessos"
        descricao="Quem pode entrar na plataforma e com qual cargo (RF002). Desativar uma conta impede novos logins sem apagar o histórico da pessoa — nada some da trilha."
        acoes={
          <Botao pequeno onClick={() => setFormAberto((v) => !v)}>
            <Plus size={14} strokeWidth={1.5} /> Nova conta
          </Botao>
        }
      />

      {formAberto && <FormNovoUsuario aoFechar={() => setFormAberto(false)} />}

      <div className="mb-6">
        <FaixaEstatisticas
          itens={[
            { rotulo: 'Contas', valor: usuarios.length, detalhe: 'usuários internos' },
            { rotulo: 'Ativas', valor: ativos, detalhe: 'com acesso à plataforma' },
            { rotulo: 'Inativas', valor: usuarios.length - ativos, detalhe: 'login bloqueado, histórico preservado' },
            { rotulo: 'Administradores', valor: administradores, detalhe: 'cargo com todos os acessos' },
          ]}
        />
      </div>

      {/* Busca por nome, e-mail ou cargo */}
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="relative min-w-64 flex-1">
          <span className="label-mono mb-1.5 block">Buscar pessoa</span>
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute bottom-2.5 left-3 text-stone" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, e-mail ou cargo…"
            className="w-full rounded-md border border-mist bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-mist focus:border-accent"
          />
        </label>
        <div className="pb-2 font-mono text-[12px] uppercase tracking-[0.12em] text-stone">
          {filtrados.length} de {usuarios.length}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cloud">
                <th className="label-mono px-6 py-3.5 font-normal">Usuário</th>
                <th className="label-mono px-6 py-3.5 font-normal">Cargo</th>
                <th className="label-mono px-6 py-3.5 font-normal">Status</th>
                <th className="label-mono px-6 py-3.5 font-normal">Desde</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-stone">
                    Nenhuma pessoa encontrada para “{busca}”.
                  </td>
                </tr>
              )}
              {filtrados.map((u) => (
                <tr key={u.id} className={`transition-colors hover:bg-off ${u.ativo ? '' : 'opacity-55'}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-paper">
                        {iniciais(u.nome)}
                      </span>
                      <span>
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <UserRound size={13} strokeWidth={1.5} className="text-stone" /> {u.nome}
                        </span>
                        <span className="block text-xs text-stone">{u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={u.persona}
                      onChange={(e) =>
                        mudarPersonaUsuario(u.id, e.target.value as Persona).catch((err) =>
                          toast(err instanceof ErroApi ? err.message : 'Não foi possível alterar o cargo.'),
                        )
                      }
                      className="cursor-pointer rounded-full border border-mist bg-paper px-3 py-1.5 text-sm font-semibold text-ink focus:border-accent"
                      title={PERSONAS[u.persona].descricao}
                    >
                      {Object.entries(PERSONAS).map(([codigo, p]) => (
                        <option key={codigo} value={codigo}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    {u.ativo ? <Chip tom="pos">Ativa</Chip> : <Chip tom="neutro">Inativa</Chip>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-stone">{formatarData(u.criadoEm)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Botao
                        variante={u.ativo ? 'perigo' : 'ghost'}
                        pequeno
                        onClick={() => {
                          if (u.ativo) {
                            setADesativar(u); // desativar pede confirmação
                          } else {
                            alternarAtivoUsuario(u.id).catch((err) =>
                              toast(err instanceof ErroApi ? err.message : 'Não foi possível reativar.'),
                            ); // reativar é seguro
                            toast(`${u.nome} reativada(o) — acesso liberado.`);
                          }
                        }}
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </Botao>
                      <button
                        type="button"
                        onClick={() => setAApagar(u)}
                        className="rounded-full p-2 text-stone transition-colors hover:bg-status-negsoft hover:text-status-neg"
                        title="Apagar pessoa definitivamente"
                        aria-label={`Apagar ${u.nome}`}
                      >
                        <Trash2 size={15} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-stone">
        <ShieldCheck size={13} strokeWidth={1.5} className="text-accent-deep" />
        Na plataforma real, o enforcement por cargo acontece no backend (401/403 por rota) — aqui a
        gestão é demonstrativa e persiste localmente.
      </p>

      <ConfirmDialog
        aberto={aDesativar !== null}
        titulo="Desativar acesso?"
        descricao={
          <>
            <strong className="font-semibold text-graphite">{aDesativar?.nome}</strong> não conseguirá mais
            fazer login. O histórico da pessoa é preservado e a conta pode ser reativada a qualquer momento.
          </>
        }
        rotuloConfirmar="Desativar"
        perigo
        aoConfirmar={() => {
          if (aDesativar) {
            alternarAtivoUsuario(aDesativar.id).catch((err) =>
              toast(err instanceof ErroApi ? err.message : 'Não foi possível desativar.'),
            );
            toast(`Acesso de ${aDesativar.nome} desativado.`, 'info');
          }
        }}
        aoFechar={() => setADesativar(null)}
      />

      <ConfirmDialog
        aberto={aApagar !== null}
        titulo="Apagar pessoa?"
        descricao={
          <>
            <strong className="font-semibold text-graphite">{aApagar?.nome}</strong> será removida(o)
            definitivamente da lista. Diferente de desativar, esta ação não pode ser desfeita. Se quiser
            apenas bloquear o acesso preservando o histórico, use “Desativar”.
          </>
        }
        rotuloConfirmar="Apagar definitivamente"
        perigo
        aoConfirmar={() => {
          if (aApagar) {
            removerUsuario(aApagar.id).catch((err) =>
              toast(err instanceof ErroApi ? err.message : 'Não foi possível apagar.'),
            );
            toast(`${aApagar.nome} foi apagada(o) da lista.`, 'info');
          }
        }}
        aoFechar={() => setAApagar(null)}
      />
    </div>
  );
}
