import { Search } from 'lucide-react';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Suche« (Plan 012 Phase B, Schritt 6 — Grundgerüst).
 * Die Volltext-/RAG-Trefferliste bindet Schritt 19 (Phase G) an den aktiven
 * Ordner an. Bis dahin steht hier die getragene Hülle bereit.
 */
export function SearchPanel() {
  return (
    <SidebarView title="Suche">
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Search className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Die Suche über den aktiven Ordner wird in einem späteren Schritt angebunden.
        </p>
      </div>
    </SidebarView>
  );
}
