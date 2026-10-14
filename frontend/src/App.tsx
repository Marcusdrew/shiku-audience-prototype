import { BrowserRouter, Route, Routes } from 'react-router';
import type { UserManager } from 'oidc-client-ts';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { DroitsProvider } from './auth/DroitsContext';
import { AppShell } from './components/AppShell';
import { CallbackPage } from './pages/CallbackPage';
import { AdministrationPage } from './pages/AdministrationPage';
import { AgendasPage } from './pages/AgendasPage';
import { DashboardPage } from './pages/DashboardPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { DemandeDetailPage } from './pages/DemandeDetailPage';
import { DemandesPage } from './pages/DemandesPage';
import { JournalPage } from './pages/JournalPage';
import { LoginPage } from './pages/LoginPage';
import { ModulePage } from './pages/ModulePage';
import { OperationsPage } from './pages/OperationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NAVIGATION } from './navigation';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route
          element={
            <DroitsProvider>
              <AppShell />
            </DroitsProvider>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/demandes" element={<DemandesPage />} />
          <Route path="/demandes/:id" element={<DemandeDetailPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/agendas" element={<AgendasPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/administration" element={<AdministrationPage />} />
          {NAVIGATION.filter((e) => !e.implemente).map((e) => (
            <Route key={e.chemin} path={e.chemin} element={<ModulePage />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App({ gestionnaire }: { gestionnaire: UserManager }) {
  return (
    <AuthProvider gestionnaire={gestionnaire}>
      <BrowserRouter>
        <Routes>
          <Route path="/callback" element={<CallbackPage gestionnaire={gestionnaire} />} />
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
