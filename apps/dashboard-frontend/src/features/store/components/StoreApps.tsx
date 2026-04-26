/**
 * StoreApps Component
 * Apps catalog with simplified filters (Empfohlen/Alle)
 * Based on the original AppStore component
 *
 * Migrated to TypeScript + shadcn + Tailwind
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../../contexts/ToastContext';
import { useAppsQuery } from '../hooks/queries';
import { useAppActionMutation } from '../hooks/mutations';
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
import DownloadProgress from './DownloadProgress';
import DataStateRenderer from '../../../components/ui/DataStateRenderer';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useApi } from '../../../hooks/useApi';
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

// Category labels
const categoryLabels: Record<string, string> = {
  development: 'Entwicklung',
  productivity: 'Produktivität',
  ai: 'KI & ML',
  storage: 'Speicher',
  monitoring: 'Monitoring',
  networking: 'Netzwerk',
};

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

// Synthesized tags so App-Cards match Model-Card density
export const getAppTags = (app: Pick<App, 'hasCustomPage' | 'ports' | 'appType'>): string[] => {
  const tags: string[] = [];
  if (app.hasCustomPage) tags.push('Integriert');
  else if (app.ports?.external) tags.push('Web-UI');
  if (app.appType === 'official') tags.push('Offiziell');
  return tags;
};

function StoreApps() {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const navigate = useNavigate();

  const toast = useToast();
  const [loadingTimeout, setLoadingTimeout] = useState(false);
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

  // Apps via TanStack Query — refetchInterval handles the 20s polling we
  // had as a manual setInterval before.
  const appsQuery = useAppsQuery(20_000);
  const apps = (appsQuery.data ?? []) as App[];
  const loading = appsQuery.isLoading;
  const error = appsQuery.error
    ? appsQuery.error instanceof Error
      ? appsQuery.error.message
      : String(appsQuery.error)
    : null;
  const loadApps = useCallback(() => {
    appsQuery.refetch();
  }, [appsQuery]);

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

        while (true) {
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

  // (20s polling now handled by useAppsQuery's refetchInterval)

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

  // App action mutation (install/start/stop/restart/uninstall)
  const appActionMutation = useAppActionMutation();

  const handleAction = async (
    appId: string,
    action: string,
    options: Record<string, unknown> = {}
  ) => {
    if (actionLoading[appId]) return;
    setActionLoading(prev => ({ ...prev, [appId]: action }));

    try {
      await appActionMutation.mutateAsync({ appId, action, options });
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
    return statusConfig[status] || statusConfig.available;
  };

  // Retry handler for loading timeout
  const retry = () => {
    setLoadingTimeout(false);
    loadApps();
  };

  // Render app card
  const renderAppCard = (app: App) => {
    const status = getStatusConfig(app.status);
    const StatusIcon = status.icon;
    const isLoading = actionLoading[app.id];
    const isSystem = app.appType === 'system';
    const isFeatured = FEATURED_APPS.includes(app.id) || app.featured;
    const tags = getAppTags(app);

    return (
      <div
        key={app.id}
        className="app-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted-foreground/20"
        onClick={() => setSelectedApp(app)}
        tabIndex={0}
        role="button"
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedApp(app);
          }
        }}
      >
        <div className="app-card-header flex items-start justify-between gap-3">
          <div className="app-icon size-12 bg-muted rounded-lg flex items-center justify-center text-primary text-2xl shrink-0">
            {getIcon(app.icon)}
          </div>
          <div className="app-badges flex flex-wrap gap-1.5 justify-end">
            {isFeatured && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary gap-1"
              >
                <Star className="size-3" /> Empfohlen
              </Badge>
            )}
            {isSystem && (
              <Badge variant="outline" className="bg-muted border-border text-muted-foreground">
                System
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                'gap-1',
                app.status === 'running' && 'border-primary/30 bg-primary/10 text-primary',
                app.status === 'installed' && 'border-border bg-muted text-muted-foreground',
                app.status === 'available' && 'border-border bg-muted text-muted-foreground',
                app.status === 'error' &&
                  'border-destructive/30 bg-destructive/10 text-destructive',
                (app.status === 'installing' ||
                  app.status === 'starting' ||
                  app.status === 'stopping' ||
                  app.status === 'uninstalling') &&
                  'border-primary/30 bg-primary/10 text-primary'
              )}
            >
              {isLoading ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <StatusIcon className="size-3" />
              )}
              {status.label}
            </Badge>
          </div>
        </div>

        <h3 className="app-name text-base font-semibold text-foreground">{app.name}</h3>
        <p className="app-description text-sm text-muted-foreground line-clamp-2">
          {app.description}
        </p>

        <div className="app-specs flex gap-4 text-sm">
          <div className="spec flex flex-col">
            <span className="spec-label text-xs text-muted-foreground">Version</span>
            <span className="spec-value font-medium text-foreground">v{app.version}</span>
          </div>
          <div className="spec flex flex-col">
            <span className="spec-label text-xs text-muted-foreground">Kategorie</span>
            <span className="spec-value font-medium text-foreground">
              {categoryLabels[app.category] || app.category}
            </span>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="app-tags flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <span
                key={tag}
                className="tag text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Install progress bar */}
        {installProgress[app.id] != null && (
          <div onClick={e => e.stopPropagation()}>
            <DownloadProgress downloadState={installProgress[app.id]!} compact />
          </div>
        )}

        <div className="app-actions flex gap-2 mt-auto pt-2" onClick={e => e.stopPropagation()}>
          {app.status === 'available' && !installProgress[app.id] && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => handleInstallSSE(app.id)}
              disabled={!!isLoading}
            >
              <Download className="size-4" />
              Installieren
            </Button>
          )}

          {app.status === 'installed' && (
            <>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleAction(app.id, 'start')}
                disabled={!!isLoading}
              >
                {isLoading === 'start' ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Starten
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => openUninstallDialog(app.id, app.name)}
                disabled={!!isLoading}
                title="Deinstallieren"
                aria-label="Deinstallieren"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}

          {app.status === 'running' && (
            <>
              {app.hasCustomPage && app.customPageRoute ? (
                <Button size="sm" className="flex-1" asChild>
                  <Link to={app.customPageRoute}>
                    <ExternalLink className="size-4" /> Öffnen
                  </Link>
                </Button>
              ) : getAppUrl(app) ? (
                <Button size="sm" className="flex-1" asChild>
                  <a href={getAppUrl(app)!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Öffnen
                  </a>
                </Button>
              ) : (
                <Button size="sm" className="flex-1" disabled title="App-URL nicht verfügbar">
                  <ExternalLink className="size-4" /> Öffnen
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction(app.id, 'stop')}
                disabled={!!isLoading}
              >
                {isLoading === 'stop' ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Stoppen
              </Button>
            </>
          )}

          {app.status === 'error' && (
            <>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleAction(app.id, 'start')}
                disabled={!!isLoading}
              >
                <RefreshCw className="size-4" /> Erneut starten
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => openUninstallDialog(app.id, app.name)}
                disabled={!!isLoading}
                title="Deinstallieren"
                aria-label="Deinstallieren"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}

          {(app.status === 'installing' ||
            app.status === 'starting' ||
            app.status === 'stopping' ||
            app.status === 'uninstalling') && (
            <Button size="sm" className="flex-1" disabled>
              <RefreshCw className="size-4 animate-spin" /> {status.label}
            </Button>
          )}
        </div>

        {app.lastError && !dismissedErrors.has(app.id) && (
          <div
            className="app-error flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded mt-2"
            onClick={e => e.stopPropagation()}
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="flex-1 line-clamp-2">{app.lastError}</span>
            <button
              onClick={() => handleAction(app.id, 'start')}
              className="shrink-0 text-destructive hover:text-foreground transition-colors font-medium"
              title="Erneut versuchen"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              onClick={() => setDismissedErrors(prev => new Set(prev).add(app.id))}
              className="shrink-0 text-destructive/60 hover:text-destructive transition-colors"
              title="Schließen"
              aria-label="Fehlermeldung schließen"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
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
      loadingSkeleton={
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <SkeletonCard key={i} hasAvatar={false} lines={3} />
            ))}
        </div>
      }
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

        {/* Apps Grid */}
        <div className="app-grid grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {apps.length > 0 ? (
            apps.map(renderAppCard)
          ) : (
            <div className="store-empty flex flex-col items-center justify-center p-12 text-muted-foreground col-span-full">
              <Package className="size-12 mb-4 opacity-50" />
              <p>Keine Apps gefunden</p>
            </div>
          )}
        </div>

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
          <DialogContent className="sm:max-w-[480px]">
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
