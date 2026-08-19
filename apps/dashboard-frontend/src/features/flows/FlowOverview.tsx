/**
 * FlowOverview — die Flow-Startseite im zentralen Flow-Tab (`mode: 'overview'`).
 *
 * Öffnet sich über die ActivityBar-Ansicht »Flows«: vorne ein klarer Einstieg
 * zum Anlegen, darunter alle vorhandenen Flows (Global / je Projekt) als
 * klickbare Karten — ein Klick führt in die Flow-Zentrale (Dashboard).
 */
import { useMemo } from 'react';
import { Plus, Waypoints } from 'lucide-react';
import { useFlows } from '@/hooks/useFlows';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import type { Flow } from '@/types/flows';

export default function FlowOverview() {
  const { flows, isLoading } = useFlows();
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);

  const gruppen = useMemo(() => {
    const global: Flow[] = [];
    const jeProjekt = new Map<string, { name: string; flows: Flow[] }>();
    for (const flow of flows) {
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
  }, [flows]);

  const flowKarte = (flow: Flow) => (
    <button
      key={`${flow.projekt?.id ?? 'global'}:${flow.name}`}
      type="button"
      data-testid={`flow-card-${flow.name}`}
      onClick={() => setEditTarget(flow.name, 'view', flow.projekt ?? null)}
      className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Waypoints className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">/{flow.name}</span>
      </span>
      {flow.beschreibung && (
        <span className="line-clamp-2 text-xs text-muted-foreground">{flow.beschreibung}</span>
      )}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="flow-overview">
      <div className="flex h-ui-header shrink-0 items-center border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">Flows</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <button
            type="button"
            data-testid="flow-overview-neu"
            onClick={() => setEditTarget(null, 'edit')}
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Plus className="size-5 text-primary" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-foreground">Neuen Flow erstellen</span>
            <span className="max-w-md text-xs text-muted-foreground">
              Ein Flow ist ein wiederverwendbarer Auftrag an die KI, im Chat per /name gestartet
              oder automatisch über n8n.
            </span>
          </button>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Flows werden geladen …</p>
          ) : (
            <>
              {gruppen.global.length > 0 && (
                <section className="flex flex-col gap-2">
                  {gruppen.projekte.length > 0 && (
                    <h3 className="text-ui-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Global
                    </h3>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {gruppen.global.map(flowKarte)}
                  </div>
                </section>
              )}
              {gruppen.projekte.map(gruppe => (
                <section key={gruppe.id} className="flex flex-col gap-2">
                  <h3 className="text-ui-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Projekt „{gruppe.name}“
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {gruppe.flows.map(flowKarte)}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
