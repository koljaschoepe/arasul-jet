import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Rechte Spalte der Shell. Seit B2 (26.08.2026) ist sie leer: Agent-Chat und
 * Terminal, die hier als eine Fläche mit zwei Modi lebten, sind aus der
 * Oberfläche gefallen. Die Spalte bleibt, damit das Dreispalten-Raster steht;
 * D2 füllt sie mit den Notizen.
 *
 * Die Shell versteckt die Spalte per `data-shell-hidden` am Panel, nie über
 * `aria-hidden` (Radix-Dialoge kippen das auf Nachbarn, Plan 003 · Bug b).
 */
export function RightPanel() {
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="workspace-right-panel">
      <div className="flex h-8 shrink-0 items-center px-2 select-none">
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
      <div
        className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
        data-testid="workspace-right-panel-leer"
      >
        Noch nichts hier
      </div>
    </div>
  );
}
