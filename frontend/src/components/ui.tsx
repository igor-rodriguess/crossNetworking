import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

// ─── Botões (pill, conforme a biblioteca de UI do design system) ────────────

type Variante = 'primario' | 'secundario' | 'ghost' | 'perigo';

const ESTILO_BOTAO: Record<Variante, string> = {
  primario: 'bg-accent text-paper hover:bg-accent-deep',
  secundario: 'bg-ink text-paper hover:bg-graphite',
  ghost: 'bg-transparent text-graphite border border-mist hover:border-graphite hover:text-ink',
  perigo: 'bg-transparent text-status-neg border border-status-neg/40 hover:bg-status-negsoft',
};

export function Botao({
  variante = 'primario',
  pequeno = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; pequeno?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        pequeno ? 'px-4 py-1.5 text-sm' : 'px-6 py-2.5 text-sm'
      } ${ESTILO_BOTAO[variante]} ${className}`}
      {...props}
    />
  );
}

// ─── Chip de status ──────────────────────────────────────────────────────────

export type TomChip = 'neutro' | 'info' | 'pos' | 'warn' | 'neg';

const ESTILO_CHIP: Record<TomChip, string> = {
  neutro: 'bg-cloud text-graphite',
  info: 'bg-accent-soft text-accent-deep',
  pos: 'bg-status-possoft text-status-pos',
  warn: 'bg-status-warnsoft text-status-warn',
  neg: 'bg-status-negsoft text-status-neg',
};

export function Chip({ tom = 'neutro', children }: { tom?: TomChip; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] ${ESTILO_CHIP[tom]}`}
    >
      {children}
    </span>
  );
}

// ─── Rótulo técnico (Space Mono) ─────────────────────────────────────────────

export function RotuloMono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`label-mono ${className}`}>{children}</div>;
}

// ─── Medidor de score (barra fina, acento único) ────────────────────────────

export function MedidorScore({
  percentual,
  altura = 'h-1.5',
  className = '',
}: {
  percentual: number;
  altura?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, percentual));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-cloud ${altura} ${className}`} role="presentation">
      <div
        className="h-full rounded-full bg-accent transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Tile de estatística (hero number em Archivo) ────────────────────────────

export function TileEstatistica({
  rotulo,
  valor,
  detalhe,
  icone,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <RotuloMono>{rotulo}</RotuloMono>
        {icone && <span className="text-stone">{icone}</span>}
      </div>
      <div className="whitespace-nowrap font-display text-4xl font-extrabold leading-none tracking-tight text-ink">{valor}</div>
      {detalhe && <div className="text-sm text-stone">{detalhe}</div>}
    </div>
  );
}

// ─── Faixa de estatísticas (um card único com divisórias) ───────────────────

// Classes explícitas por contagem — o Tailwind não gera nomes por interpolação.
const COLUNAS_FAIXA: Record<number, string> = {
  3: 'grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 xl:grid-cols-5',
};

export function FaixaEstatisticas({
  itens,
}: {
  itens: { rotulo: string; valor: ReactNode; detalhe?: string }[];
}) {
  const colunas = COLUNAS_FAIXA[itens.length] ?? 'grid-cols-2 xl:grid-cols-4';
  return (
    <div className={`card grid ${colunas}`}>
      {itens.map((item) => (
        <div
          key={item.rotulo}
          className="flex items-start gap-3 border-cloud px-6 py-5 xl:[&:not(:first-child)]:border-l"
        >
          <span className="whitespace-nowrap font-display text-4xl font-extrabold leading-none tracking-tight text-ink">
            {item.valor}
          </span>
          {/* pt-0.5 alinha oticamente o topo do texto com o topo do número grande */}
          <span className="min-w-0 pt-0.5">
            <span className="block text-sm font-semibold leading-tight text-graphite">{item.rotulo}</span>
            {item.detalhe && <span className="mt-0.5 block text-xs text-stone">{item.detalhe}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Campos de formulário ────────────────────────────────────────────────────

export function CampoTexto({
  rotulo,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo && <span className="label-mono">{rotulo}</span>}
      <input
        className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-mist focus:border-accent"
        {...props}
      />
    </label>
  );
}

export function CampoSelecao({
  rotulo,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo && <span className="label-mono">{rotulo}</span>}
      <select
        className="w-full cursor-pointer rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-accent disabled:cursor-not-allowed disabled:bg-off disabled:text-stone"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

// ─── Estado vazio ────────────────────────────────────────────────────────────

export function EstadoVazio({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-8 py-14 text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-cloud">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B73" strokeWidth="1.5">
          <path d="M12 3 L20 8.5 L17.5 19 L6.5 19 L4 8.5 Z" />
        </svg>
      </div>
      <h3 className="font-display text-lg font-bold text-ink">{titulo}</h3>
      <p className="max-w-sm text-sm text-stone">{descricao}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

// ─── Cabeçalho de página ─────────────────────────────────────────────────────

export function CabecalhoPagina({
  sobretitulo,
  titulo,
  descricao,
  acoes,
}: {
  sobretitulo: string;
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <RotuloMono className="mb-2">{sobretitulo}</RotuloMono>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-sm text-stone">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-3">{acoes}</div>}
    </div>
  );
}
