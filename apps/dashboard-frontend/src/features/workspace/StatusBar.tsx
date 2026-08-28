import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Cpu, Download, ChevronsUpDown, Wifi } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { useApi } from '@/hooks/useApi';
import { useMemoryBudget, MEMORY_BUDGET_QUERY_KEY } from '@/hooks/useMemoryBudget';
import { istChatModell, modellAnzeigeName } from '@/utils/modelDisplay';
import { modellage, wechselGrund, kiRamZeile, zuGb } from '@/utils/modellZustand';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import {
  isModelInstalled,
  isModelActive,
  STORE_MODELS_KEY,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
  type CatalogModel,
  type LoadedModel,
} from '@/hooks/useStoreCatalog';

/** Antwort des öffentlichen /health-Fast-Path (dashboard-backend). */
interface HealthResponse {
  status?: string;
  version?: string;
}

/**
 * Schlanke Statusleiste am unteren Rand der IDE-Shell (Cursor-Maß: 24px):
 * links Verbindungs-/Health-Punkt + Plattform-Version (klickbar → was ist
 * verbunden?), mittig der Modellstatus (klickbar → heruntergeladenes Modell
 * wählen). Die beiden Popover laden ihre Detaildaten erst beim Öffnen (kein
 * Dauer-Poll auf dem Jetson). Das aktive Projekt und die Git-Kopplung, die
 * rechts standen, sind mit B2 gefallen.
 *
 * Rechts steht seit D1 die Zahl der Freigaben, die auf eine Entscheidung
 * warten (Phase C7). Nur die ZAHL: die Oberfläche zum Entscheiden ist D2 oder
 * später, und eine halbe hier wäre die, die dann noch einmal gebaut wird. Bis
 * dahin ist die Zahl trotzdem das, was gefehlt hat — ein angehaltener Lauf
 * stand in der Datenbank und wartete darauf, dass jemand die Adresse kennt.
 */
export function StatusBar() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
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
  //
  // NUR FUER DEN ADMINISTRATOR (Phase D3, Fund der D2-Abnahme). Der Weg
  // dahinter traegt `requireRole('admin')`, die Statusleiste steht aber in
  // jeder Shell: ein Mitarbeiter bekam beim Laden zwei 403 in die Konsole
  // (`retry: 1`) und danach alle zehn Sekunden eines. Ohne Budget faellt der
  // Modell-Umschalter unten von selbst weg, und das ist richtig so: welches
  // Modell Standard ist, entscheidet die Verwaltung.
  const { data: budget } = useMemoryBudget({ enabled: istAdmin });

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

  // Globales Download-Feedback: laufende Modell-Downloads sind sonst nur im
  // Store sichtbar — hier bleiben sie es überall, ein Klick springt hin.
  const { data: offeneFreigaben } = useOffeneFreigaben();
  const wartende = offeneFreigaben?.length ?? 0;

  const { activeDownloadsList } = useDownloads();
  const openTab = useWorkspaceStore(s => s.openTab);
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
  const hasModel = loadedModels.length > 0;
  const installedModel = budget?.installedModel ?? null;
  // Plan 023 D3: der Zustandssatz kommt aus `utils/modellZustand`, damit hier
  // und im Modellraster dasselbe steht. Bis dahin sagte das Raster „kein Modell
  // geladen", während hier gleichzeitig ein bereites Modell stand.
  const lage = modellage(budget);
  const grund = wechselGrund(budget?.lastSwitch?.reason);
  // Der Name kommt aus dem Namensregister (D1), der Zustand aus der
  // gemeinsamen Lage (D3). Angehängt wird hier nur, was hier hingehört: die
  // KI-RAM-Zahl, für die im Raster ein Balken steht.
  const modelLabel = hasModel
    ? `${lage.name}${lage.weitere > 0 ? ` +${lage.weitere}` : ''} · KI-RAM ${zuGb(
        budget?.usedMb ?? 0
      )}/${zuGb(budget?.totalBudgetMb ?? 0)} GB`
    : lage.text;

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
                <dd className="text-foreground">{data.version}</dd>
              </div>
            )}
            {budget !== undefined && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">KI-RAM</dt>
                <dd className="text-foreground">{kiRamZeile(budget)}</dd>
              </div>
            )}
            {loadedModels.length > 0 && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Modelle im RAM</dt>
                <dd className="text-right text-foreground">
                  {loadedModels
                    .map(m => `${modellAnzeigeName(m.name)} (${zuGb(m.ramMb)} GB)`)
                    .join(', ')}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-2 border-t border-border pt-2 text-muted-foreground">
            Alles läuft lokal auf dem Gerät, keine Cloud.
          </p>
        </PopoverContent>
      </Popover>

      {/* Ohne das feste „v": die Version sagt seit Plan 023 C6 „Vorserie",
          solange keine gesetzt ist, und „vVorserie" waere Unsinn. */}
      {data?.version && <span className="text-muted-foreground/70">{data.version}</span>}

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
            {/* Plan 023 D3: warum das System zuletzt selbst etwas getan hat.
                Bis dahin verschwand ein Modell aus dem Speicher, ohne dass
                irgendwo stand, warum: 877 automatische Entladungen im
                Protokoll, keine einzige davon sichtbar. */}
            {grund && budget?.lastSwitch && (
              <p
                className="mt-1 border-t border-border px-2 pt-2 text-muted-foreground"
                data-testid="statusbar-wechselgrund"
              >
                {modellAnzeigeName(budget.lastSwitch.model)} wurde {grund}.
              </p>
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

      {wartende > 0 && (
        <span
          className="flex items-center gap-1.5 px-1 text-foreground"
          data-testid="statusbar-freigaben"
          title="Freigaben, die auf deine Entscheidung warten"
        >
          <ClipboardCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          {wartende === 1 ? '1 Freigabe wartet' : `${wartende} Freigaben warten`}
        </span>
      )}
    </footer>
  );
}
