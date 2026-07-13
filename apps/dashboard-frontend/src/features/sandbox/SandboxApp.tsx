/**
 * SandboxApp - Tab-based terminal app with project management
 *
 * Layout:
 * - Tab bar: Open project tabs + [+] add button + [list] all projects
 * - Terminal area: xterm.js terminal for active session
 * - Welcome screen when no sessions are open
 * - ProjectListPanel overlay for managing all projects
 *
 * Session-State (welche Terminals offen sind, welches aktiv ist) lebt seit
 * Stufe 3 des Cursor-Shell-Neubaus NICHT mehr hier, sondern in der Terminal-
 * Session-Registry des workspaceStore (persistiert unter 'arasul_workspace').
 * Diese Komponente rendert die Sessions nur; der alte localStorage-Key
 * 'sandbox-open-tabs' wird einmalig in die Registry migriert.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import TerminalTabs from './TerminalTabs';
import ProjectListPanel from './ProjectListPanel';
import CreateProjectDialog from './CreateProjectDialog';
import EditProjectDialog from './EditProjectDialog';
import SandboxTerminal from './SandboxTerminal';
import type { SandboxProject, SandboxStats } from './types';

/** Legacy-Key (v2): Tab-State lag im SandboxApp-Lokalstate + localStorage. */
const LEGACY_TABS_KEY = 'sandbox-open-tabs';

interface SandboxAppProps {
  /**
   * Ist die App gerade sichtbar? Im Workspace hängt das am Terminal-Panel
   * (Keep-alive: ausgeblendet = display:none, nicht unmounted). Beim
   * Wieder-Einblenden triggert das den xterm-Refit — fit() auf verstecktem
   * Container liefert falsche Maße. Legacy-Route /terminal: immer sichtbar.
   */
  visible?: boolean;
}

export default function SandboxApp({ visible = true }: SandboxAppProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();

  // Session-Registry aus dem workspaceStore — die einzige Quelle der Wahrheit
  const terminalSessions = useWorkspaceStore(s => s.terminalSessions);
  const activeTabId = useWorkspaceStore(s => s.activeTerminalSessionId);
  const openTerminalSession = useWorkspaceStore(s => s.openTerminalSession);
  const closeTerminalSession = useWorkspaceStore(s => s.closeTerminalSession);
  const activateTerminalSession = useWorkspaceStore(s => s.activateTerminalSession);
  const updateTerminalSessionTitle = useWorkspaceStore(s => s.updateTerminalSessionTitle);

  // Data state
  const [projects, setProjects] = useState<SandboxProject[]>([]);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // UI state
  const [showProjectList, setShowProjectList] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editProject, setEditProject] = useState<SandboxProject | null>(null);

  // Offene Tabs = Registry-Sessions, aufgelöst auf frische Projektdaten
  const openTabs = useMemo(
    () =>
      terminalSessions
        .map(session => projects.find(p => p.id === session.id))
        .filter((p): p is SandboxProject => p != null && p.status === 'active'),
    [terminalSessions, projects]
  );

  // ---- Data loading ----

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get<{ projects: SandboxProject[]; total: number }>(
        '/sandbox/projects',
        { showError: false }
      );
      setProjects(data.projects);
      setProjectsLoaded(true);
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

  /**
   * Bootstrap (einmalig, nach dem ersten erfolgreichen Projekt-Load):
   * 1. Legacy-Migration: 'sandbox-open-tabs' (v2, Lokalstate) → Store-Registry,
   *    nur wenn die Registry noch leer ist; der Key wird danach entfernt.
   * 2. Auto-Start gestoppter Container für alle Registry-Sessions —
   *    gleiche Semantik wie der alte Tab-Restore.
   */
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!projectsLoaded || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const saved = localStorage.getItem(LEGACY_TABS_KEY);
    if (saved && useWorkspaceStore.getState().terminalSessions.length === 0) {
      try {
        const { tabs, activeId } = JSON.parse(saved) as {
          tabs: string[];
          activeId: string | null;
        };
        for (const id of tabs) {
          const project = projects.find(p => p.id === id && p.status === 'active');
          if (project) {
            openTerminalSession({ id: project.id, projectId: project.id, title: project.name });
          }
        }
        if (activeId) activateTerminalSession(activeId);
      } catch {
        // Korrupter localStorage-Eintrag — ignorieren
      }
    }
    localStorage.removeItem(LEGACY_TABS_KEY);

    for (const session of useWorkspaceStore.getState().terminalSessions) {
      const project = projects.find(p => p.id === session.id);
      if (
        project &&
        project.container_status !== 'running' &&
        project.container_status !== 'creating'
      ) {
        api.post(`/sandbox/projects/${project.id}/start`, {}, { showError: false }).catch(() => {});
      }
    }
  }, [projectsLoaded, projects, api, openTerminalSession, activateTerminalSession]);

  /**
   * Registry ↔ Projektliste synchron halten (nach jedem erfolgreichen Load):
   * archivierte/gelöschte Projekte schließen ihre Session, Umbenennungen
   * aktualisieren den Session-Titel (sichtbar u. a. in der StatusBar).
   */
  useEffect(() => {
    if (!projectsLoaded || !bootstrappedRef.current) return;
    for (const session of useWorkspaceStore.getState().terminalSessions) {
      const project = projects.find(p => p.id === session.id);
      if (!project || project.status !== 'active') {
        closeTerminalSession(session.id);
      } else if (project.name !== session.title) {
        updateTerminalSessionTitle(session.id, project.name);
      }
    }
  }, [projectsLoaded, projects, closeTerminalSession, updateTerminalSessionTitle]);

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

        // Session schließen, falls offen (Store aktiviert den Nachbarn)
        closeTerminalSession(project.id);

        await loadProjects();
        loadStats();
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        toast.error(e.data?.message || e.message || 'Fehler beim Archivieren');
      } finally {
        setActionLoading(null);
      }
    },
    [api, toast, showConfirm, loadProjects, loadStats, closeTerminalSession]
  );

  // One-click open: immediately opens session, starts container in background if needed
  const handleOpenProject = useCallback(
    async (project: SandboxProject) => {
      // 1. Session sofort registrieren/aktivieren — Terminal zeigt "Verbinde..."
      openTerminalSession({ id: project.id, projectId: project.id, title: project.name });
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
    [api, toast, loadProjects, openTerminalSession]
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
        onSelectTab={activateTerminalSession}
        onCloseTab={closeTerminalSession}
        onOpenProject={handleOpenProject}
        onCreateProject={() => setShowCreateDialog(true)}
        onShowAllProjects={() => setShowProjectList(!showProjectList)}
      />

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative">
        {/* Terminals - hidden but alive for non-active sessions (genau EINE
            useTerminal/WebSocket-Instanz pro Session, keyed by project id) */}
        {openTabs.map(project => (
          <div
            key={project.id}
            className="absolute inset-0"
            style={{ display: project.id === activeTabId ? 'flex' : 'none' }}
          >
            <SandboxTerminal
              projectId={project.id}
              containerStatus={project.container_status || 'none'}
              networkMode={project.network_mode}
              isVisible={visible && project.id === activeTabId}
              className="flex-1"
            />
          </div>
        ))}

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
