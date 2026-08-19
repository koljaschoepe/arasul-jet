import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, Download, FolderKanban, ChevronsUpDown, Wifi } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { useApi } from '@/hooks/useApi';
import { istChatModell, modellAnzeigeName } from '@/utils/modelDisplay';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useExtensionStore } from '@/stores/extensionStore';
import { useActiveProject } from '@/features/workspace/useProjects';
import { GitSyncControl } from '@/features/workspace/GitSyncControl';
import {
  isModelInstalled,
  isModelActive,
  STORE_MODELS_KEY,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
  type CatalogModel,
  type LoadedModel,
} from '@/hooks/useStoreCatalog';
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
 * links Verbindungs-/Health-Punkt + Plattform-Version (klickbar → was ist
 * verbunden?), mittig der Modellstatus (klickbar → heruntergeladenes Modell
 * wählen), rechts das aktive Workspace-Projekt (Plan 018). Die beiden Popover
 * laden ihre Detaildaten erst beim Öffnen (kein Dauer-Poll auf dem Jetson).
 */
export function StatusBar() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [modelOpen, setModelOpen] = useState(false);

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

  // Modell-Umschalter: Katalog/Status/Standard nur laden, während das Popover
  // offen ist. Teilt die Query-Keys mit der Store-Ansicht (Cache-Dedup).
  const { data: catalog } = useQuery({
    queryKey: STORE_MODELS_KEY,
    queryFn: async () => {
      const res = await api.get<{ models?: CatalogModel[] }>('/models/catalog', {
        showError: false,
      });
      return res.models ?? [];
    },
    enabled: modelOpen,
    staleTime: 30_000,
  });
  const { data: loaded } = useQuery({
    queryKey: STORE_MODEL_STATUS_KEY,
    queryFn: async () => {
      const res = await api
        .get<{ loaded_model?: LoadedModel | null }>('/models/status', { showError: false })
        .catch(() => ({}) as { loaded_model?: LoadedModel | null });
      return res.loaded_model ?? null;
    },
    enabled: modelOpen,
    staleTime: 5_000,
  });
  const { data: defaultModelId } = useQuery({
    queryKey: STORE_MODEL_DEFAULT_KEY,
    queryFn: async () => {
      const res = await api
        .get<{ default_model?: string | null }>('/models/default', { showError: false })
        .catch(() => ({}) as { default_model?: string | null });
      return res.default_model ?? null;
    },
    enabled: modelOpen,
    staleTime: 30_000,
  });

  // Standardmodell = Gesprächsmodell für neue Chats: Embedding-/OCR-Modelle
  // (z. B. nomic-embed-text) sind installiert, aber hier keine sinnvolle Wahl.
  const installedModels = (catalog ?? []).filter(isModelInstalled).filter(istChatModell);
  const loadedModelId = loaded?.model_id ?? null;

  const setDefault = useMutation({
    mutationFn: (modelId: string) =>
      api.post<{ default_model?: string }>('/models/default', { model_id: modelId }),
    onSuccess: (_res, modelId) => {
      qc.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
      qc.invalidateQueries({ queryKey: MEMORY_BUDGET_QUERY_KEY });
      qc.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
      const m = installedModels.find(x => x.id === modelId);
      toast.success(`Standardmodell: ${m ? modellAnzeigeName(m) : modelId}`);
      setModelOpen(false);
    },
  });

  // Rechts in der Leiste steht das aktive WORKSPACE-Projekt (Plan 018:
  // ein aktives Projekt steuert Dateien + Flows + Terminal). Bewusst NICHT
  // der Terminal-Session-Titel — der zeigt bei umbenannten/mehreren Shells
  // „Shell 1" statt des Projektnamens und war irreführend.
  const { activeProject } = useActiveProject();

  // Globales Download-Feedback: laufende Modell-Downloads sind sonst nur im
  // Store sichtbar — hier bleiben sie es überall, ein Klick springt hin.
  const { activeDownloadsList } = useDownloads();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setStoreTab = useExtensionStore(s => s.setStoreTab);
  const laufendeDownloads = activeDownloadsList.filter(
    d => d.phase !== 'complete' && d.phase !== 'error'
  );
  const downloadProzent =
    laufendeDownloads.length > 0
      ? Math.round(
          laufendeDownloads.reduce((sum, d) => sum + (d.progress || 0), 0) /
            laufendeDownloads.length
        )
      : 0;

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
  // Plan 022 — der geladene/installierte Modellname kommt roh von Ollama
  // (z. B. "hf.co/…"); einheitlich über den Anzeige-Helfer säubern.
  const ladeName = (n?: string | null) => modellAnzeigeName({ id: n || '', name: n });
  const modelLabel = hasModel
    ? `${ladeName(primaryModel.name)}${extraModels} · KI-RAM ${toGb(budget?.usedMb ?? 0)}/${toGb(
        budget?.totalBudgetMb ?? 0
      )} GB`
    : installedModel
      ? `${ladeName(installedModel.name)} · bereit`
      : 'kein Modell geladen';

  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-background px-3 text-xs text-muted-foreground select-none"
      data-testid="workspace-statusbar"
    >
      {/* Verbindung — klickbar: zeigt, womit die Plattform verbunden ist. */}
      <Popover>
        <PopoverTrigger
          className="flex items-center gap-1.5 rounded px-1 hover:bg-accent hover:text-foreground"
          title="Verbindung anzeigen"
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          {healthLabel}
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72 text-xs">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Wifi className="h-4 w-4" aria-hidden="true" />
            Verbindung
          </div>
          <dl className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Backend</dt>
              <dd className="flex items-center gap-1.5 text-foreground">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
                {healthLabel}
              </dd>
            </div>
            {data?.version && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Version</dt>
                <dd className="text-foreground">v{data.version}</dd>
              </div>
            )}
            {budget !== undefined && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">KI-RAM</dt>
                <dd className="text-foreground">
                  {toGb(budget.usedMb ?? 0)} / {toGb(budget.totalBudgetMb ?? 0)} GB belegt · frei{' '}
                  {toGb(budget.availableMb ?? 0)} GB
                </dd>
              </div>
            )}
            {loadedModels.length > 0 && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Modelle im RAM</dt>
                <dd className="text-right text-foreground">
                  {loadedModels.map(m => `${ladeName(m.name)} (${toGb(m.ramMb)} GB)`).join(', ')}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-2 border-t border-border pt-2 text-muted-foreground">
            Alles läuft lokal auf dem Gerät, keine Cloud.
          </p>
        </PopoverContent>
      </Popover>

      {data?.version && <span className="text-muted-foreground/70">v{data.version}</span>}

      {/* Modell — klickbar: heruntergeladenes Modell als Standard wählen. */}
      {budget !== undefined && (
        <Popover open={modelOpen} onOpenChange={setModelOpen}>
          <PopoverTrigger
            className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-accent hover:text-foreground"
            title="Modell wählen"
            data-testid="workspace-statusbar-model"
          >
            <Cpu
              className={`h-3 w-3 shrink-0 ${hasModel || installedModel ? 'text-foreground/70' : ''}`}
              aria-hidden="true"
            />
            <span className="truncate">{modelLabel}</span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 p-1 text-xs">
            <p className="px-2 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Modell für neue Chats
            </p>
            {installedModels.length === 0 ? (
              <p className="px-2 py-2 text-muted-foreground">
                Noch keine Modelle heruntergeladen. Im Store „Modelle“ laden.
              </p>
            ) : (
              <ul className="flex flex-col">
                {installedModels.map(m => {
                  const active = isModelActive(m, loadedModelId);
                  const isDefault = defaultModelId === m.id;
                  return (
                    <li key={m.id}>
                      {/* Auswahl ohne Icon-Spalte (Nutzer-Entscheid 2026-07-28):
                        das Standardmodell ist fett und dezent hinterlegt. */}
                      <button
                        type="button"
                        disabled={setDefault.isPending}
                        onClick={() => setDefault.mutate(m.id)}
                        aria-current={isDefault || undefined}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-60 ${
                          isDefault ? 'bg-accent/60' : ''
                        }`}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            isDefault ? 'font-semibold text-foreground' : 'text-foreground'
                          }`}
                        >
                          {modellAnzeigeName(m)}
                        </span>
                        {active && (
                          <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-success">
                            im RAM
                          </span>
                        )}
                        <span className="shrink-0 text-muted-foreground">
                          {m.ram_required_gb} GB
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-1 border-t border-border px-2 pt-2 text-muted-foreground">
              Ausgewähltes Modell wird der Standard für neue Chats.
            </p>
          </PopoverContent>
        </Popover>
      )}

      {laufendeDownloads.length > 0 && (
        <button
          type="button"
          data-testid="statusbar-downloads"
          title="Zu den Modellen"
          onClick={() => {
            setStoreTab('models');
            openTab({ type: 'modelle' });
          }}
          className="flex items-center gap-1.5 rounded px-1 text-primary hover:bg-accent"
        >
          <Download className="h-3 w-3 shrink-0 animate-pulse" aria-hidden="true" />
          {laufendeDownloads.length === 1
            ? `Modell lädt … ${downloadProzent}%`
            : `${laufendeDownloads.length} Modelle laden … ${downloadProzent}%`}
        </button>
      )}

      <div className="flex-1" />

      {/* GitHub-Sync des aktiven Projekts (Plan 013, B9). */}
      <GitSyncControl />

      {activeProject && (
        <span className="flex min-w-0 items-center gap-1.5" title="Aktives Projekt">
          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{activeProject.name}</span>
        </span>
      )}
    </footer>
  );
}
