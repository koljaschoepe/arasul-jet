import { lazy, Suspense, useEffect, useState } from 'react';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Feature-Entry wie in TabContent.tsx — kein Import feature-interner Komponenten.
const SandboxApp = lazy(() => import('@/features/sandbox'));

/**
 * Terminal-Fläche des rechten Panels — der EINZIGE Ort, an dem das Terminal
 * existiert (nie als Mitte-Tab). Der Inhalt wird beim ersten Sichtbarwerden
 * gemountet (SandboxApp lädt Projekte und startet ggf. Container) und danach nie
 * wieder unmounted: Beim Umschalten auf den Chat-Modus versteckt das RightPanel
 * die Fläche nur (data-shell-hidden), damit WebSocket-Sessions und laufende
 * Prozesse Modus- und Panel-Toggle überleben.
 *
 * Kopfzeile und Panel-Toggle leben seit Schritt 4 im gemeinsamen Segment-Kopf
 * des RightPanel. Die Session-Verwaltung (offene Terminals, aktive Session)
 * liegt in der Registry des workspaceStore; SandboxApp rendert sie nur.
 * `visible` (Panel offen UND Terminal-Modus) wird durchgereicht, damit xterm
 * bei jedem Wieder-Einblenden neu fittet (fit() auf verstecktem Container misst
 * 0×0) — greift sowohl beim Moduswechsel als auch beim Panel-Toggle.
 */
export function TerminalPanel() {
  const terminalVisible = useWorkspaceStore(
    s => s.rightPanelVisible && s.rightPanelMode === 'terminal'
  );

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
