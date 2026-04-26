import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';

export interface MetricsDisk {
  used: number;
  free: number;
  percent: number;
}

export interface MetricsNetwork {
  online: boolean;
}

export interface Metrics {
  cpu: number;
  ram: number;
  swap: number;
  gpu: number;
  temperature: number;
  temp: number;
  disk: MetricsDisk;
  network?: MetricsNetwork;
}

export interface MetricsHistory {
  timestamps: string[];
  cpu: (number | null)[];
  ram: (number | null)[];
  swap: (number | null)[];
  gpu: (number | null)[];
  temperature: (number | null)[];
}

export interface RunningApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: string;
  hasCustomPage?: boolean;
  customPageRoute?: string;
  ports?: { external?: number };
}

export interface ThresholdPair {
  warning: number;
  critical: number;
}

export interface Thresholds {
  cpu: ThresholdPair;
  ram: ThresholdPair;
  gpu: ThresholdPair;
  storage: ThresholdPair;
  temperature: ThresholdPair;
  [key: string]: ThresholdPair;
}

export interface DeviceInfo {
  name: string;
  total_memory_gb?: number;
  cpu_cores?: number;
  type?: string;
}

interface UseDashboardDataResult {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  runningApps: RunningApp[];
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
  loading: boolean;
  error: string | null;
  setMetrics: (m: Metrics | null) => void;
  refetch: () => void;
  clearError: () => void;
}

/**
 * Loads dashboard data (metrics, history, running apps, thresholds, device info)
 * via Promise.allSettled so a single failing endpoint doesn't block the rest.
 * Auto-refetches every 30s while authenticated.
 */
export function useDashboardData(isAuthenticated: boolean): UseDashboardDataResult {
  const api = useApi();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory | null>(null);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAuthenticated) return;

      try {
        const opts = { signal, showError: false };
        const results = await Promise.allSettled([
          api.get('/metrics/live', opts),
          api.get('/metrics/history?range=24h', opts),
          api.get('/apps?status=running,installed', opts),
          api.get('/system/thresholds', opts),
        ]);

        const val = (i: number): unknown =>
          results[i]?.status === 'fulfilled'
            ? (results[i] as PromiseFulfilledResult<unknown>).value
            : null;

        const liveMetrics = val(0) as Metrics | null;
        const history = val(1) as MetricsHistory | null;
        const apps = val(2) as { apps?: RunningApp[] } | null;
        const thresh = val(3) as { thresholds?: Thresholds; device?: DeviceInfo } | null;

        if (liveMetrics) setMetrics(liveMetrics);
        if (history) setMetricsHistory(history);
        if (apps?.apps) setRunningApps(apps.apps);
        if (thresh?.thresholds) setThresholds(thresh.thresholds);
        if (thresh?.device) setDeviceInfo(thresh.device);

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount === results.length) {
          setError('Alle Dashboard-Daten konnten nicht geladen werden');
        } else {
          setError(null);
        }
        setLoading(false);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        setLoading(false);
      }
    },
    [isAuthenticated, api]
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    fetchData(controller.signal);
    const interval = setInterval(() => fetchData(controller.signal), 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchData, isAuthenticated]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const clearError = useCallback(() => setError(null), []);

  return {
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
  };
}
