/**
 * StoreDetailPage — die Mitte der Extensions-Ansicht (Store 3.1). Zeigt die
 * Detailseite der links (ExtensionsSidebarList) gewählten Extension mit allen
 * Aktionen; ohne Auswahl einen Leerzustand mit kompaktem „Aktuell geladen"-Kopf.
 *
 * Ersetzt die früheren Unter-Tabs (Start/Modelle/Apps): statt Grid + Modal
 * eine Liste-links/Detail-Mitte-Aufteilung. Die Modell-Aktionen laufen wie
 * bisher über DownloadContext/ActivationContext (Downloads/Aktivierungen
 * überleben Navigation), App-Aktionen über die /apps-Endpunkte inkl.
 * SSE-Installation. Datenbasis: useStoreCatalog (geteilt mit der Sidebar-Liste).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Package,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { Input } from '@/components/ui/shadcn/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/shadcn/dialog';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useActivation } from '@/contexts/ActivationContext';
import useConfirm from '@/hooks/useConfirm';
import { useStoreCatalog } from '@/hooks/useStoreCatalog';
import type { CatalogApp, CatalogModel, LoadedModel } from '@/hooks/useStoreCatalog';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind } from '@/stores/extensionStore';
import { formatModelSize as formatSize } from '@/utils/formatting';
import { sanitizeUrl } from '@/utils/sanitizeUrl';
import ActivationButton from './ActivationButton';
import DownloadProgress from './DownloadProgress';

const speedLabel: Record<string, string> = {
  fast: 'Schnell',
  balanced: 'Ausgewogen',
  quality: 'Qualität',
  vision: 'Vision',
  ocr: 'OCR',
  embed: 'Embedding',
};

/** 131072 → „128k Tokens", 8192 → „8k Tokens", 512 → „512 Tokens". */
function formatContextLength(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1024)}k Tokens`;
  return `${tokens} Tokens`;
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}

function DetailShell({
  icon,
  title,
  badges,
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <span className="text-primary [&_svg]:size-5">{icon}</span>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {badges}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">{footer}</div>
    </div>
  );
}

// --- Model detail ---

function ModelDetail({
  model,
  loadedModel,
  defaultModel,
  onChanged,
}: {
  model: CatalogModel;
  loadedModel: LoadedModel | null;
  defaultModel: string | null;
  onChanged: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { startDownload, isDownloading, getDownloadState, onDownloadComplete, cancelDownload } =
    useDownloads();
  const { activation, startActivation, onActivationComplete } = useActivation();

  useEffect(() => {
    const unsub1 = onDownloadComplete(() => onChanged());
    const unsub2 = onActivationComplete(() => onChanged());
    return () => {
      unsub1();
      unsub2();
    };
  }, [onDownloadComplete, onActivationComplete, onChanged]);

  const isReady = model.install_status === 'available';
  const loadedId = loadedModel?.model_id ?? null;
  const isLoaded =
    loadedId != null && (loadedId === model.id || loadedId === model.effective_ollama_name);
  const isDefault = defaultModel === model.id;
  const isActivating = activation?.modelId === model.id && !activation?.error;
  const downloading = isDownloading(model.id);
  const downloadState = getDownloadState(model.id);

  const handleSetDefault = async () => {
    try {
      await api.post('/models/default', { model_id: model.id }, { showError: false });
      toast.success(`„${model.name}" als Standard gesetzt`);
      onChanged();
    } catch {
      toast.error(`Fehler beim Setzen von „${model.name}" als Standard`);
    }
  };

  const handleDelete = async () => {
    if (!(await confirm({ message: `Modell „${model.name}" wirklich löschen?` }))) return;
    try {
      await api.del(`/models/${model.id}`, { showError: false });
      onChanged();
    } catch {
      toast.error(`Fehler beim Löschen von „${model.name}"`);
    }
  };

  return (
    <DetailShell
      icon={<Cpu />}
      title={model.name}
      badges={
        <div className="flex items-center gap-2">
          {isLoaded && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Zap className="size-3" /> Aktiv
            </Badge>
          )}
          {isDefault && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Star className="size-3" /> Standard
            </Badge>
          )}
        </div>
      }
      footer={
        <>
          {!isReady && !downloading && (
            <Button onClick={() => startDownload(model.id, model.name)}>
              <Download className="size-4" /> Herunterladen
            </Button>
          )}
          {(isReady || isLoaded) && (
            <ActivationButton
              isActivating={!!isActivating}
              isLoaded={!!isLoaded}
              activatingPercent={activation?.progress || 0}
              onActivate={() => startActivation(model.id, model.name)}
              className="max-w-48"
            />
          )}
          {!isDefault && (isReady || isLoaded) && (
            <Button variant="secondary" onClick={handleSetDefault}>
              <Star className="size-4" /> Als Standard
            </Button>
          )}
          {isReady && !isLoaded && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="size-4" /> Löschen
            </Button>
          )}
        </>
      }
    >
      <p className="leading-relaxed text-muted-foreground">{model.description}</p>

      {downloading && downloadState && (
        <div className="mt-ui-4 rounded-lg border border-border bg-card p-ui-3">
          <div className="mb-ui-2 flex items-center gap-ui-1 text-ui-sm font-medium text-foreground">
            <Download className="size-4 text-primary" /> Wird heruntergeladen
          </div>
          <DownloadProgress
            downloadState={downloadState}
            onCancel={() => cancelDownload(model.id)}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 border-t border-border pt-6">
        <Spec label="Modell-ID">
          <code className="text-sm">{model.id}</code>
        </Spec>
        <Spec label="Download-Größe">{formatSize(model.size_bytes)}</Spec>
        <Spec label="RAM-Bedarf">{model.ram_required_gb} GB</Spec>
        <Spec label="Geschwindigkeit">{speedLabel[model.speed_tier ?? ''] ?? 'Ausgewogen'}</Spec>
        {model.context_window != null && (
          <Spec label="Kontextlänge">{formatContextLength(model.context_window)}</Spec>
        )}
      </div>

      {model.capabilities && model.capabilities.length > 0 && (
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Fähigkeiten</h2>
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map(cap => (
              <span key={cap} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {model.ollama_library_url && (
        <div className="mt-6 border-t border-border pt-6">
          <a href={sanitizeUrl(model.ollama_library_url)} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">
              <ExternalLink className="size-4" /> Ollama Library ansehen
            </Button>
          </a>
        </div>
      )}
      {ConfirmDialog}
    </DetailShell>
  );
}

// --- App detail ---

const getAppUrl = (app: CatalogApp): string | null => {
  if (app.hasCustomPage && app.customPageRoute) return app.customPageRoute;
  const traefikPaths: Record<string, string> = { n8n: '/n8n' };
  if (traefikPaths[app.id]) return `${window.location.origin}${traefikPaths[app.id]}`;
  if (app.ports?.external) return `http://${window.location.hostname}:${app.ports.external}`;
  return null;
};

interface InstallProgress {
  phase: string;
  progress: number;
  status: string;
  error?: string;
}

function AppDetail({ app, onChanged }: { app: CatalogApp; onChanged: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallProgress | null>(null);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const installRef = useRef(false);

  const handleAction = async (action: string, options: Record<string, unknown> = {}) => {
    if (actionLoading) return;
    setActionLoading(action);
    try {
      await api.post(`/apps/${app.id}/${action}`, options, { showError: false });
      onChanged();
    } catch {
      const labels: Record<string, string> = {
        start: 'Start',
        stop: 'Stoppen',
        restart: 'Neustart',
        uninstall: 'Deinstallation',
      };
      toast.error(`${labels[action] ?? action} von „${app.name}" fehlgeschlagen`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleInstall = useCallback(async () => {
    if (installRef.current) return;
    installRef.current = true;
    setInstall({ phase: 'init', progress: 0, status: 'Wird vorbereitet...' });
    try {
      const response = await api.request<Response>(`/apps/${app.id}/install?stream=true`, {
        method: 'POST',
        body: { config: {} },
        raw: true,
        showError: false,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) {
              toast.error(`Installation von „${app.name}" fehlgeschlagen`);
              setInstall(null);
              onChanged();
              return;
            }
            if (evt.done) {
              setInstall({ phase: 'complete', progress: 100, status: evt.message || 'Fertig' });
              onChanged();
              setTimeout(() => setInstall(null), 2000);
              return;
            }
            setInstall({
              phase: evt.phase || 'pull',
              progress: evt.percent ?? 0,
              status: evt.message || evt.status || '',
            });
          } catch {
            /* keepalive / parse noise */
          }
        }
      }
    } catch {
      toast.error(`Installation von „${app.name}" fehlgeschlagen`);
      setInstall(null);
      onChanged();
    } finally {
      installRef.current = false;
    }
  }, [api, app.id, app.name, onChanged, toast]);

  const doUninstall = async (removeVolumes: boolean) => {
    setUninstallOpen(false);
    await handleAction('uninstall', { removeVolumes });
  };

  const busy = !!actionLoading;
  const appUrl = getAppUrl(app);

  return (
    <DetailShell
      icon={<Package />}
      title={app.name}
      badges={
        app.status === 'running' ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <Zap className="size-3" /> Aktiv
          </Badge>
        ) : app.status === 'installed' ? (
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            Gestoppt
          </Badge>
        ) : app.status === 'error' ? (
          <Badge
            variant="outline"
            className="border-destructive/30 bg-destructive/10 text-destructive"
          >
            <AlertCircle className="size-3" /> Fehler
          </Badge>
        ) : undefined
      }
      footer={
        <>
          {app.status === 'available' && !install && (
            <Button onClick={handleInstall} disabled={busy}>
              <Download className="size-4" /> Installieren
            </Button>
          )}
          {app.status === 'installed' && (
            <>
              <Button onClick={() => handleAction('start')} disabled={busy}>
                {actionLoading === 'start' ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Starten
              </Button>
              <Button variant="destructive" onClick={() => setUninstallOpen(true)} disabled={busy}>
                <Trash2 className="size-4" /> Löschen
              </Button>
            </>
          )}
          {app.status === 'running' && (
            <>
              {app.hasCustomPage && app.customPageRoute ? (
                <Button asChild>
                  <Link to={app.customPageRoute}>
                    <ExternalLink className="size-4" /> Öffnen
                  </Link>
                </Button>
              ) : appUrl ? (
                <Button asChild>
                  <a href={appUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Öffnen
                  </a>
                </Button>
              ) : (
                <Button disabled title="App-URL nicht verfügbar">
                  <ExternalLink className="size-4" /> Öffnen
                </Button>
              )}
              {!app.builtin && (
                <>
                  <Button variant="outline" onClick={() => handleAction('restart')} disabled={busy}>
                    <RefreshCw className="size-4" /> Neustarten
                  </Button>
                  <Button variant="outline" onClick={() => handleAction('stop')} disabled={busy}>
                    {actionLoading === 'stop' ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Square className="size-4" />
                    )}
                    Stoppen
                  </Button>
                </>
              )}
            </>
          )}
          {app.status === 'error' && (
            <>
              <Button onClick={() => handleAction('start')} disabled={busy}>
                <RefreshCw className="size-4" /> Erneut starten
              </Button>
              <Button variant="destructive" onClick={() => setUninstallOpen(true)} disabled={busy}>
                <Trash2 className="size-4" /> Löschen
              </Button>
            </>
          )}
        </>
      }
    >
      <p className="leading-relaxed text-muted-foreground">
        {app.longDescription || app.description}
      </p>

      {install && (
        <div className="mt-4">
          <DownloadProgress downloadState={install} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 border-t border-border pt-6">
        <Spec label="Version">v{app.version}</Spec>
        <Spec label="Kategorie">{app.category}</Spec>
        {app.author && <Spec label="Autor">{app.author}</Spec>}
        <Spec label="Status">
          {app.status === 'running'
            ? 'Aktiv'
            : app.status === 'installed'
              ? 'Gestoppt'
              : app.status === 'error'
                ? 'Fehler'
                : 'Verfügbar'}
        </Spec>
        {app.ports?.external && <Spec label="Port">{app.ports.external}</Spec>}
        {app.homepage && (
          <Spec label="Homepage">
            <a
              href={sanitizeUrl(app.homepage)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {app.homepage}
            </a>
          </Spec>
        )}
      </div>

      {app.lastError && (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{app.lastError}</span>
        </div>
      )}

      <Dialog open={uninstallOpen} onOpenChange={open => !open && setUninstallOpen(false)}>
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" /> App deinstallieren
            </DialogTitle>
            <DialogDescription>
              Möchten Sie <strong>{app.name}</strong> wirklich deinstallieren?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertCircle className="size-4 shrink-0" />
            Wählen Sie, ob die App-Daten behalten oder gelöscht werden sollen:
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setUninstallOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="secondary" onClick={() => doUninstall(false)}>
              <Trash2 className="size-4" /> Nur App entfernen
            </Button>
            <Button variant="destructive" onClick={() => doUninstall(true)}>
              <Trash2 className="size-4" /> App + Daten löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailShell>
  );
}

// --- Landing / category overview ---

/** Kompakter „Aktuell geladen"-Kopf, geteilt von Landing- und Fallback-Ansicht. */
function LoadedModelBar({ loadedModel }: { loadedModel: LoadedModel | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3 text-sm">
      {loadedModel ? (
        <>
          <Zap className="size-4 text-primary" />
          <span className="text-muted-foreground">Aktuell geladen:</span>
          <strong className="text-foreground">{loadedModel.model_id}</strong>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="size-4" />
            {loadedModel.ram_usage_mb
              ? `${(loadedModel.ram_usage_mb / 1024).toFixed(1)} GB RAM`
              : 'RAM wird berechnet...'}
          </span>
        </>
      ) : (
        <>
          <Check className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Kein Modell geladen.</span>
        </>
      )}
    </div>
  );
}

interface Tile {
  kind: ExtensionKind;
  id: string;
  name: string;
  description: string;
  meta: string;
}

function CategoryTile({ tile, onSelect }: { tile: Tile; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-testid={`landing-tile-${tile.kind}-${tile.id}`}
      onClick={onSelect}
      className="flex h-full flex-col gap-ui-2 rounded-lg border border-border bg-card p-ui-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <span className="flex items-center gap-ui-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
          {tile.kind === 'model' ? <Cpu aria-hidden="true" /> : <Package aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-ui font-semibold text-foreground">
          {tile.name}
        </span>
      </span>
      <span className="line-clamp-2 text-ui-sm text-muted-foreground">{tile.description}</span>
      <span className="mt-auto text-ui-xs uppercase tracking-wider text-muted-foreground">
        {tile.meta}
      </span>
    </button>
  );
}

/** Browse-Tabs der Mitte (spiegeln den Kategorie-Filter der linken Verwaltung). */
type BrowseTab = 'recommended' | 'models' | 'apps';

const BROWSE_TABS: ReadonlyArray<{ value: BrowseTab; label: string; icon: React.ReactNode }> = [
  { value: 'recommended', label: 'Empfohlen', icon: <Sparkles aria-hidden="true" /> },
  { value: 'models', label: 'Sprachmodelle', icon: <Cpu aria-hidden="true" /> },
  { value: 'apps', label: 'Apps', icon: <Package aria-hidden="true" /> },
];

function TileGrid({ tiles, onSelect }: { tiles: Tile[]; onSelect: (tile: Tile) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-ui-3">
      {tiles.map(tile => (
        <CategoryTile key={`${tile.kind}-${tile.id}`} tile={tile} onSelect={() => onSelect(tile)} />
      ))}
    </div>
  );
}

function modelTile(model: CatalogModel): Tile {
  return {
    kind: 'model',
    id: model.id,
    name: model.name,
    description: model.description,
    meta:
      model.install_status === 'available'
        ? 'Installiert'
        : `${formatSize(model.size_bytes)} Download`,
  };
}

function appTile(app: CatalogApp): Tile {
  return {
    kind: 'app',
    id: app.id,
    name: app.name,
    description: app.description,
    meta: app.status === 'running' ? 'Aktiv' : app.category,
  };
}

function StoreLanding({
  models,
  apps,
  defaultModel,
  loadedModel,
}: {
  models: CatalogModel[];
  apps: CatalogApp[];
  defaultModel: string | null;
  loadedModel: LoadedModel | null;
}) {
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const onSelect = (tile: Tile) => selectExtension({ kind: tile.kind, id: tile.id });
  const [tab, setTab] = useState<BrowseTab>('recommended');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const recommendedModels = models.filter(
    m => m.id === defaultModel || m.speed_tier === 'balanced'
  );
  const featuredApps = apps.filter(a => a.featured);
  const tilesByTab: Record<BrowseTab, Tile[]> = {
    recommended: [...recommendedModels.map(modelTile), ...featuredApps.map(appTile)],
    models: models.map(modelTile),
    apps: apps.map(appTile),
  };
  const activeTiles = tilesByTab[tab].filter(
    t => q === '' || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );

  const hasContent = models.length > 0 || apps.length > 0;

  return (
    <div className="flex h-full flex-col">
      <LoadedModelBar loadedModel={loadedModel} />
      {hasContent && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
          <div role="tablist" aria-label="Katalog filtern" className="flex gap-1">
            {BROWSE_TABS.map(t => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                data-testid={`browse-tab-${t.value}`}
                onClick={() => setTab(t.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-ui-sm font-medium transition-colors [&_svg]:size-3.5',
                  tab === t.value
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Katalog durchsuchen..."
              aria-label="Katalog durchsuchen"
              className="h-8 pl-8 pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {hasContent ? (
          activeTiles.length > 0 ? (
            <div className="mx-auto max-w-4xl">
              <TileGrid tiles={activeTiles} onSelect={onSelect} />
            </div>
          ) : (
            <p className="py-16 text-center text-ui-sm text-muted-foreground">
              {q !== ''
                ? `Keine Treffer für „${query}“.`
                : tab === 'recommended'
                  ? 'Noch keine Empfehlungen — wähle „Sprachmodelle" oder „Apps".'
                  : 'Nichts in dieser Kategorie.'}
            </p>
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            <p className="font-medium">Noch keine Extensions verfügbar</p>
            <p className="max-w-sm text-ui-sm">
              Sobald Modelle oder Apps im Katalog stehen, erscheinen sie hier.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function StoreDetailPage() {
  const selected = useExtensionStore(s => s.selected);
  const { models, apps, loadedModel, defaultModel, invalidateModels, invalidateApps } =
    useStoreCatalog();

  const landing = (
    <StoreLanding
      models={models}
      apps={apps}
      defaultModel={defaultModel}
      loadedModel={loadedModel}
    />
  );

  if (!selected) return landing;

  if (selected.kind === 'model') {
    const model = models.find(m => m.id === selected.id);
    if (!model) return landing;
    return (
      <ModelDetail
        model={model}
        loadedModel={loadedModel}
        defaultModel={defaultModel}
        onChanged={invalidateModels}
      />
    );
  }

  const app = apps.find(a => a.id === selected.id);
  if (!app) return landing;
  return <AppDetail app={app} onChanged={invalidateApps} />;
}

export default StoreDetailPage;
