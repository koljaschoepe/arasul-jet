import React, { useEffect, useCallback } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Login from './features/system/Login';
import LoadingSpinner from './components/ui/LoadingSpinner';
import SetupWizard from './features/system/SetupWizard';
import { DownloadProvider } from './contexts/DownloadContext';
import { ActivationProvider } from './contexts/ActivationContext';
import { useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { useWebSocketMetrics } from './hooks/useWebSocketMetrics';
import { useDashboardData, type Metrics } from './hooks/useDashboardData';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { useSidebarState } from './hooks/useSidebarState';
import { useSetupGate } from './hooks/useSetupGate';
import { useTheme } from './hooks/useTheme';
import { useEvictionWatcher } from './hooks/useEvictionWatcher';
import { SidebarWithDownloads } from './components/layout/Sidebar';
import { Button } from '@/components/ui/shadcn/button';
import KeyboardShortcutsLegend from './components/KeyboardShortcutsLegend';
import AppRoutes from './AppRoutes';

// Tiny mount-once component for the eviction watcher (Phase 2.5). Lives
// inside the provider tree so it has access to ToastContext.
function EvictionWatcher(): null {
  useEvictionWatcher();
  return null;
}

function AppShell(): React.JSX.Element | null {
  const { isAuthenticated, loading: authLoading, login, logout } = useAuth();
  const { collapsed, toggle } = useSidebarState();
  const { theme, toggleTheme } = useTheme();
  const { showSetupWizard, closeSetupWizard } = useSetupGate(isAuthenticated);
  const { updateAvailable, dismissUpdate } = useUpdateChecker(isAuthenticated);
  const {
    metrics,
    metricsHistory,
    runningApps,
    thresholds,
    deviceInfo,
    loading,
    error,
    setMetrics,
    refetch,
    clearError,
  } = useDashboardData(isAuthenticated);
  const { metrics: wsMetrics } = useWebSocketMetrics(isAuthenticated);

  useEffect(() => {
    if (wsMetrics) setMetrics(wsMetrics as unknown as Metrics);
  }, [wsMetrics, setMetrics]);

  const handleLoginSuccess = useCallback(
    (data: { user: { id: number; username: string }; token?: string }) => {
      login(data);
    },
    [login]
  );

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  if (!isAuthenticated) {
    if (authLoading) {
      return <LoadingSpinner message="Prüfe Authentifizierung..." fullscreen={true} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (loading && !showSetupWizard) {
    return <LoadingSpinner message="Lade Dashboard..." fullscreen={true} />;
  }

  if (showSetupWizard) {
    return (
      <DownloadProvider>
        <ActivationProvider>
          <SetupWizard onComplete={closeSetupWizard} onSkip={closeSetupWizard} />
        </ActivationProvider>
      </DownloadProvider>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Fehler beim Laden</h2>
          <p className="error-text">{error}</p>
          <Button
            variant="solid"
            onClick={() => {
              clearError();
              refetch();
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DownloadProvider>
      <ActivationProvider>
        <ChatProvider isAuthenticated={isAuthenticated}>
          <Router>
            <div className="app">
              <a href="#main-content" className="skip-to-content">
                Zum Hauptinhalt springen
              </a>

              <EvictionWatcher />
              <KeyboardShortcutsLegend />

              <SidebarWithDownloads collapsed={collapsed} onToggle={toggle} />

              {metrics?.network && !metrics.network.online && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-muted border-b border-border text-foreground text-center py-1.5 text-sm font-medium">
                  Keine Internetverbindung
                </div>
              )}

              {updateAvailable && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground text-center py-1.5 text-sm font-medium flex items-center justify-center gap-3">
                  <span>Update verfügbar — Seite neu laden</span>
                  <Button
                    variant="link"
                    size="xs"
                    className="text-primary-foreground underline font-semibold h-auto p-0 hover:opacity-80"
                    onClick={() => window.location.reload()}
                  >
                    Jetzt laden
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-primary-foreground opacity-70 hover:opacity-100 hover:bg-transparent"
                    onClick={dismissUpdate}
                    aria-label="Update-Hinweis schließen"
                  >
                    ✕
                  </Button>
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
                <AppRoutes
                  metrics={metrics}
                  metricsHistory={metricsHistory}
                  runningApps={runningApps}
                  thresholds={thresholds}
                  deviceInfo={deviceInfo}
                  handleLogout={handleLogout}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              </div>
            </div>
          </Router>
        </ChatProvider>
      </ActivationProvider>
    </DownloadProvider>
  );
}

export default AppShell;
