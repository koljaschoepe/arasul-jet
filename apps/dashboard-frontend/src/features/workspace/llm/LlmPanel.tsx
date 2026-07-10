import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import ChatRouter from '@/features/chat/ChatRouter';

/**
 * Rechtes KI-Panel: bettet den bestehenden RAG-Chat in einem eigenen
 * MemoryRouter ein (harness-ready — ein späterer Agent-Harness ersetzt nur
 * das Innere dieses Panels, nicht die Shell).
 */
export function LlmPanel() {
  return (
    <div className="flex h-full min-w-0 flex-col border-l border-border bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-medium text-muted-foreground select-none">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        KI-Assistent
      </div>
      <div className="min-h-0 flex-1">
        <ComponentErrorBoundary componentName="KI-Panel">
          <MemoryRouter initialEntries={['/chat']}>
            <Routes>
              <Route path="/chat/*" element={<ChatRouter />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </MemoryRouter>
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}
