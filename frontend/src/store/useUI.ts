import { create } from 'zustand';

// Estado de UI efêmero (não é domínio) — mantido fora do store da plataforma.
// A busca rápida (⌘K) abre pelo atalho E pelo botão do header a partir daqui,
// em vez de despachar um evento de teclado sintético (frágil e imprevisível).

interface EstadoUI {
  buscaAberta: boolean;
  abrirBusca: () => void;
  fecharBusca: () => void;
  alternarBusca: () => void;
}

export const useUI = create<EstadoUI>((set) => ({
  buscaAberta: false,
  abrirBusca: () => set({ buscaAberta: true }),
  fecharBusca: () => set({ buscaAberta: false }),
  alternarBusca: () => set((s) => ({ buscaAberta: !s.buscaAberta })),
}));
