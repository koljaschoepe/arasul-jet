import React from 'react';
import { Home, Blocks, Database, Workflow } from 'lucide-react';
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
 * Feste Tab-Shortcuts (Mitte-Tabs). Der »Daten«-Tab ist bewusst weg —
 * Dateiverwaltung lebt vollständig im Explorer.
 */
const BASE_SHORTCUTS: Array<{ spec: WorkspaceTabSpec; label: string; icon: React.ReactNode }> = [
  { spec: { type: 'dashboard' }, label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  { spec: { type: 'store' }, label: 'Extensions', icon: <Blocks className="h-5 w-5" /> },
];

/** App-gebundene Shortcuts — erscheinen nur, wenn die Extension aktiviert ist. */
const APP_SHORTCUTS: Array<{
  appId: string;
  spec: WorkspaceTabSpec;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    appId: 'n8n',
    spec: { type: 'automationen' },
    label: 'Automationen',
    icon: <Workflow className="h-5 w-5" />,
  },
  {
    appId: 'database',
    spec: { type: 'database' },
    label: 'Datenbank',
    icon: <Database className="h-5 w-5" />,
  },
];

/**
 * Schmale Icon-Leiste ganz links (wie VS Code/Cursor). Rein für Mitte-Tabs:
 * Dashboard, Extensions und dynamisch die aktivierten Apps (n8n,
 * Datenbank). Sidebar- und Panel-Sichtbarkeit steuern die zwei Layout-Toggles
 * in der WorkspaceMenuBar; der Panel-Modus (Chat/Terminal) lebt im Panel
 * selbst (Cursor-minimal).
 */
export function ActivityBar() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const { isAppEnabled } = useWorkspaceApps();

  const shortcuts = [...BASE_SHORTCUTS, ...APP_SHORTCUTS.filter(s => isAppEnabled(s.appId))];

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-background py-2"
    >
      {shortcuts.map(({ spec, label, icon }) => (
        <ActivityButton
          key={spec.type}
          label={label}
          onClick={() => openTab(spec)}
          active={activeTabId === spec.type}
        >
          {icon}
        </ActivityButton>
      ))}
    </nav>
  );
}
