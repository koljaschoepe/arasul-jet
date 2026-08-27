import { useWorkspaceStore, nurFuerAdmin } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { AppsPanel } from './sidebar/AppsPanel';
import { ModelsPanel } from './sidebar/ModelsPanel';
import { SettingsPanel } from './sidebar/SettingsPanel';

/**
 * SidebarHost — Inhalt der linken Sidebar nach der aktiven Activity-Bar-Ansicht
 * (Plan 012 Phase B, Schritt 6). Die Activity-Bar selbst ist eine eigene,
 * immer sichtbare Spalte in der WorkspaceShell; das Einstellungen-Zahnrad
 * sitzt dort unten.
 *
 *   apps        → die eigenen Apps (D1, die Voreinstellung)
 *   models      → Modell-Filter          (nur Administrator)
 *   settings    → Bereiche der Einstellungen (nur Administrator)
 *
 * Seit B2 gibt es keinen Datei-Explorer mehr, seit B3 keine Erweiterungs-Suche
 * und keine Flow-Liste. Zwischen B2 und D1 stand die Spalte ohne gewählte
 * Ansicht leer; seit D1 hat sie eine Voreinstellung und damit keinen
 * Leerzustand mehr.
 *
 * Ein Mitarbeiter, dessen gespeicherter Stand auf einer Admin-Ansicht steht
 * (er war einmal Administrator, oder er hat den localStorage von Hand
 * angefasst), sieht die Apps. Das ist Ausblenden, keine Berechtigung: die
 * Wege hinter den beiden Ansichten antworten ihm ohnehin mit 403.
 */
export function SidebarHost() {
  const { user } = useAuth();
  const gespeichert = useWorkspaceStore(s => s.activeView);
  const activeView = user?.role !== 'admin' && nurFuerAdmin(gespeichert) ? 'apps' : gespeichert;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="workspace-sidebar">
      {activeView === 'apps' && <AppsPanel />}
      {activeView === 'models' && <ModelsPanel />}
      {activeView === 'settings' && <SettingsPanel />}
    </div>
  );
}
