/**
 * ProjekteStartTab (Plan 018) — die Projekt-Startseite: eine Kachelliste aller
 * Workspace-Projekte. Ein Klick aktiviert das Projekt (Dateien, Flows und
 * Terminal folgen ihm) und öffnet seine Übersichtsseite. Einstieg der
 * Navigation „Liste → Projekt → Übersicht → Arbeiten".
 */
import { FolderKanban, Check } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import EmptyState from '@/components/ui/EmptyState';
import { DEFAULT_PROJECT_COLOR } from '@/lib/themeColors';
import { useProjects, useActiveProject } from '../useProjects';

export default function ProjekteStartTab() {
  const { projects, isLoading } = useProjects();
  const { activeId, setActive } = useActiveProject();
  const openTab = useWorkspaceStore(s => s.openTab);

  const oeffne = (id: string) => {
    // Projekt aktiv setzen (Dateien/Flows/Terminal folgen) und Übersicht öffnen.
    if (id !== activeId) setActive.mutate(id);
    openTab({ type: 'projektuebersicht' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="projekte-start">
      <div className="flex h-ui-header shrink-0 items-center gap-2 border-b border-border px-3">
        <FolderKanban className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold text-foreground">Projekte</span>
        <span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">
          {projects.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Projekte werden geladen …</p>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban />}
            title="Noch keine Projekte"
            description="Lege oben links über den Projekt-Umschalter dein erstes Projekt an."
          />
        ) : (
          <div className="mx-auto grid w-full max-w-4xl grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                data-testid={`projekt-kachel-${p.id}`}
                onClick={() => oeffne(p.id)}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color || DEFAULT_PROJECT_COLOR }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                  {p.id === activeId && (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                </div>
                {p.description && (
                  <p className="line-clamp-2 text-ui-xs text-muted-foreground">{p.description}</p>
                )}
                <span className="mt-auto text-ui-xs tabular-nums text-muted-foreground">
                  {p.folder_count} {p.folder_count === 1 ? 'Ordner' : 'Ordner'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
