/**
 * DownloadProgress Component
 * Unified download progress display with phase labels, percent, cancel button
 * Used in StoreHome and StoreModels for consistent download UX
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadState {
  progress: number;
  phase: string;
  status?: string;
  error?: string;
}

interface DownloadProgressProps {
  downloadState: DownloadState;
  onCancel?: () => void;
  compact?: boolean;
}

const phaseLabels: Record<string, string> = {
  init: 'Initialisiere',
  download: 'Download',
  pull: 'Image-Download',
  setup: 'Einrichtung',
  verify: 'Verifiziere',
  complete: 'Fertig',
  error: 'Fehler',
};

function DownloadProgress({ downloadState, onCancel, compact = false }: DownloadProgressProps) {
  const isComplete = downloadState.phase === 'complete';
  const isVerify = downloadState.phase === 'verify';
  const isError = downloadState.phase === 'error';

  if (compact) {
    return (
      <div className="download-progress flex items-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                isComplete ? 'text-primary' : isError ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {phaseLabels[downloadState.phase] || downloadState.phase}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-semibold">{downloadState.progress}%</span>
              {onCancel && !isComplete && (
                <button
                  onClick={onCancel}
                  className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                  title="Download abbrechen"
                  aria-label="Download abbrechen"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="h-2 bg-border rounded overflow-hidden">
            <div
              className={cn(
                'h-full bg-primary rounded transition-all duration-300',
                isVerify && 'animate-pulse bg-muted-foreground'
              )}
              style={{
                width: `${isVerify && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
              }}
              role="progressbar"
              aria-valuenow={downloadState.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'download-progress bg-muted rounded-md p-3.5 border border-border',
        isComplete && 'border-primary bg-primary/10',
        isError && 'border-destructive/30 bg-destructive/10'
      )}
      onClick={e => e.stopPropagation()}
    >
      <div className="progress-header flex justify-between items-center mb-2">
        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            isComplete ? 'text-primary' : isError ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {phaseLabels[downloadState.phase] || downloadState.phase}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-semibold',
              isComplete ? 'text-primary' : isError ? 'text-destructive' : 'text-primary'
            )}
          >
            {downloadState.progress}%
          </span>
          {onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
              title="Download abbrechen"
              aria-label="Download abbrechen"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="h-2 bg-border rounded overflow-hidden mb-2">
        <div
          className={cn(
            'h-full bg-linear-to-r from-primary to-primary/80 rounded transition-all duration-300',
            isVerify && 'animate-pulse from-muted-foreground to-muted-foreground/80',
            isComplete && 'from-primary to-primary/80'
          )}
          style={{
            width: `${isVerify && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
          }}
          role="progressbar"
          aria-valuenow={downloadState.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div
        className={cn(
          'text-xs',
          isComplete ? 'text-primary' : isError ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {downloadState.error || downloadState.status}
      </div>
    </div>
  );
}

export default DownloadProgress;
