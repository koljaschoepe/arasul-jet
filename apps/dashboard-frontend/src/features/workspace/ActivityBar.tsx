import React from 'react';
import { AppWindow, Cpu, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ActivityView } from '@/stores/workspaceStore';

interface ActivityButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

/**
 * Icon-Button der Activity-Bar (~36px, Cursor-/VS-Code-Maß). Reiner
 * Darstellungs-Baustein — Zustand und Verhalten liegen in der ActivityBar.
 */
function ActivityButton({ label, onClick, active, children }: ActivityButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Die festen Sidebar-Ansichten (Plan 012 Phase B) in Anzeige-Reihenfolge.
 * »Dateien« ist mit B2 gefallen (kein Explorer mehr), »Erweiterungen« und
 * »Flows« mit B3 (kein Erweiterungs-Store, kein Flow-Editor mehr). »Apps«
 * kommt mit D1 dazu und steht oben: sie ist die linke Spalte des Zielbilds.
 *
 * `nurAdmin` blendet den Eintrag für einen Mitarbeiter aus. Das ist eine
 * Anzeige-Entscheidung und keine Berechtigung — die trifft `requireRole` im
 * Backend, und `/api/models/*` antwortet einem Mitarbeiter mit 403, ob dieser
 * Knopf nun da ist oder nicht. Ein Knopf, der bei jedem Klick 403 sagt, ist
 * kein Schutz, sondern eine Sackgasse.
 */
const VIEW_ENTRIES: Array<{
  view: ActivityView;
  label: string;
  icon: React.ReactNode;
  nurAdmin?: boolean;
}> = [
  { view: 'apps', label: 'Apps', icon: <AppWindow className="h-[18px] w-[18px]" /> },
  { view: 'models', label: 'Modelle', icon: <Cpu className="h-[18px] w-[18px]" />, nurAdmin: true },
];

/**
 * Activity-Bar (Plan 012 Phase B, Schritt 5): eine eigene, **immer sichtbare**
 * schmale Spalte ganz links — außerhalb des einklappbaren Sidebar-Panels.
 * Dadurch bleibt jede Ansicht erreichbar, auch wenn die Sidebar eingeklappt
 * ist.
 *
 * Oben »Apps« (D1), darunter »Modelle« für den Administrator, unten das
 * Einstellungen-Zahnrad — ebenfalls nur für ihn. Die Kern-App-Einträge
 * dazwischen (n8n) sind mit Phase B5 gefallen. Ein Klick auf eine Ansicht
 * wählt sie und zieht die Sidebar auf; erneuter Klick auf die aktive Ansicht
 * klappt sie wieder ein (VS-Code-Semantik, `selectView`). Jede Ansicht öffnet
 * zusätzlich ihren Tab in der Mitte.
 */
export function ActivityBar() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const activeView = useWorkspaceStore(s => s.activeView);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const selectView = useWorkspaceStore(s => s.selectView);
  const openTab = useWorkspaceStore(s => s.openTab);
  const handleView = (view: ActivityView) => {
    selectView(view);
    // Jede Ansicht zeigt ihren Inhalt auch in der Mitte.
    if (view === 'models') {
      openTab({ type: 'modelle' });
    } else if (view === 'apps') {
      openTab({ type: 'dashboard' });
    }
  };

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
    >
      {VIEW_ENTRIES.filter(entry => istAdmin || !entry.nurAdmin).map(entry => (
        <ActivityButton
          key={entry.view}
          label={entry.label}
          active={sidebarVisible && activeView === entry.view}
          onClick={() => handleView(entry.view)}
        >
          {entry.icon}
        </ActivityButton>
      ))}

      <div className="flex-1" aria-hidden="true" />

      {istAdmin && (
        <ActivityButton
          label="Einstellungen"
          active={sidebarVisible && activeView === 'settings'}
          onClick={() => {
            // Wie eine Sidebar-Ansicht: Sektionen erscheinen links (SettingsPanel),
            // der Mitte-Tab zeigt die gewählte Sektion (B4).
            selectView('settings');
            openTab({ type: 'settings' });
          }}
        >
          <Settings className="h-[18px] w-[18px]" />
        </ActivityButton>
      )}
    </nav>
  );
}
