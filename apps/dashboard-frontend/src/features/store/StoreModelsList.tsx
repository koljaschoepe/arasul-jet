/**
 * StoreModelsList — die LINKE Liste des „Modelle"-Reiters (Plan 008 · Schritt 15).
 *
 * Zeigt alle LLM-/Embedding-Modelle des Katalogs mit Name, Größe und Status
 * (Verfügbar · Installiert · Aktiv · Lädt · Fehler). Läuft ein Download, zeigt
 * die Zeile eine LIVE-Fortschrittsanzeige (kompakte DownloadProgress-Leiste),
 * gespeist aus dem globalen DownloadContext — bewusst ruhig/übersichtlich wie
 * die frühere Einstellungen-Download-UX. Nach einem erfolgreichen Pull wird der
 * Katalog neu geladen, sodass das Modell sofort als „Installiert" erscheint.
 *
 * Der „Erweiterungen"-Reiter nutzt weiterhin die ExtensionsSidebarList (An/Aus);
 * die Auswahl beider Reiter läuft über denselben ephemeren Extension-Store, die
 * Detailseite in der Mitte (StoreDetailPage) reagiert darauf.
 */
import { useEffect, useMemo, useState } from 'react';
import { Cpu, Download, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
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

export function StoreModelsList() {
  const { models, loadedModel, invalidateModels } = useStoreCatalog();
  const { isDownloading, getDownloadState, startDownload, cancelDownload, onDownloadComplete } =
    useDownloads();
  const selected = useExtensionStore(s => s.selected);
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const [query, setQuery] = useState('');

  // Nach Abschluss eines Downloads den Katalog neu laden, damit das Modell
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
    <div
      className="flex h-full flex-col bg-background"
      data-testid="store-models-list"
      aria-label="Modelle"
    >
      <div className="relative shrink-0 p-2 pb-2">
        <Search className="pointer-events-none absolute left-4 top-[calc(0.5rem+1rem)] size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Modelle durchsuchen..."
          aria-label="Modelle durchsuchen"
          className="h-8 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Suche leeren"
            className="absolute right-4 top-[calc(0.5rem+1rem)] -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto pb-3">
        {filtered.map(model => {
          const downloading = isDownloading(model.id);
          const status = modelStatus(model, loadedId, downloading);
          const meta = STATUS_META[status];
          const isSelected = selected?.kind === 'model' && selected.id === model.id;
          const downloadState = downloading ? getDownloadState(model.id) : null;
          const canDownload = status === 'available' || status === 'error';

          return (
            <li key={model.id} className="px-1.5">
              <div
                className={cn(
                  'rounded-md transition-colors',
                  isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <button
                  type="button"
                  data-testid={`model-row-${model.id}`}
                  aria-pressed={isSelected}
                  onClick={() => selectExtension({ kind: 'model', id: model.id })}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-primary [&_svg]:size-3.5">
                    <Cpu aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {model.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatModelSize(model.size_bytes)}
                    </span>
                  </span>
                  {canDownload ? (
                    <span
                      role="button"
                      tabIndex={0}
                      data-testid={`model-download-${model.id}`}
                      aria-label={`${model.name} herunterladen`}
                      onClick={e => {
                        e.stopPropagation();
                        startDownload(model.id, model.name);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          startDownload(model.id, model.name);
                        }
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary [&_svg]:size-3.5"
                      title="Herunterladen"
                    >
                      <Download aria-hidden="true" />
                    </span>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn('h-4.5 shrink-0 px-1.5 text-ui-xs', badgeClass(meta.tone))}
                    >
                      {meta.label}
                    </Badge>
                  )}
                </button>
                {downloadState && (
                  <div className="px-2 pb-2" data-testid={`model-progress-${model.id}`}>
                    <DownloadProgress
                      downloadState={downloadState}
                      onCancel={() => cancelDownload(model.id)}
                      compact
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}

        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {q !== '' ? <>Keine Treffer für „{query}“</> : 'Noch keine Modelle im Katalog.'}
          </p>
        )}
      </ul>
    </div>
  );
}

export default StoreModelsList;
