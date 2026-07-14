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
import { nextTerminalSession, type OpenSession } from './sessionModel';
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

  // Offene Sessions = Registry-Sessions, aufgelöst auf frische Projektdaten.
  // Mehrere Sessions können dasselbe Projekt referenzieren (Mehrfach-Sitzungen);
  // die Auflösung erfolgt daher über projectId, nicht über die Session-Id.
  const openSessions = useMemo<OpenSession[]>(
    () =>
      terminalSessions
        .map(session => {
          const project = projects.find(p => p.id === session.projectId);
          return project && project.status === 'active' ? { session, project } : null;
        })
        .filter((x): x is OpenSession => x != null),
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

  // Auto-refresh while containers are running — oder eine offene Session noch
  // auf ihren Container wartet (z. B. Auto-Start nach Reboot): ohne Poll bliebe
  // das Terminal dauerhaft im »Container wird gestartet…«-Spinner, denn durch
  // das Keep-alive im Panel gibt es keinen Remount-Reload mehr.
  useEffect(() => {
    const hasRunning = projects.some(
      p => p.container_status === 'running' || p.container_status === 'creating'
    );
    const hasWaitingSession = terminalSessions.some(session => {
      const project = projects.find(p => p.id === session.projectId);
      return project != null && project.container_status !== 'running';
    });
    if (!hasRunning && !hasWaitingSession) return;
    const interval = setInterval(loadProjects, 10000);
    return () => clearInterval(interval);
  }, [projects, terminalSessions, loadProjects]);

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

    // Container je Projekt nur EINMAL starten, auch wenn mehrere Sessions
    // dasselbe Projekt referenzieren.
    const startRequests: Array<Promise<unknown>> = [];
    const startedProjects = new Set<string>();
    for (const session of useWorkspaceStore.getState().terminalSessions) {
      const project = projects.find(p => p.id === session.projectId);
      if (
        project &&
        !startedProjects.has(project.id) &&
        project.container_status !== 'running' &&
        project.container_status !== 'creating'
      ) {
        startedProjects.add(project.id);
        startRequests.push(
          api
            .post(`/sandbox/projects/${project.id}/start`, {}, { showError: false })
            .catch(() => {})
        );
      }
    }
    if (startRequests.length > 0) {
      // Nach den Starts die Projektliste nachziehen — erst mit
      // container_status 'running' verbindet SandboxTerminal; sonst hinge
      // der Restore dauerhaft im Spinner (kein Remount-Reload mehr).
      Promise.allSettled(startRequests).then(() => loadProjects());
    }
  }, [projectsLoaded, projects, api, openTerminalSession, activateTerminalSession, loadProjects]);

  /**
   * Registry ↔ Projektliste synchron halten (nach jedem erfolgreichen Load):
   * archivierte/gelöschte Projekte schließen ihre Session, Umbenennungen
   * aktualisieren den Session-Titel (sichtbar u. a. in der StatusBar).
   */
  useEffect(() => {
    if (!projectsLoaded || !bootstrappedRef.current) return;
    for (const session of useWorkspaceStore.getState().terminalSessions) {
      const project = projects.find(p => p.id === session.projectId);
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

        // ALLE offenen Sessions dieses Projekts schließen (Store aktiviert den
        // Nachbarn); mehrere Sitzungen pro Projekt sind möglich.
        for (const session of useWorkspaceStore
          .getState()
          .terminalSessions.filter(s => s.projectId === project.id)) {
          closeTerminalSession(session.id);
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
    [api, toast, showConfirm, loadProjects, loadStats, closeTerminalSession]
  );

  // One-click open: fokussiert eine bestehende Session des Projekts oder legt
  // die erste an; startet den Container bei Bedarf im Hintergrund.
  const handleOpenProject = useCallback(
    async (project: SandboxProject) => {
      // 1. Bestehende Session des Projekts wiederverwenden (fokussieren) oder
      //    erste anlegen. openTerminalSession dedupt nach Id → aktiviert + blendet
      //    das Terminal-Panel ein.
      const sessions = useWorkspaceStore.getState().terminalSessions;
      const existing = sessions.find(s => s.projectId === project.id);
      openTerminalSession(existing ?? nextTerminalSession(project.id, project.name, sessions));
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

  // "+ neue Sitzung": öffnet IMMER eine zusätzliche, unabhängige Session im
  // angegebenen Projekt (eigener tmux-Screen). Der Container läuft bereits.
  const handleNewSession = useCallback(
    (projectId: string) => {
      const state = useWorkspaceStore.getState();
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      openTerminalSession(nextTerminalSession(projectId, project.name, state.terminalSessions));
    },
    [projects, openTerminalSession]
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
      {/* Kopfzeile: Projekt-Wechsler + „neue Sitzung" + Session-Umschalter */}
      <TerminalTabs
        openSessions={openSessions}
        activeTabId={activeTabId}
        allProjects={projects}
        onSelectTab={activateTerminalSession}
        onCloseTab={closeTerminalSession}
        onOpenProject={handleOpenProject}
        onNewSession={handleNewSession}
        onCreateProject={() => setShowCreateDialog(true)}
        onShowAllProjects={() => setShowProjectList(!showProjectList)}
      />

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative">
        {/* Terminals - hidden but alive for non-active sessions (genau EINE
            useTerminal/WebSocket-Instanz pro Session, keyed by session id;
            mehrere Sessions pro Projekt via distinktem tmux-Namen) */}
        {openSessions.map(({ session, project }) => (
          <div
            key={session.id}
            className="absolute inset-0"
            style={{ display: session.id === activeTabId ? 'flex' : 'none' }}
          >
            <SandboxTerminal
              projectId={project.id}
              terminalName={session.terminalName}
              containerStatus={project.container_status || 'none'}
              networkMode={project.network_mode}
              isVisible={visible && session.id === activeTabId}
              className="flex-1"
            />
          </div>
        ))}

        {/* Default view when no sessions open — show project list directly */}
        {openSessions.length === 0 && (
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

        {/* Project list overlay (only when sessions are open) */}
        {showProjectList && openSessions.length > 0 && (
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
