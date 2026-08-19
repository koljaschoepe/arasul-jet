/**
 * SandboxApp — das Terminal des AKTIVEN Workspace-Projekts (Plan 018:
 * Projekt-Vereinheitlichung).
 *
 * Das Terminal folgt seit Plan 018 dem oben gewählten Workspace-Projekt: es hat
 * KEINEN eigenen Projekt-Umschalter mehr. Der gekoppelte Sandbox-Container wird
 * über den ensure-Endpunkt aus `useActiveProject().activeId` abgeleitet (1:1-
 * Kopplung) und bei Bedarf automatisch angelegt (Netz „intern") und gestartet.
 *
 * Session-State (welche Sitzungen offen sind, welche aktiv ist) lebt in der
 * Terminal-Session-Registry des workspaceStore (persistiert unter
 * 'arasul_workspace'); die Sitzungen sind über ihre `projectId` (= Container-Id)
 * pro Projekt partitioniert und bleiben so beim Projektwechsel erhalten. Diese
 * Komponente rendert nur die Sitzungen des aktuell gekoppelten Containers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, TerminalSquare } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useActiveProject } from '../workspace/useProjects';
import TerminalTabs from './TerminalTabs';
import SandboxTerminal from './SandboxTerminal';
import { nextTerminalSession, type OpenSession } from './sessionModel';
import type { SandboxProject } from './types';

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
  const qc = useQueryClient();
  const { activeProject, activeId } = useActiveProject();

  // Session-Registry aus dem workspaceStore — die einzige Quelle der Wahrheit.
  const terminalSessions = useWorkspaceStore(s => s.terminalSessions);
  const activeTabId = useWorkspaceStore(s => s.activeTerminalSessionId);
  const openTerminalSession = useWorkspaceStore(s => s.openTerminalSession);
  const closeTerminalSession = useWorkspaceStore(s => s.closeTerminalSession);
  const activateTerminalSession = useWorkspaceStore(s => s.activateTerminalSession);
  const updateTerminalSessionTitle = useWorkspaceStore(s => s.updateTerminalSessionTitle);

  // Gekoppelten Container aus dem aktiven Projekt ableiten (1:1). Der Query-Key
  // wird mit der Projekt-Übersichtsseite geteilt → nur EIN ensure-Aufruf.
  const {
    data: container,
    isLoading: containerLoading,
    isError: containerError,
  } = useQuery({
    // useQuery statt useMutation, damit sich SandboxApp und die Projekt-
    // Übersichtsseite EINEN ensure-Aufruf teilen (Key = aktives Projekt). Der
    // Endpunkt ist idempotent (lookup-or-create), daher als Query unbedenklich.
    queryKey: ['sandbox-ensure', activeId],
    queryFn: () =>
      api.post<{ project: SandboxProject }>(
        '/sandbox/projects/ensure',
        { project_id: activeId },
        { showError: false }
      ),
    enabled: !!activeId,
    staleTime: 60_000,
    retry: false,
    select: res => res.project,
  });

  const containerId = container?.id ?? null;

  // Live-Status des Containers, solange er (noch) nicht läuft — treibt den
  // Verbindungs-/Spinner-Zustand von SandboxTerminal. Kein Poll mehr, sobald er
  // läuft.
  const { data: statusData } = useQuery({
    queryKey: ['sandbox-status', containerId],
    queryFn: () =>
      api.get<{ status: { running: boolean; status?: string } }>(
        `/sandbox/projects/${containerId}/status`,
        { showError: false }
      ),
    enabled: !!containerId && visible,
    refetchInterval: query => {
      const running = (query.state.data as { status?: { running?: boolean } } | undefined)?.status
        ?.running;
      return running ? false : 2500;
    },
  });

  const effectiveStatus: SandboxProject['container_status'] = statusData?.status?.running
    ? 'running'
    : (container?.container_status ?? 'none');

  // Sitzungen des gekoppelten Containers (pro Projekt gemerkt).
  const sessionsOfContainer = useMemo<OpenSession[]>(
    () =>
      container
        ? terminalSessions
            .filter(session => session.projectId === container.id)
            .map(session => ({ session, project: container }))
        : [],
    [terminalSessions, container]
  );

  // Effektiv aktive Sitzung: die Store-Auswahl, sofern sie zu diesem Container
  // gehört — sonst die erste Sitzung des Containers.
  const effectiveActiveId = useMemo(() => {
    if (sessionsOfContainer.some(({ session }) => session.id === activeTabId)) return activeTabId;
    return sessionsOfContainer[0]?.session.id ?? null;
  }, [sessionsOfContainer, activeTabId]);

  // ---- Sitzungs-Titel (geräteweit gleich) ----
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({});

  const loadSessionMeta = useCallback(
    async (cid: string) => {
      try {
        const data = await api.get<{ titles?: Record<string, string> }>(
          `/sandbox/projects/${cid}/sessions`,
          { showError: false }
        );
        const titles = data.titles || {};
        setSessionTitles(titles);
        for (const s of useWorkspaceStore.getState().terminalSessions) {
          if (s.projectId !== cid) continue;
          const t = titles[s.terminalName || 'main'];
          if (t && t !== s.title) updateTerminalSessionTitle(s.id, t);
        }
      } catch {
        /* Meta ist Beiwerk — Fehler still schlucken */
      }
    },
    [api, updateTerminalSessionTitle]
  );

  useEffect(() => {
    setSessionTitles({});
    if (!containerId) return;
    void loadSessionMeta(containerId);
  }, [containerId, loadSessionMeta]);

  const handleRenameSession = useCallback(
    async (tmuxName: string, title: string) => {
      if (!containerId) return;
      const sess = terminalSessions.find(
        s => s.projectId === containerId && (s.terminalName || 'main') === tmuxName
      );
      if (sess) updateTerminalSessionTitle(sess.id, title);
      setSessionTitles(prev => ({ ...prev, [tmuxName]: title }));
      try {
        await api.put(
          `/sandbox/projects/${containerId}/sitzungen/${encodeURIComponent(tmuxName)}/titel`,
          { title },
          { showError: false }
        );
      } catch {
        toast.error('Sitzung konnte nicht umbenannt werden');
        void loadSessionMeta(containerId);
      }
    },
    [containerId, terminalSessions, updateTerminalSessionTitle, api, toast, loadSessionMeta]
  );

  // ---- Auto-Öffnen der ersten Sitzung + Auto-Start des Containers ----
  // Nur wenn das Terminal sichtbar ist (sonst würde das Panel den Chat-Modus
  // kapern). Je Container genau EINMAL — so kann der Nutzer die letzte Sitzung
  // schließen, ohne dass sie sofort wieder aufpoppt.
  const autoOpenedRef = useRef<Set<string>>(new Set());
  const startedRef = useRef<Set<string>>(new Set());

  const openNewSession = useCallback(() => {
    if (!container) return;
    openTerminalSession(
      nextTerminalSession(
        container.id,
        container.name,
        useWorkspaceStore.getState().terminalSessions
      )
    );
  }, [container, openTerminalSession]);

  useEffect(() => {
    if (!container || !visible) return;
    const cid = container.id;

    // 1. Erste Sitzung des Containers automatisch anlegen (einmal je Container).
    if (sessionsOfContainer.length === 0) {
      if (!autoOpenedRef.current.has(cid)) {
        autoOpenedRef.current.add(cid);
        openNewSession();
      }
      return; // auf die Registrierung warten
    }

    // 2. Aktive Sitzung muss zu diesem Container gehören.
    const first = sessionsOfContainer[0];
    if (first && !sessionsOfContainer.some(({ session }) => session.id === activeTabId)) {
      activateTerminalSession(first.session.id);
    }

    // 3. Container bei Bedarf starten (einmal je Container).
    if (
      effectiveStatus !== 'running' &&
      effectiveStatus !== 'creating' &&
      !startedRef.current.has(cid)
    ) {
      startedRef.current.add(cid);
      api
        .post(`/sandbox/projects/${cid}/start`, {}, { showError: false })
        .then(() => qc.invalidateQueries({ queryKey: ['sandbox-status', cid] }))
        .catch(() => {
          // Fehlgeschlagener Auto-Start darf den Container nicht dauerhaft
          // stranden lassen (Keep-alive-Komponente): Sperre lösen, damit ein
          // Projektwechsel/„neue Sitzung" erneut startet, und den Nutzer
          // informieren (es gibt keinen separaten Start-Knopf mehr).
          startedRef.current.delete(cid);
          toast.error('Terminal-Container konnte nicht gestartet werden, bitte erneut versuchen');
        });
    }
  }, [
    container,
    visible,
    sessionsOfContainer,
    activeTabId,
    effectiveStatus,
    openNewSession,
    activateTerminalSession,
    api,
    qc,
    toast,
  ]);

  // ---- Render ----

  return (
    <div className="flex flex-col h-full bg-background rounded-lg overflow-hidden border border-border">
      <TerminalTabs
        projectName={activeProject?.name ?? container?.name ?? null}
        sessions={sessionsOfContainer}
        activeTabId={effectiveActiveId}
        sessionTitles={sessionTitles}
        onSelectTab={activateTerminalSession}
        onCloseTab={closeTerminalSession}
        onNewSession={openNewSession}
        onRenameSession={handleRenameSession}
      />

      <div className="flex-1 min-h-0 relative">
        {/* Terminals — hidden but alive für nicht-aktive Sitzungen (genau EINE
            useTerminal/WebSocket-Instanz pro Session, keyed by session id). */}
        {container &&
          sessionsOfContainer.map(({ session }) => (
            <div
              key={session.id}
              className="absolute inset-0 flex-col"
              style={{ display: session.id === effectiveActiveId ? 'flex' : 'none' }}
            >
              <SandboxTerminal
                projectId={container.id}
                terminalName={session.terminalName}
                containerStatus={effectiveStatus}
                networkMode={container.network_mode}
                isVisible={visible && session.id === effectiveActiveId}
                className="flex-1"
              />
            </div>
          ))}

        {/* Zustände ohne offene Sitzung */}
        {sessionsOfContainer.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {!activeId ? (
              <p className="text-sm text-muted-foreground">Kein Projekt aktiv.</p>
            ) : containerLoading ? (
              <>
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Terminal wird vorbereitet …</p>
              </>
            ) : containerError ? (
              <p className="text-sm text-destructive">
                Terminal konnte nicht vorbereitet werden. Bitte erneut versuchen.
              </p>
            ) : (
              <>
                <TerminalSquare className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Keine offene Sitzung in „{activeProject?.name ?? 'diesem Projekt'}&ldquo;.
                </p>
                <button
                  type="button"
                  onClick={openNewSession}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Terminal-Sitzung starten
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
