import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// PHASE 2: Code-Splitting - Synchronous imports for critical components
import Login from './features/system/Login';
import CreateAdmin from './features/system/CreateAdmin';
import ErrorBoundary, { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import NichtGefunden from './components/ui/NichtGefunden';
import PasswortWechseln from './features/system/PasswortWechseln';

// PHASE 3: State Management - Contexts and Hooks
import { DownloadProvider } from './contexts/DownloadContext';
import { ActivationProvider } from './contexts/ActivationContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';

import { useApi } from './hooks/useApi';
import { useTheme } from './hooks/useTheme';
import { lazyNachladen } from './utils/lazyNachladen';
import './index.css';
import { Ladezustand } from '@marken';

// Einstellungen und Store werden nicht mehr hier geladen, sondern
// vom Arbeitsbereich (features/workspace/TabContent.tsx), seit die Legacy-Shell
// entfernt ist (Plan 023 B1).

// IDE-Workspace-Shell (Feature-Flag `workspace-shell`, Plan ide-workspace-shell)
//
// `lazyNachladen` und nicht `lazy` (D6): dieses Buendel wird genau EINMAL
// geholt, naemlich in dem Augenblick, in dem die Anmeldung durch ist. Geht die
// eine Anfrage daneben, sieht der Mensch nach richtigem Passwort eine
// Fehlerseite. Ein zweiter Versuch kostet eine halbe Sekunde.
const WorkspaceShell = lazyNachladen(() => import('./features/workspace'));

// Die Schauseite der Bibliothek (Phase H3). Sie steht unter einem
// Entwicklerpfad und in KEINEM Menue: sie ist fuer den, der eine App baut,
// nicht fuer den, der auf diesem Geraet arbeitet. Nachgeladen wie die Shell --
// sechsundzwanzig Primitive in allen Zustaenden gehoeren in kein Buendel, das
// jemand beim Anmelden holt.
const Schauseite = lazyNachladen(() => import('./features/entwickler/Schauseite'));

/**
 * Main App Component
 * PHASE 3: Wraps the application with providers (AuthProvider, DownloadProvider)
 */
function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

/**
 * App Content - Uses auth context and contains main app logic
 * PHASE 3: Separated from App to use hooks inside AuthProvider
 */
function AppContent(): React.JSX.Element | null {
  const api = useApi();
  const toast = useToast();
  const { user, isAuthenticated, loading: authLoading, login, logout } = useAuth();

  // First-run onboarding: null = still checking, true = box has no admin yet
  // (show CreateAdmin instead of Login), false = normal login.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  // Auto-update notification: poll /api/health every 5 min for build hash change
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialBuildHashRef = useRef<string | null>(null);
  const updateDismissedRef = useRef(0); // timestamp of last dismiss

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkVersion = async () => {
      // Don't re-show if dismissed less than 30 min ago
      if (updateDismissedRef.current && Date.now() - updateDismissedRef.current < 30 * 60 * 1000)
        return;
      try {
        const data = await api.get<{ build_hash?: string }>('/health', { showError: false });
        const hash = data.build_hash;
        if (!hash || hash === 'dev') return;
        if (!initialBuildHashRef.current) {
          initialBuildHashRef.current = hash;
        } else if (hash !== initialBuildHashRef.current) {
          setUpdateAvailable(true);
        }
      } catch {
        /* ignore */
      }
    };

    checkVersion();
    const id = setInterval(checkVersion, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Das Theme des Angemeldeten am Dokument (Phase H1). Der Hook wird hier
  // gehalten, weil `AppContent` die eine Komponente ist, die IMMER steht --
  // Anmeldung, Passwortwechsel und Shell hängen darunter. Ohne Sitzung ist es
  // die Vorgabe (hell); sobald die Sitzungsprobe geantwortet hat, steht der
  // Wert des Menschen da, und zwar bevor die Shell zum ersten Mal malt.
  useTheme();

  // P2.5.1: prevent the browser from navigating to a file when the user drops
  // it outside of a designated drop zone. Without this, a stray drop on the
  // sidebar / chat area unloads the SPA. Each component's own drop zone calls
  // preventDefault before this listener fires (React event bubbling reaches
  // the component first; window listener is fallback).
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  // P2.1.8 (post-review fix): capture deep-link target in a useEffect, not
  // during render body. This runs once when isAuthenticated flips to false,
  // captures the URL the user was on at that moment, and stores it for
  // handleLoginSuccess to replay.
  useEffect(() => {
    if (isAuthenticated) return;
    if (authLoading) return;
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/' && !sessionStorage.getItem('arasul_login_redirect')) {
      sessionStorage.setItem('arasul_login_redirect', currentPath);
    }
  }, [isAuthenticated, authLoading]);

  // First-run check (unauthenticated): does the box still need an admin?
  // Runs once on mount, before login, so we can show CreateAdmin instead of
  // the login screen on a freshly bootstrapped box.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ needsSetup: boolean }>('/auth/needs-setup', { showError: false })
      .then(d => {
        if (!cancelled) setNeedsSetup(d.needsSetup);
      })
      .catch(() => {
        // Old backend without the endpoint → assume an admin exists.
        if (!cancelled) setNeedsSetup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // HIER STAND DER EINRICHTUNGSASSISTENT (bis Phase D4, 28.08.2026).
  //
  // Nach der Anmeldung fragte die Oberfläche `GET /api/system/setup-status`
  // und schob dem Administrator einen Assistenten vor die Shell: Firma,
  // Branche, Teamgröße, Antwortstil, ein Modell. Jede dieser Fragen gehört
  // inzwischen woandershin — das Profil war das des Chats (seit B2 weg), die
  // Modellwahl ist seit C8 eine Kurzliste in der Ansicht „Modelle", und
  // Netzname, Startpasswort und Kit-Schlüssel nennt seit C10 der Bootstrap auf
  // der Konsole des Geräts. Übrig geblieben wäre ein Bildschirm, der
  // wiederholt, was der Bootstrap gerade gezeigt hat.
  //
  // Was BLEIBT, steht direkt darüber und darunter: `needsSetup` (hat das Gerät
  // überhaupt einen Administrator?) und der erzwungene Wechsel eines
  // Startpassworts (D1). Beides sind Zustände, keine Assistenten.

  // Handle login success - called from Login component
  const handleLoginSuccess = useCallback(
    (data: { user: { id: number; username: string }; token?: string }) => {
      login(data);
      // P2.1.8: Restore deep-link target after login. The Login component is
      // rendered outside <Router>, so we cannot useNavigate(); instead we
      // captured the original pathname before render and replay it via
      // window.location after login. window.location.replace avoids polluting
      // the history with the login screen.
      const redirect = sessionStorage.getItem('arasul_login_redirect');
      if (redirect) {
        sessionStorage.removeItem('arasul_login_redirect');
        if (redirect !== '/' && redirect !== window.location.pathname) {
          window.location.replace(redirect);
        }
      }
    },
    [login]
  );

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    if (authLoading || needsSetup === null) {
      return <Ladezustand meldung="Prüfe Authentifizierung..." ganzeSeite={true} />;
    }
    // Freshly bootstrapped box with no admin yet → first-run onboarding.
    if (needsSetup) {
      return <CreateAdmin onCreated={handleLoginSuccess} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Startpasswort wechseln, bevor irgendetwas anderes kommt (Phase D1).
  //
  // Vor dem Einrichtungsassistenten und vor der Shell: wer mit einem Passwort
  // angemeldet ist, das ein Zweiter kennt, soll das zuerst aendern und nicht
  // erst am Ende eines Assistenten. Die Sitzung selbst ist gueltig — das
  // Backend sperrt hier nichts, es sagt nur, was der Fall ist.
  if (user?.passwortWechselNoetig) {
    return (
      <PasswortWechseln
        onGewechselt={() => {
          // `POST /api/auth/change-password` entwertet alle Sitzungen des
          // Betroffenen. Eine neue Anmeldung ist deshalb keine Hoeflichkeit,
          // sondern der Zustand: der alte Token traegt nicht mehr.
          toast.success('Passwort geändert. Bitte melde dich neu an.');
          void logout();
        }}
        onAbmelden={() => {
          void logout();
        }}
      />
    );
  }

  return (
    <DownloadProvider>
      <ActivationProvider>
        <Router>
          {/* Update available banner (overlay) */}
          {updateAvailable && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground text-center py-1.5 text-sm font-medium flex items-center justify-center gap-3">
              <span>Update verfügbar, Seite neu laden</span>
              <button
                className="underline font-semibold hover:opacity-80"
                onClick={() => window.location.reload()}
              >
                Jetzt laden
              </button>
              <button
                type="button"
                aria-label="Update-Benachrichtigung schließen"
                className="ml-2 opacity-70 hover:opacity-100"
                onClick={() => {
                  setUpdateAvailable(false);
                  updateDismissedRef.current = Date.now();
                }}
              >
                ✕
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/workspace/*"
              element={
                <RouteErrorBoundary routeName="Workspace">
                  <Suspense
                    fallback={<Ladezustand meldung="Lade Workspace..." ganzeSeite={true} />}
                  >
                    <WorkspaceShell onLogout={handleLogout} />
                  </Suspense>
                </RouteErrorBoundary>
              }
            />
            {/* Plan 023 B1: die Legacy-Shell ist entfernt. Sie war nur über
                  getippte URLs erreichbar, hatte genau einen Menüeintrag und
                  keine Navigation zu fünf der sechs Einstellungsbereiche. Ihre
                  Routen zeigen jetzt in den Arbeitsbereich, der dieselben
                  Inhalte als Tab kennt. Suchparameter bleiben erhalten, damit
                  Deep-Links wie /settings?tab=remote-access weiter funktionieren. */}
            {/* Die Schauseite der Bibliothek (H3). Hinter der Anmeldung, weil
                  sie auf einem Geraet im Firmennetz steht; in keinem Menue,
                  weil sie niemandem hier bei der Arbeit hilft. */}
            <Route
              path="/entwickler/bausteine"
              element={
                <RouteErrorBoundary routeName="Bausteine">
                  <Suspense
                    fallback={<Ladezustand meldung="Lade Bausteine..." ganzeSeite={true} />}
                  >
                    <Schauseite />
                  </Suspense>
                </RouteErrorBoundary>
              }
            />
            <Route path="/" element={<InDenArbeitsbereich ziel="" />} />
            <Route path="/settings" element={<InDenArbeitsbereich ziel="/settings" />} />
            <Route path="/store/*" element={<InDenArbeitsbereich ziel="/store" />} />
            {/* /terminal, /sandbox, /data und /documents zeigten auf Terminal
                  und Explorer; beides ist mit B2 gefallen, die Adressen sind
                  unbekannt. */}
            <Route path="*" element={<NichtGefunden />} />
          </Routes>
        </Router>
      </ActivationProvider>
    </DownloadProvider>
  );
}

/**
 * Leitet eine Alt-Route in den Arbeitsbereich um und nimmt Suchparameter und
 * Anker mit. Ohne das bräche `/settings?tab=remote-access`, das genau ein
 * Bereich der Einstellungen auswertet.
 */
export function InDenArbeitsbereich({ ziel }: { ziel: string }): React.JSX.Element {
  const location = useLocation();
  return <Navigate to={`/workspace${ziel}${location.search}${location.hash}`} replace />;
}

export default App;
