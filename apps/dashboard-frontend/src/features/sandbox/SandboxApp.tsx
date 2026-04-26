/**
 * SandboxApp - Tab-based terminal app with project management
 *
 * Layout:
 * - Tab bar: Open project tabs + [+] add button + [list] all projects
 * - Terminal area: xterm.js terminal for active tab
 * - Welcome screen when no tabs are open
 * - ProjectListPanel overlay for managing all projects
 */

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import TerminalTabs from './components/TerminalTabs';
import ProjectListPanel from './components/ProjectListPanel';
import CreateProjectDialog from './components/CreateProjectDialog';
import EditProjectDialog from './components/EditProjectDialog';
import SandboxTerminal from './components/SandboxTerminal';
import type { SandboxProject, SandboxStats } from './types';

export default function SandboxApp() {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();

  // Data state
  const [projects, setProjects] = useState<SandboxProject[]>([]);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // UI state
  const [openTabs, setOpenTabs] = useState<SandboxProject[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editProject, setEditProject] = useState<SandboxProject | null>(null);
  const [hasRestoredTabs, setHasRestoredTabs] = useState(false);

  // ---- Data loading ----

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get<{ projects: SandboxProject[]; total: number }>(
        '/sandbox/projects',
        { showError: false }
      );
      setProjects(data.projects);

      // Update open tabs with fresh data — only if something actually changed
      setOpenTabs(prev => {
        const next = prev
          .map(tab => data.projects.find(p => p.id === tab.id))
          .filter((p): p is SandboxProject => p != null && p.status === 'active');
        // Skip update if tabs and statuses haven't changed
        if (
          next.length === prev.length &&
          next.every(
            (p, i) => p.id === prev[i].id && p.container_status === prev[i].container_status
          )
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      toast.error('Projekte konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

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

  // Auto-refresh while containers are running
  useEffect(() => {
    const hasRunning = projects.some(
      p => p.container_status === 'running' || p.container_status === 'creating'
    );
    if (!hasRunning) return;
    const interval = setInterval(loadProjects, 10000);
    return () => clearInterval(interval);
  }, [projects, loadProjects]);

  // Persist open tabs to localStorage
  useEffect(() => {
    if (!hasRestoredTabs) return; // Don't save before restore completes
    if (openTabs.length > 0) {
      localStorage.setItem(
        'sandbox-open-tabs',
        JSON.stringify({
          tabs: openTabs.map(t => t.id),
          activeId: activeTabId,
        })
      );
    } else {
      localStorage.removeItem('sandbox-open-tabs');
    }
  }, [openTabs, activeTabId, hasRestoredTabs]);

  // Restore tabs from localStorage (once, after first project load)
  useEffect(() => {
    if (hasRestoredTabs || loading || projects.length === 0) return;

    const saved = localStorage.getItem('sandbox-open-tabs');
    if (!saved) {
      setHasRestoredTabs(true);
      return;
    }

    try {
      const { tabs, activeId } = JSON.parse(saved) as { tabs: string[]; activeId: string | null };
      const restoredTabs = tabs
        .map(id => projects.find(p => p.id === id))
        .filter((p): p is SandboxProject => p != null && p.status === 'active');

      if (restoredTabs.length > 0) {
        setOpenTabs(restoredTabs);
        const validActiveId =
          activeId && restoredTabs.some(t => t.id === activeId) ? activeId : restoredTabs[0].id;
        setActiveTabId(validActiveId);

        // Auto-start stopped containers for restored tabs
        for (const tab of restoredTabs) {
          if (tab.container_status !== 'running' && tab.container_status !== 'creating') {
            api.post(`/sandbox/projects/${tab.id}/start`, {}, { showError: false }).catch(() => {});
          }
        }
      }
    } catch {
      // Corrupt localStorage — ignore
    }

    setHasRestoredTabs(true);
  }, [projects, loading, hasRestoredTabs, api]);

  // ---- Actions ----

  const handleStop = useCallback(
    async (project: SandboxProject) => {
      setActionLoading(project.id);
      try {
        await api.post(`/sandbox/projects/${project.id}/stop`, {}, { showError: false });
        toast.success(`Container für "${project.name}" gestoppt`);
        await loadProjects();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Container konnte nicht gestoppt werden');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, loadProjects]
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

        // Close tab if open
        setOpenTabs(prev => prev.filter(t => t.id !== project.id));
        setActiveTabId(prev => (prev === project.id ? null : prev));

        await loadProjects();
        loadStats();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Fehler beim Archivieren');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, showConfirm, loadProjects, loadStats]
  );

  // One-click open: immediately opens tab, starts container in background if needed
  const handleOpenProject = useCallback(
    async (project: SandboxProject) => {
      // 1. Immediately open the tab — terminal shows "Verbinde..."
      setOpenTabs(prev => {
        if (prev.some(t => t.id === project.id)) return prev;
        return [...prev, project];
      });
      setActiveTabId(project.id);
      setShowProjectList(false);

      // 2. Start container in background if not running
      if (project.container_status !== 'running') {
        try {
          await api.post(`/sandbox/projects/${project.id}/start`, {}, { showError: false });
          await loadProjects();
        } catch (err: unknown) {
          const e = err as { data?: { message?: string }; message?: string };
          toast.error(e.data?.message || e.message || 'Container konnte nicht gestartet werden');
        }
      }
    },
    [api, toast, loadProjects]
  );

  const handleCloseTab = useCallback(
    (projectId: string) => {
      setOpenTabs(prev => prev.filter(t => t.id !== projectId));
      setActiveTabId(prev => {
        if (prev !== projectId) return prev;
        // Switch to adjacent tab
        const idx = openTabs.findIndex(t => t.id === projectId);
        const next = openTabs[idx + 1] || openTabs[idx - 1];
        return next?.id || null;
      });
    },
    [openTabs]
  );

  const handleProjectCreated = useCallback(() => {
    setShowCreateDialog(false);
    loadProjects();
    loadStats();
  }, [loadProjects, loadStats]);

  const handleProjectUpdated = useCallback(() => {
    setEditProject(null);
    loadProjects();
  }, [loadProjects]);

  // ---- Render ----

  return (
    <div className="flex flex-col h-full bg-background rounded-lg overflow-hidden border border-border">
      {/* Tab bar */}
      <TerminalTabs
        openTabs={openTabs}
        activeTabId={activeTabId}
        allProjects={projects}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onOpenProject={handleOpenProject}
        onCreateProject={() => setShowCreateDialog(true)}
        onShowAllProjects={() => setShowProjectList(!showProjectList)}
      />

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative">
        {/* Terminals - hidden but alive for non-active tabs */}
        {openTabs.map(tab => {
          const project = projects.find(p => p.id === tab.id);
          const containerStatus = project?.container_status || 'none';
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            >
              <SandboxTerminal
                projectId={tab.id}
                containerStatus={containerStatus}
                className="flex-1"
              />
            </div>
          );
        })}

        {/* Default view when no tabs open — show project list directly */}
        {openTabs.length === 0 && (
          <ProjectListPanel
            variant="inline"
            projects={projects}
            stats={stats}
            loading={loading}
            actionLoading={actionLoading}
            onClose={() => {}}
            onOpenProject={handleOpenProject}
            onStopProject={handleStop}
            onDeleteProject={handleDelete}
            onEditProject={setEditProject}
            onCreateProject={() => setShowCreateDialog(true)}
            onRefresh={() => {
              setLoading(true);
              loadProjects();
              loadStats();
            }}
          />
        )}

        {/* Project list overlay (only when tabs are open) */}
        {showProjectList && openTabs.length > 0 && (
          <ProjectListPanel
            projects={projects}
            stats={stats}
            loading={loading}
            actionLoading={actionLoading}
            onClose={() => setShowProjectList(false)}
            onOpenProject={handleOpenProject}
            onStopProject={handleStop}
            onDeleteProject={handleDelete}
            onEditProject={setEditProject}
            onCreateProject={() => {
              setShowCreateDialog(true);
              setShowProjectList(false);
            }}
            onRefresh={() => {
              setLoading(true);
              loadProjects();
              loadStats();
            }}
          />
        )}
      </div>

      {/* Dialogs */}
      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleProjectCreated}
      />

      <EditProjectDialog
        project={editProject}
        onClose={() => setEditProject(null)}
        onUpdated={handleProjectUpdated}
      />

      {ConfirmDialog}
    </div>
  );
}
