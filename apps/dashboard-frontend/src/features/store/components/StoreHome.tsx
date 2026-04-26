/**
 * StoreHome Component
 * Landing page with recommended models and apps in 2 separate sections
 * Shows loaded-model banner + 4 model cards + 4 app cards
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cpu,
  ArrowRight,
  Download,
  Play,
  Check,
  Clock,
  Star,
  RefreshCw,
  Zap,
  Package,
  HardDrive,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { useDownloads } from '../../../contexts/DownloadContext';
import { useActivation } from '../../../contexts/ActivationContext';
import { useToast } from '../../../contexts/ToastContext';
import { useApi } from '../../../hooks/useApi';
import { formatModelSize as formatSize } from '../../../utils/formatting';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import StoreDetailModal from './StoreDetailModal';
import DownloadProgress from './DownloadProgress';
import ActivationButton from './ActivationButton';
import { useModelsStatusQuery, useModelsDefaultQuery } from '../hooks/queries';
import {
  useAppActionMutation,
  useDeleteModelMutation,
  useSetDefaultModelMutation,
} from '../hooks/mutations';
import { storeKeys } from '../hooks/queryKeys';

interface SystemInfo {
  llmRamGB: number;
  totalRamGB: number;
  availableDiskGB: number;
}

interface Model {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  capabilities?: string[];
  install_status: string;
  is_default?: boolean;
  effective_ollama_name?: string;
  category: string;
  [key: string]: unknown;
}

interface App {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  status: string;
  featured?: boolean;
  hasCustomPage?: boolean;
  ports?: { external?: number };
  appType?: string;
  [key: string]: unknown;
}

const getAppTags = (app: App): string[] => {
  const tags: string[] = [];
  if (app.hasCustomPage) tags.push('Integriert');
  else if (app.ports?.external) tags.push('Web-UI');
  if (app.appType === 'official') tags.push('Offiziell');
  return tags;
};

interface StoreHomeProps {
  systemInfo: SystemInfo;
}

interface SelectedItem {
  type: 'model' | 'app';
  item: Model | App;
}

interface LoadedModel {
  model_id: string;
  ram_usage_mb?: number;
}

interface Recommendations {
  models: Model[];
  apps: App[];
}

function StoreHome({ systemInfo }: StoreHomeProps) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [actionLoading, setActionLoading] = useState<Record<string, string | null>>({});
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  const { startDownload, isDownloading, getDownloadState, onDownloadComplete } = useDownloads();
  const { activation, startActivation, onActivationComplete } = useActivation();

  // Recommendations is a typed Recommendations object (not just an array),
  // so we use a one-off useQuery here rather than a generic recommendations
  // hook. The shape of /store/recommendations is { models: [], apps: [] }.
  const recsQuery = useQuery({
    queryKey: storeKeys.recommendations(),
    queryFn: ({ signal }) =>
      api.get<Recommendations>('/store/recommendations', { showError: false, signal }),
  });
  const recommendations: Recommendations = recsQuery.data ?? { models: [], apps: [] };
  const statusQuery = useModelsStatusQuery();
  const defaultQuery = useModelsDefaultQuery();
  const loadedModel: LoadedModel | null =
    (statusQuery.data?.loaded_model as LoadedModel | null | undefined) ?? null;
  const defaultModel: string | null = defaultQuery.data?.default_model ?? null;
  const loading = recsQuery.isLoading || statusQuery.isLoading;
  const error = recsQuery.error ? 'Fehler beim Laden der Empfehlungen' : null;

  // Mutations
  const appActionMutation = useAppActionMutation();
  const deleteModelMutation = useDeleteModelMutation();
  const setDefaultMutation = useSetDefaultModelMutation();

  // Reload all on download/activation complete
  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries({ queryKey: storeKeys.recommendations() });
      qc.invalidateQueries({ queryKey: storeKeys.modelsStatus() });
      qc.invalidateQueries({ queryKey: storeKeys.modelsDefault() });
    };
    const unsub1 = onDownloadComplete(refresh);
    const unsub2 = onActivationComplete(refresh);
    return () => {
      unsub1();
      unsub2();
    };
  }, [onDownloadComplete, onActivationComplete, qc]);

  // Handle model download
  const handleModelDownload = (modelId: string, modelName: string) => {
    startDownload(modelId, modelName);
  };

  // Handle model activation via global ActivationContext
  const handleModelActivate = (modelId: string) => {
    const model = recommendations.models.find(m => m.id === modelId);
    startActivation(modelId, model?.name);
  };

  // Handle app action (install/start/stop/restart)
  const handleAppAction = async (appId: string, action: string) => {
    if (actionLoading[appId]) return;
    setActionLoading(prev => ({ ...prev, [appId]: action }));
    try {
      await appActionMutation.mutateAsync({ appId, action });
    } catch (err) {
      console.error(`App ${action} error:`, err);
      const app = recommendations.apps.find(a => a.id === appId);
      const name = app?.name || appId;
      const actionLabels: Record<string, string> = {
        install: 'Installation',
        start: 'Start',
        stop: 'Stoppen',
        restart: 'Neustart',
      };
      const actionLabel = actionLabels[action] || action;
      toast.error(`${actionLabel} von „${name}" fehlgeschlagen`);
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  // Handle model deletion
  const handleModelDelete = async (modelId: string) => {
    setActionLoading(prev => ({ ...prev, [modelId]: 'deleting' }));
    try {
      await deleteModelMutation.mutateAsync(modelId);
      toast.success('Modell gelöscht');
    } catch {
      toast.error('Fehler beim Löschen des Modells');
    } finally {
      setActionLoading(prev => ({ ...prev, [modelId]: null }));
    }
  };

  // Handle setting default model
  const handleSetDefault = async (modelId: string) => {
    try {
      await setDefaultMutation.mutateAsync(modelId);
      toast.success('Standard-Modell gesetzt');
    } catch {
      toast.error('Fehler beim Setzen des Standard-Modells');
    }
  };

  // Handle app uninstall
  const handleAppUninstall = async (appId: string, appName: string) => {
    setActionLoading(prev => ({ ...prev, [appId]: 'uninstall' }));
    try {
      await appActionMutation.mutateAsync({ appId, action: 'uninstall' });
      toast.success(`„${appName}" deinstalliert`);
    } catch {
      toast.error(`Deinstallation von „${appName}" fehlgeschlagen`);
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  if (loading) {
    return (
      <div className="store-home flex flex-col gap-8 animate-in fade-in">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
          <SkeletonCard hasAvatar={false} lines={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="store-home-error flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{error}</p>
        <Button variant="outline" onClick={() => recsQuery.refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="store-home flex flex-col gap-8">
      {/* Loaded Model Banner */}
      {loadedModel && (
        <div className="loaded-model-banner flex items-center justify-between bg-primary/10 border border-primary rounded-lg px-6 py-4 mb-6 flex-wrap gap-4">
          <div className="loaded-model-info flex items-center gap-3 text-foreground font-medium">
            <Zap className="animate-pulse size-5 text-primary" />
            <span>Aktuell geladen:</span>
            <strong>{loadedModel.model_id}</strong>
          </div>
          <div className="loaded-model-stats flex items-center gap-4">
            <span className="ram-usage flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="size-4" />
              {loadedModel.ram_usage_mb
                ? `${(loadedModel.ram_usage_mb / 1024).toFixed(1)} GB RAM`
                : 'RAM wird berechnet...'}
            </span>
          </div>
        </div>
      )}

      {!loadedModel && (
        <div className="no-model-banner flex items-center gap-3 bg-card border border-border rounded-lg px-6 py-4 mb-6 text-muted-foreground">
          <Info className="size-5" />
          <span>Kein Modell geladen. Aktiviere ein Modell, um zu starten.</span>
        </div>
      )}

      {/* Models Section */}
      <section className="store-home-section">
        <div className="section-header flex justify-between items-center mb-2">
          <h2 className="flex items-center gap-3 text-xl font-semibold text-foreground">
            <Cpu className="size-6" /> Modelle
          </h2>
          <Link
            to="/store/models"
            className="section-link flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Alle Modelle <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="section-subtitle text-sm text-muted-foreground mb-4">
          Empfohlen für {systemInfo?.totalRamGB || 64} GB RAM ({systemInfo?.llmRamGB || 32} GB LLM)
        </p>

        <div className="model-grid grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {recommendations.models.slice(0, 4).map(model => {
            const isReady = model.install_status === 'available';
            const isLoaded = loadedModel?.model_id === model.id;
            const modelIsDownloading = isDownloading(model.id);
            const downloadState = getDownloadState(model.id);
            const isActivating = activation?.modelId === model.id && !activation?.error;

            return (
              <div
                key={model.id}
                className="model-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted-foreground/20"
                onClick={() => setSelectedItem({ type: 'model', item: model })}
                tabIndex={0}
                role="button"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedItem({ type: 'model', item: model });
                  }
                }}
              >
                <div className="model-card-header flex items-start justify-between gap-3">
                  <div className="model-icon size-12 bg-muted rounded-lg flex items-center justify-center text-primary text-2xl shrink-0">
                    <Cpu className="size-6" />
                  </div>
                  <div className="model-badges flex flex-wrap gap-1.5 justify-end">
                    {model.is_default && (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 border-primary/30 text-primary"
                      >
                        <Star className="size-3" /> Standard
                      </Badge>
                    )}
                    {isLoaded && (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 border-primary/30 text-primary"
                      >
                        <Zap className="size-3" /> Aktiv
                      </Badge>
                    )}
                    {isReady && !isLoaded && (
                      <Badge
                        variant="outline"
                        className="bg-muted border-border text-muted-foreground"
                      >
                        <Check className="size-3" /> Installiert
                      </Badge>
                    )}
                  </div>
                </div>

                <h3 className="model-name text-base font-semibold text-foreground">{model.name}</h3>
                <p className="model-description text-sm text-muted-foreground line-clamp-2">
                  {model.description}
                </p>

                <div className="model-specs flex gap-4 text-sm">
                  <div className="spec flex flex-col">
                    <span className="spec-label text-xs text-muted-foreground">Größe</span>
                    <span className="spec-value font-medium text-foreground">
                      {formatSize(model.size_bytes)}
                    </span>
                  </div>
                  <div className="spec flex flex-col">
                    <span className="spec-label text-xs text-muted-foreground">RAM-Bedarf</span>
                    <span className="spec-value font-medium text-foreground">
                      {model.ram_required_gb} GB
                    </span>
                  </div>
                </div>

                {model.capabilities && model.capabilities.length > 0 && (
                  <div className="model-capabilities flex flex-wrap gap-1.5">
                    {model.capabilities.slice(0, 4).map(cap => (
                      <span
                        key={cap}
                        className="capability-tag text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                {/* Download Progress */}
                {modelIsDownloading && downloadState && (
                  <DownloadProgress downloadState={downloadState} compact />
                )}

                <div
                  className="model-actions flex gap-2 mt-auto pt-2"
                  onClick={e => e.stopPropagation()}
                >
                  {!isReady && !modelIsDownloading && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleModelDownload(model.id, model.name)}
                    >
                      <Download className="size-4" /> Herunterladen
                    </Button>
                  )}
                  {(isReady || isLoaded) && (
                    <ActivationButton
                      isActivating={isActivating}
                      isLoaded={isLoaded}
                      activatingPercent={activation?.progress || 0}
                      onActivate={() => handleModelActivate(model.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Apps Section */}
      <section className="store-home-section">
        <div className="section-header flex justify-between items-center mb-2">
          <h2 className="flex items-center gap-3 text-xl font-semibold text-foreground">
            <Package className="size-6" /> Apps
          </h2>
          <Link
            to="/store/apps"
            className="section-link flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Alle Apps <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="model-grid grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {recommendations.apps.slice(0, 4).map(app => {
            const isRunning = app.status === 'running';
            const isInstalled = app.status === 'installed';
            const isLoading = actionLoading[app.id];
            const tags = getAppTags(app);

            return (
              <div
                key={app.id}
                className="model-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted-foreground/20"
                onClick={() => setSelectedItem({ type: 'app', item: app })}
                tabIndex={0}
                role="button"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedItem({ type: 'app', item: app });
                  }
                }}
              >
                <div className="model-card-header flex items-start justify-between gap-3">
                  <div className="model-icon size-12 bg-muted rounded-lg flex items-center justify-center text-primary text-2xl shrink-0">
                    <Package className="size-6" />
                  </div>
                  <div className="model-badges flex flex-wrap gap-1.5 justify-end">
                    {app.featured && (
                      <Badge
                        variant="outline"
                        className="border-primary/30 bg-primary/10 text-primary gap-1"
                      >
                        <Star className="size-3" /> Empfohlen
                      </Badge>
                    )}
                    {isRunning && (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 border-primary/30 text-primary"
                      >
                        <Zap className="size-3" /> Aktiv
                      </Badge>
                    )}
                    {isInstalled && (
                      <Badge
                        variant="outline"
                        className="bg-muted border-border text-muted-foreground"
                      >
                        <Clock className="size-3" /> Gestoppt
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="bg-muted border-border text-muted-foreground"
                    >
                      App
                    </Badge>
                  </div>
                </div>

                <h3 className="model-name text-base font-semibold text-foreground">{app.name}</h3>
                <p className="model-description text-sm text-muted-foreground line-clamp-2">
                  {app.description}
                </p>

                <div className="model-specs flex gap-4 text-sm">
                  <div className="spec flex flex-col">
                    <span className="spec-label text-xs text-muted-foreground">Version</span>
                    <span className="spec-value font-medium text-foreground">v{app.version}</span>
                  </div>
                  <div className="spec flex flex-col">
                    <span className="spec-label text-xs text-muted-foreground">Kategorie</span>
                    <span className="spec-value font-medium text-foreground">{app.category}</span>
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

                <div
                  className="model-actions flex gap-2 mt-auto pt-2"
                  onClick={e => e.stopPropagation()}
                >
                  {app.status === 'available' && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleAppAction(app.id, 'install')}
                      disabled={!!isLoading}
                    >
                      {isLoading === 'install' ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" /> Installiere...
                        </>
                      ) : (
                        <>
                          <Download className="size-4" /> Installieren
                        </>
                      )}
                    </Button>
                  )}
                  {isInstalled && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleAppAction(app.id, 'start')}
                      disabled={!!isLoading}
                    >
                      {isLoading === 'start' ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" /> Starte...
                        </>
                      ) : (
                        <>
                          <Play className="size-4" /> Starten
                        </>
                      )}
                    </Button>
                  )}
                  {isRunning && (
                    <Button size="sm" className="flex-1" disabled>
                      <Check className="size-4" /> Aktiv
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detail Modal */}
      {selectedItem && (
        <StoreDetailModal
          type={selectedItem.type}
          item={selectedItem.item}
          onClose={() => setSelectedItem(null)}
          loadedModel={loadedModel}
          defaultModel={defaultModel ?? undefined}
          isDownloading={isDownloading}
          onDownload={handleModelDownload}
          onActivate={handleModelActivate}
          onDelete={handleModelDelete}
          onSetDefault={handleSetDefault}
          onAction={handleAppAction}
          onUninstall={handleAppUninstall}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

export default StoreHome;
