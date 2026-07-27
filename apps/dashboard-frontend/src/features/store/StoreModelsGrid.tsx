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
import { Cpu, Download, Loader2, CircleCheck, DownloadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useDownloads } from '@/contexts/DownloadContext';
import { useStoreCatalog, isModelInstalled, isModelActive } from '@/hooks/useStoreCatalog';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { formatModelSize } from '@/utils/formatting';
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

/** Kompakte Live-Statusleiste über dem Katalog (B3): schneller Überblick statt
 *  langer Liste — installiert / aktiv / lädt gerade. */
function ModelsStatusBar({
  models,
  loadedId,
  shown,
}: {
  models: CatalogModel[];
  loadedId: string | null;
  shown: number;
}) {
  const { activeDownloadCount } = useDownloads();
  const installedCount = models.filter(isModelInstalled).length;
  const activeModel = models.find(m => isModelActive(m, loadedId)) ?? null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-foreground">
        <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
        {installedCount} installiert
      </span>
      <span className="flex items-center gap-1.5 text-foreground">
        <Cpu className="size-3.5 text-primary" aria-hidden="true" />
        Aktiv: {activeModel ? activeModel.name : 'keins geladen'}
      </span>
      {activeDownloadCount > 0 && (
        <span className="flex items-center gap-1.5 text-foreground">
          <DownloadCloud className="size-3.5 animate-pulse text-primary" aria-hidden="true" />
          {activeDownloadCount} lädt …
        </span>
      )}
      <span className="ml-auto text-muted-foreground">{shown} Modelle</span>
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
    <div
      className="min-h-0 flex-1 overflow-y-auto p-4"
      data-testid="store-models-grid"
      aria-label="Modelle"
    >
      {visible.length > 0 ? (
        <>
          <ModelsStatusBar models={models} loadedId={loadedId} shown={visible.length} />
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
        </>
      ) : (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {isFiltered ? 'Keine Modelle passen zu Suche/Filter.' : 'Noch keine Modelle im Katalog.'}
        </p>
      )}
    </div>
  );
}

export default StoreModelsGrid;
