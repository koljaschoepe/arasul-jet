/**
 * StoreHome Component
 * Landing page with recommended models and apps in 2 separate sections
 * Shows loaded-model banner + 4 model cards + 4 app cards
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  ArrowRight,
  Download,
  Play,
  Check,
  Star,
  RefreshCw,
  Zap,
  Package,
  HardDrive,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useDownloads } from '../../contexts/DownloadContext';
import { useToast } from '../../contexts/ToastContext';
import { useApi } from '../../hooks/useApi';
import { formatModelSize as formatSize } from '../../utils/formatting';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StoreDetailModal from './StoreDetailModal';

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
  [key: string]: unknown;
}

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
  const [recommendations, setRecommendations] = useState<Recommendations>({ models: [], apps: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedModel, setLoadedModel] = useState<LoadedModel | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string | null>>({});
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  const { startDownload, isDownloading, getDownloadState, onDownloadComplete } = useDownloads();

  // Load recommendations
  const loadRecommendations = useCallback(async () => {
    try {
      const opts = { showError: false };
      const [recsData, statusData] = await Promise.all([
        api.get('/store/recommendations', opts),
        api.get('/models/status', opts).catch(() => ({})),
      ]);

      setRecommendations(recsData);
      setLoadedModel(statusData.loaded_model);
      setError(null);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError('Fehler beim Laden der Empfehlungen');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  // Reload when download completes
  useEffect(() => {
    const unsubscribe = onDownloadComplete(() => {
      loadRecommendations();
    });
    return unsubscribe;
  }, [onDownloadComplete, loadRecommendations]);

  // Handle model download
  const handleModelDownload = (modelId: string, modelName: string) => {
    startDownload(modelId, modelName);
  };

  // Handle model activation with SSE streaming for progress feedback
  const handleModelActivate = async (modelId: string) => {
    setActionLoading(prev => ({ ...prev, [modelId]: 'activating' }));
    try {
      const response = await api.post(`/models/${modelId}/activate?stream=true`, null, {
        raw: true,
        showError: false,
      });

      // Consume SSE stream (just wait for completion, StoreHome doesn't show detailed progress)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) throw new Error(data.error);
            } catch (e) {
              if (e instanceof Error && e.message && e.message !== 'Unexpected end of JSON input')
                throw e;
            }
          }
        }
      }

      await loadRecommendations();
    } catch (err) {
      console.error('Activation error:', err);
      const model = recommendations.models.find(m => m.id === modelId);
      const name = model?.name || modelId;
      toast.error((err as Error).message || `Aktivierung von „${name}" fehlgeschlagen`);
    } finally {
      setActionLoading(prev => ({ ...prev, [modelId]: null }));
    }
  };

  // Handle app action (install/start/stop/restart)
  const handleAppAction = async (appId: string, action: string) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));
    try {
      await api.post(`/apps/${appId}/${action}`, null, { showError: false });
      await loadRecommendations();
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
      await api.del(`/models/${modelId}`, { showError: false });
      toast.success('Modell gelöscht');
      await loadRecommendations();
    } catch {
      toast.error('Fehler beim Löschen des Modells');
    } finally {
      setActionLoading(prev => ({ ...prev, [modelId]: null }));
    }
  };

  // Handle setting default model
  const handleSetDefault = async (modelId: string) => {
    try {
      await api.post('/models/default', { model_id: modelId }, { showError: false });
      toast.success('Standard-Modell gesetzt');
      await loadRecommendations();
    } catch {
      toast.error('Fehler beim Setzen des Standard-Modells');
    }
  };

  // Handle app uninstall
  const handleAppUninstall = async (appId: string, appName: string) => {
    setActionLoading(prev => ({ ...prev, [appId]: 'uninstall' }));
    try {
      await api.post(`/apps/${appId}/uninstall`, null, { showError: false });
      toast.success(`„${appName}" deinstalliert`);
      await loadRecommendations();
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
        <Button variant="outline" onClick={loadRecommendations}>
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
            const isInstalled = model.install_status === 'available';
            const isLoaded = loadedModel?.model_id === model.id;
            const modelIsDownloading = isDownloading(model.id);
            const downloadState = getDownloadState(model.id);
            const isActivating = actionLoading[model.id] === 'activating';

            return (
              <div
                key={model.id}
                className={cn(
                  'model-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted',
                  isLoaded && 'active border-primary bg-primary/5'
                )}
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
                        className="bg-primary/10 border-primary text-primary"
                      >
                        <Zap className="size-3" /> Aktiv
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
                        className="capability-tag text-xs bg-muted text-foreground/60 px-2 py-0.5 rounded-full"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                {/* Download Progress */}
                {modelIsDownloading && downloadState && (
                  <div
                    className="download-progress flex items-center gap-3"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="progress-bar flex-1 bg-border h-2 rounded overflow-hidden">
                      <div
                        className="progress-fill h-full bg-primary transition-all duration-300"
                        style={{ width: `${downloadState.progress}%` }}
                      />
                    </div>
                    <span className="progress-text text-xs text-muted-foreground font-medium">
                      {downloadState.progress}%
                    </span>
                  </div>
                )}

                <div
                  className="model-actions flex gap-2 mt-auto pt-2"
                  onClick={e => e.stopPropagation()}
                >
                  {!isInstalled && !modelIsDownloading && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleModelDownload(model.id, model.name)}
                    >
                      <Download className="size-4" /> Herunterladen
                    </Button>
                  )}
                  {isInstalled && !isLoaded && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleModelActivate(model.id)}
                      disabled={isActivating}
                    >
                      {isActivating ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" /> Aktiviere...
                        </>
                      ) : (
                        <>
                          <Play className="size-4" /> Aktivieren
                        </>
                      )}
                    </Button>
                  )}
                  {isLoaded && (
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

            return (
              <div
                key={app.id}
                className={cn(
                  'model-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted',
                  isRunning && 'active border-primary bg-primary/5'
                )}
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
                        className="bg-primary/10 border-primary text-primary"
                      >
                        <Zap className="size-3" /> Aktiv
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-muted border-border text-foreground/60">
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
