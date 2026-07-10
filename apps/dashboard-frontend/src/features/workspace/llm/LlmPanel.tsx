import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ChatRouter from '@/features/chat/ChatRouter';
import { IsolatedMemoryRouter } from '../IsolatedMemoryRouter';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { LlmPanelMode } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';

// Feature-Entry wie in TabContent.tsx — kein Import feature-interner Komponenten.
const SandboxApp = lazy(() => import('@/features/sandbox'));

const MODES: ReadonlyArray<{ mode: LlmPanelMode; label: string }> = [
  { mode: 'chat', label: 'Chat' },
  { mode: 'terminal', label: 'Terminal' },
];

/**
 * Rechtes KI-Panel: bettet den bestehenden RAG-Chat in einem eigenen
 * MemoryRouter ein (harness-ready — ein späterer Agent-Harness ersetzt nur
 * das Innere dieses Panels, nicht die Shell). Über den Umschalter in der
 * Kopfleiste lässt sich alternativ das Sandbox-Terminal anzeigen; beide
 * Modi bleiben gemountet (hidden statt unmount, wie TabContent.tsx), damit
 * Terminal-WebSocket-Sessions den Moduswechsel überleben.
 */
export function LlmPanel() {
  const mode = useWorkspaceStore(s => s.llmPanelMode);
  const setMode = useWorkspaceStore(s => s.setLlmPanelMode);

  // Terminal erst beim ersten Wechsel mounten (SandboxApp lädt Projekte und
  // startet ggf. Container) — danach bleibt es am Leben.
  const [terminalMounted, setTerminalMounted] = useState(mode === 'terminal');
  useEffect(() => {
    if (mode === 'terminal') setTerminalMounted(true);
  }, [mode]);

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-border bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-medium text-muted-foreground select-none">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        KI-Assistent
        <div className="ml-auto flex items-center gap-0.5" role="group" aria-label="Panel-Modus">
          {MODES.map(m => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={mode === m.mode}
              onClick={() => setMode(m.mode)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                mode === m.mode
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1" hidden={mode !== 'chat'}>
        <ComponentErrorBoundary componentName="KI-Panel">
          <IsolatedMemoryRouter initialEntries={['/chat']}>
            <Routes>
              <Route path="/chat/*" element={<ChatRouter />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </IsolatedMemoryRouter>
        </ComponentErrorBoundary>
      </div>
      <div className="min-h-0 flex-1" hidden={mode !== 'terminal'}>
        {terminalMounted && (
          <ComponentErrorBoundary componentName="KI-Panel Terminal">
            <Suspense fallback={<LoadingSpinner message="Lade Terminal..." />}>
              <SandboxApp />
            </Suspense>
          </ComponentErrorBoundary>
        )}
      </div>
    </div>
  );
}
