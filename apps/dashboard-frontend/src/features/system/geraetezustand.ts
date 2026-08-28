import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useWebSocketMetrics } from '@/hooks/useWebSocketMetrics';
import type { Metrics } from '@/types';

/**
 * Was das Gerät gerade tut: Live-Metriken über den WebSocket, der Verlauf der
 * letzten 24 Stunden und die Schwellen samt Geräteangaben.
 *
 * Hieß bis Phase D5 `hooks/useDashboardData` und holte sieben Wege im
 * 30-Sekunden-Takt: dazu `/services`, `/system/info`, `/system/network` und
 * `/apps?status=running,installed`. Gelesen wurde davon nichts. Die Startseite,
 * für die das gebaut war, ist mit Plan 008 gefallen; übrig blieb ein Hook, der
 * auf einem Jetson alle 30 Sekunden vier Antworten wegwarf. Der Rest steht
 * jetzt hier, beim einzigen Verwender (Regel des Ordners: ein Feature, ein
 * Ort).
 */

/**
 * Null heisst bei der Temperatur nicht null Grad, sondern kein Messwert.
 *
 * `services/metrics-collector/collector.py` gibt in `get_temperature` 0.0
 * zurueck, wenn keine Thermalzone gefunden wird und bei jedem Fehler beim
 * Lesen; `gpu_monitor.py` ebenso ueber NVML. Danach macht
 * `apps/dashboard-backend/src/routes/system/metrics.js` mit
 * `parseFloat(...) || 0` aus jedem NULL und jedem NaN aus der Datenbank
 * ebenfalls eine Null, in `/live` wie in `/history`.
 *
 * Damit ist auch die Grenze benannt: eine echte Messung von null Grad oder
 * darunter wird ebenfalls verworfen. Auf einem Jetson-SoC im Betrieb gibt es
 * die nicht, und unterscheidbar waeren beide Faelle ohnehin nicht, solange das
 * Backend NULL zu 0 macht.
 *
 * Ein ausgefallener Sensor sieht also aus wie ein eiskaltes Geraet. Hier wird
 * daraus wieder eine Luecke. Nur die Temperatur, denn bei Auslagerung sind
 * null Prozent ein ganz normaler Messwert.
 *
 * Stand: 2026-08-20 · Quelle: collector.py, gpu_monitor.py, metrics.js
 */
export function ohneAusfallwerte(werte: (number | null)[] | undefined): (number | null)[] {
  if (!Array.isArray(werte)) return [];
  return werte.map(wert => (typeof wert === 'number' && wert > 0 ? wert : null));
}

export interface MetricsHistory {
  timestamps: string[];
  cpu: (number | null)[];
  ram: (number | null)[];
  swap: (number | null)[];
  gpu: (number | null)[];
  temperature: (number | null)[];
}

interface ThresholdPair {
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

export interface Geraetezustand {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
  loading: boolean;
  error: string | null;
  formatChartData: () => ChartDataPoint[];
  retry: () => void;
}

export function useGeraetezustand(isAuthenticated: boolean): Geraetezustand {
  const api = useApi();

  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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
        const [metricsRes, historyRes, thresholdsRes] = await Promise.allSettled([
          api.get<Metrics>('/metrics/live', opts),
          api.get<MetricsHistory>('/metrics/history?range=24h', opts),
          api.get<{ thresholds: Thresholds; device: DeviceInfo }>('/system/thresholds', opts),
        ]);
        const results: PromiseSettledResult<unknown>[] = [metricsRes, historyRes, thresholdsRes];

        if (metricsRes.status === 'fulfilled' && metricsRes.value) setMetrics(metricsRes.value);
        if (historyRes.status === 'fulfilled' && historyRes.value)
          setMetricsHistory({
            ...historyRes.value,
            temperature: ohneAusfallwerte(historyRes.value.temperature),
          });
        if (thresholdsRes.status === 'fulfilled' && thresholdsRes.value) {
          setThresholds(thresholdsRes.value.thresholds);
          setDeviceInfo(thresholdsRes.value.device);
        }

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
          console.warn(`${failedCount} von ${results.length} Abfragen zum Gerätezustand rot`);
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
            setError('Der Zustand des Geräts ließ sich nicht laden');
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
    thresholds,
    deviceInfo,
    loading,
    error,
    formatChartData,
    retry,
  };
}
