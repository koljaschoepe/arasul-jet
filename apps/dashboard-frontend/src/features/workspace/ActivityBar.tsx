import React from 'react';
import { FolderClosed, Blocks, Workflow, Bot } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabSpec } from '@/stores/workspaceStore';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';

interface ActivityButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

/**
 * Kompakter Icon-Button im Cursor-Maß (~28px). Wird sowohl von der oberen
 * Icon-Zeile (ActivityBar) als auch vom SidebarFooter (Einstellungen) genutzt.
 */
export function ActivityButton({ label, onClick, active, children }: ActivityButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
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
    icon: <Workflow className="h-[18px] w-[18px]" />,
  },
];

/**
 * Cursor-artige Umschalt-Zeile OBEN im linken Panel (Plan 009): eine kompakte
 * horizontale Icon-Reihe statt der früheren breiten vertikalen Leiste. Zwei
 * feste Bereiche — **Dateien** (Explorer-Sidebar ein-/ausblenden) und
 * **Extensions** (Store) — plus die aktivierten App-Erweiterungen. Der Chat
 * lebt ausschließlich im rechten Panel; die Einstellungen sitzen als Zahnrad
 * unten im SidebarFooter. Höhe an Cursors Panel-Header (~35px) angelehnt.
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
      className="flex h-9 w-full shrink-0 items-center gap-0.5 border-b border-border bg-background px-1"
    >
      <ActivityButton
        label="Dateien"
        active={sidebarVisible}
        onClick={() => setSidebarVisible(!sidebarVisible)}
      >
        <FolderClosed className="h-[18px] w-[18px]" />
      </ActivityButton>
      <ActivityButton
        label="Agenten"
        active={activeTabId === 'agenten'}
        onClick={() => openTab({ type: 'agenten' })}
      >
        <Bot className="h-[18px] w-[18px]" />
      </ActivityButton>
      <ActivityButton
        label="Extensions"
        active={activeTabId === 'store'}
        onClick={() => openTab({ type: 'store' })}
      >
        <Blocks className="h-[18px] w-[18px]" />
      </ActivityButton>

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
    </nav>
  );
}
