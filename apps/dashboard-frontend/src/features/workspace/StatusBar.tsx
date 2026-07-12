import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Antwort des öffentlichen /health-Fast-Path (dashboard-backend). */
interface HealthResponse {
  status?: string;
  version?: string;
}

/**
 * Schlanke Statusleiste am unteren Rand der IDE-Shell (Cursor-Maß: 24px):
 * links Verbindungs-/Health-Punkt + Plattform-Version, rechts das aktive
 * Terminal-Projekt (sobald die Session-Registry gefüllt ist). Bewusst
 * token-basiert und kompakt — keine Interaktion außer Statusanzeige.
 */
export function StatusBar() {
  const api = useApi();

  const { data, isError } = useQuery({
    queryKey: ['workspace-health'],
    queryFn: () => api.get<HealthResponse>('/health', { showError: false }),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const terminalSessions = useWorkspaceStore(s => s.terminalSessions);
  const activeTerminalSessionId = useWorkspaceStore(s => s.activeTerminalSessionId);
  const activeSession = terminalSessions.find(s => s.id === activeTerminalSessionId) ?? null;

  const healthLabel = isError
    ? 'Getrennt'
    : data === undefined
      ? 'Verbindet…'
      : data.status === 'OK'
        ? 'Verbunden'
        : 'Eingeschränkt';
  const dotColor = isError
    ? 'var(--destructive)'
    : data === undefined
      ? 'var(--status-neutral)'
      : data.status === 'OK'
        ? 'var(--success)'
        : 'var(--warning)';

  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-background px-3 text-xs text-muted-foreground select-none"
      data-testid="workspace-statusbar"
    >
      <span className="flex items-center gap-1.5" title={`Backend: ${healthLabel}`}>
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
        {healthLabel}
      </span>

      {data?.version && <span className="text-muted-foreground/70">v{data.version}</span>}

      <div className="flex-1" />

      {activeSession && (
        <span className="flex min-w-0 items-center gap-1.5" title="Aktives Projekt">
          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{activeSession.title}</span>
        </span>
      )}
    </footer>
  );
}
