/**
 * StoreModelsGrid — der „Modelle"-Reiter des Stores (Full-Width-Kartenraster).
 *
 * Zeigt die LLM-/Embedding-Modelle des Katalogs als ruhiges, breites Karten-
 * raster (Standard 3 pro Reihe) mit Name, Größe, Status-Badge (Verfügbar ·
 * Installiert · Aktiv · Lädt · Fehler) und einer Inline-Aktion („Laden"). Läuft
 * ein Download, ersetzt eine LIVE-Fortschrittsleiste (DownloadProgress) die
 * Aktion — gespeist aus dem globalen DownloadContext, sodass der Fortschritt
 * Navigation überlebt. Nach einem erfolgreichen Pull wird der Katalog neu
 * geladen, sodass die Karte sofort auf „Installiert" umspringt.
 *
 * Plan 012 Phase C Schritt 7: die Filter-Leiste ist in die linke Sidebar
 * gewandert (StoreModelsFilterPanel). Das Raster liest Suche + Filter aus dem
 * storeFilterStore, sortiert per Default nach Status → Größe und zeigt nur noch
 * die Karten. Ein Klick auf eine Karte öffnet die Detailseite (StoreDetailPage)
 * über den ephemeren Extension-Store.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, Download, Loader2, CircleCheck, DownloadCloud, Power, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import {
  useStoreCatalog,
  isModelInstalled,
  isModelActive,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
} from '@/hooks/useStoreCatalog';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import type { MemoryBudget } from '@/types';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { formatModelSize } from '@/utils/formatting';

/**
 * React-Query-Key des KI-RAM-Budgets — bewusst wertgleich zu dem der Fußzeilen-
 * Statusleiste, damit sich beide denselben Cache-Eintrag teilen (kein doppelter
 * Poll auf dem Jetson). Als lokale Konstante gehalten, weil ein Feature-Modul
 * nicht aus einem anderen Feature (features/workspace) importieren darf.
 */
const MEMORY_BUDGET_QUERY_KEY = ['models', 'memory-budget'] as const;

/** MB → GB, eine Nachkommastelle. */
function toGb(mb: number): string {
  return (mb / 1024).toFixed(1);
}
import DownloadProgress from './DownloadProgress';
import {
  applyModelFilters,
  sortModels,
  activeFilterCount,
  sizeBucketOf,
  SIZE_LABELS,
  type SizeBucket,
} from './storeModelFilters';

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

  const onStart = () => {
    setStarting(true);
    void startDownload(model.id, model.name);
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
        <div className="flex items-start gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3">
            <Cpu aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {model.name}
          </span>
          <Badge
            variant="outline"
            className={cn('h-4 shrink-0 px-1.5 text-ui-xs', badgeClass(meta.tone))}
          >
            {meta.label}
          </Badge>
        </div>
        <span className="text-ui-xs font-medium text-muted-foreground">
          {formatModelSize(model.size_bytes)}
        </span>
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
              aria-label={`${model.name} herunterladen`}
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
 * Großes Kopf-Dashboard über dem Katalog: KI-RAM-Auslastung als Balken, die
 * aktuell im RAM geladenen Modelle (mit Entladen), das Standardmodell für neue
 * Chats (Wechseln + bei Bedarf in den RAM laden) und Zähler.
 *
 * WICHTIG: Datenquelle für „was ist geladen" ist `/models/memory-budget` — genau
 * wie die Fußzeilen-Statusleiste. Früher las die obere Leiste nur den Katalog
 * ab (`isModelActive`) und zeigte „keins geladen", sobald das laufende Modell
 * nicht exakt einem Katalog-Eintrag entsprach (z. B. `qwen3:14b` vs. Katalog
 * `qwen3:14b-q8`) — im Widerspruch zur Fußzeile. Gemeinsame Quelle = kein
 * Widerspruch mehr.
 */
function ModelsDashboard({ models, shown }: { models: CatalogModel[]; shown: number }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeDownloadCount } = useDownloads();

  const { data: budget } = useQuery({
    queryKey: MEMORY_BUDGET_QUERY_KEY,
    queryFn: () => api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 1,
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
  const loaded = budget?.loadedModels ?? [];
  const loadedIds = new Set(loaded.map(m => m.id));
  const usedMb = budget?.usedMb ?? 0;
  const totalMb = budget?.totalBudgetMb ?? 0;
  const availableMb = budget?.availableMb ?? 0;
  const pct = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;
  const defaultModel = installed.find(m => m.id === defaultModelId) ?? null;
  const defaultLoaded = defaultModel ? loadedIds.has(defaultModel.id) : false;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: MEMORY_BUDGET_QUERY_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
  };

  const unload = useMutation({
    mutationFn: (id: string) => api.post(`/models/${encodeURIComponent(id)}/unload`, {}),
    onSuccess: invalidate,
  });
  const load = useMutation({
    mutationFn: (id: string) => api.post(`/models/${encodeURIComponent(id)}/load`, {}),
    onSuccess: () => {
      invalidate();
      toast.success('Modell wird in den RAM geladen …');
    },
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.post('/models/default', { model_id: id }),
    onSuccess: (_r, id) => {
      invalidate();
      const m = installed.find(x => x.id === id);
      toast.success(`Standardmodell: ${m?.name ?? id}`);
    },
  });

  const busy = unload.isPending || load.isPending || setDefault.isPending;

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

      {/* KI-RAM-Balken */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">KI-RAM</span>
          <span className="text-foreground">
            {toGb(usedMb)} / {toGb(totalMb)} GB belegt · frei {toGb(availableMb)} GB
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="KI-RAM-Auslastung"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct >= 90 ? 'bg-destructive' : 'bg-primary'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Aktuell im RAM geladene Modelle + Entladen */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Im RAM:</span>
        {loaded.length === 0 ? (
          <span className="text-muted-foreground">
            kein Modell geladen — wird bei Bedarf automatisch geladen
          </span>
        ) : (
          loaded.map(m => (
            <span
              key={m.id}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary"
            >
              <span className="font-medium">{m.name}</span>
              <span className="text-primary/70">{toGb(m.ramMb)} GB</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => unload.mutate(m.id)}
                title={`${m.name} aus dem RAM entladen`}
                aria-label={`${m.name} entladen`}
                className="rounded-full p-0.5 hover:bg-primary/20 disabled:opacity-50"
              >
                <Power className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))
        )}
      </div>

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
            {!defaultModel && <option value="">— wählen —</option>}
            {installed.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {defaultModel && !defaultLoaded && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => load.mutate(defaultModel.id)}
              className="h-7"
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-6">
              {groups.map(group => (
                <section key={group.bucket} aria-label={group.label}>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                      {group.models.length}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
