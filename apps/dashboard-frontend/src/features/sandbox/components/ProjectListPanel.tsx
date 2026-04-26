/**
 * ProjectListPanel - Compact project management overlay
 *
 * Shows all projects in a compact list with status badges and quick actions.
 * Opens as an animated overlay panel from the tab bar.
 * Clicking a project row opens it (auto-starts if stopped).
 */

import { useState } from 'react';
import {
  X,
  Plus,
  Square,
  Terminal,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { SandboxProject, SandboxStats } from '../types';

interface ProjectListPanelProps {
  projects: SandboxProject[];
  stats: SandboxStats | null;
  loading: boolean;
  actionLoading: string | null;
  onClose: () => void;
  onOpenProject: (project: SandboxProject) => void;
  onStopProject: (project: SandboxProject) => void;
  onDeleteProject: (project: SandboxProject) => void;
  onEditProject: (project: SandboxProject) => void;
  onCreateProject: () => void;
  onRefresh: () => void;
  variant?: 'overlay' | 'inline';
}

const statusLabel = (status: SandboxProject['container_status']) => {
  switch (status) {
    case 'running':
      return { text: 'Aktiv', color: 'text-primary', dot: 'bg-primary' };
    case 'stopped':
      return { text: 'Gestoppt', color: 'text-muted-foreground', dot: 'bg-muted-foreground' };
    case 'creating':
      return { text: 'Startet...', color: 'text-primary', dot: 'bg-primary animate-pulse' };
    case 'committing':
      return { text: 'Speichert...', color: 'text-primary', dot: 'bg-primary animate-pulse' };
    case 'error':
      return { text: 'Fehler', color: 'text-destructive', dot: 'bg-destructive' };
    default:
      return { text: 'Bereit', color: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
  }
};

export default function ProjectListPanel({
  projects,
  stats,
  loading,
  actionLoading,
  onClose,
  onOpenProject,
  onStopProject,
  onDeleteProject,
  onEditProject,
  onCreateProject,
  onRefresh,
  variant = 'overlay',
}: ProjectListPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const isInline = variant === 'inline';

  const filtered = searchQuery
    ? projects.filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const content = (
    <div
      className={cn(
        'overflow-hidden flex flex-col',
        isInline
          ? 'w-full h-full border-0 rounded-none bg-transparent'
          : 'w-full max-w-xl mt-12 mx-4 border border-border rounded-lg shadow-2xl bg-card animate-in slide-in-from-top-4 fade-in duration-300'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-foreground">Alle Projekte</h2>
          {stats && (
            <span className="text-[10px] text-muted-foreground">
              {stats.active_projects} Projekte, {stats.running_containers} aktiv
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateProject}
            className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs gap-1"
          >
            <Plus className="size-3" />
            Neu
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground"
            title="Aktualisieren"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
          {!isInline && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      {projects.length > 3 && (
        <div className="px-4 py-2 border-b border-border/50 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Suchen..."
              className="w-full pl-8 pr-3 py-1.5 bg-muted border border-border/50 rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Project list */}
      <div className={cn(isInline ? 'flex-1 overflow-y-auto' : 'max-h-[50vh] overflow-y-auto')}>
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 text-muted-foreground animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Terminal className="size-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'Keine Treffer' : 'Noch keine Projekte'}
            </p>
            {!searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCreateProject}
                className="mt-2 text-xs text-primary"
              >
                <Plus className="size-3 mr-1" />
                Erstes Projekt erstellen
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(project => {
              const status = statusLabel(project.container_status);
              const isLoading = actionLoading === project.id;
              const isRunning = project.container_status === 'running';

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors duration-150 group text-left"
                >
                  {/* Color dot + name */}
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: project.color || '#45ADFF' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {project.name}
                    </div>
                    {project.description && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {project.description}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                    <span className={cn('text-[10px]', status.color)}>{status.text}</span>
                  </div>

                  {/* Secondary actions — only on hover */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {isLoading ? (
                      <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={e => {
                            e.stopPropagation();
                            onEditProject(project);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Bearbeiten"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {isRunning ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={e => {
                              e.stopPropagation();
                              onStopProject(project);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            title="Stoppen"
                          >
                            <Square className="size-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={e => {
                              e.stopPropagation();
                              onDeleteProject(project);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            title="Archivieren"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (isInline) return content;

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {content}
    </div>
  );
}
