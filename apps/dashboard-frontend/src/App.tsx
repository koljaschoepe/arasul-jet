import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// PHASE 2: Code-Splitting - Synchronous imports for critical components
import Login from './features/system/Login';
import CreateAdmin from './features/system/CreateAdmin';
import ErrorBoundary, { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import NichtGefunden from './components/ui/NichtGefunden';
import LoadingSpinner from './components/ui/LoadingSpinner';
import SetupWizard from './features/system/SetupWizard';

// PHASE 3: State Management - Contexts and Hooks
import { DownloadProvider } from './contexts/DownloadContext';
import { ActivationProvider } from './contexts/ActivationContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

import { useApi } from './hooks/useApi';
import { useTheme } from './hooks/useTheme';
import './index.css';

// Einstellungen und Store werden nicht mehr hier geladen, sondern
// vom Arbeitsbereich (features/workspace/TabContent.tsx), seit die Legacy-Shell
// entfernt ist (Plan 023 B1).

// IDE-Workspace-Shell (Feature-Flag `workspace-shell`, Plan ide-workspace-shell)
const WorkspaceShell = lazy(() => import('./features/workspace'));

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
  const { isAuthenticated, loading: authLoading, login, logout } = useAuth();

  // Setup wizard state
  const [, setSetupComplete] = useState<boolean | null>(null); // null = loading, true/false = known
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
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

  // Theme: useTheme hook handles localStorage, system preference, and DOM classes
  const { theme, toggleTheme } = useTheme();

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

  // Check setup wizard status after login
  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    const checkSetupStatus = async () => {
      try {
        const data = await api.get<{ setupComplete?: boolean }>('/system/setup-status', {
          signal: controller.signal,
          showError: false,
        });
        const isComplete = data.setupComplete === true;
        setSetupComplete(isComplete);
        if (!isComplete) {
          setShowSetupWizard(true);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        // If endpoint doesn't exist (old backend), assume setup is complete
        setSetupComplete(true);
      }
    };

    checkSetupStatus();
    return () => controller.abort();
  }, [isAuthenticated, api]);

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
      return <LoadingSpinner message="Prüfe Authentifizierung..." fullscreen={true} />;
    }
    // Freshly bootstrapped box with no admin yet → first-run onboarding.
    if (needsSetup) {
      return <CreateAdmin onCreated={handleLoginSuccess} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Show setup wizard if setup is not complete
  if (showSetupWizard) {
    return (
      <DownloadProvider>
        <ActivationProvider>
          <SetupWizard
            onComplete={() => {
              setShowSetupWizard(false);
              setSetupComplete(true);
            }}
            onSkip={() => {
              setShowSetupWizard(false);
              setSetupComplete(true);
            }}
          />
        </ActivationProvider>
      </DownloadProvider>
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
                    fallback={<LoadingSpinner message="Lade Workspace..." fullscreen={true} />}
                  >
                    <WorkspaceShell
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      onLogout={handleLogout}
                    />
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
