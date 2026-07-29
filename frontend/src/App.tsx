import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './store/useStore';
import { ToastProvider } from './components/Toast';
import { AppShell } from './components/AppShell';

// Code-splitting por rota: cada página vira um chunk carregado sob demanda.
// As páginas exportam nomeado, então mapeamos para `default` no import dinâmico.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Oportunidades = lazy(() => import('./pages/Oportunidades').then((m) => ({ default: m.Oportunidades })));
const Partes = lazy(() => import('./pages/Partes').then((m) => ({ default: m.Partes })));
const ParteDetalhe = lazy(() => import('./pages/ParteDetalhe').then((m) => ({ default: m.ParteDetalhe })));
const Artistas = lazy(() => import('./pages/Artistas').then((m) => ({ default: m.Artistas })));
const Projetos = lazy(() => import('./pages/Projetos').then((m) => ({ default: m.Projetos })));
const ProjetoDetalhe = lazy(() => import('./pages/ProjetoDetalhe').then((m) => ({ default: m.ProjetoDetalhe })));
const Criterios = lazy(() => import('./pages/Criterios').then((m) => ({ default: m.Criterios })));
const Marcas = lazy(() => import('./pages/Marcas').then((m) => ({ default: m.Marcas })));
const ScoreCard = lazy(() => import('./pages/ScoreCard').then((m) => ({ default: m.ScoreCard })));
const Ranking = lazy(() => import('./pages/Ranking').then((m) => ({ default: m.Ranking })));
const Funil = lazy(() => import('./pages/Funil').then((m) => ({ default: m.Funil })));
const Cronograma = lazy(() => import('./pages/Cronograma').then((m) => ({ default: m.Cronograma })));
const ParceriaDetalhe = lazy(() => import('./pages/ParceriaDetalhe').then((m) => ({ default: m.ParceriaDetalhe })));
const Resumo = lazy(() => import('./pages/Resumo').then((m) => ({ default: m.Resumo })));
const Usuarios = lazy(() => import('./pages/Usuarios').then((m) => ({ default: m.Usuarios })));
const ImportarDados = lazy(() => import('./pages/ImportarDados').then((m) => ({ default: m.ImportarDados })));
const Conhecimento = lazy(() => import('./pages/Conhecimento').then((m) => ({ default: m.Conhecimento })));

function RotaProtegida({ children }: { children: React.ReactNode }) {
  const usuario = useStore((s) => s.usuario);
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Fallback minimalista enquanto o chunk da rota carrega
function CarregandoRota() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cloud border-t-accent" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

export function App() {
  return (
    // HashRouter: funciona aberto direto do disco (file://) e em qualquer host estático
    <HashRouter>
      <ToastProvider>
        <Suspense fallback={<CarregandoRota />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RotaProtegida>
                  <AppShell />
                </RotaProtegida>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/oportunidades" element={<Oportunidades />} />
              <Route path="/partes" element={<Partes />} />
              <Route path="/partes/:parteId" element={<ParteDetalhe />} />
              <Route path="/artistas" element={<Artistas />} />
              <Route path="/projetos" element={<Projetos />} />
              <Route path="/projetos/:projetoId" element={<ProjetoDetalhe />} />
              <Route path="/criterios" element={<Criterios />} />
              <Route path="/marcas" element={<Marcas />} />
              <Route path="/marcas/:candidaturaId" element={<ScoreCard />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/funil" element={<Funil />} />
              <Route path="/cronograma" element={<Cronograma />} />
              <Route path="/parcerias/:parceriaId" element={<ParceriaDetalhe />} />
              <Route path="/resumo" element={<Resumo />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/importar" element={<ImportarDados />} />
              <Route path="/conhecimento" element={<Conhecimento />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </HashRouter>
  );
}
