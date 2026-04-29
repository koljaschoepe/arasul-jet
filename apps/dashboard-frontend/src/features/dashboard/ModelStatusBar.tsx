import React, { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Play, Square, ExternalLink, AlertTriangle, X, Zap } from 'lucide-react';
import useModelStatus from '../../hooks/useModelStatus';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../../components/ui/shadcn/skeleton';
import { Button } from '../../components/ui/shadcn/button';
import { Badge } from '../../components/ui/shadcn/badge';
import { useSystemInfoQuery } from '../../hooks/queries/system';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/shadcn/tooltip';
import type { InstalledModel } from '../../types';

type CategoryKey = 'text' | 'vision' | 'ocr';

interface ModelCategory {
  key: CategoryKey;
  label: string;
  models: Array<{ model: InstalledModel; active: boolean; hasError: boolean; isOcr: boolean }>;
}

function ModelStatusBar() {
  const {
    llmModels,
    ocrModels,
    budget,
    loadingModels,
    loadingStatus,
    error,
    pollErrors,
    usedMb,
    totalBudgetMb,
    usedPercent,
    isLlmLoaded,
    canLoadModel,
    fetchData,
    handleLoadLlm,
    handleLoadOcr,
    handleUnload,
    clearError,
  } = useModelStatus();

  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  // Phase 2.4: Jetson power mode (MAXN / 30W / 15W). Tiny chip in header
  // so the user instantly sees if the box is throttled.
  const systemInfoQuery = useSystemInfoQuery();
  const powerMode = systemInfoQuery.data?.power_mode;

  // Enrich models with status info
  const allModels = useMemo(() => {
    return [...llmModels, ...ocrModels].map(m => {
      const isOcr = m.model_type === 'ocr';
      const active = isOcr ? !!m.is_running : isLlmLoaded(m);
      const hasError = m.install_status === 'error' || m.status === 'error';
      return { model: m, active, hasError, isOcr };
    });
  }, [llmModels, ocrModels, isLlmLoaded]);

  // Group models by category
  const categories = useMemo((): ModelCategory[] => {
    return [
      {
        key: 'text' as CategoryKey,
        label: 'Text',
        models: allModels.filter(
          m => m.model.model_type !== 'ocr' && !m.model.supports_vision_input
        ),
      },
      {
        key: 'vision' as CategoryKey,
        label: 'Vision',
        models: allModels.filter(m => !!m.model.supports_vision_input),
      },
      {
        key: 'ocr' as CategoryKey,
        label: 'OCR',
        models: allModels.filter(m => m.model.model_type === 'ocr'),
      },
    ].filter(c => c.models.length > 0);
  }, [allModels]);

  // Active tab — default to first category with models
  const [activeTab, setActiveTab] = useState<CategoryKey>('text');
  const currentCategory = categories.find(c => c.key === activeTab) || categories[0];

  // Sort: active first, then by name
  const sortedModels = useMemo(() => {
    if (!currentCategory) return [];
    return [...currentCategory.models].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.model.name.localeCompare(b.model.name);
    });
  }, [currentCategory]);

  // Backend container/model state can lag the start/stop API call by a few
  // seconds. Schedule two follow-up refreshes so the UI converges without
  // requiring a manual reload.
  const scheduleFollowUpRefresh = () => {
    setTimeout(() => fetchData(true), 800);
    setTimeout(() => fetchData(true), 3000);
  };

  const handleStart = async (model: InstalledModel) => {
    const isOcr = model.model_type === 'ocr';
    try {
      if (isOcr) {
        await handleLoadOcr(model.id);
      } else {
        await handleLoadLlm(model.id);
      }
      toast.success(`${model.name} wurde aktiviert`);
      scheduleFollowUpRefresh();
    } catch {
      // Error already handled in hook
    }
  };

  const handleStop = async (model: InstalledModel) => {
    const confirmed = await confirm({
      title: 'Modell stoppen?',
      message: `${model.name} wird aus dem Arbeitsspeicher entladen.`,
      confirmText: 'Stoppen',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    try {
      await handleUnload(model.id);
      toast.success(`${model.name} wurde gestoppt`);
      scheduleFollowUpRefresh();
    } catch {
      // Error already handled in hook
    }
  };

  const hasData = llmModels.length > 0 || ocrModels.length > 0;
  const isInitialLoad = !budget && pollErrors === 0;

  const ramBarClass =
    usedPercent > 90
      ? 'msb-ram-bar-fill msb-ram-critical'
      : usedPercent > 70
        ? 'msb-ram-bar-fill msb-ram-warning'
        : 'msb-ram-bar-fill';

  return (
    <div className="dashboard-card msb-widget">
      {/* Header — matches Performance card: title only, plus action link */}
      <div className="msb-header">
        <h3 className="dashboard-card-title" style={{ margin: 0 }}>
          KI-Modelle
        </h3>
        <div className="msb-header-actions flex items-center gap-2">
          {powerMode?.available && powerMode.mode !== 'unknown' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={
                      powerMode.mode === 'MAXN'
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400'
                    }
                  >
                    <Zap className="size-3" /> {powerMode.mode}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {powerMode.mode === 'MAXN'
                    ? 'Maximaler Power-Modus — volle GPU/CPU-Performance.'
                    : `Power-Modus ${powerMode.mode} — gedrosselt; LLM-Performance reduziert. Mit \`sudo nvpmodel -m 0\` auf MAXN umstellen.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/store/models"
                  className="msb-btn msb-btn-stop"
                  aria-label="Modelle verwalten"
                >
                  <ExternalLink size={14} />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Modelle verwalten</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Connection error */}
      {pollErrors >= 3 && (
        <div className="msb-error">
          <AlertTriangle size={14} />
          <span>Verbindung unterbrochen</span>
        </div>
      )}

      {/* Operation error */}
      {error && (
        <div className="msb-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="msb-error-dismiss"
            onClick={clearError}
            aria-label="Fehler schließen"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {isInitialLoad && (
        <div className="msb-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="msb-model-row">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isInitialLoad && !hasData && (
        <div className="msb-empty">
          <p>Keine Modelle installiert</p>
          <Link to="/store/models" className="msb-link">
            Modelle herunterladen <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* Tabs + Model list */}
      {!isInitialLoad && hasData && (
        <>
          {/* Category Tabs */}
          {categories.length > 1 && (
            <div className="msb-tabs" role="tablist">
              {categories.map(cat => {
                const activeCount = cat.models.filter(m => m.active).length;
                return (
                  <button
                    key={cat.key}
                    role="tab"
                    aria-selected={
                      activeTab === cat.key ||
                      (!categories.find(c => c.key === activeTab) && cat === categories[0])
                    }
                    className={`msb-tab ${activeTab === cat.key || (!categories.find(c => c.key === activeTab) && cat === categories[0]) ? 'active' : ''}`}
                    onClick={() => setActiveTab(cat.key)}
                  >
                    {cat.label}
                    {activeCount > 0 && <span className="msb-tab-count">({activeCount})</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Model list for active tab */}
          <div className="msb-list" role="tabpanel">
            {sortedModels.map(({ model, active, hasError }) => {
              const isLoading = loadingModels.has(model.id);
              const statusMsg = loadingStatus[model.id];
              const canLoad = canLoadModel(model);
              const ramGb = model.ram_required_gb
                ? model.ram_required_gb >= 1
                  ? `${model.ram_required_gb.toFixed(1)} GB`
                  : `${Math.round(model.ram_required_gb * 1024)} MB`
                : null;

              const dotClass = hasError
                ? 'msb-dot msb-dot-error'
                : active
                  ? 'msb-dot msb-dot-active'
                  : 'msb-dot msb-dot-inactive';

              return (
                <div key={model.id} className="msb-model-row">
                  <span
                    className={dotClass}
                    aria-label={hasError ? 'Fehler' : active ? 'Aktiv' : 'Inaktiv'}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="msb-model-name">{model.name}</span>
                      </TooltipTrigger>
                      <TooltipContent>{model.name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {ramGb && <span className="msb-model-ram">{ramGb}</span>}

                  {isLoading ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="msb-btn msb-btn-loading">
                            <Loader2 size={14} className="msb-spin" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{statusMsg || 'Wird geladen\u2026'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : active ? (
                    <button
                      className="msb-btn msb-btn-stop"
                      onClick={() => handleStop(model)}
                      aria-label={`${model.name} stoppen`}
                    >
                      <Square size={12} />
                    </button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="msb-btn msb-btn-start"
                            onClick={() => handleStart(model)}
                            disabled={!canLoad}
                            aria-label={`${model.name} starten`}
                          >
                            <Play size={12} />
                          </button>
                        </TooltipTrigger>
                        {!canLoad && <TooltipContent>Nicht genug RAM verfügbar</TooltipContent>}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              );
            })}

            {sortedModels.length === 0 && (
              <div className="msb-empty">
                <p>Keine Modelle in dieser Kategorie</p>
                <Link to="/store/models" className="msb-link">
                  Im Store verfügbar <ExternalLink size={12} />
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {/* RAM Budget Bar */}
      {budget && (
        <div className="msb-ram">
          <div className="msb-ram-bar-bg">
            <div className={ramBarClass} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
          </div>
          <div className="msb-ram-label">
            <span>KI-RAM</span>
            <span>
              {(usedMb / 1024).toFixed(1)} / {(totalBudgetMb / 1024).toFixed(0)} GB
            </span>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

export default memo(ModelStatusBar);
