import { Sparkles, X } from 'lucide-react';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import AgentChatPanel from './agentChat/AgentChatPanel';

/**
 * Chat-Fläche im rechten Panel (oben). Der Agent-Chat (AgentChatPanel) ist
 * die einzige Chat-UI im Workspace — er läuft ohne eigenen Router direkt auf
 * dem ChatContext. Die Fläche bleibt beim Ausblenden gemountet (aria-hidden
 * am umgebenden Panel, siehe WorkspaceShell), damit laufende Streams den
 * Toggle überleben.
 */
export function ChatPanel() {
  const toggleChat = useWorkspaceStore(s => s.toggleChat);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="workspace-chat-panel">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs font-medium text-muted-foreground select-none">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        KI-Assistent
        <button
          type="button"
          title="Chat-Panel ausblenden"
          aria-label="Chat-Panel ausblenden"
          onClick={toggleChat}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ComponentErrorBoundary componentName="Chat-Panel">
          <AgentChatPanel />
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}
