/**
 * SandboxApp - Main sandbox/terminal app
 *
 * Two views:
 * 1. Project list (default) - shows all projects, create new ones
 * 2. Project terminal (when a project is opened) - fullscreen terminal
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowLeft, Terminal, RefreshCw, Search, Box, Save, Square } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ProjectCard from './ProjectCard';
import CreateProjectDialog from './CreateProjectDialog';
import SandboxTerminal from './SandboxTerminal';
import type { SandboxProject, SandboxStats } from './types';

export default function SandboxApp() {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();

  // State
  const [projects, setProjects] = useState<SandboxProject[]>([]);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeProject, setActiveProject] = useState<SandboxProject | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch projects
  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get<{ projects: SandboxProject[]; total: number }>(
        `/sandbox/projects${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`,
        { showError: false }
      );
      setProjects(data.projects);
    } catch {
      toast.error('Projekte konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [api, searchQuery, toast]);

  // Fetch stats
  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<{ stats: SandboxStats }>('/sandbox/stats', { showError: false });
      setStats(data.stats);
    } catch {
      // Stats are non-critical
    }
  }, [api]);

  useEffect(() => {
    loadProjects();
    loadStats();
  }, [loadProjects, loadStats]);

  // Auto-refresh running containers
  useEffect(() => {
    const hasRunning = projects.some(
      p => p.container_status === 'running' || p.container_status === 'creating'
    );
    if (!hasRunning) return;
    const interval = setInterval(loadProjects, 10000);
    return () => clearInterval(interval);
  }, [projects, loadProjects]);

  // Actions
  const handleStart = useCallback(
    async (project: SandboxProject) => {
      setActionLoading(project.id);
      try {
        await api.post(`/sandbox/projects/${project.id}/start`, {}, { showError: false });
        toast.success(`Container für "${project.name}" gestartet`);
        await loadProjects();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Container konnte nicht gestartet werden');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, loadProjects]
  );

  const handleStop = useCallback(
    async (project: SandboxProject) => {
      setActionLoading(project.id);
      try {
        await api.post(`/sandbox/projects/${project.id}/stop`, {}, { showError: false });
        toast.success(`Container für "${project.name}" gestoppt`);
        if (activeProject?.id === project.id) {
          setActiveProject(null);
          setIsFullscreen(false);
        }
        await loadProjects();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Container konnte nicht gestoppt werden');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, loadProjects, activeProject]
  );

  const handleDelete = useCallback(
    async (project: SandboxProject) => {
      const confirmed = await showConfirm({
        message: `Projekt "${project.name}" wirklich archivieren? Der Container und alle installierten Pakete gehen verloren.`,
      });
      if (!confirmed) return;

      setActionLoading(project.id);
      try {
        await api.del(`/sandbox/projects/${project.id}`, { showError: false });
        toast.success(`Projekt "${project.name}" archiviert`);
        if (activeProject?.id === project.id) {
          setActiveProject(null);
          setIsFullscreen(false);
        }
        await loadProjects();
        loadStats();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Fehler beim Archivieren');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, showConfirm, loadProjects, loadStats, activeProject]
  );

  const handleCommit = useCallback(
    async (project: SandboxProject) => {
      setActionLoading(project.id);
      try {
        await api.post(`/sandbox/projects/${project.id}/commit`, {}, { showError: false });
        toast.success(`Container-Zustand für "${project.name}" gespeichert`);
        await loadProjects();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Fehler beim Speichern');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, loadProjects]
  );

  const handleOpen = useCallback(
    async (project: SandboxProject) => {
      // If not running, start first
      if (project.container_status !== 'running') {
        setActionLoading(project.id);
        try {
          await api.post(`/sandbox/projects/${project.id}/start`, {}, { showError: false });
          await loadProjects();
        } catch (err: unknown) {
          const e = err as { data?: { message?: string }; message?: string };
          toast.error(e.data?.message || e.message || 'Container konnte nicht gestartet werden');
          setActionLoading(null);
          return;
        }
        setActionLoading(null);
      }
      setActiveProject(project);
      setIsFullscreen(true);
    },
    [api, toast, loadProjects]
  );

  const handleBack = useCallback(() => {
    setActiveProject(null);
    setIsFullscreen(false);
    loadProjects();
  }, [loadProjects]);

  const handleProjectCreated = useCallback(
    (project: SandboxProject) => {
      setShowCreateDialog(false);
      loadProjects();
      loadStats();
    },
    [loadProjects, loadStats]
  );

  // Terminal view (fullscreen)
  if (activeProject) {
    return (
      <div
        className={cn(
          'flex flex-col bg-background',
          isFullscreen ? 'fixed inset-0 z-50' : 'h-full'
        )}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="size-4 mr-1" />
              Zurück
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{ backgroundColor: `${activeProject.color || '#3b82f6'}20` }}
              >
                <Terminal
                  className="size-3.5"
                  style={{ color: activeProject.color || '#3b82f6' }}
                />
              </div>
              <span className="text-sm font-medium text-foreground">{activeProject.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeProject.committed_image && (
              <span
                className="text-xs text-muted-foreground flex items-center gap-1 mr-1"
                title="Container-Snapshot vorhanden"
              >
                <Save className="size-3" />
                Snapshot
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCommit(activeProject)}
              disabled={actionLoading === activeProject.id}
              title="Container-Zustand als Snapshot speichern (installierte Pakete bleiben erhalten)"
            >
              <Box className="size-3.5 mr-1.5" />
              Snapshot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStop(activeProject)}
              disabled={actionLoading === activeProject.id}
            >
              <Square className="size-3.5 mr-1.5" />
              Stoppen
            </Button>
          </div>
        </div>

        {/* Terminal */}
        <div className="flex-1 min-h-0">
          <SandboxTerminal
            projectId={activeProject.id}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          />
        </div>

        <ConfirmDialog />
      </div>
    );
  }

  // Project list view
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="settings-section-title">Sandbox</h1>
            <p className="settings-section-description">
              Isolierte Entwicklungsumgebungen mit persistentem Speicher
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="size-4 mr-1.5" />
            Neues Projekt
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-4 flex-wrap mb-6">
          {[
            { label: 'Projekte', value: stats.active_projects },
            { label: 'Laufend', value: stats.running_containers },
            {
              label: 'Terminal-Zeit',
              value:
                stats.total_terminal_hours > 0 ? `${stats.total_terminal_hours.toFixed(1)}h` : '0h',
            },
          ].map(item => (
            <div
              key={item.label}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border/50 rounded-lg text-sm"
            >
              <span className="text-muted-foreground">{item.label}:</span>
              <span className="font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + Refresh */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Projekte suchen..."
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setLoading(true);
            loadProjects();
            loadStats();
          }}
          title="Aktualisieren"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Project grid */}
      <div className="settings-cards">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <Terminal className="size-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Keine Projekte</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Erstelle dein erstes Sandbox-Projekt, um loszulegen.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="size-4 mr-1.5" />
              Neues Projekt
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpen}
                onStart={handleStart}
                onStop={handleStop}
                onDelete={handleDelete}
                onCommit={handleCommit}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleProjectCreated}
      />

      <ConfirmDialog />
    </div>
  );
}
