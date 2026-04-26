import React, { lazy, Suspense, useCallback } from 'react';
import { Route, Routes, Link, Navigate } from 'react-router-dom';
import { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from './components/ui/Skeleton';
import DashboardHome from './features/dashboard/DashboardHome';
import ChatRouter from './features/chat/ChatRouter';
import type {
  Metrics,
  MetricsHistory,
  RunningApp,
  Thresholds,
  DeviceInfo,
} from './hooks/useDashboardData';

const Settings = lazy(() => import('./features/settings/Settings'));
const DocumentManager = lazy(() => import('./features/documents/DocumentManager'));
const Store = lazy(() => import('./features/store'));
const SandboxApp = lazy(() => import('./features/sandbox'));
const TelegramBotPage = lazy(() => import('./features/telegram/TelegramBotPage'));
const DatabaseOverview = lazy(() => import('./features/database/DatabaseOverview'));
const DatabaseTable = lazy(() => import('./features/database/DatabaseTable'));

interface ChartDataPoint {
  timestamp: number;
  time: string;
  hour: number;
  RAM: number | null;
  Swap: number | null;
  Temp: number | null;
}

interface AppRoutesProps {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  runningApps: RunningApp[];
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
  handleLogout: () => Promise<void>;
  theme: string;
  onToggleTheme: () => void;
}

const SuspenseFallback = (
  <div className="flex flex-col gap-6 p-6 animate-in fade-in">
    <SkeletonText lines={2} width="40%" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SkeletonCard hasAvatar={false} lines={3} />
      <SkeletonCard hasAvatar={false} lines={3} />
    </div>
  </div>
);

const NotFound = (
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
);

function AppRoutes({
  metrics,
  metricsHistory,
  runningApps,
  thresholds,
  deviceInfo,
  handleLogout,
  theme,
  onToggleTheme,
}: AppRoutesProps): React.JSX.Element {
  const formatChartData = useCallback((): ChartDataPoint[] => {
    if (!metricsHistory?.timestamps || !Array.isArray(metricsHistory.timestamps)) return [];
    return metricsHistory.timestamps.map((timestamp: string, index: number) => ({
      timestamp: new Date(timestamp).getTime(),
      time: new Date(timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      hour: new Date(timestamp).getHours(),
      RAM: metricsHistory.ram?.[index] ?? null,
      Swap: metricsHistory.swap?.[index] ?? null,
      Temp: metricsHistory.temperature?.[index] ?? null,
    }));
  }, [metricsHistory]);

  return (
    <Suspense fallback={SuspenseFallback}>
      <Routes>
        <Route
          path="/"
          element={
            <RouteErrorBoundary routeName="Dashboard">
              <DashboardHome
                metrics={metrics}
                metricsHistory={metricsHistory}
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
              <Settings handleLogout={handleLogout} theme={theme} onToggleTheme={onToggleTheme} />
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
        <Route path="*" element={NotFound} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
