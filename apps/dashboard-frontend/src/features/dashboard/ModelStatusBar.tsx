import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  RefreshCw,
  Loader2,
  Play,
  Square,
  ExternalLink,
  AlertTriangle,
  X,
} from 'lucide-react';
import useModelStatus from '../../hooks/useModelStatus';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../../components/ui/shadcn/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/shadcn/tooltip';
import type { InstalledModel } from '../../types';

function ModelStatusBar() {
  const {
    llmModels,
    ocrModels,
    budget,
    loadingModels,
    loadingStatus,
    error,
    isRefreshing,
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

  const allModels = useMemo(() => {
    const withStatus = [...llmModels, ...ocrModels].map(m => {
      const isOcr = m.model_type === 'ocr';
      const active = isOcr ? !!m.is_running : isLlmLoaded(m);
      const hasError = m.install_status === 'error' || m.status === 'error';
      return { model: m, active, hasError, isOcr };
    });
    // Sort: active first, then by name
    return withStatus.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.model.name.localeCompare(b.model.name);
    });
  }, [llmModels, ocrModels, isLlmLoaded]);

  const handleStart = async (model: InstalledModel) => {
    const isOcr = model.model_type === 'ocr';
    try {
      if (isOcr) {
        await handleLoadOcr(model.id);
      } else {
        await handleLoadLlm(model.id);
      }
      toast.success(`${model.name} wurde aktiviert`);
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
      {/* Header */}
      <div className="msb-header">
        <div className="msb-header-left">
          <Cpu size={18} style={{ color: 'var(--primary-color)' }} />
          <h3 className="dashboard-card-title" style={{ margin: 0 }}>
            KI-Modelle
          </h3>
        </div>
        <div className="msb-header-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="msb-btn msb-btn-stop"
                  onClick={() => fetchData(true)}
                  disabled={isRefreshing}
                  aria-label="Aktualisieren"
                >
                  <RefreshCw size={14} className={isRefreshing ? 'msb-spin' : ''} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Aktualisieren</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          <button
            className="msb-error-dismiss"
            onClick={clearError}
            aria-label="Fehler schlie\u00dfen"
          >
            <X size={14} />
          </button>
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

      {/* Model list */}
      {!isInitialLoad && hasData && (
        <div className="msb-list">
          {allModels.map(({ model, active, hasError, isOcr }) => {
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
                <span className="msb-type-badge">{isOcr ? 'OCR' : 'LLM'}</span>
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
                      {!canLoad && <TooltipContent>Nicht genug RAM verf\u00fcgbar</TooltipContent>}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* RAM Budget Bar */}
      {budget && (
        <div className="msb-ram">
          <div className="msb-ram-bar-bg">
            <div className={ramBarClass} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
          </div>
          <div className="msb-ram-label">
            <span>RAM</span>
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
