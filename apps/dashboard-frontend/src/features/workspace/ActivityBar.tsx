import React from 'react';
import {
  PanelLeft,
  Home,
  FolderOpen,
  Package,
  SquareTerminal,
  Send,
  Database,
  MessageSquare,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabSpec } from '@/stores/workspaceStore';

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

const TAB_SHORTCUTS: Array<{ spec: WorkspaceTabSpec; label: string; icon: React.ReactNode }> = [
  { spec: { type: 'dashboard' }, label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  { spec: { type: 'documents' }, label: 'Daten', icon: <FolderOpen className="h-5 w-5" /> },
  { spec: { type: 'store' }, label: 'Store', icon: <Package className="h-5 w-5" /> },
  { spec: { type: 'sandbox' }, label: 'Terminal', icon: <SquareTerminal className="h-5 w-5" /> },
  { spec: { type: 'telegram' }, label: 'Telegram', icon: <Send className="h-5 w-5" /> },
  { spec: { type: 'database' }, label: 'Datenbank', icon: <Database className="h-5 w-5" /> },
];

/**
 * Schmale Icon-Leiste ganz links (wie VS Code): Explorer/LLM-Panel-Toggles
 * und Schnellzugriff auf die Feature-Tabs. Einstellungen und der Rückweg zur
 * klassischen UI leben in der WorkspaceMenuBar (Cursor-minimal).
 */
export function ActivityBar() {
  const explorerVisible = useWorkspaceStore(s => s.explorerVisible);
  const llmVisible = useWorkspaceStore(s => s.llmVisible);
  const toggleExplorer = useWorkspaceStore(s => s.toggleExplorer);
  const toggleLlm = useWorkspaceStore(s => s.toggleLlm);
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
    >
      <ActivityButton
        label={explorerVisible ? 'Explorer ausblenden' : 'Explorer einblenden'}
        onClick={toggleExplorer}
        active={explorerVisible}
      >
        <PanelLeft className="h-5 w-5" />
      </ActivityButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      {TAB_SHORTCUTS.map(({ spec, label, icon }) => (
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
        <MessageSquare className="h-5 w-5" />
      </ActivityButton>
    </nav>
  );
}
