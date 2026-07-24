import React from 'react';
import { Files, Cpu, Blocks, Wand2, Workflow, Settings } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ActivityView, WorkspaceTabSpec } from '@/stores/workspaceStore';
import { useExtensionStore } from '@/stores/extensionStore';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';

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
export function ActivityButton({ label, onClick, active, children }: ActivityButtonProps) {
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

/** Die festen Sidebar-Ansichten (Plan 012 Phase B) in Anzeige-Reihenfolge. */
const VIEW_ENTRIES: Array<{ view: ActivityView; label: string; icon: React.ReactNode }> = [
  { view: 'files', label: 'Dateien', icon: <Files className="h-[18px] w-[18px]" /> },
  { view: 'models', label: 'Modelle', icon: <Cpu className="h-[18px] w-[18px]" /> },
  { view: 'extensions', label: 'Erweiterungen', icon: <Blocks className="h-[18px] w-[18px]" /> },
  { view: 'skills', label: 'Skills', icon: <Wand2 className="h-[18px] w-[18px]" /> },
];

/**
 * Dynamische App-Einträge: erscheinen NUR, wenn die zugehörige Erweiterung
 * aktiviert (heruntergeladen) ist. n8n ist damit eine echte Erweiterung —
 * deaktiviert taucht sie hier nicht auf (Lizenz-sauber, der Container läuft
 * dann auch nicht; siehe appLifecycleService). App-Einträge öffnen einen
 * Mitte-Tab, sie sind keine Sidebar-Ansicht.
 */
const APP_ENTRIES: Array<{
  appId: string;
  spec: WorkspaceTabSpec;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    appId: 'n8n',
    spec: { type: 'automationen' },
    label: 'Automation',
    icon: <Workflow className="h-[18px] w-[18px]" />,
  },
];

/**
 * Activity-Bar (Plan 012 Phase B, Schritt 5): eine eigene, **immer sichtbare**
 * schmale Spalte ganz links — außerhalb des einklappbaren Sidebar-Panels.
 * Dadurch bleibt »Dateien« (und jede andere Ansicht) erreichbar, auch wenn die
 * Sidebar eingeklappt ist (behebt den ⌘B-/»Dateien«-Bug).
 *
 * Oben die festen Ansichten (Dateien · Suche · Modelle · Erweiterungen · Skills),
 * darunter die aktivierten App-Erweiterungen, unten das Einstellungen-Zahnrad.
 * Ein Klick auf eine Ansicht wählt sie und zieht die Sidebar auf; erneuter Klick
 * auf die aktive Ansicht klappt sie wieder ein (VS-Code-Semantik, `selectView`).
 * »Modelle«/»Erweiterungen« aktivieren zusätzlich den passenden Reiter im Store
 * und öffnen dessen Mitte-Tab.
 */
export function ActivityBar() {
  const activeView = useWorkspaceStore(s => s.activeView);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const selectView = useWorkspaceStore(s => s.selectView);
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const setStoreTab = useExtensionStore(s => s.setStoreTab);
  const { isAppEnabled } = useWorkspaceApps();

  const apps = APP_ENTRIES.filter(a => isAppEnabled(a.appId));

  const handleView = (view: ActivityView) => {
    selectView(view);
    // Modelle/Erweiterungen zeigen ihren Inhalt im Store-Mitte-Tab; der Reiter
    // folgt der gewählten Ansicht. Skills bekommen ihre Zentrale in Phase D.
    if (view === 'models') {
      setStoreTab('models');
      openTab({ type: 'store' });
    } else if (view === 'extensions') {
      setStoreTab('extensions');
      openTab({ type: 'store' });
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

      {apps.length > 0 && <div className="my-1 h-px w-6 shrink-0 bg-border" aria-hidden="true" />}
      {apps.map(a => (
        <ActivityButton
          key={a.appId}
          label={a.label}
          active={activeTabId === a.spec.type}
          onClick={() => openTab(a.spec)}
        >
          {a.icon}
        </ActivityButton>
      ))}

      <div className="flex-1" aria-hidden="true" />

      <ActivityButton
        label="Einstellungen"
        active={activeTabId === 'settings'}
        onClick={() => openTab({ type: 'settings' })}
      >
        <Settings className="h-[18px] w-[18px]" />
      </ActivityButton>
    </nav>
  );
}
