import type { ReactNode } from 'react';
import { Sparkles, SquareTerminal, X } from 'lucide-react';
import { useWorkspaceStore, type RightPanelMode } from '@/stores/workspaceStore';
import { ChatPanel } from './llm/ChatPanel';
import { TerminalPanel } from './terminal/TerminalPanel';

/**
 * Rechtes Panel der IDE-Shell: EINE Fläche mit zwei Modi, umgeschaltet über
 * einen Segment-Kopf [Chat | Terminal]. Kein innerer Split mehr — der frühere
 * vertikale Chat-oben/Terminal-unten-Aufbau (samt eigener Layout-Persistenz
 * 'arasul-workspace-right-panels') entfällt.
 *
 * Keep-alive: BEIDE Flächen (ChatPanel, TerminalPanel) sind permanent gemountet
 * — der Moduswechsel versteckt die inaktive Fläche nur per CSS, statt sie zu
 * unmounten (WebSocket-/Chat-Sessions überleben so jeden Wechsel). Anker ist
 * bewusst `data-shell-hidden` (nur die Shell setzt es) und NICHT `aria-hidden`:
 * Radix-Dialoge rufen beim Öffnen `hideOthers()` auf und kippen `aria-hidden`
 * auf Nachbar-Elemente — hinge die Versteck-Regel daran, kollabierte die
 * inaktive Fläche beim Öffnen eines Dialogs (Plan 003 · Bug b). `aria-hidden`
 * wird für die A11y gespiegelt, steuert aber die Darstellung nicht mehr.
 */

const SEGMENTS: ReadonlyArray<{ mode: RightPanelMode; label: string; icon: ReactNode }> = [
  { mode: 'chat', label: 'Chat', icon: <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> },
  {
    mode: 'terminal',
    label: 'Terminal',
    icon: <SquareTerminal className="h-3.5 w-3.5" aria-hidden="true" />,
  },
];

export function RightPanel() {
  const mode = useWorkspaceStore(s => s.rightPanelMode);
  const setRightPanelMode = useWorkspaceStore(s => s.setRightPanelMode);
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="workspace-right-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2 select-none">
        <div
          role="tablist"
          aria-label="Panel-Inhalt"
          data-testid="right-panel-mode"
          className="flex items-center gap-0.5"
        >
          {SEGMENTS.map(seg => {
            const active = mode === seg.mode;
            return (
              <button
                key={seg.mode}
                type="button"
                role="tab"
                id={`right-panel-tab-${seg.mode}`}
                aria-selected={active}
                aria-controls={`right-panel-surface-${seg.mode}`}
                onClick={() => setRightPanelMode(seg.mode)}
                className={`flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {seg.icon}
                {seg.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          title="Panel ausblenden"
          aria-label="Panel ausblenden"
          onClick={toggleRightPanel}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          id="right-panel-surface-chat"
          role="tabpanel"
          aria-labelledby="right-panel-tab-chat"
          data-shell-surface="chat"
          data-shell-hidden={mode === 'chat' ? 'false' : 'true'}
          aria-hidden={mode !== 'chat'}
          className="absolute inset-0"
        >
          <ChatPanel />
        </div>
        <div
          id="right-panel-surface-terminal"
          role="tabpanel"
          aria-labelledby="right-panel-tab-terminal"
          data-shell-surface="terminal"
          data-shell-hidden={mode === 'terminal' ? 'false' : 'true'}
          aria-hidden={mode !== 'terminal'}
          className="absolute inset-0"
        >
          <TerminalPanel />
        </div>
      </div>
    </div>
  );
}
