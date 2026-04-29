/**
 * StorageBar — live disk-usage strip for the Store header.
 *
 * Phase 2.3 of LLM_RAG_N8N_HARDENING. Backend already exposes the numbers
 * via `/api/metrics/live`; frontend just never showed them in the Store —
 * users had to switch to the Dashboard to find out if a 40 GB pull would
 * even fit. Compact, color-coded, refreshes every 10s.
 */
import { useQuery } from '@tanstack/react-query';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { cn } from '@/lib/utils';

interface DiskInfo {
  used?: number;
  free?: number;
  total?: number;
  percent?: number;
}

interface MetricsResponse {
  disk?: DiskInfo;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || !isFinite(bytes) || bytes <= 0) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export default function StorageBar() {
  const api = useApi();
  const query = useQuery({
    queryKey: ['metrics', 'live', 'disk'],
    queryFn: ({ signal }) =>
      api.get<MetricsResponse>('/metrics/live', { showError: false, signal }),
    refetchInterval: 10_000,
  });

  const disk = query.data?.disk;
  if (!disk || !disk.total) return null;

  // disk.percent is "used %", treat anything over 80 as warning, 90+ as critical.
  const used = disk.used ?? 0;
  const free = disk.free ?? 0;
  const total = disk.total ?? 1;
  const percent = disk.percent ?? Math.round((used / total) * 100);

  const tone = percent >= 90 ? 'critical' : percent >= 80 ? 'warning' : 'ok';

  const barClass =
    tone === 'critical' ? 'bg-destructive' : tone === 'warning' ? 'bg-amber-500' : 'bg-primary';

  const labelClass =
    tone === 'critical'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg">
      <HardDrive className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={cn('font-medium', labelClass)}>
            Speicher: {formatBytes(used)} belegt · {formatBytes(free)} frei
          </span>
          <span className={cn('tabular-nums', labelClass)}>{percent}%</span>
        </div>
        <div className="mt-1 h-1.5 bg-border rounded overflow-hidden">
          <div
            className={cn('h-full rounded transition-all duration-500', barClass)}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Speicher-Auslastung: ${percent}%`}
          />
        </div>
      </div>
      {tone !== 'ok' && (
        <AlertTriangle
          className={cn(
            'size-4 shrink-0',
            tone === 'critical' ? 'text-destructive' : 'text-amber-500'
          )}
          aria-label={tone === 'critical' ? 'Kritisch wenig Speicher' : 'Wenig Speicher'}
        />
      )}
    </div>
  );
}
