import { useMemo, useState } from 'react';
import { Plus, Waypoints } from 'lucide-react';
import { useFlows } from '@/hooks/useFlows';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import { SidebarSearch } from '@/components/ui/SidebarSearch';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Flows« (Plan 012 Phase D, Schritt 12) — die echte
 * Übersicht. Listet alle Flows (echte Daten via `useFlows`); ein Klick öffnet
 * den zentralen Flow-Editor-Tab (Schritt 10) mit dem Flow, der Kopf-Knopf
 * »Neuer Flow« öffnet ihn leer. Ziel setzen + Tab öffnen läuft — wie bei
 * Modellen/Erweiterungen in der ActivityBar — über Ziel-Store + `openTab`.
 */
export function FlowsPanel() {
  const { flows, isLoading } = useFlows();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flows;
    return flows.filter(
      s => s.name.toLowerCase().includes(q) || (s.beschreibung ?? '').toLowerCase().includes(q)
    );
  }, [flows, query]);

  const oeffneEditor = (editName: string | null) => {
    setEditTarget(editName);
    openTab({ type: 'flow' });
  };

  return (
    <SidebarView
      title="Flows"
      actions={
        <button
          type="button"
          aria-label="Neuer Flow"
          title="Neuer Flow"
          onClick={() => oeffneEditor(null)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Flows werden geladen …</p>
      ) : flows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Waypoints className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Noch keine Flows angelegt.</p>
          <button
            type="button"
            onClick={() => oeffneEditor(null)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Flow anlegen
          </button>
        </div>
      ) : (
        <>
          <div className="p-2">
            <SidebarSearch
              value={query}
              onChange={setQuery}
              placeholder="Flows durchsuchen…"
              ariaLabel="Flows durchsuchen"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Kein Treffer für „{query}“.</p>
          ) : (
            <ul className="flex flex-col py-1">
              {filtered.map(flow => (
                <li key={flow.name}>
                  <button
                    type="button"
                    data-testid={`flow-open-${flow.name}`}
                    onClick={() => oeffneEditor(flow.name)}
                    className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent/50"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Waypoints
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">/{flow.name}</span>
                    </span>
                    {flow.beschreibung && (
                      <span className="truncate pl-5 text-xs text-muted-foreground">
                        {flow.beschreibung}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SidebarView>
  );
}
