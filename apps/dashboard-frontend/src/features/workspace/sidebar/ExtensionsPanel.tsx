import { Blocks } from 'lucide-react';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Erweiterungen« (Plan 012 Phase B, Schritt 6 — Grundgerüst).
 * Schritt 9 (Phase C) baut hier sinnvolle Filter für die Erweiterungen ein; die
 * Karten selbst stehen im Store-Mitte-Tab, den die Activity-Bar mitöffnet.
 */
export function ExtensionsPanel() {
  return (
    <SidebarView title="Erweiterungen">
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Blocks className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Die Erweiterungs-Filter folgen in einem späteren Schritt. Die Erweiterungen selbst stehen
          im Store-Bereich in der Mitte.
        </p>
      </div>
    </SidebarView>
  );
}
