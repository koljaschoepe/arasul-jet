import { lazy, Suspense, useEffect, useState } from 'react';
import { SquareTerminal, X } from 'lucide-react';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Feature-Entry wie in TabContent.tsx — kein Import feature-interner Komponenten.
const SandboxApp = lazy(() => import('@/features/sandbox'));

/**
 * Terminal-Fläche im rechten Panel (unten) — der EINZIGE Ort, an dem das
 * Terminal existiert (nie als Mitte-Tab). Der Inhalt wird beim ersten
 * Einblenden gemountet (SandboxApp lädt Projekte und startet ggf. Container)
 * und danach nie wieder unmounted: Ausblenden versteckt nur (aria-hidden am
 * umgebenden Panel, siehe WorkspaceShell), damit WebSocket-Sessions und
 * laufende Prozesse Toggle und Ansichtswechsel überleben.
 *
 * Die Session-Verwaltung (offene Terminals, aktive Session) liegt in der
 * Registry des workspaceStore; SandboxApp rendert sie nur. `visible` wird
 * durchgereicht, damit xterm beim Wieder-Einblenden neu fittet (fit() auf
 * verstecktem Container misst 0×0).
 */
export function TerminalPanel() {
  const terminalVisible = useWorkspaceStore(s => s.terminalVisible);
  const toggleTerminal = useWorkspaceStore(s => s.toggleTerminal);

  // Mount-once: erst beim ersten Einblenden laden, danach am Leben halten.
  const [mounted, setMounted] = useState(terminalVisible);
  useEffect(() => {
    if (terminalVisible) setMounted(true);
  }, [terminalVisible]);

  return (
    <div
      className="flex h-full min-w-0 flex-col bg-background"
      data-testid="workspace-terminal-panel"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs font-medium text-muted-foreground select-none">
        <SquareTerminal className="h-3.5 w-3.5" aria-hidden="true" />
        Terminal
        <button
          type="button"
          title="Terminal-Panel ausblenden"
          aria-label="Terminal-Panel ausblenden"
          onClick={toggleTerminal}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {mounted && (
          <ComponentErrorBoundary componentName="Terminal-Panel">
            <Suspense fallback={<LoadingSpinner message="Lade Terminal..." />}>
              <SandboxApp visible={terminalVisible} />
            </Suspense>
          </ComponentErrorBoundary>
        )}
      </div>
    </div>
  );
}
