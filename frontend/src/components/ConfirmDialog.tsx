import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Botao } from './ui';

// Diálogo de confirmação para ações destrutivas (prevenção de erro — Nielsen nº 5).
// Gerencia foco (envia ao botão de ação, devolve ao gatilho), fecha com Esc,
// trava o scroll do fundo e captura o clique fora.

export function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  perigo = false,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: ReactNode;
  rotuloConfirmar?: string;
  perigo?: boolean;
  aoConfirmar: () => void | Promise<void>;
  aoFechar: () => void;
}) {
  const botaoRef = useRef<HTMLButtonElement>(null);
  const gatilhoRef = useRef<HTMLElement | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    gatilhoRef.current = document.activeElement as HTMLElement;
    botaoRef.current?.focus();
    document.body.style.overflow = 'hidden';

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
      gatilhoRef.current?.focus();
    };
  }, [aberto, aoFechar]);

  useEffect(() => {
    if (!aberto) setConfirmando(false);
  }, [aberto]);

  async function confirmar() {
    if (confirmando) return;
    setConfirmando(true);
    try {
      await aoConfirmar();
      aoFechar();
    } catch {
      // A tela chamadora apresenta a mensagem contextual de erro e o diálogo
      // permanece aberto para a pessoa decidir se tenta novamente.
    } finally {
      setConfirmando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm print:hidden"
      onMouseDown={(e) => {
        if (!confirmando && e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        aria-describedby="confirm-descricao"
        className="anim-dialog w-full max-w-md rounded-2xl border border-cloud bg-paper p-6 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              perigo ? 'bg-status-negsoft text-status-neg' : 'bg-accent-soft text-accent-deep'
            }`}
          >
            <AlertTriangle size={18} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-titulo" className="font-display text-lg font-bold text-ink">
              {titulo}
            </h2>
            <p id="confirm-descricao" className="mt-1 text-sm leading-relaxed text-stone">
              {descricao}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Botao variante="ghost" pequeno onClick={aoFechar} disabled={confirmando}>
            Cancelar
          </Botao>
          <button
            ref={botaoRef}
            type="button"
            onClick={() => void confirmar()}
            disabled={confirmando}
            className={`inline-flex items-center justify-center rounded-full px-6 py-1.5 text-sm font-semibold text-paper transition-colors ${
              perigo ? 'bg-status-neg hover:brightness-110' : 'bg-accent hover:bg-accent-deep'
            }`}
          >
            {confirmando ? 'Processando…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
