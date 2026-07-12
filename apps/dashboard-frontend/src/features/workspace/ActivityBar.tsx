import React from 'react';
import {
  PanelLeft,
  Home,
  Blocks,
  SquareTerminal,
  Send,
  Database,
  Workflow,
  MessageSquare,
} from 'lucide-react';
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
 * Feste Shortcuts + App-gebundene Shortcuts. Der »Daten«-Tab ist bewusst
 * weg — Dateiverwaltung lebt vollständig im Explorer. Apps (n8n, Telegram,
 * Datenbank) erscheinen nur, wenn sie unter Extensions aktiviert sind.
 */
const BASE_SHORTCUTS: Array<{ spec: WorkspaceTabSpec; label: string; icon: React.ReactNode }> = [
  { spec: { type: 'dashboard' }, label: 'Dashboard', icon: <Home className="h-4.5 w-4.5" /> },
  { spec: { type: 'store' }, label: 'Extensions', icon: <Blocks className="h-4.5 w-4.5" /> },
  {
    spec: { type: 'sandbox' },
    label: 'Terminal',
    icon: <SquareTerminal className="h-4.5 w-4.5" />,
  },
];

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
    icon: <Workflow className="h-4.5 w-4.5" />,
  },
  {
    appId: 'telegram',
    spec: { type: 'telegram' },
    label: 'Telegram',
    icon: <Send className="h-4.5 w-4.5" />,
  },
  {
    appId: 'database',
    spec: { type: 'database' },
    label: 'Datenbank',
    icon: <Database className="h-4.5 w-4.5" />,
  },
];

/**
 * Schmale Icon-Leiste ganz links (wie VS Code/Cursor): Explorer/KI-Panel-
 * Toggles und Schnellzugriff auf Tabs. Einstellungen und der Rückweg zur
 * klassischen UI leben in der WorkspaceMenuBar (Cursor-minimal).
 */
export function ActivityBar() {
  const explorerVisible = useWorkspaceStore(s => s.explorerVisible);
  const llmVisible = useWorkspaceStore(s => s.llmVisible);
  const toggleExplorer = useWorkspaceStore(s => s.toggleExplorer);
  const toggleLlm = useWorkspaceStore(s => s.toggleLlm);
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const { isAppEnabled } = useWorkspaceApps();

  const shortcuts = [...BASE_SHORTCUTS, ...APP_SHORTCUTS.filter(s => isAppEnabled(s.appId))];

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-11 shrink-0 flex-col items-center gap-0.5 bg-background py-1.5"
    >
      <ActivityButton
        label={explorerVisible ? 'Explorer ausblenden' : 'Explorer einblenden'}
        onClick={toggleExplorer}
        active={explorerVisible}
      >
        <PanelLeft className="h-4.5 w-4.5" />
      </ActivityButton>

      <div className="my-1 h-px w-5 bg-border" aria-hidden="true" />

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

      <div className="flex-1" />

      <ActivityButton
        label={llmVisible ? 'KI-Panel ausblenden' : 'KI-Panel einblenden'}
        onClick={toggleLlm}
        active={llmVisible}
      >
        <MessageSquare className="h-4.5 w-4.5" />
      </ActivityButton>
    </nav>
  );
}
