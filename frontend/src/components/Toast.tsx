import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

// Sistema de toasts: feedback imediato para toda ação de escrita (heurística de
// visibilidade do status do sistema — Nielsen nº 1). Provider + hook `useToast`.

type TomToast = 'sucesso' | 'info';

interface Toast {
  id: number;
  tom: TomToast;
  mensagem: string;
}

interface ContextoToast {
  toast: (mensagem: string, tom?: TomToast) => void;
}

const Ctx = createContext<ContextoToast | null>(null);

export function useToast(): ContextoToast {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}

function ItemToast({ toast, aoRemover }: { toast: Toast; aoRemover: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => aoRemover(toast.id), 3200);
    return () => clearTimeout(t);
  }, [toast.id, aoRemover]);

  const Icone = toast.tom === 'sucesso' ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      className="anim-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-graphite bg-ink px-4 py-3 shadow-pop"
    >
      <Icone size={17} strokeWidth={1.5} className={toast.tom === 'sucesso' ? 'text-accent' : 'text-mist'} />
      <span className="flex-1 text-sm font-medium leading-snug text-paper">{toast.mensagem}</span>
      <button
        type="button"
        onClick={() => aoRemover(toast.id)}
        className="shrink-0 text-stone transition-colors hover:text-paper"
        aria-label="Fechar aviso"
      >
        <X size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((mensagem: string, tom: TomToast = 'sucesso') => {
    setToasts((atual) => [...atual, { id: Date.now() + Math.random(), mensagem, tom }]);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {/* Região aria-live: leitores de tela anunciam cada toast */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2.5 print:hidden"
      >
        {toasts.map((t) => (
          <ItemToast key={t.id} toast={t} aoRemover={remover} />
        ))}
      </div>
    </Ctx.Provider>
  );
}
