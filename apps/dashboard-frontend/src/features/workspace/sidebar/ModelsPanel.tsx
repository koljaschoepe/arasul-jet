import { Cpu } from 'lucide-react';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Modelle« (Plan 012 Phase B, Schritt 6 — Grundgerüst).
 * Schritt 7 (Phase C) verlegt die Modell-Filter (Typ · Größe · Status) aus dem
 * Content hierher; die Karten stehen bereits im Store-Mitte-Tab, den die
 * Activity-Bar mitöffnet.
 */
export function ModelsPanel() {
  return (
    <SidebarView title="Modelle">
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Cpu className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Die Modell-Filter ziehen in einem späteren Schritt hierher. Die Modelle selbst stehen im
          Store-Bereich in der Mitte.
        </p>
      </div>
    </SidebarView>
  );
}
