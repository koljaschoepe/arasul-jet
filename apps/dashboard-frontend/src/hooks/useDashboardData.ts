import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { useWebSocketMetrics } from './useWebSocketMetrics';
import type { Metrics } from '../types';

/**
 * Kapselt das komplette Dashboard-Datenmodell (Live-Metriken via WebSocket,
 * History, Services, System-/Netzwerk-Info, Apps, Thresholds) inklusive
 * 30s-Refresh. Wird von der alten UI (App.tsx) und vom Dashboard-Tab der
 * Workspace-Shell gemeinsam genutzt — es rendert immer nur einer von beiden.
 */

export interface MetricsHistory {
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

export interface Services {
  llm: ServiceStatus;
  embeddings: ServiceStatus;
}

export interface SystemInfo {
  uptime_seconds: number;
  version: string;
  hostname: string;
}

export interface NetworkInfo {
  internet_reachable: boolean;
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

export interface ChartDataPoint {
  timestamp: number;
  time: string;
  hour: number;
  RAM: number | null;
  Swap: number | null;
  Temp: number | null;
}

export interface DashboardData {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  services: Services | null;
  systemInfo: SystemInfo | null;
  networkInfo: NetworkInfo | null;
  runningApps: RunningApp[];
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
  loading: boolean;
  error: string | null;
  formatChartData: () => ChartDataPoint[];
  retry: () => void;
}

export function useDashboardData(isAuthenticated: boolean): DashboardData {
  const api = useApi();

  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // Live-Metriken via WebSocket
  const { metrics: wsMetrics } = useWebSocketMetrics(isAuthenticated);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (wsMetrics) {
      setMetrics(wsMetrics);
    }
  }, [wsMetrics]);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAuthenticated) return;

      try {
        const opts = { signal, showError: false };
        const [metricsRes, historyRes, servicesRes, infoRes, networkRes, appsRes, thresholdsRes] =
          await Promise.allSettled([
            api.get<Metrics>('/metrics/live', opts),
            api.get<MetricsHistory>('/metrics/history?range=24h', opts),
            api.get<Services>('/services', opts),
            api.get<SystemInfo>('/system/info', opts),
            api.get<NetworkInfo>('/system/network', opts),
            api.get<{ apps?: RunningApp[] }>('/apps?status=running,installed', opts),
            api.get<{ thresholds: Thresholds; device: DeviceInfo }>('/system/thresholds', opts),
          ]);
        const results: PromiseSettledResult<unknown>[] = [
          metricsRes,
          historyRes,
          servicesRes,
          infoRes,
          networkRes,
          appsRes,
          thresholdsRes,
        ];

        if (metricsRes.status === 'fulfilled' && metricsRes.value) setMetrics(metricsRes.value);
        if (historyRes.status === 'fulfilled' && historyRes.value)
          setMetricsHistory(historyRes.value);
        if (servicesRes.status === 'fulfilled' && servicesRes.value) setServices(servicesRes.value);
        if (infoRes.status === 'fulfilled' && infoRes.value) setSystemInfo(infoRes.value);
        if (networkRes.status === 'fulfilled' && networkRes.value) setNetworkInfo(networkRes.value);
        if (appsRes.status === 'fulfilled' && appsRes.value)
          setRunningApps(appsRes.value.apps || []);
        if (thresholdsRes.status === 'fulfilled' && thresholdsRes.value) {
          setThresholds(thresholdsRes.value.thresholds);
          setDeviceInfo(thresholdsRes.value.device);
        }

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
          console.warn(`${failedCount} of ${results.length} dashboard requests failed`);
        }
        // Only show error if ALL requests failed
        if (failedCount === results.length) {
          // Bug-fix (user-reported "Dashboard konnte nicht geladen werden"):
          // when every request 401s the useApi 401-interceptor has already
          // fired logout(); the next render sees isAuthenticated=false and
          // shows the Login screen. Suppress the error-state in that case
          // so the user doesn't briefly see a permanent "Fehler beim Laden"
          // page that races the logout-redirect.
          const all401 = results.every(
            r => r.status === 'rejected' && (r.reason as { status?: number })?.status === 401
          );
          if (!all401) {
            setError('Alle Dashboard-Daten konnten nicht geladen werden');
          }
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

  const formatChartData = useCallback((): ChartDataPoint[] => {
    if (!metricsHistory?.timestamps || !Array.isArray(metricsHistory.timestamps)) return [];

    return metricsHistory.timestamps.map((timestamp: string, index: number) => ({
      timestamp: new Date(timestamp).getTime(),
      time: new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      hour: new Date(timestamp).getHours(),
      RAM: metricsHistory.ram?.[index] ?? null,
      Swap: metricsHistory.swap?.[index] ?? null,
      Temp: metricsHistory.temperature?.[index] ?? null,
    }));
  }, [metricsHistory]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return {
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
  };
}
