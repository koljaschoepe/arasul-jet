import React from 'react';
import { Cpu, Settings } from 'lucide-react';
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
 * »Flows« mit B3 (kein Erweiterungs-Store, kein Flow-Editor mehr).
 */
const VIEW_ENTRIES: Array<{ view: ActivityView; label: string; icon: React.ReactNode }> = [
  { view: 'models', label: 'Modelle', icon: <Cpu className="h-[18px] w-[18px]" /> },
];

/**
 * Activity-Bar (Plan 012 Phase B, Schritt 5): eine eigene, **immer sichtbare**
 * schmale Spalte ganz links — außerhalb des einklappbaren Sidebar-Panels.
 * Dadurch bleibt jede Ansicht erreichbar, auch wenn die Sidebar eingeklappt
 * ist.
 *
 * Oben die feste Ansicht »Modelle«, unten das Einstellungen-Zahnrad. Die
 * Kern-App-Einträge dazwischen (n8n) sind mit Phase B5 gefallen. Ein Klick auf eine Ansicht wählt sie und zieht die
 * Sidebar auf; erneuter Klick auf die aktive Ansicht klappt sie wieder ein
 * (VS-Code-Semantik, `selectView`). »Modelle« öffnet zusätzlich den Mitte-Tab.
 */
export function ActivityBar() {
  const activeView = useWorkspaceStore(s => s.activeView);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const selectView = useWorkspaceStore(s => s.selectView);
  const openTab = useWorkspaceStore(s => s.openTab);
  const handleView = (view: ActivityView) => {
    selectView(view);
    // Jede Ansicht zeigt ihren Inhalt auch in der Mitte.
    if (view === 'models') {
      openTab({ type: 'modelle' });
    }
  };

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
    >
      {VIEW_ENTRIES.map(entry => (
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
    </nav>
  );
}
