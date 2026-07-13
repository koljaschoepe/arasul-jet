import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import AgentChatPanel from './agentChat/AgentChatPanel';

/**
 * Chat-Fläche des rechten Panels. Der Agent-Chat (AgentChatPanel) ist die
 * einzige Chat-UI im Workspace — er läuft ohne eigenen Router direkt auf dem
 * ChatContext.
 *
 * Kopfzeile und Panel-Toggle leben seit Schritt 4 im gemeinsamen Segment-Kopf
 * des RightPanel; diese Fläche rendert nur noch den Chat selbst. Sie bleibt beim
 * Umschalten auf das Terminal gemountet (nur per data-shell-hidden versteckt),
 * damit laufende Streams den Moduswechsel überleben.
 */
export function ChatPanel() {
  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="workspace-chat-panel">
      <div className="min-h-0 flex-1">
        <ComponentErrorBoundary componentName="Chat-Panel">
          <AgentChatPanel />
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}
