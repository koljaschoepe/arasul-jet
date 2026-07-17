import React from 'react';
import { MessageSquare, Library, Workflow, Blocks, Settings } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface ActivityButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}

function ActivityButton({ label, onClick, active, className, children }: ActivityButtonProps) {
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
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

/**
 * Schmale Icon-Leiste ganz links (wie VS Code/Cursor) — die
 * Drei-Bereiche-Navigation aus Plan 008: **Chat** (Kommandozentrale, rechtes
 * Panel), **Wissen** (Dateien/Explorer, linke Sidebar) und **Automation** (n8n).
 * Darunter der Extensions-Store, ganz unten die Einstellungen. Die Bereiche sind
 * bewusst fest — keine dynamischen App-Shortcuts mehr; der Store verwaltet, was
 * installiert ist, die Navigation bleibt konstant.
 *
 * Chat und Wissen schalten Panel- bzw. Sidebar-Sichtbarkeit; Automation,
 * Extensions und Einstellungen öffnen ihren Mitte-Tab.
 */
export function ActivityBar() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const setSidebarVisible = useWorkspaceStore(s => s.setSidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const rightPanelMode = useWorkspaceStore(s => s.rightPanelMode);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);

  const chatActive = rightPanelVisible && rightPanelMode === 'chat';

  return (
    <nav
      aria-label="Workspace-Navigation"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-background py-2"
    >
      <ActivityButton label="Chat" active={chatActive} onClick={() => setRightPanelMode('chat')}>
        <MessageSquare className="h-5 w-5" />
      </ActivityButton>
      <ActivityButton
        label="Wissen"
        active={sidebarVisible}
        onClick={() => setSidebarVisible(!sidebarVisible)}
      >
        <Library className="h-5 w-5" />
      </ActivityButton>
      <ActivityButton
        label="Automation"
        active={activeTabId === 'automationen'}
        onClick={() => openTab({ type: 'automationen' })}
      >
        <Workflow className="h-5 w-5" />
      </ActivityButton>
      <ActivityButton
        label="Extensions"
        active={activeTabId === 'store'}
        onClick={() => openTab({ type: 'store' })}
      >
        <Blocks className="h-5 w-5" />
      </ActivityButton>
      <ActivityButton
        label="Einstellungen"
        active={activeTabId === 'settings'}
        onClick={() => openTab({ type: 'settings' })}
        className="mt-auto"
      >
        <Settings className="h-5 w-5" />
      </ActivityButton>
    </nav>
  );
}
