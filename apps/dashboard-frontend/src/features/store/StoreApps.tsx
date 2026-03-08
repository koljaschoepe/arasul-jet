/**
 * StoreApps Component
 * Apps catalog with simplified filters (Empfohlen/Alle)
 * Based on the original AppStore component
 *
 * Migrated to TypeScript + shadcn + Tailwind
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import {
  Package,
  Download,
  Play,
  OctagonX,
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
} from 'lucide-react';
import StoreDetailModal from './StoreDetailModal';
import ConfirmIconButton from '../../components/ui/ConfirmIconButton';
import { SkeletonCard } from '../../components/ui/Skeleton';
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
const FEATURED_APPS = ['n8n', 'telegram-bot', 'claude-code'];

// Category labels
const categoryLabels: Record<string, string> = {
  development: 'Entwicklung',
  productivity: 'Produktivität',
  ai: 'KI & ML',
  storage: 'Speicher',
  monitoring: 'Monitoring',
  networking: 'Netzwerk',
};

// Status configuration - uses CSS variables from Design System
const statusConfig: Record<string, StatusConfigEntry> = {
  running: { color: 'var(--primary-color)', label: 'Aktiv', icon: Check },
  installed: { color: 'var(--status-neutral)', label: 'Gestoppt', icon: Clock },
  available: { color: 'var(--text-disabled)', label: 'Verfügbar', icon: Download },
  installing: { color: 'var(--primary-light)', label: 'Installiert...', icon: RefreshCw },
  starting: { color: 'var(--primary-light)', label: 'Startet...', icon: RefreshCw },
  stopping: { color: 'var(--status-neutral)', label: 'Stoppt...', icon: RefreshCw },
  uninstalling: { color: 'var(--text-disabled)', label: 'Deinstalliert...', icon: RefreshCw },
  error: { color: 'var(--danger-color)', label: 'Fehler', icon: AlertCircle },
};

// Get app URL
const getAppUrl = (app: App): string => {
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
  const knownPorts: Record<string, number> = {
    minio: 9001,
    'code-server': 8443,
    gitea: 3002,
  };
  if (knownPorts[app.id]) {
    return `http://${window.location.hostname}:${knownPorts[app.id]}`;
  }
  return '#';
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
  const [uninstallDialog, setUninstallDialog] = useState<UninstallDialogState>({
    open: false,
    appId: null,
    appName: null,
  });

  // Load apps
  const loadApps = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/apps', { signal, showError: false });
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

  // Refresh every 15 seconds
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(() => loadApps(controller.signal), 15000);
    return () => {
      controller.abort();
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
    return statusConfig[status] || statusConfig.available;
  };

  // Retry handler for loading timeout
  const retry = () => {
    setLoading(true);
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

    return (
      <div
        key={app.id}
        className={cn(
          'app-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted',
          app.status === 'running' && 'active border-primary bg-primary/5'
        )}
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
          <div className="app-icon size-12 bg-muted rounded-lg flex items-center justify-center text-primary text-2xl">
            {getIcon(app.icon)}
          </div>
          <div className="app-badges flex flex-wrap gap-1.5">
            {isFeatured && (
              <Badge
                variant="outline"
                className="badge badge-featured border-amber-500/30 bg-amber-500/10 text-amber-400 gap-1"
              >
                <Star className="size-3" /> Empfohlen
              </Badge>
            )}
            {isSystem && (
              <Badge variant="secondary" className="badge badge-system">
                System
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                'badge badge-status gap-1',
                app.status === 'running' &&
                  'badge-running border-primary/30 bg-primary/10 text-primary',
                app.status === 'installed' &&
                  'badge-installed border-muted-foreground/30 bg-muted text-muted-foreground',
                app.status === 'available' &&
                  'badge-available border-border bg-muted text-muted-foreground',
                app.status === 'error' &&
                  'badge-error border-destructive/30 bg-destructive/10 text-destructive',
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

        <h3 className="app-name text-lg font-semibold text-foreground m-0">{app.name}</h3>
        <p className="app-description text-sm text-muted-foreground leading-relaxed m-0 line-clamp-2">
          {app.description}
        </p>

        <div className="app-meta flex gap-3 flex-wrap">
          <span className="app-version text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            v{app.version}
          </span>
          <span className="app-category text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            {categoryLabels[app.category] || app.category}
          </span>
        </div>

        <div className="app-actions flex gap-2 mt-auto pt-2" onClick={e => e.stopPropagation()}>
          {app.status === 'available' && (
            <Button onClick={() => handleAction(app.id, 'install')} disabled={!!isLoading}>
              {isLoading === 'install' ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Installieren
            </Button>
          )}

          {app.status === 'installed' && (
            <>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
                variant="destructive"
                size="icon"
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
                <Button asChild>
                  <Link to={app.customPageRoute}>
                    <ExternalLink className="size-4" /> Öffnen
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <a href={getAppUrl(app)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Öffnen
                  </a>
                </Button>
              )}
              <ConfirmIconButton
                icon={<OctagonX />}
                label="Stoppen"
                confirmText="Stoppen?"
                onConfirm={() => handleAction(app.id, 'stop')}
                variant="danger"
                disabled={!!isLoading}
              />
            </>
          )}

          {app.status === 'error' && (
            <>
              <Button onClick={() => handleAction(app.id, 'start')} disabled={!!isLoading}>
                <RefreshCw className="size-4" /> Erneut starten
              </Button>
              <Button
                variant="destructive"
                size="icon"
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
            <Button disabled>
              <RefreshCw className="size-4 animate-spin" /> {status.label}
            </Button>
          )}
        </div>

        {app.lastError && (
          <div className="app-error flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded mt-2">
            <AlertCircle className="size-4 shrink-0" />
            {app.lastError}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="store-apps animate-in fade-in">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
        </div>
        {loadingTimeout && (
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
        )}
      </div>
    );
  }

  return (
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
  );
}

export default StoreApps;
