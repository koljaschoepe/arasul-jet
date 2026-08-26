import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ModelsPanel } from './sidebar/ModelsPanel';
import { SettingsPanel } from './sidebar/SettingsPanel';

/**
 * SidebarHost — Inhalt der linken Sidebar nach der aktiven Activity-Bar-Ansicht
 * (Plan 012 Phase B, Schritt 6). Die Activity-Bar selbst ist eine eigene,
 * immer sichtbare Spalte in der WorkspaceShell; das Einstellungen-Zahnrad
 * sitzt dort unten.
 *
 *   models      → Modell-Filter
 *   settings    → Bereiche der Einstellungen
 *   null        → leer
 *
 * Seit B2 gibt es keinen Datei-Explorer mehr, seit B3 keine Erweiterungs-Suche
 * und keine Flow-Liste; ohne gewählte Ansicht bleibt die Spalte leer, bis D1
 * sie mit der App-Liste füllt.
 */
export function SidebarHost() {
  const activeView = useWorkspaceStore(s => s.activeView);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="workspace-sidebar">
      {activeView === 'models' && <ModelsPanel />}
      {activeView === 'settings' && <SettingsPanel />}
      {activeView === null && (
        <div
          className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
          data-testid="workspace-sidebar-leer"
        >
          Noch nichts hier
        </div>
      )}
    </div>
  );
}
