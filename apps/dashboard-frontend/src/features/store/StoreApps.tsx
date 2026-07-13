/**
 * StoreApps Component
 * Extensions-Katalog als kompakte Listenansicht (~32px-Zeilen):
 * Icon, Name, Kurzbeschreibung, Status/Aktionen rechts.
 * Detailansicht (StoreDetailModal) öffnet per Klick auf die Zeile.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import {
  Package,
  Download,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  Trash2,
  AlertCircle,
  Check,
  Clock,
  Zap,
  Database,
  Code,
  GitBranch,
  Terminal,
  Star,
  AlertTriangle,
  X,
} from 'lucide-react';
import StoreDetailModal from './StoreDetailModal';
import PlatformAppsSection from './PlatformAppsSection';
import DownloadProgress from './DownloadProgress';
import DataStateRenderer from '../../components/ui/DataStateRenderer';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/shadcn/dialog';

// --- Types ---

interface AppPorts {
  external?: number;
  internal?: number;
}

interface App {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  icon?: string;
  status: string;
  appType?: string;
  featured?: boolean;
  hasCustomPage?: boolean;
  customPageRoute?: string;
  ports?: AppPorts;
  lastError?: string;
}

interface StatusConfigEntry {
  color: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface UninstallDialogState {
  open: boolean;
  appId: string | null;
  appName: string | null;
}

// --- Constants ---

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FiZap: Zap,
  FiDatabase: Database,
  FiCode: Code,
  FiGitBranch: GitBranch,
  FiPackage: Package,
  FiTerminal: Terminal,
};

// Featured apps
const FEATURED_APPS = ['n8n', 'telegram-bot', 'terminal'];

// Status configuration - uses shadcn/Tailwind semantic tokens
const statusConfig: Record<string, StatusConfigEntry> = {
  running: { color: 'var(--primary)', label: 'Aktiv', icon: Check },
  installed: { color: 'var(--muted-foreground)', label: 'Gestoppt', icon: Clock },
  available: { color: 'var(--muted-foreground)', label: 'Verfügbar', icon: Download },
  installing: { color: 'var(--primary)', label: 'Installiert...', icon: RefreshCw },
  starting: { color: 'var(--primary)', label: 'Startet...', icon: RefreshCw },
  stopping: { color: 'var(--muted-foreground)', label: 'Stoppt...', icon: RefreshCw },
  uninstalling: { color: 'var(--muted-foreground)', label: 'Deinstalliert...', icon: RefreshCw },
  error: { color: 'var(--destructive)', label: 'Fehler', icon: AlertCircle },
};

// Get app URL - prefers dynamic data from backend over hardcoded fallbacks
const getAppUrl = (app: App): string | null => {
  if (app.hasCustomPage && app.customPageRoute) {
    return app.customPageRoute;
  }
  const traefikPaths: Record<string, string> = { n8n: '/n8n' };
  if (traefikPaths[app.id]) {
    return `${window.location.origin}${traefikPaths[app.id]}`;
  }
  if (app.ports?.external) {
    return `http://${window.location.hostname}:${app.ports.external}`;
  }
  return null;
};

function StoreApps() {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const navigate = useNavigate();

  const toast = useToast();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string | null>>({});
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set());
  const [installProgress, setInstallProgress] = useState<
    Record<string, { phase: string; progress: number; status: string; error?: string } | null>
  >({});
  const installAbortRef = useRef<Record<string, AbortController>>({});
  const [uninstallDialog, setUninstallDialog] = useState<UninstallDialogState>({
    open: false,
    appId: null,
    appName: null,
  });

  // Load apps
  const loadApps = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get<{ apps?: App[] }>('/apps', { signal, showError: false });
        setApps(data.apps || []);
        setError(null);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Error loading apps:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadApps(controller.signal);
    return () => controller.abort();
  }, [loadApps]);

  // SSE-based install with real-time progress
  const handleInstallSSE = useCallback(
    async (appId: string) => {
      if (installProgress[appId]) return;

      const controller = new AbortController();
      installAbortRef.current[appId] = controller;
      setInstallProgress(prev => ({
        ...prev,
        [appId]: { phase: 'init', progress: 0, status: 'Wird vorbereitet...' },
      }));

      try {
        // FE-04: use api.request with raw:true so auth + CSRF are attached.
        // Raw mode returns the Response so we can still read the SSE body stream.
        const response = await api.request<Response>(`/apps/${appId}/install?stream=true`, {
          method: 'POST',
          body: { config: {} },
          signal: controller.signal,
          raw: true,
          showError: false,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

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
                setInstallProgress(prev => ({
                  ...prev,
                  [appId]: { phase: 'error', progress: 0, status: '', error: evt.error },
                }));
                const app = apps.find(a => a.id === appId);
                toast.error(`Installation von „${app?.name || appId}" fehlgeschlagen`);
                setTimeout(() => setInstallProgress(prev => ({ ...prev, [appId]: null })), 5000);
                await loadApps();
                return;
              }

              if (evt.done) {
                setInstallProgress(prev => ({
                  ...prev,
                  [appId]: { phase: 'complete', progress: 100, status: evt.message || 'Fertig' },
                }));
                await loadApps();
                setTimeout(() => setInstallProgress(prev => ({ ...prev, [appId]: null })), 2000);
                return;
              }

              setInstallProgress(prev => ({
                ...prev,
                [appId]: {
                  phase: evt.phase || 'pull',
                  progress: evt.percent ?? 0,
                  status: evt.message || evt.status || '',
                },
              }));
            } catch {
              // ignore parse errors (keepalive comments etc.)
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const app = apps.find(a => a.id === appId);
        toast.error(`Installation von „${app?.name || appId}" fehlgeschlagen`);
        setInstallProgress(prev => ({ ...prev, [appId]: null }));
        await loadApps();
      } finally {
        delete installAbortRef.current[appId];
      }
    },
    [apps, installProgress, loadApps, toast]
  );

  // Refresh every 20 seconds (app status changes rarely)
  useEffect(() => {
    let active = true;
    const interval = setInterval(() => {
      if (active) loadApps();
    }, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loadApps]);

  // Loading timeout - show message after 15s
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => setLoadingTimeout(true), 15000);
      return () => clearTimeout(timeout);
    }
    setLoadingTimeout(false);
  }, [loading]);

  // Highlight app from search
  useEffect(() => {
    if (highlightId && apps.length > 0) {
      const app = apps.find(a => a.id === highlightId);
      if (app) {
        setSelectedApp(app);
      }
    }
  }, [highlightId, apps]);

  // Handle app actions
  const handleAction = async (
    appId: string,
    action: string,
    options: Record<string, unknown> = {}
  ) => {
    if (actionLoading[appId]) return;
    setActionLoading(prev => ({ ...prev, [appId]: action }));

    try {
      await api.post(`/apps/${appId}/${action}`, options, { showError: false });
      await loadApps();
    } catch (err) {
      console.error(`Error ${action} app ${appId}:`, err);
      const app = apps.find(a => a.id === appId);
      const name = app?.name || appId;
      const actionLabels: Record<string, string> = {
        install: 'Installation',
        start: 'Start',
        stop: 'Stoppen',
        restart: 'Neustart',
        uninstall: 'Deinstallation',
      };
      const actionLabel = actionLabels[action] || action;
      toast.error(`${actionLabel} von „${name}" fehlgeschlagen`);
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  // Uninstall dialog
  const openUninstallDialog = (appId: string, appName: string) => {
    setUninstallDialog({ open: true, appId, appName });
  };

  const closeUninstall = () => {
    setUninstallDialog({ open: false, appId: null, appName: null });
  };

  const handleUninstall = async (removeVolumes: boolean) => {
    const { appId } = uninstallDialog;
    setUninstallDialog({ open: false, appId: null, appName: null });
    if (appId) {
      await handleAction(appId, 'uninstall', { removeVolumes });
    }
  };

  // Get icon component
  const getIcon = (iconName?: string) => {
    const IconComponent = iconName ? iconMap[iconName] || Package : Package;
    return <IconComponent />;
  };

  // Get status config
  const getStatusConfig = (status: string): StatusConfigEntry => {
    return (
      statusConfig[status] || {
        color: 'var(--muted-foreground)',
        label: 'Verfügbar',
        icon: Download,
      }
    );
  };

  // Retry handler for loading timeout
  const retry = () => {
    setLoading(true);
    setLoadingTimeout(false);
    loadApps();
  };

  // Render compact list row (~32px): Icon, Name, Kurzbeschreibung, Status/Aktionen rechts
  const renderAppRow = (app: App) => {
    const status = getStatusConfig(app.status);
    const StatusIcon = status.icon;
    const isLoading = actionLoading[app.id];
    const isSystem = app.appType === 'system';
    const isFeatured = FEATURED_APPS.includes(app.id) || app.featured;
    const isBusy =
      app.status === 'installing' ||
      app.status === 'starting' ||
      app.status === 'stopping' ||
      app.status === 'uninstalling';

    return (
      <li key={app.id} className="not-last:border-b not-last:border-border">
        <div
          className="app-row flex min-h-8 cursor-pointer items-center gap-2 bg-card px-3 py-1 transition-colors hover:bg-muted/50"
          onClick={() => setSelectedApp(app)}
          tabIndex={0}
          role="button"
          data-testid={`app-row-${app.id}`}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedApp(app);
            }
          }}
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-primary [&_svg]:size-4">
            {getIcon(app.icon)}
          </span>
          <span className="shrink-0 text-sm font-medium text-foreground">{app.name}</span>
          {isFeatured && (
            <Star className="size-3 shrink-0 text-primary" aria-label="Empfohlen" role="img" />
          )}
          {isSystem && (
            <Badge
              variant="outline"
              className="h-4.5 shrink-0 border-border bg-muted px-1.5 text-2xs text-muted-foreground"
            >
              System
            </Badge>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {app.description}
          </span>

          <div
            className="flex shrink-0 items-center gap-1.5"
            role="presentation"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            {installProgress[app.id] != null ? (
              <div className="w-56">
                <DownloadProgress downloadState={installProgress[app.id]!} compact />
              </div>
            ) : (
              <>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-4.5 gap-1 px-1.5 text-2xs',
                    app.status === 'running' && 'border-primary/30 bg-primary/10 text-primary',
                    app.status === 'installed' && 'border-border bg-muted text-muted-foreground',
                    app.status === 'available' && 'border-border bg-muted text-muted-foreground',
                    app.status === 'error' &&
                      'border-destructive/30 bg-destructive/10 text-destructive',
                    isBusy && 'border-primary/30 bg-primary/10 text-primary'
                  )}
                >
                  {isLoading ? (
                    <RefreshCw className="size-2.5 animate-spin" />
                  ) : (
                    <StatusIcon className="size-2.5" />
                  )}
                  {status.label}
                </Badge>

                {app.status === 'available' && (
                  <Button size="xs" onClick={() => handleInstallSSE(app.id)} disabled={!!isLoading}>
                    <Download /> Installieren
                  </Button>
                )}

                {app.status === 'installed' && (
                  <>
                    <Button
                      size="xs"
                      onClick={() => handleAction(app.id, 'start')}
                      disabled={!!isLoading}
                    >
                      {isLoading === 'start' ? <RefreshCw className="animate-spin" /> : <Play />}
                      Starten
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openUninstallDialog(app.id, app.name)}
                      disabled={!!isLoading}
                      title="Deinstallieren"
                      aria-label="Deinstallieren"
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}

                {app.status === 'running' && (
                  <>
                    {app.hasCustomPage && app.customPageRoute ? (
                      <Button size="xs" asChild>
                        <Link to={app.customPageRoute}>
                          <ExternalLink /> Öffnen
                        </Link>
                      </Button>
                    ) : getAppUrl(app) ? (
                      <Button size="xs" asChild>
                        <a href={getAppUrl(app)!} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> Öffnen
                        </a>
                      </Button>
                    ) : (
                      <Button size="xs" disabled title="App-URL nicht verfügbar">
                        <ExternalLink /> Öffnen
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => handleAction(app.id, 'stop')}
                      disabled={!!isLoading}
                      title="Stoppen"
                      aria-label="Stoppen"
                    >
                      {isLoading === 'stop' ? <RefreshCw className="animate-spin" /> : <Square />}
                    </Button>
                  </>
                )}

                {app.status === 'error' && (
                  <>
                    <Button
                      size="xs"
                      onClick={() => handleAction(app.id, 'start')}
                      disabled={!!isLoading}
                    >
                      <RefreshCw /> Erneut starten
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openUninstallDialog(app.id, app.name)}
                      disabled={!!isLoading}
                      title="Deinstallieren"
                      aria-label="Deinstallieren"
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}

                {isBusy && (
                  <Button size="xs" disabled>
                    <RefreshCw className="animate-spin" /> {status.label}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {app.lastError && !dismissedErrors.has(app.id) && (
          <div
            className="app-error mx-3 mb-1.5 flex items-center gap-2 rounded border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs text-destructive"
            role="presentation"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="flex-1 truncate">{app.lastError}</span>
            <button
              onClick={() => handleAction(app.id, 'start')}
              className="shrink-0 font-medium text-destructive transition-colors hover:text-foreground"
              title="Erneut versuchen"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              onClick={() => setDismissedErrors(prev => new Set(prev).add(app.id))}
              className="shrink-0 text-destructive/60 transition-colors hover:text-destructive"
              title="Schließen"
              aria-label="Fehlermeldung schließen"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </li>
    );
  };

  // Full-page error only when initial load fails (no data yet)
  const initialError = error && apps.length === 0 ? error : null;

  return (
    <DataStateRenderer
      loading={loading}
      error={initialError}
      empty={false}
      onRetry={retry}
      loadingSkeleton={<SkeletonList count={5} hasAvatar />}
      loadingFooter={
        loadingTimeout ? (
          <div className="mt-6 text-center">
            <p className="text-warning mb-4 flex items-center justify-center gap-2">
              <AlertTriangle className="size-4" />
              Laden dauert länger als erwartet.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={retry}>
                <RefreshCw className="size-4" /> Erneut versuchen
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                Zurück zum Dashboard
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="store-apps">
        <PlatformAppsSection />
        {/* Error */}
        {error && (
          <div className="store-error flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-md px-4 py-3 mb-6 text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={() => loadApps()}>
              Erneut versuchen
            </Button>
          </div>
        )}

        {/* Apps als kompakte Liste */}
        {apps.length > 0 ? (
          <ul
            className="app-list overflow-hidden rounded-lg border border-border"
            aria-label="Verfügbare Extensions"
          >
            {apps.map(renderAppRow)}
          </ul>
        ) : (
          <div className="store-empty flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Package className="size-12 mb-4 opacity-50" />
            <p>Keine Apps gefunden</p>
          </div>
        )}

        {/* App Detail Modal */}
        {selectedApp && (
          <StoreDetailModal
            type="app"
            item={selectedApp}
            onClose={() => setSelectedApp(null)}
            onAction={handleAction}
            onUninstall={openUninstallDialog}
            actionLoading={actionLoading}
          />
        )}

        {/* Uninstall Dialog */}
        <Dialog open={uninstallDialog.open} onOpenChange={open => !open && closeUninstall()}>
          <DialogContent className="sm:max-w-120">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-5" /> App deinstallieren
              </DialogTitle>
              <DialogDescription>
                Möchten Sie <strong>{uninstallDialog.appName}</strong> wirklich deinstallieren?
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-md p-3">
              <AlertCircle className="size-4 shrink-0" />
              Wählen Sie, ob die App-Daten behalten oder gelöscht werden sollen:
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" onClick={closeUninstall}>
                Abbrechen
              </Button>
              <Button variant="secondary" onClick={() => handleUninstall(false)}>
                <Trash2 className="size-4" /> Nur App entfernen
              </Button>
              <Button variant="destructive" onClick={() => handleUninstall(true)}>
                <Trash2 className="size-4" /> App + Daten löschen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DataStateRenderer>
  );
}

export default StoreApps;
