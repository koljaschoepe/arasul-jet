/**
 * StoreModelsGrid — der „Modelle"-Reiter des Stores (Full-Width-Kartenraster).
 *
 * Zeigt die LLM-/Embedding-Modelle des Katalogs als ruhiges, breites Karten-
 * raster mit Name, Größe, Status-Badge (Verfügbar · Installiert · Aktiv ·
 * Lädt · Fehler) und einer Inline-Aktion („Laden"). Läuft ein Download,
 * ersetzt eine LIVE-Fortschrittsleiste (DownloadProgress) die Aktion —
 * gespeist aus dem globalen DownloadContext, sodass der Fortschritt
 * Navigation überlebt. Nach einem erfolgreichen Pull wird der Katalog neu
 * geladen, sodass die Karte sofort auf „Installiert" umspringt.
 *
 * Spaltenzahl über CONTAINER-Queries, nicht Viewport-Breakpoints: der Store
 * läuft meist als Workspace-Mitte-Tab (Sidebar + Panels nehmen Breite weg) —
 * mit Viewport-Breakpoints rechnete das Raster mit der Fensterbreite und
 * quetschte 4 Spalten in ~840px Container (alle Modellnamen „…"-abgeschnitten).
 *
 * Plan 012 Phase C Schritt 7: die Filter-Leiste ist in die linke Sidebar
 * gewandert (StoreModelsFilterPanel). Das Raster liest Suche + Filter aus dem
 * storeFilterStore, sortiert per Default nach Status → Größe und zeigt nur noch
 * die Karten. Ein Klick auf eine Karte öffnet die Detailseite (StoreDetailPage)
 * über den ephemeren Extension-Store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, Download, Loader2, CircleCheck, DownloadCloud, Power, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useMemoryBudget, MEMORY_BUDGET_QUERY_KEY } from '@/hooks/useMemoryBudget';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useActivation } from '@/contexts/ActivationContext';
import {
  useStoreCatalog,
  isModelInstalled,
  isModelActive,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
} from '@/hooks/useStoreCatalog';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { formatBytes } from '@/utils/formatting';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { modellage, wechselGrund, kiRamZeile, zuGb as toGb } from '@/utils/modellZustand';
import DownloadProgress from './DownloadProgress';
import {
  applyModelFilters,
  sortModels,
  activeFilterCount,
  sizeBucketOf,
  SIZE_LABELS,
  type SizeBucket,
} from './storeModelFilters';

/** Entladen gilt nach dieser Zeit ohne Budget-Bestätigung als „Status unklar". */
const UNLOAD_TIMEOUT_MS = 45_000;

type ModelStatus = 'downloading' | 'error' | 'active' | 'installed' | 'available';

interface StatusMeta {
  label: string;
  tone: 'active' | 'muted' | 'error';
}

const STATUS_META: Record<ModelStatus, StatusMeta> = {
  downloading: { label: 'Lädt …', tone: 'muted' },
  error: { label: 'Fehler', tone: 'error' },
  active: { label: 'Aktiv', tone: 'active' },
  installed: { label: 'Installiert', tone: 'muted' },
  available: { label: 'Verfügbar', tone: 'muted' },
};

function badgeClass(tone: StatusMeta['tone']): string {
  switch (tone) {
    case 'active':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function modelStatus(
  model: CatalogModel,
  loadedId: string | null,
  downloading: boolean
): ModelStatus {
  if (downloading || model.install_status === 'downloading') return 'downloading';
  if (model.install_status === 'error') return 'error';
  if (isModelActive(model, loadedId)) return 'active';
  if (isModelInstalled(model)) return 'installed';
  return 'available';
}

function ModelCard({ model, loadedId }: { model: CatalogModel; loadedId: string | null }) {
  const { isDownloading, getDownloadState, startDownload, cancelDownload } = useDownloads();
  const selectExtension = useExtensionStore(s => s.selectExtension);
  // Sofort-Feedback: der Ollama-Pull braucht anfangs Sekunden, bis der SSE-
  // Fortschritt einsetzt (Manifest auflösen). „Startet …" überbrückt diese
  // Lücke, damit der Klick nie ins Leere läuft (Nutzerkritik B3).
  const [starting, setStarting] = useState(false);

  const downloading = isDownloading(model.id);
  const status = modelStatus(model, loadedId, downloading);
  const meta = STATUS_META[status];
  const downloadState = downloading ? getDownloadState(model.id) : null;
  const canDownload = status === 'available' || status === 'error';

  useEffect(() => {
    if (downloadState) setStarting(false);
  }, [downloadState]);

  // Plan 023 D1: der Name kommt aus dem Register, nicht aus dem Rohfeld.
  const anzeige = modellAnzeigeName(model);

  const onStart = () => {
    setStarting(true);
    void startDownload(model.id, anzeige);
  };

  return (
    <div
      data-testid={`model-card-${model.id}`}
      className="flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        data-testid={`model-open-${model.id}`}
        onClick={() => selectExtension({ kind: 'model', id: model.id })}
        className="flex flex-1 flex-col gap-1.5 rounded-t-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Zeile 1: Icon + Name über die VOLLE Kartenbreite — der Badge steht
            in Zeile 2, damit lange Modellnamen nicht auf „…" zusammenfallen. */}
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3">
            <Cpu aria-hidden="true" />
          </span>
          <span
            title={anzeige}
            className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
          >
            {anzeige}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ui-xs font-medium text-muted-foreground">
            {formatBytes(model.size_bytes)}
          </span>
          <Badge
            variant="outline"
            className={cn('h-4 shrink-0 px-1.5 text-ui-xs', badgeClass(meta.tone))}
          >
            {meta.label}
          </Badge>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{model.description}</p>
      </button>

      {(downloadState || canDownload || starting) && (
        <div className="border-t border-border p-2.5">
          {downloadState ? (
            <div data-testid={`model-progress-${model.id}`}>
              <DownloadProgress
                downloadState={downloadState}
                onCancel={() => cancelDownload(model.id)}
                compact
              />
            </div>
          ) : starting ? (
            <Button size="sm" className="w-full" disabled aria-label="Download startet">
              <Loader2 className="size-4 animate-spin" /> Startet …
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full"
              data-testid={`model-download-${model.id}`}
              aria-label={`${anzeige} herunterladen`}
              onClick={onStart}
            >
              <Download className="size-4" /> Laden
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Großes Kopf-Dashboard über dem Katalog: KI-RAM-Auslastung als Balken (mit
 * einem Segment je geladenem Modell), die aktuell im RAM geladenen Modelle
 * (mit Entladen inkl. sichtbarem „entlädt …"-Zustand bis zur Bestätigung),
 * das Standardmodell für neue Chats (Wechseln + bei Bedarf in den RAM laden —
 * über den globalen ActivationContext mit LIVE-Statusmeldungen) und Zähler.
 *
 * WICHTIG: Datenquelle für „was ist geladen" ist `/models/memory-budget` — genau
 * wie die Fußzeilen-Statusleiste. Früher las die obere Leiste nur den Katalog
 * ab (`isModelActive`) und zeigte „keins geladen", sobald das laufende Modell
 * nicht exakt einem Katalog-Eintrag entsprach (z. B. `qwen3:14b` vs. Katalog
 * `qwen3:14b-q8`) — im Widerspruch zur Fußzeile. Gemeinsame Quelle = kein
 * Widerspruch mehr.
 *
 * Feedback-Regeln (Nutzerkritik: „Klick auf Entladen → lange nichts"):
 * - Laden läuft über POST /models/:id/activate?stream=true (ActivationContext):
 *   der frühere einfache POST /load lief bei großen Modellen ins 30-s-Timeout
 *   von useApi, während Ollama noch lud — der Klick wirkte wirkungslos.
 * - Entladen hält den Chip mit Spinner + „entlädt …", pollt das Budget schnell
 *   und meldet erst dann Erfolg, wenn das Modell wirklich verschwunden ist.
 */
function ModelsDashboard({ models, shown }: { models: CatalogModel[]; shown: number }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeDownloadCount } = useDownloads();
  const { activation, startActivation, onActivationComplete } = useActivation();

  // IDs, deren Entladen bestätigt aussteht (Mutation läuft ODER Budget zeigt
  // das Modell noch). Erst wenn es aus `loadedModels` verschwindet, gilt das
  // Entladen als abgeschlossen.
  const [pendingUnload, setPendingUnload] = useState<ReadonlySet<string>>(new Set());
  const unloadTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearPendingUnload = useCallback((id: string) => {
    setPendingUnload(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const timeout = unloadTimeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      unloadTimeouts.current.delete(id);
    }
  }, []);

  // Solange etwas lädt/entlädt, das Budget schnell pollen — sonst gemütlich.
  const busyPolling = pendingUnload.size > 0 || activation !== null;
  const { data: budget } = useMemoryBudget({
    refetchInterval: busyPolling ? 2_000 : 10_000,
    staleTime: busyPolling ? 0 : 5_000,
  });
  const { data: defaultModelId } = useQuery({
    queryKey: STORE_MODEL_DEFAULT_KEY,
    queryFn: async () => {
      const res = await api
        .get<{ default_model?: string | null }>('/models/default', { showError: false })
        .catch(() => ({}) as { default_model?: string | null });
      return res.default_model ?? null;
    },
    staleTime: 30_000,
  });

  const installed = models.filter(isModelInstalled);
  const loaded = useMemo(() => budget?.loadedModels ?? [], [budget]);
  const loadedIds = new Set(loaded.map(m => m.id));
  const usedMb = budget?.usedMb ?? 0;
  const totalMb = budget?.totalBudgetMb ?? 0;
  const pct = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;
  // Plan 023 D3: derselbe Zustand wie in der Statusleiste, aus einer Quelle.
  const lage = modellage(budget);
  const grund = wechselGrund(budget?.lastSwitch?.reason);
  const defaultModel = installed.find(m => m.id === defaultModelId) ?? null;
  const defaultLoaded = defaultModel
    ? loadedIds.has(defaultModel.id) ||
      (defaultModel.effective_ollama_name != null &&
        loadedIds.has(defaultModel.effective_ollama_name))
    : false;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: MEMORY_BUDGET_QUERY_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
  }, [qc]);

  // Abgeschlossenes Entladen erkennen: eine ausstehende ID, die nicht mehr im
  // Budget auftaucht, ist wirklich draußen → Erfolg melden.
  useEffect(() => {
    if (pendingUnload.size === 0 || !budget) return;
    for (const id of pendingUnload) {
      if (!loaded.some(m => m.id === id)) {
        clearPendingUnload(id);
        toast.success('Modell aus dem RAM entladen');
      }
    }
  }, [pendingUnload, budget, loaded, clearPendingUnload, toast]);

  // Laden abgeschlossen (ActivationContext) → Budget/Status sofort aktualisieren.
  useEffect(
    () =>
      onActivationComplete((_modelId, success) => {
        invalidate();
        if (success) toast.success('Modell ist im RAM bereit');
      }),
    [onActivationComplete, invalidate, toast]
  );

  // Timeouts beim Unmount aufräumen.
  useEffect(() => {
    const timeouts = unloadTimeouts.current;
    return () => {
      timeouts.forEach(t => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const unload = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success?: boolean; error?: string }>(
        `/models/${encodeURIComponent(id)}/unload`,
        {}
      ),
    onMutate: (id: string) => {
      setPendingUnload(prev => new Set(prev).add(id));
      // Sicherheitsnetz: wenn das Budget das Modell nach 45 s immer noch
      // listet, den Schwebezustand auflösen statt ewig zu drehen.
      const timeout = setTimeout(() => {
        clearPendingUnload(id);
        toast.error('Entladen dauert ungewöhnlich lange. Status unklar, Ansicht aktualisiert');
        invalidate();
      }, UNLOAD_TIMEOUT_MS);
      unloadTimeouts.current.set(id, timeout);
    },
    onSuccess: (res, id) => {
      if (res?.success === false) {
        clearPendingUnload(id);
        toast.error(`Entladen fehlgeschlagen: ${res.error ?? 'unbekannter Fehler'}`);
        return;
      }
      invalidate();
    },
    onError: (_err, id) => {
      clearPendingUnload(id);
    },
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.post('/models/default', { model_id: id }),
    onSuccess: (_r, id) => {
      invalidate();
      const m = installed.find(x => x.id === id);
      toast.success(`Standardmodell: ${modellAnzeigeName(m ?? { id })}`);
    },
  });

  const busy = unload.isPending || setDefault.isPending || activation !== null;

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-testid="models-dashboard"
    >
      {/* Kopf: Titel + Zähler */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Cpu className="size-4 text-primary" aria-hidden="true" />
          KI-Modelle
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
          {installed.length} installiert
        </span>
        {activeDownloadCount > 0 && (
          <span className="flex items-center gap-1.5 text-primary">
            <DownloadCloud className="size-3.5 animate-pulse" aria-hidden="true" />
            {activeDownloadCount} lädt …
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{shown} im Katalog</span>
      </div>

      {/* KI-RAM-Balken — ein Segment je geladenem Modell, Rest = frei */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">KI-RAM</span>
          <span className="text-foreground">{kiRamZeile(budget)}</span>
        </div>
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="KI-RAM-Auslastung"
        >
          {totalMb > 0 &&
            loaded.map((m, i) => (
              <div
                key={m.id}
                title={`${modellAnzeigeName(m)}: ${toGb(m.ramMb)} GB`}
                className={cn(
                  'h-full transition-all',
                  pct >= 90 ? 'bg-destructive' : 'bg-primary',
                  i > 0 && 'border-l border-card'
                )}
                style={{
                  width: `${Math.min(100, (m.ramMb / totalMb) * 100)}%`,
                  opacity: 1 - i * 0.25,
                }}
              />
            ))}
        </div>
      </div>

      {/* Aktuell im RAM geladene Modelle + Entladen (mit „entlädt …"-Zustand) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Im RAM:</span>
        {loaded.length === 0 ? (
          // Plan 023 D3: derselbe Satz wie in der Statusleiste. Bis zum
          // 21.08.2026 stand hier "kein Modell geladen", waehrend die Leiste
          // gleichzeitig ein bereites Modell nannte.
          <span className="text-muted-foreground" data-testid="modelle-zustand">
            {lage.text}
            {lage.zustand === 'bereit' && ', wird bei Bedarf automatisch geladen'}
          </span>
        ) : (
          loaded.map(m => {
            const unloading = pendingUnload.has(m.id);
            const anzeige = modellAnzeigeName(m);
            return (
              <span
                key={m.id}
                data-testid={`loaded-chip-${m.id}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary',
                  unloading && 'opacity-70'
                )}
              >
                <span className="font-medium">{anzeige}</span>
                <span className="text-primary/70">{toGb(m.ramMb)} GB</span>
                {unloading ? (
                  <span className="flex items-center gap-1" aria-live="polite">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    entlädt …
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => unload.mutate(m.id)}
                    title={`${anzeige} aus dem RAM entladen`}
                    aria-label={`${anzeige} entladen`}
                    className="rounded-full p-0.5 hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Power className="size-3" aria-hidden="true" />
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>

      {/* Plan 023 D3: warum das System zuletzt selbst etwas getan hat. Am
          20.08.2026 standen 877 automatische Entladungen im Protokoll, und
          keine davon war irgendwo zu sehen. Wer sein Modell aus dem Speicher
          verschwinden sah, bekam dafuer keine Erklaerung. */}
      {grund && budget?.lastSwitch && (
        <p className="text-xs text-muted-foreground" data-testid="modelle-wechselgrund">
          {modellAnzeigeName(budget.lastSwitch.model)} wurde {grund}.
        </p>
      )}

      {/* Laufendes Laden in den RAM — LIVE-Status aus dem ActivationContext */}
      {activation && (
        <div
          data-testid="model-activation-progress"
          className={cn(
            'flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs',
            activation.error
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-primary/30 bg-primary/5'
          )}
          aria-live="polite"
        >
          {activation.error ? null : (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">
              {activation.error
                ? `${activation.modelName}: Laden fehlgeschlagen`
                : `${activation.modelName} wird in den RAM geladen …`}
            </div>
            <div className={cn('truncate', activation.error ? '' : 'text-muted-foreground')}>
              {activation.message}
            </div>
            {!activation.error && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-primary/15">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standardmodell für neue Chats wählen (+ bei Bedarf sofort laden) */}
      {installed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Standardmodell:</span>
          <select
            value={defaultModel?.id ?? ''}
            disabled={busy}
            onChange={e => setDefault.mutate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label="Standardmodell wählen"
          >
            {!defaultModel && <option value="">Modell wählen</option>}
            {installed.map(m => (
              <option key={m.id} value={m.id}>
                {modellAnzeigeName(m)}
              </option>
            ))}
          </select>
          {defaultModel && !defaultLoaded && !activation && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void startActivation(defaultModel.id, modellAnzeigeName(defaultModel))}
              className="h-7"
              data-testid="load-default-model"
            >
              <Zap className="size-3.5" /> In den RAM laden
            </Button>
          )}
          <span className="text-muted-foreground">für neue Chats</span>
        </div>
      )}
    </div>
  );
}

const SIZE_ORDER: SizeBucket[] = ['klein', 'mittel', 'gross'];

export function StoreModelsGrid() {
  const { models, loadedModel, invalidateModels } = useStoreCatalog();
  const { onDownloadComplete } = useDownloads();
  const query = useStoreFilterStore(s => s.modelQuery);
  const filters = useStoreFilterStore(s => s.modelFilters);

  // Nach Abschluss eines Downloads den Katalog neu laden, damit die Karte
  // sofort als „Installiert" erscheint (ohne manuelles Neuladen).
  useEffect(
    () => onDownloadComplete(() => invalidateModels()),
    [onDownloadComplete, invalidateModels]
  );

  const loadedId = loadedModel?.model_id ?? null;
  const visible = useMemo(
    () => sortModels(applyModelFilters(models, filters, query)),
    [models, filters, query]
  );
  const isFiltered = query.trim() !== '' || activeFilterCount(filters) > 0;

  // Nach Größe/RAM-Klasse gruppieren (Nutzerwahl B3): je Klasse eine Überschrift,
  // innerhalb die schon sortierte Reihenfolge (installiert zuerst).
  const groups = useMemo(
    () =>
      SIZE_ORDER.map(bucket => ({
        bucket,
        label: SIZE_LABELS[bucket],
        models: visible.filter(m => sizeBucketOf(m) === bucket),
      })).filter(g => g.models.length > 0),
    [visible]
  );

  return (
    // Äußere Spalte füllt den Tab und scrollt SELBST nicht — nur die Gruppen
    // darunter scrollen. So bleibt das Dashboard sichtbar und der frühere
    // „lässt sich nicht scrollen"-Fehler (verschachtelte Scroll-Container)
    // verschwindet: es gibt genau EINEN Scroll-Bereich.
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="store-models-grid"
      aria-label="Modelle"
    >
      {visible.length > 0 ? (
        <>
          <div className="shrink-0 px-4 pt-4">
            <ModelsDashboard models={models} shown={visible.length} />
          </div>
          <div className="@container min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-6">
              {groups.map(group => (
                <section key={group.bucket} aria-label={group.label}>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                      {group.models.length}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
                    {group.models.map(model => (
                      <ModelCard key={model.id} model={model} loadedId={loadedId} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {isFiltered
              ? 'Keine Modelle passen zu Suche/Filter.'
              : 'Noch keine Modelle im Katalog.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default StoreModelsGrid;
