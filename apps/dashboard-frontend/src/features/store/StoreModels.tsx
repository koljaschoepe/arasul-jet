/**
 * StoreModels Component
 * Full model catalog with size and type filters
 * Based on the original ModelStore component
 *
 * Migrated to TypeScript + shadcn + Tailwind
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import useConfirm from '../../hooks/useConfirm';
import EmptyState from '../../components/ui/EmptyState';
import DataStateRenderer from '../../components/ui/DataStateRenderer';
import { useToast } from '../../contexts/ToastContext';
import {
  Cpu,
  Download,
  Trash2,
  Play,
  Check,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Zap,
  Star,
  X,
  Info,
  Eye,
  Type,
} from 'lucide-react';
import { useDownloads } from '../../contexts/DownloadContext';
import { useApi } from '../../hooks/useApi';
import { useFetchData } from '../../hooks/useFetchData';
import { formatModelSize as formatSize } from '../../utils/formatting';
import StoreDetailModal from './StoreDetailModal';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';

// --- Interfaces ---

interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  model_type?: string;
  capabilities?: string[];
  recommended_for?: string[];
  install_status: string;
  effective_ollama_name?: string;
  performance_tier?: number;
  ollama_library_url?: string;
}

interface LoadedModel {
  model_id: string;
  ram_usage_mb?: number;
}

interface QueueEntry {
  model: string;
  pending_count: number;
}

interface DownloadState {
  progress: number;
  phase: string;
  status?: string;
  error?: string;
}

// --- Config ---

const sizeConfig: Record<string, { label: string; description: string }> = {
  small: { label: 'Klein', description: '7-12 GB RAM' },
  medium: { label: 'Mittel', description: '15-25 GB RAM' },
  large: { label: 'Groß', description: '30-40 GB RAM' },
  xlarge: { label: 'Sehr Groß', description: '45+ GB RAM' },
};

const typeConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  llm: { label: 'LLM', icon: Cpu, description: 'Sprachmodelle' },
  ocr: { label: 'OCR', icon: Type, description: 'Texterkennung' },
  vision: { label: 'Vision', icon: Eye, description: 'Bildanalyse' },
};

function StoreModels() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  interface ModelData {
    catalog: CatalogModel[];
    loadedModel: LoadedModel | null;
    defaultModel: string | null;
    queueByModel: QueueEntry[];
  }

  const modelFetcher = useCallback(
    async (signal: AbortSignal) => {
      const opts = { signal, showError: false };
      const [catalogData, statusData, defaultData] = await Promise.all([
        api.get('/models/catalog', opts),
        api.get('/models/status', opts).catch(() => ({})),
        api.get('/models/default', opts).catch(() => ({})),
      ]);
      return {
        catalog: (catalogData as { models?: CatalogModel[] }).models || [],
        loadedModel: (statusData as { loaded_model?: LoadedModel | null }).loaded_model || null,
        defaultModel: (defaultData as { default_model?: string | null }).default_model || null,
        queueByModel: (statusData as { queue_by_model?: QueueEntry[] }).queue_by_model || [],
      } as ModelData;
    },
    [api]
  );

  const {
    data: modelData,
    setData: setModelData,
    loading,
    error,
    setError,
    refetch: loadData,
  } = useFetchData<ModelData>(modelFetcher, {
    initialData: { catalog: [], loadedModel: null, defaultModel: null, queueByModel: [] },
    errorMessage: 'Fehler beim Laden der Modell-Daten',
  });

  const { catalog, loadedModel, defaultModel, queueByModel } = modelData;

  const [activating, setActivating] = useState<string | null>(null);
  const [activatingProgress, setActivatingProgress] = useState('');
  const [activatingPercent, setActivatingPercent] = useState(0);
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);

  // Filters
  const [sizeFilter, setSizeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { startDownload, isDownloading, getDownloadState, onDownloadComplete } = useDownloads();
  const activatingRef = useRef(false);
  const activateAbortRef = useRef<AbortController | null>(null);

  // Cleanup activation stream on unmount
  useEffect(() => {
    return () => {
      activateAbortRef.current?.abort();
    };
  }, []);

  // Poll for status updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => loadData(), 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Reload when download completes
  useEffect(() => {
    const unsubscribe = onDownloadComplete(() => loadData());
    return unsubscribe;
  }, [onDownloadComplete, loadData]);

  // Highlight model from search
  useEffect(() => {
    if (highlightId && catalog.length > 0) {
      const model = catalog.find(m => m.id === highlightId);
      if (model) {
        setSelectedModel(model);
      }
    }
  }, [highlightId, catalog]);

  // Download model
  const handleDownload = (modelId: string, modelName: string) => {
    startDownload(modelId, modelName);
  };

  // Activate model with SSE streaming
  const handleActivate = async (modelId: string) => {
    if (activatingRef.current) return;
    activatingRef.current = true;

    activateAbortRef.current?.abort();
    const controller = new AbortController();
    activateAbortRef.current = controller;

    setActivating(modelId);
    setActivatingProgress('Initialisiere...');
    setActivatingPercent(0);

    try {
      const response = await api.post(`/models/${modelId}/activate?stream=true`, null, {
        raw: true,
        showError: false,
        signal: controller.signal,
      });

      const body = (response as unknown as Response).body;
      if (!body) throw new Error('Streaming nicht verfügbar');
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress !== undefined) setActivatingPercent(data.progress);
              if (data.message) setActivatingProgress(data.message);
              if (data.error) throw new Error(data.error);
              if (data.done) {
                setActivatingProgress(data.message || 'Erfolgreich aktiviert!');
                setActivatingPercent(100);
                await new Promise(resolve => setTimeout(resolve, 800));
                await loadData();
              }
            } catch (parseErr: unknown) {
              if (
                !(parseErr instanceof Error) ||
                parseErr.message !== 'Unexpected end of JSON input'
              ) {
                console.error('SSE parse error:', parseErr);
              }
            }
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Activation error:', err);
      const model = catalog.find(m => m.id === modelId);
      const name = model?.name || modelId;
      setError(`Aktivierung von „${name}" fehlgeschlagen. Bitte versuche es erneut.`);
    } finally {
      setActivating(null);
      setActivatingProgress('');
      setActivatingPercent(0);
      activatingRef.current = false;
    }
  };

  // Delete model
  const handleDelete = async (modelId: string) => {
    if (!(await confirm({ message: `Modell "${modelId}" wirklich löschen?` }))) return;

    try {
      await api.del(`/models/${modelId}`, { showError: false });
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      const model = catalog.find(m => m.id === modelId);
      const name = model?.name || modelId;
      setError(`Fehler beim Löschen von „${name}"`);
    }
  };

  // Set as default
  const handleSetDefault = async (modelId: string) => {
    try {
      await api.post('/models/default', { model_id: modelId }, { showError: false });
      setModelData(prev => ({ ...prev, defaultModel: modelId }));
    } catch (err) {
      console.error('Set default error:', err);
      const model = catalog.find(m => m.id === modelId);
      const name = model?.name || modelId;
      setError(`Fehler beim Setzen von „${name}" als Standard-Modell`);
    }
  };

  // Get queue count for model
  const getQueueCount = (modelId: string): number => {
    const entry = queueByModel.find(q => q.model === modelId);
    return entry?.pending_count || 0;
  };

  // Filter catalog
  const filteredCatalog = catalog.filter(model => {
    if (sizeFilter !== 'all' && model.category !== sizeFilter) return false;
    if (typeFilter !== 'all' && (model.model_type || 'llm') !== typeFilter) return false;
    return true;
  });

  // Get available types from catalog
  const availableTypes = Array.from(new Set(catalog.map(m => m.model_type || 'llm')));

  // Full-page error only when initial load fails (no data yet)
  const initialError = error && catalog.length === 0 ? error : null;

  return (
    <DataStateRenderer
      loading={loading}
      error={initialError}
      empty={false}
      onRetry={() => loadData()}
      loadingSkeleton={
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <SkeletonCard key={i} hasAvatar={false} lines={3} />
            ))}
        </div>
      }
    >
      <div className="store-models">
        {/* Loaded model banner */}
        {loadedModel && (
          <div className="loaded-model-banner flex items-center justify-between bg-primary/10 border border-primary rounded-lg px-6 py-4 mb-6 flex-wrap gap-4">
            <div className="loaded-model-info flex items-center gap-3">
              <Zap className="pulse animate-pulse size-5 text-primary" />
              <span className="text-muted-foreground">Aktuell geladen:</span>
              <strong className="text-foreground">{loadedModel.model_id}</strong>
            </div>
            <div className="loaded-model-stats flex items-center gap-2">
              <span className="ram-usage flex items-center gap-1.5 text-sm text-muted-foreground">
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

        {/* Error */}
        {error && (
          <div className="store-error flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-md px-4 py-3 mb-6 text-destructive">
            <AlertCircle className="size-5" />
            <span>{error}</span>
            <button
              type="button"
              className="ml-auto hover:opacity-70 transition-opacity"
              onClick={() => setError(null)}
              aria-label="Fehlermeldung schließen"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="store-filters flex gap-6 mb-6 flex-wrap">
          <div className="filter-group flex items-center gap-3">
            <span className="filter-label text-sm text-muted-foreground font-medium">Größe:</span>
            <div className="filter-chips flex gap-2 flex-wrap">
              <button
                type="button"
                className={cn(
                  'filter-chip flex items-center gap-1.5 px-3.5 py-2 bg-card border border-border rounded-full text-sm font-medium text-muted-foreground cursor-pointer transition-all hover:bg-muted',
                  sizeFilter === 'all' && 'active bg-primary/10 border-primary text-primary'
                )}
                onClick={() => setSizeFilter('all')}
                aria-pressed={sizeFilter === 'all'}
              >
                Alle
              </button>
              {Object.entries(sizeConfig).map(([key, config]) => (
                <button
                  type="button"
                  key={key}
                  className={cn(
                    'filter-chip flex items-center gap-1.5 px-3.5 py-2 bg-card border border-border rounded-full text-sm font-medium text-muted-foreground cursor-pointer transition-all hover:bg-muted',
                    sizeFilter === key && 'active bg-primary/10 border-primary text-primary'
                  )}
                  onClick={() => setSizeFilter(key)}
                  aria-pressed={sizeFilter === key}
                  title={config.description}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {availableTypes.length > 1 && (
            <div className="filter-group flex items-center gap-3">
              <span className="filter-label text-sm text-muted-foreground font-medium">Typ:</span>
              <div className="filter-chips flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={cn(
                    'filter-chip flex items-center gap-1.5 px-3.5 py-2 bg-card border border-border rounded-full text-sm font-medium text-muted-foreground cursor-pointer transition-all hover:bg-muted',
                    typeFilter === 'all' && 'active bg-primary/10 border-primary text-primary'
                  )}
                  onClick={() => setTypeFilter('all')}
                  aria-pressed={typeFilter === 'all'}
                >
                  Alle
                </button>
                {availableTypes.map(type => {
                  const config = typeConfig[type] || { label: type, icon: Cpu };
                  const Icon = config.icon;
                  return (
                    <button
                      type="button"
                      key={type}
                      className={cn(
                        'filter-chip flex items-center gap-1.5 px-3.5 py-2 bg-card border border-border rounded-full text-sm font-medium text-muted-foreground cursor-pointer transition-all hover:bg-muted',
                        typeFilter === type && 'active bg-primary/10 border-primary text-primary'
                      )}
                      onClick={() => setTypeFilter(type)}
                      aria-pressed={typeFilter === type}
                    >
                      <Icon className="size-4" /> {config.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Model Grid */}
        <div className="model-grid grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {filteredCatalog.map(model => {
            const isInstalled = model.install_status === 'available';
            const isLoaded =
              loadedModel?.model_id === model.id ||
              loadedModel?.model_id === model.effective_ollama_name;
            const modelIsDownloading = isDownloading(model.id);
            const downloadState = getDownloadState(model.id);
            const isActivating = activating === model.id;
            const isDefault = defaultModel === model.id;
            const pendingJobs = getQueueCount(model.id);
            const sizeInfo = sizeConfig[model.category] || sizeConfig.medium;
            const typeInfo = typeConfig[model.model_type || 'llm'] || typeConfig.llm;
            const TypeIcon = typeInfo.icon;

            return (
              <div
                key={model.id}
                className={cn(
                  'model-card bg-card border border-border rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-muted',
                  isLoaded && 'active border-primary bg-primary/5',
                  isInstalled && 'installed border-muted'
                )}
                onClick={() => setSelectedModel(model)}
                tabIndex={0}
                role="button"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedModel(model);
                  }
                }}
              >
                <div className="model-card-header flex items-start justify-between gap-3">
                  <div className="model-icon size-12 bg-muted rounded-lg flex items-center justify-center text-primary text-2xl shrink-0">
                    <TypeIcon className="size-6" />
                  </div>
                  <div className="model-badges flex flex-wrap gap-1.5 justify-end">
                    {isDefault && (
                      <Badge
                        variant="outline"
                        className="badge-default bg-primary/10 border-primary/30 text-primary"
                      >
                        <Star className="size-3" /> Standard
                      </Badge>
                    )}
                    {isLoaded && (
                      <Badge
                        variant="outline"
                        className="badge-loaded bg-primary/10 border-primary text-primary"
                      >
                        <Zap className="size-3" /> Aktiv
                      </Badge>
                    )}
                    {pendingJobs > 0 && (
                      <Badge
                        variant="outline"
                        className="badge-queue bg-muted-foreground/10 border-muted-foreground/30 text-muted-foreground"
                      >
                        {pendingJobs} wartend
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="badge-type bg-muted border-border text-foreground/60"
                      title={typeInfo.description}
                    >
                      {typeInfo.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="badge-category bg-muted border-border text-foreground/60"
                      title={sizeInfo.description}
                    >
                      {sizeInfo.label}
                    </Badge>
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
                    className={cn(
                      'download-progress bg-muted rounded-md p-3.5 border border-border',
                      `phase-${downloadState.phase}`,
                      downloadState.phase === 'complete' && 'border-primary bg-primary/10'
                    )}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="progress-header flex justify-between items-center mb-2">
                      <span
                        className={cn(
                          'progress-phase-label text-xs font-semibold text-muted-foreground uppercase tracking-wider',
                          downloadState.phase === 'complete' && 'text-primary'
                        )}
                      >
                        {downloadState.phase === 'init' && 'Initialisiere'}
                        {downloadState.phase === 'download' && 'Download'}
                        {downloadState.phase === 'verify' && 'Verifiziere'}
                        {downloadState.phase === 'complete' && 'Fertig'}
                        {downloadState.phase === 'error' && 'Fehler'}
                      </span>
                      <span
                        className={cn(
                          'progress-percent text-primary font-semibold text-sm',
                          downloadState.phase === 'complete' && 'text-primary'
                        )}
                      >
                        {downloadState.progress}%
                      </span>
                    </div>
                    <div className="progress-bar h-2 bg-border rounded overflow-hidden mb-2">
                      <div
                        className={cn(
                          'progress-fill h-full bg-linear-to-r from-primary to-primary/80 rounded transition-all duration-300',
                          downloadState.phase === 'verify' &&
                            'pulsing animate-pulse from-muted-foreground to-muted-foreground/80',
                          downloadState.phase === 'complete' && 'from-primary to-primary/80'
                        )}
                        style={{
                          width: `${downloadState.phase === 'verify' && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
                        }}
                      />
                    </div>
                    <div
                      className={cn(
                        'progress-status text-xs text-muted-foreground',
                        downloadState.phase === 'complete' && 'text-primary'
                      )}
                    >
                      {downloadState.error || downloadState.status}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div
                  className="model-actions flex gap-2 mt-auto pt-2"
                  onClick={e => e.stopPropagation()}
                >
                  {!isInstalled && !modelIsDownloading && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDownload(model.id, model.name)}
                      >
                        <Download className="size-4" /> Herunterladen
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn(
                          'text-muted-foreground hover:text-primary',
                          isDefault && 'text-primary'
                        )}
                        onClick={() => handleSetDefault(model.id)}
                        title={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                        aria-label={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                      >
                        <Star className={cn('size-4', isDefault && 'fill-primary')} />
                      </Button>
                    </>
                  )}

                  {isInstalled && !isLoaded && (
                    <>
                      <Button
                        size="sm"
                        className={cn('flex-1', isActivating && 'activating-btn')}
                        onClick={() => handleActivate(model.id)}
                        disabled={isActivating}
                        style={
                          isActivating
                            ? {
                                background: `linear-gradient(90deg, var(--color-success) ${activatingPercent}%, var(--card) ${activatingPercent}%)`,
                                borderColor: 'var(--color-success)',
                              }
                            : {}
                        }
                      >
                        {isActivating ? (
                          <>
                            <RefreshCw className="size-4 animate-spin" /> {activatingPercent}%
                          </>
                        ) : (
                          <>
                            <Play className="size-4" /> Aktivieren
                          </>
                        )}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn(
                          'text-muted-foreground hover:text-primary',
                          isDefault && 'text-primary'
                        )}
                        onClick={() => handleSetDefault(model.id)}
                        title={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                        aria-label={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                      >
                        <Star className={cn('size-4', isDefault && 'fill-primary')} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleDelete(model.id)}
                        title="Löschen"
                        aria-label="Löschen"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}

                  {isLoaded && (
                    <>
                      <Button size="sm" className="flex-1" disabled>
                        <Check className="size-4" /> Aktiv
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn(
                          'text-muted-foreground hover:text-primary',
                          isDefault && 'text-primary'
                        )}
                        onClick={() => handleSetDefault(model.id)}
                        title={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                        aria-label={isDefault ? 'Standard-Modell' : 'Als Standard setzen'}
                      >
                        <Star className={cn('size-4', isDefault && 'fill-primary')} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredCatalog.length === 0 && (
          <EmptyState icon={<Cpu />} title="Keine Modelle gefunden" />
        )}

        {/* Model Detail Modal */}
        {selectedModel && (
          <StoreDetailModal
            type="model"
            item={selectedModel}
            onClose={() => setSelectedModel(null)}
            loadedModel={loadedModel}
            defaultModel={defaultModel ?? undefined}
            isDownloading={isDownloading}
            activating={activating}
            activatingPercent={activatingPercent}
            onDownload={handleDownload}
            onActivate={handleActivate}
            onDelete={handleDelete}
            onSetDefault={handleSetDefault}
          />
        )}
        {ConfirmDialog}
      </div>
    </DataStateRenderer>
  );
}

export default StoreModels;
