/**
 * StoreModelsGrid — der „Modelle"-Reiter des Stores (Full-Width-Kartenraster).
 *
 * Zeigt alle LLM-/Embedding-Modelle des Katalogs als responsives Kartenraster
 * mit Name, Größe, Status-Badge (Verfügbar · Installiert · Aktiv · Lädt · Fehler)
 * und einer Inline-Aktion („Laden"). Läuft ein Download, ersetzt eine LIVE-
 * Fortschrittsleiste (DownloadProgress) die Aktion — gespeist aus dem globalen
 * DownloadContext, sodass der Fortschritt Navigation überlebt. Nach einem
 * erfolgreichen Pull wird der Katalog neu geladen, sodass die Karte sofort auf
 * „Installiert" umspringt (ohne Reload). Ein Klick auf die Karte öffnet die
 * Detailseite (StoreDetailPage) über den ephemeren Extension-Store.
 */
import { useEffect, useMemo, useState } from 'react';
import { Cpu, Download, Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useDownloads } from '@/contexts/DownloadContext';
import { useStoreCatalog, isModelInstalled, isModelActive } from '@/hooks/useStoreCatalog';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import { useExtensionStore } from '@/stores/extensionStore';
import { formatModelSize } from '@/utils/formatting';
import DownloadProgress from './DownloadProgress';
import {
  applyModelFilters,
  deriveModelFacets,
  toggleValue,
  activeFilterCount,
  EMPTY_MODEL_FILTERS,
  type ModelFilterState,
  type FacetOption,
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

  const downloading = isDownloading(model.id);
  const status = modelStatus(model, loadedId, downloading);
  const meta = STATUS_META[status];
  const downloadState = downloading ? getDownloadState(model.id) : null;
  const canDownload = status === 'available' || status === 'error';

  return (
    <div
      data-testid={`model-card-${model.id}`}
      className="flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        data-testid={`model-open-${model.id}`}
        onClick={() => selectExtension({ kind: 'model', id: model.id })}
        className="flex flex-1 flex-col gap-2 rounded-t-lg p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3.5">
            <Cpu aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {model.name}
          </span>
          <Badge
            variant="outline"
            className={cn('h-5 shrink-0 px-1.5 text-ui-xs', badgeClass(meta.tone))}
          >
            {meta.label}
          </Badge>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {formatModelSize(model.size_bytes)}
        </span>
        <p className="line-clamp-2 text-sm text-muted-foreground">{model.description}</p>
      </button>

      {(downloadState || canDownload) && (
        <div className="border-t border-border p-3">
          {downloadState ? (
            <div data-testid={`model-progress-${model.id}`}>
              <DownloadProgress
                downloadState={downloadState}
                onCancel={() => cancelDownload(model.id)}
                compact
              />
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              data-testid={`model-download-${model.id}`}
              aria-label={`${model.name} herunterladen`}
              onClick={() => startDownload(model.id, model.name)}
            >
              <Download className="size-4" /> Laden
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Eine Facetten-Gruppe in der linken Filter-Leiste (Checkboxen + Zähler). */
function FacetGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="px-1 text-ui-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {options.map(opt => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-ui-sm text-foreground hover:bg-accent"
        >
          <input
            type="checkbox"
            className="size-3.5 shrink-0 accent-primary"
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          />
          <span className="min-w-0 flex-1 truncate">{opt.label}</span>
          <span className="shrink-0 text-ui-xs text-muted-foreground tabular-nums">
            {opt.count}
          </span>
        </label>
      ))}
    </div>
  );
}

export function StoreModelsGrid() {
  const { models, loadedModel, invalidateModels } = useStoreCatalog();
  const { onDownloadComplete } = useDownloads();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ModelFilterState>(EMPTY_MODEL_FILTERS);

  // Nach Abschluss eines Downloads den Katalog neu laden, damit die Karte
  // sofort als „Installiert" erscheint (ohne manuelles Neuladen).
  useEffect(
    () => onDownloadComplete(() => invalidateModels()),
    [onDownloadComplete, invalidateModels]
  );

  const loadedId = loadedModel?.model_id ?? null;
  const facets = useMemo(() => deriveModelFacets(models), [models]);
  const filtered = useMemo(
    () => applyModelFilters(models, filters, query),
    [models, filters, query]
  );
  const activeCount = activeFilterCount(filters);

  const toggle = <K extends keyof ModelFilterState>(group: K, value: ModelFilterState[K][number]) =>
    setFilters(f => ({ ...f, [group]: toggleValue(f[group] as string[], value as string) }));
  const resetFilters = () => setFilters(EMPTY_MODEL_FILTERS);

  return (
    <div className="flex h-full min-h-0" data-testid="store-models-grid" aria-label="Modelle">
      {/* Linke Filter-Leiste (Facetten mit Zählern) */}
      <aside className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4 sm:flex">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-ui-sm font-semibold text-foreground">
            <SlidersHorizontal className="size-3.5" /> Filter
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-ui-xs text-primary hover:underline"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <FacetGroup
          title="Fähigkeit"
          options={facets.capabilities}
          selected={filters.capabilities}
          onToggle={v => toggle('capabilities', v)}
        />
        <FacetGroup
          title="Typ"
          options={facets.types}
          selected={filters.types}
          onToggle={v => toggle('types', v)}
        />
        <FacetGroup
          title="Größe"
          options={facets.sizes}
          selected={filters.sizes}
          onToggle={v => toggle('sizes', v)}
        />
        <FacetGroup
          title="Status"
          options={facets.status}
          selected={filters.status}
          onToggle={v => toggle('status', v)}
        />
      </aside>

      {/* Rechte Spalte: Suche + aktive Chips + Karten-Raster */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative shrink-0 p-4 pb-2">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Modelle durchsuchen..."
            aria-label="Modelle durchsuchen"
            className="h-9 pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Suche leeren"
              className="absolute right-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Aktive Filter als entfernbare Chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
            {(
              [
                ['capabilities', filters.capabilities],
                ['types', filters.types],
                ['sizes', filters.sizes],
                ['status', filters.status],
              ] as const
            ).flatMap(([group, values]) =>
              values.map(v => (
                <button
                  key={`${group}:${v}`}
                  type="button"
                  onClick={() => toggle(group, v as never)}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-ui-xs text-foreground hover:border-primary/40"
                  aria-label={`Filter ${v} entfernen`}
                >
                  {v} <X className="size-3" />
                </button>
              ))
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="ml-1 text-ui-xs text-muted-foreground hover:text-foreground"
            >
              Alle entfernen
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filtered.map(model => (
                <ModelCard key={model.id} model={model} loadedId={loadedId} />
              ))}
            </div>
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {query !== '' || activeCount > 0
                ? 'Keine Modelle passen zu Suche/Filter.'
                : 'Noch keine Modelle im Katalog.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoreModelsGrid;
