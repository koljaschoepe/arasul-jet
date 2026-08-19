import { useMemo, useState } from 'react';
import { Plus, Waypoints } from 'lucide-react';
import { useFlows } from '@/hooks/useFlows';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import { SidebarSearch } from '@/components/ui/SidebarSearch';
import { SidebarView } from './SidebarView';
import { useActiveProject } from '../useProjects';
import type { Flow } from '@/types/flows';

/**
 * Sidebar-Ansicht »Flows« (Plan 012 Phase D, Schritt 12) — die echte
 * Übersicht. Listet die Flows des AKTIVEN Projekts plus die globalen (Plan 018:
 * Projekt-Vereinheitlichung — nicht mehr alle Projekte gleichzeitig); ein Klick
 * öffnet den zentralen Flow-Editor-Tab (Schritt 10) mit dem Flow, der
 * Kopf-Knopf »Neuer Flow« öffnet ihn leer. Ziel setzen + Tab öffnen läuft — wie
 * bei Modellen/Erweiterungen in der ActivityBar — über Ziel-Store + `openTab`.
 */
export function FlowsPanel() {
  const { flows, isLoading } = useFlows();
  const { activeId } = useActiveProject();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);
  const [query, setQuery] = useState('');

  // Auf das aktive Projekt scopen: globale Flows (ohne `projekt`) plus die des
  // aktiven Projekts. `/flows` liefert weiterhin alle — die Auswahl ist rein
  // clientseitig (Plan 018).
  const scoped = useMemo(
    () => flows.filter(f => !f.projekt || f.projekt.id === activeId),
    [flows, activeId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      s => s.name.toLowerCase().includes(q) || (s.beschreibung ?? '').toLowerCase().includes(q)
    );
  }, [scoped, query]);

  // Gruppen: zuerst Global, dann je Projekt (alphabetisch) — so bleibt die
  // gewohnte Liste oben stabil und Projekt-Flows sind klar zugeordnet.
  const gruppen = useMemo(() => {
    const global: Flow[] = [];
    const jeProjekt = new Map<string, { name: string; flows: Flow[] }>();
    for (const flow of filtered) {
      if (!flow.projekt) {
        global.push(flow);
      } else {
        const eintrag = jeProjekt.get(flow.projekt.id) ?? { name: flow.projekt.name, flows: [] };
        eintrag.flows.push(flow);
        jeProjekt.set(flow.projekt.id, eintrag);
      }
    }
    const projekte = [...jeProjekt.entries()]
      .map(([id, e]) => ({ id, ...e }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { global, projekte };
  }, [filtered]);

  // Klick auf einen Flow → Flow-Zentrale (Dashboard). »Neuer Flow« → leerer Editor.
  const oeffneFlow = (flow: Flow | null, mode: 'view' | 'edit') => {
    setEditTarget(flow?.name ?? null, mode, flow?.projekt ?? null);
    openTab({ type: 'flow' });
  };

  const flowZeile = (flow: Flow) => (
    <li key={`${flow.projekt?.id ?? 'global'}:${flow.name}`}>
      <button
        type="button"
        data-testid={`flow-open-${flow.name}`}
        onClick={() => oeffneFlow(flow, 'view')}
        className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent/50"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Waypoints className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">/{flow.name}</span>
        </span>
        {flow.beschreibung && (
          <span className="truncate pl-5 text-xs text-muted-foreground">{flow.beschreibung}</span>
        )}
      </button>
    </li>
  );

  return (
    <SidebarView
      title="Flows"
      actions={
        <button
          type="button"
          aria-label="Neuer Flow"
          title="Neuer Flow"
          onClick={() => oeffneFlow(null, 'edit')}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Flows werden geladen …</p>
      ) : scoped.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Waypoints className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Noch keine Flows in diesem Projekt.</p>
          <button
            type="button"
            onClick={() => oeffneFlow(null, 'edit')}
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
              placeholder="Suchen…"
              ariaLabel="Flows durchsuchen"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Kein Treffer für „{query}“.</p>
          ) : (
            <div className="flex flex-col py-1">
              {gruppen.global.length > 0 && (
                <>
                  {gruppen.projekte.length > 0 && (
                    <p className="px-3 pb-0.5 pt-1.5 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Global
                    </p>
                  )}
                  <ul className="flex flex-col">{gruppen.global.map(flowZeile)}</ul>
                </>
              )}
              {gruppen.projekte.map(gruppe => (
                <div key={gruppe.id} data-testid={`flow-gruppe-${gruppe.id}`}>
                  <p className="px-3 pb-0.5 pt-2 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Projekt „{gruppe.name}“
                  </p>
                  <ul className="flex flex-col">{gruppe.flows.map(flowZeile)}</ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SidebarView>
  );
}
