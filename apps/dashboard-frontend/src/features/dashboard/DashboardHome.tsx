import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
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
  Layers,
  HardDrive,
  Activity,
  Thermometer,
  Zap,
  Database,
  ExternalLink,
  Code,
  GitBranch,
  Box,
  Terminal,
  Send,
  MessageSquare,
  Upload,
  FolderKanban,
  History,
  ChevronRight,
} from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { DashboardCard, DashboardCardTitle } from './DashboardCard';

const SystemHealthWidget = lazy(() => import('./SystemHealthWidget'));

// Kompakt-Layout (Plan 002): alle Klassen auf der Dichte-Skala (text-ui-*
// + ui-1…4-Abstände). min(100%, …) in den auto-fit-Grids verhindert
// horizontales Scrollen, wenn der Container schmaler als eine Karte ist.
const STAT_BADGE_BASE =
  'mt-ui-1 inline-flex w-fit items-center gap-ui-1 rounded-xs border px-ui-1 py-px ' +
  'text-ui-xs font-semibold uppercase tracking-wide';

// Theme-aware Status-Tokens (--status-*): haben in Light-Mode eigene,
// kontraststarke Werte (#DC2626/#D97706) — --danger/--warning wären dort
// zu hell (Kontrast ~2:1 auf hellem Alpha-Hintergrund).
const STAT_BADGE_VARIANTS = {
  positive:
    'border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]',
  negative:
    'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]',
  warning:
    'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
} as const;

type StatBadgeVariant = keyof typeof STAT_BADGE_VARIANTS;

function StatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-ui-3 rounded-lg border border-border bg-bg-card p-ui-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary-alpha-10)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-ui-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Aktions-Hub: die vier zentralen Einstiege oben im Dashboard. Statt reiner
 * Systemtelemetrie führt das Dashboard den Nutzer zuerst zu einer Aktion.
 * Alle Auslöser laufen über den workspaceStore (keine erfundenen Ziele):
 *  - Chat starten     → rechtes Panel auf Chat (setRightPanelMode)
 *  - Dokument hochladen → Upload-Flow des Explorers (requestExplorerAction)
 *  - Projekt öffnen   → Explorer-Sidebar mit der Projektliste einblenden
 *  - Zuletzt genutzt  → offene Tabs (echte Datenquelle) reaktivieren
 */
function ActionTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-center gap-ui-3 rounded-lg border border-border bg-bg-card p-ui-3 text-left transition-colors hover:border-[var(--border-glow)] hover:bg-bg-card-hover"
    >
      <div
        className="flex shrink-0 items-center justify-center rounded-md bg-[var(--primary-alpha-10)] text-primary"
        style={{ width: 'var(--icon-2xl)', height: 'var(--icon-2xl)' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-ui-lg font-semibold text-text-primary">{title}</div>
        <div className="truncate text-ui-sm text-text-muted">{subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-primary" />
    </button>
  );
}

function ActionHub(): React.JSX.Element {
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const requestExplorerAction = useWorkspaceStore(s => s.requestExplorerAction);
  const setSidebarVisible = useWorkspaceStore(s => s.setSidebarVisible);
  const activateTab = useWorkspaceStore(s => s.activateTab);
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  // "Zuletzt genutzt" nutzt ausschließlich echte Daten: die offenen Tabs
  // (ohne das gerade sichtbare Dashboard), jüngste zuerst. Keine Datenquelle
  // erfunden — ist nichts weiter offen, zeigt die Kachel einen ehrlichen Hinweis.
  const recentTabs = useMemo(
    () =>
      tabs
        .filter(tb => tb.type !== 'dashboard' && tb.id !== activeTabId)
        .slice(-3)
        .reverse(),
    [tabs, activeTabId]
  );

  const iconStyle = { width: 'var(--icon-md)', height: 'var(--icon-md)' } as const;

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-ui-2">
      <ActionTile
        icon={<MessageSquare style={iconStyle} aria-hidden="true" />}
        title="Chat starten"
        subtitle="Frag die KI zu deinen Daten"
        onClick={() => setRightPanelMode('chat')}
      />
      <ActionTile
        icon={<Upload style={iconStyle} aria-hidden="true" />}
        title="Dokument hochladen"
        subtitle="Dateien zur Wissensbasis"
        onClick={() => requestExplorerAction('upload-files')}
      />
      <ActionTile
        icon={<FolderKanban style={iconStyle} aria-hidden="true" />}
        title="Projekt öffnen"
        subtitle="Projekte & Ordner im Explorer"
        onClick={() => setSidebarVisible(true)}
      />

      <div className="flex min-w-0 flex-col gap-ui-2 rounded-lg border border-border bg-bg-card p-ui-3">
        <div className="flex min-w-0 items-center gap-ui-3">
          <div
            className="flex shrink-0 items-center justify-center rounded-md bg-[var(--primary-alpha-10)] text-primary"
            style={{ width: 'var(--icon-2xl)', height: 'var(--icon-2xl)' }}
          >
            <History style={iconStyle} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-ui-lg font-semibold text-text-primary">
              Zuletzt genutzt
            </div>
            <div className="truncate text-ui-sm text-text-muted">Offene Tabs</div>
          </div>
        </div>
        {recentTabs.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-px">
            {recentTabs.map(tb => (
              <button
                key={tb.id}
                type="button"
                onClick={() => activateTab(tb.id)}
                className="flex min-w-0 items-center gap-ui-1 rounded-sm px-ui-1 py-ui-1 text-left text-ui-sm text-text-secondary transition-colors hover:bg-[var(--primary-alpha-10)] hover:text-text-primary"
              >
                <span className="min-w-0 flex-1 truncate">{tb.title}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-ui-sm text-text-muted">
            Noch nichts geöffnet – starte oben mit Chat, Upload oder einem Projekt.
          </p>
        )}
      </div>
    </div>
  );
}

interface MetricsDisk {
  used: number;
  free: number;
  percent: number;
}

interface Metrics {
  cpu: number;
  ram: number;
  swap: number;
  gpu: number;
  temperature: number;
  temp: number;
  disk: MetricsDisk;
}

interface MetricsHistory {
  timestamps: string[];
  cpu: (number | null)[];
  ram: (number | null)[];
  swap: (number | null)[];
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
  RAM: number | null;
  Swap: number | null;
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
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
}

const TempSparkline = React.memo(function TempSparkline({
  history,
}: {
  history?: (number | null)[];
}): React.JSX.Element | null {
  const points = useMemo(() => {
    if (!history || history.length === 0) return [];
    const tail = history.slice(-30);
    return tail
      .map((v, i) => ({ i, v: typeof v === 'number' && v > 0 ? v : null }))
      .filter(p => p.v !== null);
  }, [history]);

  if (points.length < 2) return null;

  return (
    <div className="pointer-events-none mt-ui-1 w-full max-w-[120px] opacity-60" aria-hidden="true">
      <ResponsiveContainer width="100%" height={18}>
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--primary-color)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const DashboardHome = React.memo(function DashboardHome({
  metrics,
  metricsHistory,
  runningApps,
  formatChartData,
  thresholds,
  deviceInfo,
}: DashboardHomeProps): React.JSX.Element {
  const defaultThresholds: Thresholds = {
    cpu: { warning: 70, critical: 90 },
    ram: { warning: 70, critical: 90 },
    swap: { warning: 30, critical: 60 },
    gpu: { warning: 80, critical: 95 },
    storage: { warning: 70, critical: 85 },
    temperature: { warning: 80, critical: 95 },
  };

  const t = thresholds || defaultThresholds;
  const api = useApi();

  // Forward-auth-gated apps (n8n, etc.) need the session COOKIE on a plain
  // <a href> navigation — the Authorization header used by the dashboard is
  // never sent on link clicks. If the user logged in under a different
  // hostname/IP than the address bar currently shows, the cookie jar is
  // per-host and missing → 401. Refresh the cookie for the current host on
  // mount so the cards work as plain links (no popup-blocker games).
  useEffect(() => {
    api.post('/auth/refresh-cookie', undefined, { showError: false }).catch(() => {
      // Best-effort: if the user isn't authenticated, the link will surface
      // the 401 the usual way; nothing to do here.
    });
    // NOTE: effect deps intentionally scoped (exhaustive-deps reviewed)
  }, []);

  const getStatusInfo = (
    value: number,
    metric: string
  ): { status: string; variant: StatBadgeVariant } => {
    const threshold = t[metric];
    if (!threshold) return { status: 'Normal', variant: 'positive' };
    if (value >= threshold.critical) {
      return { status: 'Critical', variant: 'negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warning', variant: 'warning' };
    }
    return { status: 'Normal', variant: 'positive' };
  };

  const getTempStatusInfo = (value: number): { status: string; variant: StatBadgeVariant } => {
    const threshold = t.temperature;
    if (value >= threshold.critical) {
      return { status: 'Hot', variant: 'negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warm', variant: 'warning' };
    }
    return { status: 'Normal', variant: 'positive' };
  };

  const [chartTimeRange, setChartTimeRange] = useState<number>(() => {
    const saved = localStorage.getItem('arasul_chart_time_range');
    return saved ? Number(saved) : 24;
  });

  useEffect(() => {
    localStorage.setItem('arasul_chart_time_range', String(chartTimeRange));
  }, [chartTimeRange]);
  const timeRangeOptions: number[] = [1, 6, 12, 24];

  const tickIntervalMs: Record<number, number> = {
    1: 10 * 60 * 1000,
    6: 60 * 60 * 1000,
    12: 2 * 60 * 60 * 1000,
    24: 4 * 60 * 60 * 1000,
  };

  const chartData = useMemo((): ChartDataPoint[] => {
    const allData = formatChartData();
    if (!allData.length) return [];
    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    return allData.filter(d => d.timestamp >= cutoff);
  }, [formatChartData, chartTimeRange]);

  const chartTicks = useMemo((): number[] => {
    if (!chartData.length) return [];
    const interval = tickIntervalMs[chartTimeRange] || 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    const firstTick = Math.ceil(cutoff / interval) * interval;
    const ticks: number[] = [];
    for (let tick = firstTick; tick <= now; tick += interval) {
      ticks.push(tick);
    }
    return ticks;
  }, [chartData, chartTimeRange]);

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
    return <IconComponent className="h-4 w-4 text-primary" />;
  };

  const getAppUrl = (app: RunningApp): string => {
    if (app.hasCustomPage && app.customPageRoute) {
      return app.customPageRoute;
    }
    const traefikPaths: Record<string, string> = { n8n: '/n8n' };
    if (traefikPaths[app.id]) {
      return `${window.location.origin}${traefikPaths[app.id]}`;
    }
    if (app.ports?.external) {
      return `http://${window.location.hostname}:${app.ports.external}`;
    }
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

  const isInternalLink = (app: RunningApp): boolean => {
    return !!(app.hasCustomPage && app.customPageRoute);
  };

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
    <div className="flex min-w-0 flex-col gap-ui-3">
      <ActionHub />

      <div className="mt-ui-1 text-ui-xs font-semibold uppercase tracking-wider text-text-muted">
        Systemstatus
      </div>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-ui-2">
        <StatCard icon={<Activity className="h-5 w-5 text-primary" />} label="RAM Usage">
          <div className="flex items-baseline gap-ui-1 text-xl font-bold leading-tight text-text-primary">
            {metrics?.ram?.toFixed(1) || 0}
            <span className="text-ui-sm font-medium text-text-muted">%</span>
          </div>
          {deviceInfo?.total_memory_gb ? (
            <div className="text-ui-sm text-text-secondary">
              {(((metrics?.ram || 0) / 100) * deviceInfo.total_memory_gb).toFixed(1)} /{' '}
              {deviceInfo.total_memory_gb} GB
            </div>
          ) : (
            <div
              className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getStatusInfo(metrics?.ram || 0, 'ram').variant]}`}
            >
              {getStatusInfo(metrics?.ram || 0, 'ram').status}
            </div>
          )}
        </StatCard>

        <StatCard icon={<Layers className="h-5 w-5 text-primary" />} label="Swap">
          <div className="flex items-baseline gap-ui-1 text-xl font-bold leading-tight text-text-primary">
            {metrics?.swap?.toFixed(1) || 0}
            <span className="text-ui-sm font-medium text-text-muted">%</span>
          </div>
          <div
            className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getStatusInfo(metrics?.swap || 0, 'swap').variant]}`}
          >
            {getStatusInfo(metrics?.swap || 0, 'swap').status}
          </div>
        </StatCard>

        <StatCard icon={<HardDrive className="h-5 w-5 text-primary" />} label="Storage">
          <div className="flex items-baseline gap-ui-1 text-xl font-bold leading-tight text-text-primary">
            {metrics?.disk?.percent?.toFixed(0) || 0}
            <span className="text-ui-sm font-medium text-text-muted">%</span>
          </div>
          <div className="my-ui-1 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${metrics?.disk?.percent || 0}%`,
                background: getProgressColor(metrics?.disk?.percent || 0, 'storage'),
              }}
            />
          </div>
          <div className="text-ui-sm text-text-secondary">
            {formatBytes(usedDisk)} / {formatBytes(totalDisk)} GB
          </div>
        </StatCard>

        <StatCard icon={<Thermometer className="h-5 w-5 text-primary" />} label="Temperatur">
          <div className="flex items-baseline gap-ui-1 text-xl font-bold leading-tight text-text-primary">
            {metrics?.temperature?.toFixed(0) || 0}
            <span className="text-ui-sm font-medium text-text-muted">°C</span>
          </div>
          <div
            className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getTempStatusInfo(metrics?.temperature || 0).variant]}`}
          >
            {getTempStatusInfo(metrics?.temperature || 0).status}
          </div>
          <TempSparkline history={metricsHistory?.temperature} />
        </StatCard>
      </div>

      {runningApps && runningApps.length > 0 && (
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-ui-2">
          {runningApps
            ?.filter((app: RunningApp) => app.status === 'running' && app.id !== 'minio')
            .map((app: RunningApp) => {
              const url = getAppUrl(app);
              const cardClass =
                'group flex min-w-0 items-center gap-ui-2 rounded-lg border border-border ' +
                'bg-bg-card p-ui-2 text-inherit no-underline transition-colors ' +
                'hover:border-[var(--border-glow)] hover:bg-bg-card-hover';
              const iconWrapper = (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--primary-alpha-10)]">
                  {getAppIcon(app.icon)}
                </div>
              );
              const content = (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui font-semibold text-text-primary">{app.name}</div>
                  <div className="truncate text-ui-sm text-text-muted">{app.description}</div>
                </div>
              );
              if (isInternalLink(app)) {
                return (
                  <Link key={app.id} to={url} className={cardClass}>
                    {iconWrapper}
                    {content}
                    <ExternalLink className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-primary" />
                  </Link>
                );
              }
              if (url === '#') {
                return (
                  <div key={app.id} className={`${cardClass} pointer-events-none opacity-50`}>
                    {iconWrapper}
                    {content}
                    <span className="shrink-0 whitespace-nowrap rounded-xs bg-secondary px-ui-1 py-px text-ui-xs font-semibold text-text-muted">
                      Nicht verfügbar
                    </span>
                  </div>
                );
              }
              return (
                <a
                  key={app.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cardClass}
                >
                  {iconWrapper}
                  {content}
                  <ExternalLink className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-primary" />
                </a>
              );
            })}
        </div>
      )}

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-ui-2">
        <DashboardCard className="col-span-full">
          <div className="mb-ui-2 flex flex-wrap items-center justify-between gap-ui-2">
            <DashboardCardTitle className="mb-0">Performance</DashboardCardTitle>
            <div className="flex gap-ui-1 rounded-md bg-secondary p-ui-1">
              {timeRangeOptions.map((hours: number) => (
                <button
                  key={hours}
                  type="button"
                  className={`cursor-pointer rounded-sm px-ui-2 py-ui-1 text-ui-xs font-semibold transition-colors ${
                    chartTimeRange === hours
                      ? 'bg-primary text-primary-foreground'
                      : 'text-text-muted hover:bg-[var(--primary-alpha-10)] hover:text-text-primary'
                  }`}
                  onClick={() => setChartTimeRange(hours)}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
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
                    const unit = name === 'Temp' ? '°C' : '%';
                    return [`${value?.toFixed(1)}${unit}`, name];
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="RAM"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Swap"
                  stroke="var(--primary-color)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Temp"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="sr-only" role="status">
            {metrics && (
              <>
                RAM: {metrics.ram?.toFixed(1)}%, Swap: {metrics.swap?.toFixed(1)}%, Temperatur:{' '}
                {metrics.temperature?.toFixed(1)}°C
              </>
            )}
          </div>
        </DashboardCard>

        <Suspense fallback={<DashboardCard className="min-h-[200px]" />}>
          <SystemHealthWidget />
        </Suspense>
      </div>
    </div>
  );
});

export default DashboardHome;
