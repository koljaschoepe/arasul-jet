/**
 * ProjectCard - Card for a sandbox project in the project list
 */

import { Terminal, Play, Square, Trash2, Clock, Box, Save } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { SandboxProject } from './types';

interface ProjectCardProps {
  project: SandboxProject;
  onOpen: (project: SandboxProject) => void;
  onStart: (project: SandboxProject) => void;
  onStop: (project: SandboxProject) => void;
  onDelete: (project: SandboxProject) => void;
  onCommit: (project: SandboxProject) => void;
  actionLoading: string | null;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nie';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD}d`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  running: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'Aktiv' },
  stopped: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Gestoppt' },
  creating: { bg: 'bg-yellow-500/15', text: 'text-yellow-500', label: 'Startet...' },
  committing: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Speichert...' },
  error: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Fehler' },
  none: { bg: 'bg-zinc-500/15', text: 'text-zinc-500', label: 'Nicht gestartet' },
};

export default function ProjectCard({
  project,
  onOpen,
  onStart,
  onStop,
  onDelete,
  onCommit,
  actionLoading,
}: ProjectCardProps) {
  const status = STATUS_STYLES[project.container_status] || STATUS_STYLES.none;
  const isRunning = project.container_status === 'running';
  const isBusy =
    project.container_status === 'creating' || project.container_status === 'committing';
  const isThisLoading = actionLoading === project.id;

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 p-4 bg-card border border-border/50 rounded-xl transition-all duration-200',
        'hover:border-primary/30 hover:shadow-md',
        isRunning && 'border-emerald-500/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
          onClick={() => isRunning && onOpen(project)}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${project.color || '#3b82f6'}20` }}
          >
            <Terminal className="size-5" style={{ color: project.color || '#3b82f6' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>
            )}
          </div>
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
            status.bg,
            status.text
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isRunning ? 'bg-emerald-500 animate-pulse' : `bg-current`
            )}
          />
          {status.label}
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {formatDate(project.last_accessed_at)}
        </span>
        {project.total_terminal_seconds > 0 && (
          <span className="flex items-center gap-1">
            <Terminal className="size-3" />
            {formatTime(project.total_terminal_seconds)}
          </span>
        )}
        {project.committed_image && (
          <span className="flex items-center gap-1" title="Container-Zustand gespeichert">
            <Save className="size-3" />
            Gespeichert
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {isRunning ? (
          <>
            <Button size="sm" onClick={() => onOpen(project)} className="flex-1">
              <Terminal className="size-3.5 mr-1.5" />
              Terminal
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCommit(project)}
              disabled={isThisLoading || isBusy}
              title="Container-Zustand speichern"
            >
              <Save className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStop(project)}
              disabled={isThisLoading || isBusy}
              title="Container stoppen"
            >
              <Square className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => onStart(project)}
              disabled={isThisLoading || isBusy}
              className="flex-1"
            >
              {isThisLoading || isBusy ? (
                <Box className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="size-3.5 mr-1.5" />
              )}
              {isThisLoading || isBusy ? 'Startet...' : 'Starten'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(project)}
              disabled={isThisLoading || isBusy}
              title="Projekt archivieren"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
