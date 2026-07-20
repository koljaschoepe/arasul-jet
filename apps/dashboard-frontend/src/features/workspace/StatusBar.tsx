import { useQuery } from '@tanstack/react-query';
import { Cpu, FolderKanban } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { MemoryBudget } from '@/types';

/** Antwort des öffentlichen /health-Fast-Path (dashboard-backend). */
interface HealthResponse {
  status?: string;
  version?: string;
}

/**
 * React-Query-Key des KI-RAM-Budgets. Bewusst identisch zu dem Key, den ein
 * künftiger useModelStatus-Query nutzt, damit sich beide Verbraucher denselben
 * Cache-Eintrag teilen und es keine doppelte Poll-Last auf dem Jetson gibt.
 */
export const MEMORY_BUDGET_QUERY_KEY = ['models', 'memory-budget'] as const;

/** MB → GB, kompakt auf eine Nachkommastelle. */
function toGb(mb: number): string {
  return (mb / 1024).toFixed(1);
}

/**
 * Schlanke Statusleiste am unteren Rand der IDE-Shell (Cursor-Maß: 24px):
 * links Verbindungs-/Health-Punkt + Plattform-Version, mittig der Modellstatus
 * (KI-RAM-Budget), rechts das aktive Terminal-Projekt (sobald die
 * Session-Registry gefüllt ist). Bewusst token-basiert und kompakt — keine
 * Interaktion außer Statusanzeige.
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

  // KI-RAM-Budget: teilt sich Key + Cache mit useModelStatus, daher kein
  // zweiter Poll-Zyklus. 10 s Intervall spiegelt die bisherige Kadenz der
  // (entfallenen) Dashboard-KI-Karte.
  const { data: budget } = useQuery({
    queryKey: MEMORY_BUDGET_QUERY_KEY,
    queryFn: () => api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
    refetchInterval: 10_000,
    staleTime: 5_000,
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

  const loadedModels = budget?.loadedModels ?? [];
  const primaryModel = loadedModels[0] ?? null;
  const hasModel = primaryModel !== null;
  // Plan 009: installiertes Modell, das gerade NICHT im RAM liegt (Ollama
  // entlädt Idle-Modelle). Verhindert das fälschliche „kein Modell geladen",
  // obwohl ein Modell installiert ist.
  const installedModel = budget?.installedModel ?? null;
  const extraModels = loadedModels.length > 1 ? ` +${loadedModels.length - 1}` : '';
  const modelLabel = hasModel
    ? `${primaryModel.name}${extraModels} · KI-RAM ${toGb(budget?.usedMb ?? 0)}/${toGb(
        budget?.totalBudgetMb ?? 0
      )} GB`
    : installedModel
      ? `${installedModel.name} · bereit`
      : 'kein Modell geladen';
  const modelTooltip = hasModel
    ? `${loadedModels
        .map(m => `${m.name} (${toGb(m.ramMb)} GB)`)
        .join(', ')} — belegt ${toGb(budget?.usedMb ?? 0)} von ${toGb(
        budget?.totalBudgetMb ?? 0
      )} GB, frei ${toGb(budget?.availableMb ?? 0)} GB`
    : installedModel
      ? `${installedModel.name} ist installiert und bereit — wird beim ersten Gebrauch in den Speicher geladen`
      : 'Kein KI-Modell installiert';

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

      {budget !== undefined && (
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={modelTooltip}
          data-testid="workspace-statusbar-model"
        >
          <Cpu
            className={`h-3 w-3 shrink-0 ${hasModel || installedModel ? 'text-foreground/70' : ''}`}
            aria-hidden="true"
          />
          <span className="truncate">{modelLabel}</span>
        </span>
      )}

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
