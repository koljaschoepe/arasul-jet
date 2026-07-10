import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// PHASE 2: Code-Splitting - Synchronous imports for critical components
import Login from './features/system/Login';
import CreateAdmin from './features/system/CreateAdmin';
import ErrorBoundary, { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { SkeletonCard, SkeletonText } from './components/ui/Skeleton';
import { Button } from './components/ui/shadcn/button';
import SetupWizard from './features/system/SetupWizard';
import DashboardHome from './features/dashboard/DashboardHome';

// PHASE 3: State Management - Contexts and Hooks
import { DownloadProvider } from './contexts/DownloadContext';
import { ActivationProvider } from './contexts/ActivationContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ChatProvider } from './contexts/ChatContext';

import { useApi } from './hooks/useApi';
import { useTheme } from './hooks/useTheme';
import { useDashboardData } from './hooks/useDashboardData';
import { isWorkspaceShellEnabled } from './lib/featureFlags';
import { SidebarWithDownloads } from './components/layout/Sidebar';
import './index.css';

// Eager imports for primary routes (needed immediately or on first render)
import ChatRouter from './features/chat/ChatRouter';

// PHASE 2: Code-Splitting - Lazy imports for secondary route components
// These components are loaded on-demand when the user navigates to them
const Settings = lazy(() => import('./features/settings/Settings'));
const DocumentManager = lazy(() => import('./features/documents/DocumentManager'));
const Store = lazy(() => import('./features/store'));
const SandboxApp = lazy(() => import('./features/sandbox'));
const TelegramBotPage = lazy(() => import('./features/telegram/TelegramBotPage'));
const DatabaseOverview = lazy(() => import('./features/database/DatabaseOverview'));
const DatabaseTable = lazy(() => import('./features/database/DatabaseTable'));

// IDE-Workspace-Shell (Feature-Flag `workspace-shell`, Plan ide-workspace-shell)
const WorkspaceShell = lazy(() => import('./features/workspace'));

interface ThemeControls {
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
}

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
        <ChatProvider isAuthenticated={isAuthenticated}>
          <Router>
            {/* Update available banner (overlay, gilt für alte UI und Workspace) */}
            {updateAvailable && (
              <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground text-center py-1.5 text-sm font-medium flex items-center justify-center gap-3">
                <span>Update verfügbar — Seite neu laden</span>
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
              <Route
                path="*"
                element={
                  <LegacyOrWorkspaceRedirect
                    isAuthenticated={isAuthenticated}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onLogout={handleLogout}
                  />
                }
              />
            </Routes>
          </Router>
        </ChatProvider>
      </ActivationProvider>
    </DownloadProvider>
  );
}

interface LegacyAppContentProps extends ThemeControls {
  isAuthenticated: boolean;
}

/**
 * Review-Fix (Critical): Bei aktivem Workspace-Flag darf ein Besuch von "/"
 * die Legacy-UI (inkl. der 7 Dashboard-Fetches und des Fullscreen-Spinners)
 * gar nicht erst mounten — der Redirect nach /workspace passiert davor.
 */
function LegacyOrWorkspaceRedirect(props: LegacyAppContentProps): React.JSX.Element {
  const location = useLocation();
  if (isWorkspaceShellEnabled() && location.pathname === '/') {
    return <Navigate to="/workspace" replace />;
  }
  return <LegacyAppContent {...props} />;
}

/**
 * Die bisherige Sidebar-UI (Fallback zur Workspace-Shell). Rendert für alle
 * Routen außer /workspace/* und bleibt funktional unverändert — sie ist der
 * Sekunden-Fallback, falls die neue Shell Probleme macht.
 */
function LegacyAppContent({
  isAuthenticated,
  theme,
  onToggleTheme,
  onLogout,
}: LegacyAppContentProps): React.JSX.Element {
  const {
    metrics,
    metricsHistory,
    services,
    systemInfo,
    networkInfo,
    runningApps,
    thresholds,
    deviceInfo,
    loading,
    error,
    formatChartData,
    retry,
  } = useDashboardData(isAuthenticated);

  // Sidebar collapsed state - persisted in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('arasul_sidebar_collapsed');
      return saved ? JSON.parse(saved) : false;
    } catch {
      localStorage.removeItem('arasul_sidebar_collapsed');
      return false;
    }
  });

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev: boolean) => {
      const newState = !prev;
      localStorage.setItem('arasul_sidebar_collapsed', JSON.stringify(newState));
      return newState;
    });
  }, []);

  // Apply sidebar state class to body (for components like markdown editor overlay)
  useEffect(() => {
    document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    document.body.classList.add(sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
  }, [sidebarCollapsed]);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  if (loading) {
    return <LoadingSpinner message="Lade Dashboard..." fullscreen={true} />;
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Fehler beim Laden</h2>
          <p className="error-text">{error}</p>
          <Button
            type="button"
            variant="solid"
            size="lg"
            onClick={retry}
            className="mt-2 font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* PHASE 5: Skip-to-content link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Zum Hauptinhalt springen
      </a>

      <SidebarWithDownloads collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Network offline banner */}
      {metrics?.network && !metrics.network.online && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-muted border-b border-border text-foreground text-center py-1.5 text-sm font-medium">
          Keine Internetverbindung
        </div>
      )}

      <div
        className="app-content animate-in fade-in duration-150"
        id="main-content"
        role="main"
        tabIndex={-1}
        ref={(el: HTMLDivElement | null) => {
          if (el && window.location.hash === '#main-content') el.focus();
        }}
      >
        {/* PHASE 2: Suspense wrapper for lazy-loaded route components */}
        <Suspense
          fallback={
            <div className="flex flex-col gap-6 p-6 animate-in fade-in">
              <SkeletonText lines={2} width="40%" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard hasAvatar={false} lines={3} />
                <SkeletonCard hasAvatar={false} lines={3} />
              </div>
            </div>
          }
        >
          <Routes>
            <Route
              path="/"
              element={
                <RouteErrorBoundary routeName="Dashboard">
                  <DashboardHome
                    metrics={metrics}
                    metricsHistory={metricsHistory}
                    services={services}
                    systemInfo={systemInfo}
                    networkInfo={networkInfo}
                    runningApps={runningApps}
                    formatChartData={formatChartData}
                    thresholds={thresholds}
                    deviceInfo={deviceInfo}
                  />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/settings"
              element={
                <RouteErrorBoundary routeName="Einstellungen">
                  <Settings handleLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/chat/*"
              element={
                <RouteErrorBoundary routeName="AI Chat">
                  <ChatRouter />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/data"
              element={
                <RouteErrorBoundary routeName="Dokumente">
                  <DocumentManager />
                </RouteErrorBoundary>
              }
            />
            <Route path="/documents" element={<Navigate to="/data" replace />} />
            <Route
              path="/store/*"
              element={
                <RouteErrorBoundary routeName="Store">
                  <Store />
                </RouteErrorBoundary>
              }
            />
            <Route path="/claude-code" element={<Navigate to="/terminal" replace />} />
            <Route path="/sandbox" element={<Navigate to="/terminal" replace />} />
            <Route
              path="/terminal"
              element={
                <RouteErrorBoundary routeName="Terminal">
                  <SandboxApp />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/telegram-bot"
              element={
                <RouteErrorBoundary routeName="Telegram Bot">
                  <TelegramBotPage />
                </RouteErrorBoundary>
              }
            />
            <Route path="/telegram-bots" element={<Navigate to="/telegram-bot" replace />} />
            <Route
              path="/database"
              element={
                <RouteErrorBoundary routeName="Datenbank">
                  <DatabaseOverview />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/database/:slug"
              element={
                <RouteErrorBoundary routeName="Datentabelle">
                  <DatabaseTable />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="*"
              element={
                <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                  <h1 className="text-7xl font-bold m-0 text-foreground">404</h1>
                  <p className="text-lg mt-2">Seite nicht gefunden</p>
                  <Link
                    to="/"
                    className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg no-underline hover:opacity-90 transition-opacity"
                  >
                    Zum Dashboard
                  </Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default App;
