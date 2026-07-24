import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Blend, Eye, EyeOff, FileText, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useStore } from '../store/useStore';
import { LogoCross } from '../components/Logo';

const METODOLOGIA = [
  { numero: '01', titulo: 'Crossability', descricao: 'Encontra o parceiro ideal cruzando ativos, objetivos e consumidores.', icone: Blend },
  { numero: '02', titulo: 'Cross Score Card', descricao: 'Mede e encaixa cada parceria com critérios e pesos por cliente.', icone: BarChart3 },
  { numero: '03', titulo: 'Plano tático', descricao: 'Consolida a estratégia validada e apresentável ao cliente.', icone: FileText },
];

function CampoComIcone({
  rotulo,
  icone,
  tipo = 'text',
  valor,
  aoMudar,
  placeholder,
  final,
}: {
  rotulo: string;
  icone: React.ReactNode;
  tipo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  final?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-accent-deep">{rotulo}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone">{icone}</span>
        <input
          type={tipo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-cloud bg-paper py-3 pl-10 pr-10 text-sm text-ink placeholder:text-mist focus:border-accent"
        />
        {final && <span className="absolute right-3 top-1/2 -translate-y-1/2">{final}</span>}
      </span>
    </label>
  );
}

export function Login() {
  const login = useStore((s) => s.login);
  const navigate = useNavigate();
  const [nome, setNome] = useState('Igor Rodrigues');
  const [email, setEmail] = useState('igor@crossnetworking.com.br');
  const [senha, setSenha] = useState('demo');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.includes('@') || !senha) {
      setErro('Informe nome, e-mail válido e senha para entrar.');
      return;
    }
    login(nome.trim(), email.trim().toLowerCase());
    navigate('/');
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel institucional — preto com dourado */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink px-14 py-11 lg:flex lg:w-[54%]">
        <LogoCross claro />

        <div className="relative z-10 max-w-xl">
          <div className="font-mono text-[12px] uppercase tracking-[0.3em] text-accent">
            Estratégia · Parcerias · Negócios
          </div>
          <h1 className="mt-6 font-display text-[64px] font-extrabold uppercase leading-[0.98] tracking-tight text-paper">
            Ninguém
            <br />
            faz nada
            <br />
            <span className="text-accent">sozinho</span>
          </h1>
          <div className="mt-7 h-px w-14 bg-accent" />
          <p className="mt-6 max-w-md text-lg leading-relaxed text-paper">
            Somos uma empresa de estratégia focada em conexões que geram negócios.
          </p>
        </div>

        {/* Metodologias */}
        <div className="relative z-10 grid grid-cols-3 divide-x divide-graphite border-t border-graphite pt-8">
          {METODOLOGIA.map((etapa) => (
            <div key={etapa.numero} className="px-5 first:pl-0 last:pr-0">
              <div className="flex items-center gap-2.5">
                <etapa.icone size={17} strokeWidth={1.5} className="text-accent" />
                <span className="font-mono text-[11px] tracking-[0.2em] text-stone">{etapa.numero}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-paper">{etapa.titulo}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-stone">{etapa.descricao}</p>
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-9 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">© 2026 Crossnetworking</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">B2B · Parcerias estratégicas</span>
        </div>
      </div>

      {/* Lado do formulário */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-off px-6">
        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <LogoCross />
          </div>

          <form onSubmit={entrar} className="rounded-[28px] border border-cloud bg-paper p-9 shadow-pop">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-deep">Acesso interno</div>
            <div className="mt-2 h-px w-10 bg-accent" />
            <h2 className="mt-5 font-display text-[26px] font-extrabold tracking-tight text-ink">
              Entrar na plataforma
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-stone">
              Bem-vindo de volta. Continue de onde a operação parou.
            </p>

            <div className="mt-7 space-y-4">
              <CampoComIcone
                rotulo="Nome"
                icone={<UserRound size={15} strokeWidth={1.5} />}
                valor={nome}
                aoMudar={setNome}
                placeholder="Seu nome"
              />
              <CampoComIcone
                rotulo="E-mail"
                icone={<Mail size={15} strokeWidth={1.5} />}
                tipo="email"
                valor={email}
                aoMudar={setEmail}
                placeholder="voce@crossnetworking.com.br"
              />
              <CampoComIcone
                rotulo="Senha"
                icone={<Lock size={15} strokeWidth={1.5} />}
                tipo={mostrarSenha ? 'text' : 'password'}
                valor={senha}
                aoMudar={setSenha}
                placeholder="••••••••"
                final={
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="text-stone transition-colors hover:text-ink"
                    title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {mostrarSenha ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                  </button>
                }
              />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-graphite">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="h-4 w-4 accent-[#0A0A0B]"
                />
                Lembrar de mim
              </label>
              <button type="button" className="text-sm font-semibold text-accent-deep transition-colors hover:text-accent">
                Esqueci minha senha
              </button>
            </div>

            {erro && <p className="mt-4 rounded-md bg-status-negsoft px-3 py-2 text-xs text-status-neg">{erro}</p>}

            <button
              type="submit"
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-graphite"
            >
              Entrar <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-stone">
            <ShieldCheck size={12} strokeWidth={1.5} className="text-accent-deep" />
            Ambiente de demonstração — qualquer credencial em formato válido é aceita.
          </p>
        </div>
      </div>
    </div>
  );
}
