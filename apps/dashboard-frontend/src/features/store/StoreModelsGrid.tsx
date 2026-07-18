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
import { Cpu, Download, Search, X } from 'lucide-react';
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

export function StoreModelsGrid() {
  const { models, loadedModel, invalidateModels } = useStoreCatalog();
  const { onDownloadComplete } = useDownloads();
  const [query, setQuery] = useState('');

  // Nach Abschluss eines Downloads den Katalog neu laden, damit die Karte
  // sofort als „Installiert" erscheint (ohne manuelles Neuladen).
  useEffect(
    () => onDownloadComplete(() => invalidateModels()),
    [onDownloadComplete, invalidateModels]
  );

  const q = query.trim().toLowerCase();
  const loadedId = loadedModel?.model_id ?? null;
  const filtered = useMemo(
    () =>
      models.filter(
        m => q === '' || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
      ),
    [models, q]
  );

  return (
    <div className="flex h-full flex-col" data-testid="store-models-grid" aria-label="Modelle">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {filtered.map(model => (
              <ModelCard key={model.id} model={model} loadedId={loadedId} />
            ))}
          </div>
        ) : (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {q !== '' ? <>Keine Treffer für „{query}“</> : 'Noch keine Modelle im Katalog.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default StoreModelsGrid;
