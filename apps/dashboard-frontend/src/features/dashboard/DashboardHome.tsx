import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { Suspense, lazy } from 'react';

const ModelStatusBar = lazy(() => import('./ModelStatusBar'));
const SystemHealthWidget = lazy(() => import('./SystemHealthWidget'));

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

export interface DashboardHomeProps {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
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
    <div className="stat-sparkline" aria-hidden="true">
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
    return <IconComponent className="service-link-icon" />;
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
    <>
      <div className="stats-top-row">
        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <Activity className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">SYSTEM RAM</div>
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
            <Layers className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">SWAP</div>
            <div className="stat-value-large">
              {metrics?.swap?.toFixed(1) || 0}
              <span className="stat-unit">%</span>
            </div>
            <div className={`stat-change ${getStatusInfo(metrics?.swap || 0, 'swap').className}`}>
              {getStatusInfo(metrics?.swap || 0, 'swap').status}
            </div>
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
            <Thermometer className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label" title="System-on-Chip Sensor">
              SOC TEMP
            </div>
            <div className="stat-value-large">
              {metrics?.temperature?.toFixed(0) || 0}
              <span className="stat-unit">°C</span>
            </div>
            <div
              className={`stat-change ${getTempStatusInfo(metrics?.temperature || 0).className}`}
            >
              {getTempStatusInfo(metrics?.temperature || 0).status}
            </div>
            <TempSparkline history={metricsHistory?.temperature} />
          </div>
        </div>
      </div>

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

      <div className="dashboard-grid">
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
                yAxisId="left"
                stroke="var(--text-muted)"
                tick={{ fill: 'var(--text-muted)', fontSize: '0.75rem' }}
                axisLine={{ stroke: 'var(--text-muted)' }}
                tickLine={{ stroke: 'var(--text-muted)' }}
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--text-muted)"
                tick={{ fill: 'var(--text-muted)', fontSize: '0.75rem' }}
                axisLine={{ stroke: 'var(--text-muted)' }}
                tickLine={{ stroke: 'var(--text-muted)' }}
                domain={[0, 120]}
                tickFormatter={(value: number) => `${value}°C`}
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
                yAxisId="left"
                type="monotone"
                dataKey="RAM"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Swap"
                stroke="var(--primary-color)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Temp"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="sr-only" role="status">
            {metrics && (
              <>
                RAM: {metrics.ram?.toFixed(1)}%, Swap: {metrics.swap?.toFixed(1)}%, Temperatur:{' '}
                {metrics.temperature?.toFixed(1)}°C
              </>
            )}
          </div>
        </div>

        <Suspense fallback={<div className="dashboard-card" style={{ minHeight: 280 }} />}>
          <ModelStatusBar />
        </Suspense>

        <Suspense fallback={<div className="dashboard-card" style={{ minHeight: 200 }} />}>
          <SystemHealthWidget />
        </Suspense>
      </div>
    </>
  );
});

export default DashboardHome;
