import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
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
import { Layers, HardDrive, Activity, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useDashboardData } from '@/hooks/useDashboardData';
import type {
  DashboardData,
  MetricsHistory,
  Thresholds,
  DeviceInfo,
  ChartDataPoint,
} from '@/hooks/useDashboardData';
import type { Metrics } from '@/types';
import { DashboardCard, DashboardCardTitle } from './DashboardCard';

/**
 * SystemStatus — die Live-System-Status-Ansicht (RAM/Swap/Storage/Temperatur-
 * Kacheln, Performance-Verlauf und die admin-only System-Gesundheit).
 *
 * Aus der entfernten Dashboard-Startseite (Plan 008) in die System-
 * Einstellungen übernommen; die Datenbasis liefert weiterhin `useDashboardData`
 * (Live-Metriken via WebSocket, `/metrics/history?range=24h`,
 * `/system/thresholds`, …). Die frühere Automatisierungs-Kachel
 * (n8n-Läufe) war reines Dashboard-Chrome und entfällt hier.
 */

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

interface SystemStatusViewProps {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  formatChartData: () => ChartDataPoint[];
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
}

/**
 * Die eigentliche Status-Darstellung. Erwartet bereits geladene Daten aus
 * useDashboardData (der Wrapper unten übernimmt Lade-/Fehlerzustand + den
 * einen useDashboardData-Aufruf, damit nur EIN WebSocket geöffnet wird).
 */
function SystemStatusView({
  metrics,
  metricsHistory,
  formatChartData,
  thresholds,
  deviceInfo,
}: SystemStatusViewProps): React.JSX.Element {
  const defaultThresholds: Thresholds = {
    cpu: { warning: 70, critical: 90 },
    ram: { warning: 70, critical: 90 },
    swap: { warning: 30, critical: 60 },
    gpu: { warning: 80, critical: 95 },
    storage: { warning: 70, critical: 85 },
    temperature: { warning: 80, critical: 95 },
  };

  const t = thresholds || defaultThresholds;

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
      <div className="text-ui-xs font-semibold uppercase tracking-wider text-text-muted">
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
                  labelFormatter={label =>
                    new Date(Number(label)).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }
                  formatter={(value, name) => {
                    const unit = name === 'Temp' ? '°C' : '%';
                    const num = typeof value === 'number' ? value : Number(value);
                    return [`${num.toFixed(1)}${unit}`, String(name)];
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
}

/**
 * Öffentlicher Einstieg: kapselt Lade-/Fehlerzustand rund um die Status-Ansicht.
 */
export function SystemStatus(): React.JSX.Element {
  const data: DashboardData = useDashboardData(true);

  if (data.loading) {
    return <LoadingSpinner message="Lade Systemstatus..." />;
  }
  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <p>{data.error}</p>
        <Button type="button" variant="solid" onClick={data.retry}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
  return (
    <SystemStatusView
      metrics={data.metrics}
      metricsHistory={data.metricsHistory}
      formatChartData={data.formatChartData}
      thresholds={data.thresholds}
      deviceInfo={data.deviceInfo}
    />
  );
}

export default SystemStatus;
