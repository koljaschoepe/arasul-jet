/**
 * ProjektUebersichtTab (Plan 018) — die Übersichtsseite EINES Projekts. Folgt
 * dem aktiven Workspace-Projekt (wie die Kundenübersicht) und zeigt:
 *  • Info: Netzmodus + angeschlossene Ablage des gekoppelten Terminal-Containers,
 *  • Werkstatt: die gebauten Erweiterungen — nur, wenn welche existieren,
 *  • Schnellzugriff: Terminal / Dateien / Flows dieses Projekts.
 *
 * Der Terminal-Container wird über den ensure-Endpunkt aus dem aktiven Projekt
 * abgeleitet (1:1-Kopplung, Plan 018). „← Projekte" führt zur Startseite zurück.
 * Die Werkstatt wird über die bestehende Komponente wiederverwendet.
 */
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Network,
  FolderGit2,
  TerminalSquare,
  Files,
  Waypoints,
  Blocks,
} from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useExtensions } from '@/hooks/useExtensions';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import EmptyState from '@/components/ui/EmptyState';
import WerkstattPanel from '@/features/sandbox/WerkstattPanel';
import type { SandboxProject, SandboxNetworkMode } from '@/features/sandbox/types';
import { useActiveProject } from '../useProjects';

const NETZ_LABEL: Record<SandboxNetworkMode, string> = {
  isolated: 'Abgeschottet (nur Internet)',
  internal: 'Intern (KI-Dienste + Datenbank)',
  infrastructure: 'Infrastruktur (Plattform-Zugriff)',
};

export default function ProjektUebersichtTab() {
  const api = useApi();
  const { activeProject, activeId } = useActiveProject();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const selectView = useWorkspaceStore(s => s.selectView);
  const { loadInventar } = useExtensions();

  // Gekoppelten Terminal-Container aus dem aktiven Projekt ableiten (1:1). Der
  // Query-Key wird mit dem Terminal geteilt → nur EIN ensure-Aufruf.
  const { data: container, isLoading } = useQuery({
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

  // Werkstatt-Inventar (nur zum Gaten des Abschnitts) — teilt den Query-Key mit
  // dem WerkstattPanel, daher kein doppelter Netzaufruf.
  const { data: inventar = [] } = useQuery({
    queryKey: ['werkstatt-inventar', container?.slug],
    queryFn: () => loadInventar(container!.slug),
    enabled: !!container?.slug,
    staleTime: 15_000,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="projekt-uebersicht">
      <div className="flex h-ui-header shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={() => openTab({ type: 'projekte' })}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Zur Projektliste"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Projekte
        </button>
        <span className="text-muted-foreground/50" aria-hidden="true">
          /
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {activeProject?.name ?? 'Kein Projekt'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!activeId ? (
          <div className="p-4">
            <EmptyState
              icon={<FolderGit2 />}
              title="Kein Projekt aktiv"
              description="Wähle oben links ein Projekt oder öffne die Projektliste."
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
            {/* Schnellzugriff */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              <button
                type="button"
                data-testid="schnellzugriff-terminal"
                onClick={() => setRightPanelMode('terminal')}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <TerminalSquare className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Terminal
              </button>
              <button
                type="button"
                onClick={() => selectView('files')}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <Files className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Dateien
              </button>
              <button
                type="button"
                onClick={() => selectView('flows')}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <Waypoints className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Flows
              </button>
            </div>

            {/* Info */}
            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-2 text-ui-sm font-semibold text-foreground">
                <Network className="size-4 text-muted-foreground" aria-hidden="true" />
                Terminal-Umgebung
              </h3>
              {isLoading || !container ? (
                <p className="text-ui-sm text-muted-foreground">Container wird ermittelt …</p>
              ) : (
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-ui-sm">
                  <dt className="text-muted-foreground">Netzmodus</dt>
                  <dd className="text-foreground">{NETZ_LABEL[container.network_mode]}</dd>
                  <dt className="text-muted-foreground">Ablage</dt>
                  <dd className="text-foreground">
                    {container.project_id ? 'An dieses Projekt gekoppelt' : 'Nicht gekoppelt'}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-foreground">
                    {container.container_status === 'running' ? 'Läuft' : 'Bereit'}
                  </dd>
                </dl>
              )}
            </div>

            {/* Werkstatt — nur wenn Erweiterungen existieren (Plan 018) */}
            {container && inventar.length > 0 && (
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-ui-sm font-semibold text-foreground">
                  <Blocks className="size-4 text-primary" aria-hidden="true" />
                  Erweiterungen dieses Projekts
                </div>
                <WerkstattPanel projekt={container} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
