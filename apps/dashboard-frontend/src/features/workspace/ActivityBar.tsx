import React from 'react';
import { FolderClosed, Blocks, Workflow, Settings } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabSpec } from '@/stores/workspaceStore';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';

interface ActivityButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

function ActivityButton({ label, onClick, active, children }: ActivityButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
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
 * Dynamische App-Einträge: erscheinen in der Leiste NUR, wenn die zugehörige
 * Erweiterung aktiviert (heruntergeladen) ist. n8n ist damit eine echte
 * Erweiterung — deaktiviert taucht sie hier nicht auf (Lizenz-sauber, der
 * Container läuft dann auch nicht; siehe appLifecycleService).
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
    icon: <Workflow className="h-5 w-5" />,
  },
];

/**
 * Schmale Icon-Leiste ganz links (wie VS Code/Cursor). Bewusst reduziert auf
 * zwei feste Bereiche — **Dateien** (Explorer-Sidebar) und **Extensions**
 * (Store) — plus die aktivierten App-Erweiterungen unten und die Einstellungen
 * ganz unten. Der Chat lebt ausschließlich im rechten Panel und hat hier kein
 * Icon mehr.
 */
export function ActivityBar() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const setSidebarVisible = useWorkspaceStore(s => s.setSidebarVisible);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const { isAppEnabled } = useWorkspaceApps();

  const apps = APP_ENTRIES.filter(a => isAppEnabled(a.appId));

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-background py-2"
    >
      <ActivityButton
        label="Dateien"
        active={sidebarVisible}
        onClick={() => setSidebarVisible(!sidebarVisible)}
      >
        <FolderClosed className="h-5 w-5" />
      </ActivityButton>
      <ActivityButton
        label="Extensions"
        active={activeTabId === 'store'}
        onClick={() => openTab({ type: 'store' })}
      >
        <Blocks className="h-5 w-5" />
      </ActivityButton>

      <div className="mt-auto flex flex-col items-center gap-1">
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
        <ActivityButton
          label="Einstellungen"
          active={activeTabId === 'settings'}
          onClick={() => openTab({ type: 'settings' })}
        >
          <Settings className="h-5 w-5" />
        </ActivityButton>
      </div>
    </nav>
  );
}
