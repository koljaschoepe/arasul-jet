import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Cpu,
  HardDrive,
  Activity,
  Thermometer,
  Monitor,
  Zap,
  Database,
  ExternalLink,
  Code,
  GitBranch,
  Box,
  Terminal,
  Send,
} from 'lucide-react';

// PHASE 2: Code-Splitting - Synchronous imports for critical components
import Login from './features/system/Login';
import ErrorBoundary, {
  RouteErrorBoundary,
  ComponentErrorBoundary,
} from './components/ui/ErrorBoundary';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { SkeletonCard, SkeletonText } from './components/ui/Skeleton';
import SetupWizard from './features/system/SetupWizard';

// PHASE 3: State Management - Contexts and Hooks
import { DownloadProvider } from './contexts/DownloadContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ChatProvider } from './contexts/ChatContext';
import { useWebSocketMetrics } from './hooks/useWebSocketMetrics';

import { useApi } from './hooks/useApi';
import { useTheme } from './hooks/useTheme';
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
const TelegramAppModal = lazy(() => import('./features/telegram/TelegramAppModal'));
const DatabaseOverview = lazy(() => import('./features/database/DatabaseOverview'));
const DatabaseTable = lazy(() => import('./features/database/DatabaseTable'));
const ModelStatusBar = lazy(() => import('./features/dashboard/ModelStatusBar'));

// ---- Type definitions ----

interface TelegramRedirectProps {
  onOpen: () => void;
}

interface MetricsDisk {
  used: number;
  free: number;
  percent: number;
}

interface Metrics {
  cpu: number;
  ram: number;
  gpu: number;
  temperature: number;
  temp: number;
  disk: MetricsDisk;
}

interface MetricsHistory {
  timestamps: string[];
  cpu: (number | null)[];
  ram: (number | null)[];
  gpu: (number | null)[];
  temperature: (number | null)[];
}

interface ServiceStatus {
  status: string;
}

interface Services {
  llm: ServiceStatus;
  embeddings: ServiceStatus;
}

interface SystemInfo {
  uptime_seconds: number;
  version: string;
  hostname: string;
}

interface NetworkInfo {
  internet_reachable: boolean;
}

interface RunningApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: string;
  hasCustomPage?: boolean;
  customPageRoute?: string;
  ports?: { external?: number };
}

interface ThresholdPair {
  warning: number;
  critical: number;
}

interface Thresholds {
  cpu: ThresholdPair;
  ram: ThresholdPair;
  gpu: ThresholdPair;
  storage: ThresholdPair;
  temperature: ThresholdPair;
  [key: string]: ThresholdPair;
}

interface DeviceInfo {
  name: string;
  total_memory_gb?: number;
  cpu_cores?: number;
  type?: string;
}

interface ChartDataPoint {
  timestamp: number;
  time: string;
  hour: number;
  CPU: number | null;
  RAM: number | null;
  GPU: number | null;
  Temp: number | null;
}

interface DashboardHomeProps {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  services: Services | null;
  systemInfo: SystemInfo | null;
  networkInfo: NetworkInfo | null;
  runningApps: RunningApp[];
  formatChartData: () => ChartDataPoint[];
  formatUptime: (seconds: number) => string;
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
}

/**
 * Main App Component
 * PHASE 3: Wraps the application with providers (AuthProvider, DownloadProvider)
 */
function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

/**
 * TelegramRedirect - Navigates to home and opens Telegram modal
 */
function TelegramRedirect({ onOpen }: TelegramRedirectProps): null {
  const navigate = useNavigate();
  useEffect(() => {
    onOpen();
    navigate('/', { replace: true });
  }, [onOpen, navigate]);
  return null;
}

/**
 * App Content - Uses auth context and contains main app logic
 * PHASE 3: Separated from App to use hooks inside AuthProvider
 */
function AppContent(): React.JSX.Element | null {
  const api = useApi();
  const { isAuthenticated, loading: authLoading, login, logout } = useAuth();

  // Setup wizard state
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null); // null = loading, true/false = known
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);

  // Dashboard state
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);

  // PHASE 3: Use WebSocket hook for real-time metrics
  const { metrics: wsMetrics } = useWebSocketMetrics(isAuthenticated);

  // Local metrics state (updated by WebSocket or initial fetch)
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // Update metrics from WebSocket
  useEffect(() => {
    if (wsMetrics) {
      setMetrics(wsMetrics);
    }
  }, [wsMetrics]);

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
        const resp = await fetch('/api/health');
        if (!resp.ok) return;
        const data = await resp.json();
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

  // Theme: useTheme hook handles localStorage, system preference, and DOM classes
  const { theme, toggleTheme } = useTheme();

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

  // Fetch initial dashboard data
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAuthenticated) return;

      try {
        const opts = { signal, showError: false };
        const results = await Promise.allSettled([
          api.get('/metrics/live', opts),
          api.get('/metrics/history?range=24h', opts),
          api.get('/services', opts),
          api.get('/system/info', opts),
          api.get('/system/network', opts),
          api.get('/apps?status=running,installed', opts),
          api.get('/system/thresholds', opts),
        ]);

        const val = (i: number): unknown =>
          results[i].status === 'fulfilled'
            ? (results[i] as PromiseFulfilledResult<unknown>).value
            : null;

        if (val(0)) setMetrics(val(0));
        if (val(1)) setMetricsHistory(val(1));
        if (val(2)) setServices(val(2));
        if (val(3)) setSystemInfo(val(3));
        if (val(4)) setNetworkInfo(val(4));
        if (val(5)) setRunningApps(val(5).apps || []);
        if (val(6)) {
          setThresholds(val(6).thresholds);
          setDeviceInfo(val(6).device);
        }

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
          console.warn(`${failedCount} of ${results.length} dashboard requests failed`);
        }
        // Only show error if ALL requests failed
        if (failedCount === results.length) {
          setError('Alle Dashboard-Daten konnten nicht geladen werden');
        } else {
          setError(null);
        }
        setLoading(false);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        setLoading(false);
      }
    },
    [isAuthenticated, api]
  );

  // Fetch data on auth change and setup refresh interval
  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    fetchData(controller.signal);

    // Refresh non-metric data every 30 seconds
    const interval = setInterval(() => {
      fetchData(controller.signal);
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchData, isAuthenticated]);

  // Check setup wizard status after login
  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    const checkSetupStatus = async () => {
      try {
        const data = await api.get('/system/setup-status', {
          signal: controller.signal,
          showError: false,
        });
        const isComplete = data.setupComplete;
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

  // PHASE 2: Memoize utility functions with useCallback
  const formatUptime = useCallback((seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }, []);

  const formatChartData = useCallback((): ChartDataPoint[] => {
    if (!metricsHistory?.timestamps || !Array.isArray(metricsHistory.timestamps)) return [];

    return metricsHistory.timestamps.map((timestamp: string, index: number) => ({
      timestamp: new Date(timestamp).getTime(),
      time: new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      hour: new Date(timestamp).getHours(),
      CPU: metricsHistory.cpu?.[index] ?? null,
      RAM: metricsHistory.ram?.[index] ?? null,
      GPU: metricsHistory.gpu?.[index] ?? null,
      Temp: metricsHistory.temperature?.[index] ?? null,
    }));
  }, [metricsHistory]);

  // Handle login success - called from Login component
  const handleLoginSuccess = useCallback(
    (data: { user: { id: number; username: string }; token?: string }) => {
      login(data);
      setLoading(true);
    },
    [login]
  );

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Memoize TelegramRedirect callback to prevent useEffect re-runs
  const handleTelegramOpen = useCallback(() => setShowTelegramModal(true), []);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    if (authLoading) {
      return <LoadingSpinner message="Prüfe Authentifizierung..." fullscreen={true} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (loading && !showSetupWizard) {
    return <LoadingSpinner message="Lade Dashboard..." fullscreen={true} />;
  }

  // Show setup wizard if setup is not complete
  if (showSetupWizard) {
    return (
      <DownloadProvider>
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
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchData();
            }}
            className="btn-retry"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <DownloadProvider>
      <ChatProvider isAuthenticated={isAuthenticated}>
        <Router>
          <div className="app">
            {/* PHASE 5: Skip-to-content link for keyboard navigation */}
            <a href="#main-content" className="skip-to-content">
              Zum Hauptinhalt springen
            </a>

            <SidebarWithDownloads collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

            {/* Network offline banner */}
            {metrics &&
              (metrics as Record<string, unknown>).network &&
              !((metrics as Record<string, unknown>).network as Record<string, unknown>)
                ?.online && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-muted border-b border-border text-foreground text-center py-1.5 text-sm font-medium">
                  Keine Internetverbindung
                </div>
              )}

            {/* Update available banner */}
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
                          formatUptime={formatUptime}
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
                        <Settings
                          handleLogout={handleLogout}
                          theme={theme}
                          onToggleTheme={toggleTheme}
                        />
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
                  <Route path="/claude-code" element={<Navigate to="/sandbox" replace />} />
                  <Route
                    path="/sandbox"
                    element={
                      <RouteErrorBoundary routeName="Sandbox">
                        <SandboxApp />
                      </RouteErrorBoundary>
                    }
                  />
                  <Route
                    path="/telegram-bot"
                    element={<TelegramRedirect onOpen={handleTelegramOpen} />}
                  />
                  <Route
                    path="/telegram-bots"
                    element={<TelegramRedirect onOpen={handleTelegramOpen} />}
                  />
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
        </Router>

        {/* Telegram App Modal */}
        {showTelegramModal && (
          <Suspense fallback={null}>
            <ComponentErrorBoundary componentName="Telegram App">
              <TelegramAppModal
                isOpen={showTelegramModal}
                onClose={() => setShowTelegramModal(false)}
              />
            </ComponentErrorBoundary>
          </Suspense>
        )}
      </ChatProvider>
    </DownloadProvider>
  );
}

// PHASE 2: Memoize DashboardHome to prevent re-renders when props haven't changed
const DashboardHome = React.memo(function DashboardHome({
  metrics,
  metricsHistory,
  services,
  systemInfo,
  networkInfo,
  runningApps,
  formatChartData,
  formatUptime,
  thresholds,
  deviceInfo,
}: DashboardHomeProps): React.JSX.Element {
  // Default thresholds if not loaded yet
  const defaultThresholds: Thresholds = {
    cpu: { warning: 70, critical: 90 },
    ram: { warning: 70, critical: 90 },
    gpu: { warning: 80, critical: 95 },
    storage: { warning: 70, critical: 85 },
    temperature: { warning: 65, critical: 80 },
  };

  const t = thresholds || defaultThresholds;

  // Helper function to get status info based on value and metric thresholds
  const getStatusInfo = (value: number, metric: string): { status: string; className: string } => {
    const threshold = t[metric];
    if (!threshold) return { status: 'Normal', className: 'stat-change-positive' };

    if (value >= threshold.critical) {
      return { status: 'Critical', className: 'stat-change-negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warning', className: 'stat-change-warning' };
    }
    return { status: 'Normal', className: 'stat-change-positive' };
  };

  // Temperature-specific status labels
  const getTempStatusInfo = (value: number): { status: string; className: string } => {
    const threshold = t.temperature;
    if (value >= threshold.critical) {
      return { status: 'Hot', className: 'stat-change-negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warm', className: 'stat-change-warning' };
    }
    return { status: 'Normal', className: 'stat-change-positive' };
  };

  // Chart zoom state - persisted to localStorage
  const [chartTimeRange, setChartTimeRange] = useState<number>(() => {
    const saved = localStorage.getItem('arasul_chart_time_range');
    return saved ? Number(saved) : 24;
  }); // hours

  // Persist chartTimeRange changes
  useEffect(() => {
    localStorage.setItem('arasul_chart_time_range', String(chartTimeRange));
  }, [chartTimeRange]);
  const timeRangeOptions: number[] = [1, 6, 12, 24];

  // Tick interval in ms per time range
  const tickIntervalMs: Record<number, number> = {
    1: 10 * 60 * 1000, // 10 min
    6: 60 * 60 * 1000, // 1h
    12: 2 * 60 * 60 * 1000, // 2h
    24: 4 * 60 * 60 * 1000, // 4h
  };

  // Memoized chart data - only recalculate when data or timeRange changes
  const chartData = useMemo((): ChartDataPoint[] => {
    const allData = formatChartData();
    if (!allData.length) return [];

    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    return allData.filter(d => d.timestamp >= cutoff);
  }, [formatChartData, chartTimeRange]);

  // Generate clean tick values aligned to round intervals
  const chartTicks = useMemo((): number[] => {
    if (!chartData.length) return [];
    const interval = tickIntervalMs[chartTimeRange] || 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    // Start from first round interval after cutoff
    const firstTick = Math.ceil(cutoff / interval) * interval;
    const ticks: number[] = [];
    for (let t = firstTick; t <= now; t += interval) {
      ticks.push(t);
    }
    return ticks;
  }, [chartData, chartTimeRange]);

  // Icon mapping for apps
  const getAppIcon = (iconName: string): React.JSX.Element => {
    const icons: Record<string, React.ComponentType<{ className?: string }>> = {
      FiZap: Zap,
      FiDatabase: Database,
      FiCode: Code,
      FiGitBranch: GitBranch,
      FiBox: Box,
      FiTerminal: Terminal,
      FiSend: Send,
    };
    const IconComponent = icons[iconName] || Box;
    return <IconComponent className="service-link-icon" />;
  };

  // Get app URL based on port or traefik route
  const getAppUrl = (app: RunningApp): string => {
    // Apps with custom pages should link internally
    if (app.hasCustomPage && app.customPageRoute) {
      return app.customPageRoute;
    }
    // Apps routed through Traefik path (use same origin, no port)
    const traefikPaths: Record<string, string> = {
      n8n: '/n8n',
    };
    if (traefikPaths[app.id]) {
      return `${window.location.origin}${traefikPaths[app.id]}`;
    }
    // Use external port if available
    if (app.ports?.external) {
      return `http://${window.location.hostname}:${app.ports.external}`;
    }
    // Fallback to known ports for direct access
    const knownPorts: Record<string, number> = {
      minio: 9001,
      'code-server': 8443,
      gitea: 3002,
    };
    if (knownPorts[app.id]) {
      return `http://${window.location.hostname}:${knownPorts[app.id]}`;
    }
    return '#';
  };

  // Check if app link should be internal (React Router) or external
  const isInternalLink = (app: RunningApp): boolean => {
    return !!(app.hasCustomPage && app.customPageRoute);
  };
  // Dynamic progress color based on thresholds
  const getProgressColor = (value: number, metric: string = 'cpu'): string => {
    const threshold = t[metric] || { warning: 70, critical: 90 };
    if (value >= threshold.critical) return 'var(--danger-color)';
    if (value >= threshold.warning) return 'var(--warning-color)';
    return 'var(--primary-color)';
  };

  const formatBytes = (bytes: number): string => {
    return (bytes / 1024 / 1024 / 1024).toFixed(0);
  };

  const totalDisk = (metrics?.disk?.used || 0) + (metrics?.disk?.free || 0);
  const usedDisk = metrics?.disk?.used || 0;

  return (
    <>
      {/* Top Stats Row */}
      <div className="stats-top-row">
        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <Cpu className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">CPU USAGE</div>
            <div className="stat-value-large">
              {metrics?.cpu?.toFixed(1) || 0}
              <span className="stat-unit">%</span>
            </div>
            <div className={`stat-change ${getStatusInfo(metrics?.cpu || 0, 'cpu').className}`}>
              {getStatusInfo(metrics?.cpu || 0, 'cpu').status}
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <Activity className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">RAM USAGE</div>
            <div className="stat-value-large">
              {metrics?.ram?.toFixed(1) || 0}
              <span className="stat-unit">%</span>
            </div>
            {deviceInfo?.total_memory_gb ? (
              <div className="stat-sublabel">
                {(((metrics?.ram || 0) / 100) * deviceInfo.total_memory_gb).toFixed(1)} /{' '}
                {deviceInfo.total_memory_gb} GB
              </div>
            ) : (
              <div className={`stat-change ${getStatusInfo(metrics?.ram || 0, 'ram').className}`}>
                {getStatusInfo(metrics?.ram || 0, 'ram').status}
              </div>
            )}
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <HardDrive className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">STORAGE</div>
            <div className="stat-value-large">
              {metrics?.disk?.percent?.toFixed(0) || 0}
              <span className="stat-unit">%</span>
            </div>
            <div className="storage-bar-container">
              <div
                className="storage-bar-fill"
                style={{
                  width: `${metrics?.disk?.percent || 0}%`,
                  background: getProgressColor(metrics?.disk?.percent || 0, 'storage'),
                }}
              />
            </div>
            <div className="stat-sublabel">
              {formatBytes(usedDisk)} / {formatBytes(totalDisk)} GB
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <Monitor className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">GPU USAGE</div>
            <div className="stat-value-large">
              {metrics?.gpu?.toFixed(1) || 0}
              <span className="stat-unit">%</span>
            </div>
            <div className={`stat-change ${getStatusInfo(metrics?.gpu || 0, 'gpu').className}`}>
              {getStatusInfo(metrics?.gpu || 0, 'gpu').status}
            </div>
            {(metrics?.temperature ?? 0) > 0 && (
              <div className="stat-temp-inline">
                <Thermometer size={12} /> {metrics!.temperature.toFixed(0)}°C
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Installed Apps - Dynamic */}
      {runningApps && runningApps.length > 0 && (
        <div className="service-links-modern">
          {runningApps
            ?.filter((app: RunningApp) => app.status === 'running' && app.id !== 'minio')
            .map((app: RunningApp) => {
              const url = getAppUrl(app);
              if (isInternalLink(app)) {
                return (
                  <Link key={app.id} to={url} className="service-link-card">
                    <div className="service-link-icon-wrapper">{getAppIcon(app.icon)}</div>
                    <div className="service-link-content">
                      <div className="service-link-name">{app.name}</div>
                      <div className="service-link-description">{app.description}</div>
                    </div>
                    <ExternalLink className="service-link-arrow" />
                  </Link>
                );
              }
              if (url === '#') {
                return (
                  <div key={app.id} className="service-link-card service-link-unavailable">
                    <div className="service-link-icon-wrapper">{getAppIcon(app.icon)}</div>
                    <div className="service-link-content">
                      <div className="service-link-name">{app.name}</div>
                      <div className="service-link-description">{app.description}</div>
                    </div>
                    <span className="service-link-badge-unavailable">Nicht verfügbar</span>
                  </div>
                );
              }
              return (
                <a
                  key={app.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="service-link-card"
                >
                  <div className="service-link-icon-wrapper">{getAppIcon(app.icon)}</div>
                  <div className="service-link-content">
                    <div className="service-link-name">{app.name}</div>
                    <div className="service-link-description">{app.description}</div>
                  </div>
                  <ExternalLink className="service-link-arrow" />
                </a>
              );
            })}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* 24h Performance Chart */}
        <div className="dashboard-card dashboard-card-large">
          <div className="chart-header">
            <h3 className="dashboard-card-title">Performance</h3>
            <div className="chart-zoom-controls">
              {timeRangeOptions.map((hours: number) => (
                <button
                  key={hours}
                  type="button"
                  className={`chart-zoom-btn ${chartTimeRange === hours ? 'active' : ''}`}
                  onClick={() => setChartTimeRange(hours)}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={chartData}
              role="img"
              aria-label={`Performance-Diagramm der letzten ${chartTimeRange} Stunden: CPU, RAM und GPU`}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--primary-alpha-10)" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={chartTicks}
                tickFormatter={(ts: number) =>
                  new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                }
                stroke="var(--text-muted)"
                tick={{ fill: 'var(--text-muted)', fontSize: '0.75rem' }}
                axisLine={{ stroke: 'var(--text-muted)' }}
                tickLine={{ stroke: 'var(--text-muted)' }}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fill: 'var(--text-muted)', fontSize: '0.75rem' }}
                axisLine={{ stroke: 'var(--text-muted)' }}
                tickLine={{ stroke: 'var(--text-muted)' }}
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
                  border: '1px solid var(--primary-alpha-30)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                }}
                labelStyle={{ color: 'var(--primary-color)', fontWeight: 600 }}
                labelFormatter={(ts: number) =>
                  new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                }
                formatter={(value: number, name: string) => {
                  return [`${value?.toFixed(1)}%`, name];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="CPU"
                stroke="var(--primary-color)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="RAM"
                stroke="#A78BFA"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="GPU"
                stroke="#22C55E"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          {/* Screen-reader summary for chart data */}
          <div className="sr-only" role="status">
            {metrics && (
              <>
                CPU: {metrics.cpu?.toFixed(1)}%, RAM: {metrics.ram?.toFixed(1)}%, GPU:{' '}
                {metrics.gpu?.toFixed(1)}%
              </>
            )}
          </div>
        </div>

        {/* Model Status Bar - 40% width */}
        <Suspense fallback={<div className="dashboard-card" style={{ minHeight: 280 }} />}>
          <ModelStatusBar />
        </Suspense>
      </div>
    </>
  );
});

export default App;
