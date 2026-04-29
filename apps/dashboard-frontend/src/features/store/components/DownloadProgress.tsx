/**
 * DownloadProgress Component
 *
 * Unified download progress display with phase labels, percent, byte progress,
 * ETA, and Pause / Cancel / Resume / Purge controls.
 *
 * Phase 0 of LLM_RAG_N8N_HARDENING — bytes / ETA / 'paused' phase.
 * Plan reference: docs/plans/LLM_RAG_N8N_HARDENING.md (Phase 0.4)
 */

import { X, Pause, Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadState {
  progress: number;
  phase: string;
  status?: string;
  error?: string | null;
  bytesCompleted?: number;
  bytesTotal?: number;
  speedBps?: number;
}

interface DownloadProgressProps {
  downloadState: DownloadState;
  onCancel?: () => void;
  onResume?: () => void;
  onPurge?: () => void;
  compact?: boolean;
}

const phaseLabels: Record<string, string> = {
  init: 'Initialisiere',
  download: 'Download',
  pull: 'Image-Download',
  setup: 'Einrichtung',
  paused: 'Pausiert',
  verify: 'Verifiziere',
  complete: 'Fertig',
  error: 'Fehler',
};

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || !isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const safe = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, safe)).toFixed(safe === 0 ? 0 : 1)} ${units[safe]}`;
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '';
  return `${formatBytes(bps)}/s`;
}

function formatEta(bytesCompleted?: number, bytesTotal?: number, bps?: number): string {
  if (!bytesTotal || !bytesCompleted || !bps || bps <= 0) return '';
  const remaining = bytesTotal - bytesCompleted;
  if (remaining <= 0) return '';
  const seconds = Math.round(remaining / bps);
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)} min`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
  }
  return `~${Math.round(seconds / 3600)}h`;
}

function buildBytesLabel(state: DownloadState): string {
  const done = formatBytes(state.bytesCompleted);
  const total = formatBytes(state.bytesTotal);
  const speed = formatSpeed(state.speedBps);
  const eta = formatEta(state.bytesCompleted, state.bytesTotal, state.speedBps);

  const parts: string[] = [];
  if (done && total) parts.push(`${done} / ${total}`);
  else if (done) parts.push(done);
  if (speed) parts.push(speed);
  if (eta) parts.push(`Restzeit ${eta}`);
  return parts.join(' · ');
}

function DownloadProgress({
  downloadState,
  onCancel,
  onResume,
  onPurge,
  compact = false,
}: DownloadProgressProps) {
  const isComplete = downloadState.phase === 'complete';
  const isVerify = downloadState.phase === 'verify';
  const isError = downloadState.phase === 'error';
  const isPaused = downloadState.phase === 'paused';

  const bytesLabel = buildBytesLabel(downloadState);

  // Status-line text: prefer error, then explicit status, then bytes label
  const statusLine =
    downloadState.error ||
    (isPaused ? 'Bytes gesichert · Server setzt automatisch fort' : downloadState.status) ||
    bytesLabel ||
    '';

  // Color tone per phase
  const accentClass = isComplete
    ? 'text-primary'
    : isError
      ? 'text-destructive'
      : isPaused
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  const barClass = isComplete
    ? 'bg-primary'
    : isError
      ? 'bg-destructive'
      : isPaused
        ? 'bg-amber-500'
        : isVerify
          ? 'bg-muted-foreground animate-pulse'
          : 'bg-primary';

  if (compact) {
    return (
      <div className="download-progress flex items-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-semibold uppercase tracking-wider', accentClass)}>
              {phaseLabels[downloadState.phase] || downloadState.phase}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-semibold">{downloadState.progress}%</span>
              {isPaused && onResume && (
                <button
                  onClick={onResume}
                  className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                  title="Fortsetzen"
                  aria-label="Download fortsetzen"
                >
                  <Play className="size-3.5" />
                </button>
              )}
              {!isPaused && onCancel && !isComplete && (
                <button
                  onClick={onCancel}
                  className="text-muted-foreground hover:text-amber-600 transition-colors p-0.5 rounded"
                  title="Pause (Bytes bleiben erhalten)"
                  aria-label="Download pausieren"
                >
                  <Pause className="size-3.5" />
                </button>
              )}
              {(isError || isPaused) && onPurge && (
                <button
                  onClick={onPurge}
                  className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                  title="Zurücksetzen und neu starten"
                  aria-label="Download zurücksetzen"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="h-2 bg-border rounded overflow-hidden">
            <div
              className={cn('h-full rounded transition-all duration-300', barClass)}
              style={{
                width: `${isVerify && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
              }}
              role="progressbar"
              aria-valuenow={downloadState.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {bytesLabel && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{bytesLabel}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'download-progress bg-muted rounded-md p-3.5 border border-border',
        isComplete && 'border-primary bg-primary/10',
        isError && 'border-destructive/30 bg-destructive/10',
        isPaused && 'border-amber-500/30 bg-amber-500/5'
      )}
      onClick={e => e.stopPropagation()}
    >
      <div className="progress-header flex justify-between items-center mb-2">
        <span className={cn('text-xs font-semibold uppercase tracking-wider', accentClass)}>
          {phaseLabels[downloadState.phase] || downloadState.phase}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-semibold', accentClass)}>
            {downloadState.progress}%
          </span>
          {isPaused && onResume && (
            <button
              onClick={onResume}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
              title="Fortsetzen"
              aria-label="Download fortsetzen"
            >
              <Play className="size-3.5" />
            </button>
          )}
          {!isPaused && onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-amber-600 transition-colors p-0.5 rounded"
              title="Pause — Bytes bleiben erhalten"
              aria-label="Download pausieren"
            >
              <Pause className="size-3.5" />
            </button>
          )}
          {!isPaused && !isError && onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
              title="Abbrechen"
              aria-label="Download abbrechen"
            >
              <X className="size-3.5" />
            </button>
          )}
          {(isError || isPaused) && onPurge && (
            <button
              onClick={onPurge}
              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
              title="Zurücksetzen und von vorn"
              aria-label="Download zurücksetzen"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="h-2 bg-border rounded overflow-hidden mb-2">
        <div
          className={cn('h-full rounded transition-all duration-300', barClass)}
          style={{
            width: `${isVerify && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
          }}
          role="progressbar"
          aria-valuenow={downloadState.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className={cn('text-xs', accentClass)}>{statusLine}</div>
      {bytesLabel && statusLine !== bytesLabel && (
        <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{bytesLabel}</div>
      )}
    </div>
  );
}

export default DownloadProgress;
