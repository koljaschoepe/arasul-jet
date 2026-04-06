import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, AlertTriangle, Loader2, RefreshCw, Shield, Type } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import type { InstalledModel, MemoryBudget, ModelLifecycle } from '../../types';

interface InstalledModelsResponse {
  models?: InstalledModel[];
}

const PHASE_LABELS: Record<string, string> = {
  peak: 'Peak',
  normal: 'Normal',
  idle: 'Ruhe',
};

const PHASE_COLORS: Record<string, string> = {
  peak: 'var(--primary-color)',
  normal: 'var(--warning-color)',
  idle: 'var(--text-muted)',
};

export default function ModelDashboard() {
  const api = useApi();
  const [budget, setBudget] = useState<MemoryBudget | null>(null);
  const [lifecycle, setLifecycle] = useState<ModelLifecycle | null>(null);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());
  const [loadingStatus, setLoadingStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollErrors, setPollErrors] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const fetchData = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const [budgetData, lifecycleData, modelsData] = await Promise.all([
          api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
          api.get<ModelLifecycle>('/models/lifecycle', { showError: false }),
          api.get<InstalledModelsResponse>('/models/installed', { showError: false }),
        ]);
        setBudget(budgetData);
        setLifecycle(lifecycleData);
        if (modelsData?.models) setInstalledModels(modelsData.models);
        setPollErrors(0);
      } catch {
        setPollErrors(prev => prev + 1);
      } finally {
        if (manual) setIsRefreshing(false);
      }
    },
    [api]
  );

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchData]);

  const handleLoadLlm = async (modelId: string) => {
    setLoadingModels(prev => new Set(prev).add(modelId));
    setLoadingStatus(prev => ({ ...prev, [modelId]: 'Wird vorbereitet…' }));
    setError(null);

    const controller = new AbortController();
    abortRefs.current[modelId] = controller;

    try {
      const res = await api.post<Response>(`/models/${modelId}/activate?stream=true`, null, {
        raw: true,
        showError: false,
        signal: controller.signal,
      });

      const reader = (res as unknown as Response).body?.getReader();
      if (!reader) throw new Error('Streaming nicht verfügbar');

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
            const data = JSON.parse(line.slice(6));
            if (data.message) {
              setLoadingStatus(prev => ({ ...prev, [modelId]: data.message }));
            }
            if (data.error) {
              setError(data.error);
            }
            if (data.done) {
              await fetchData();
            }
          } catch {
            // ignore parse errors from partial chunks
          }
        }
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err?.message || 'Fehler beim Laden');
      }
    } finally {
      delete abortRefs.current[modelId];
      setLoadingModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      setLoadingStatus(prev => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  };

  const handleLoadOcr = async (modelId: string) => {
    setLoadingModels(prev => new Set(prev).add(modelId));
    setError(null);
    try {
      await api.post(`/models/${modelId}/load`);
      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Starten');
    } finally {
      setLoadingModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleUnload = async (modelId: string) => {
    setLoadingModels(prev => new Set(prev).add(modelId));
    setError(null);
    try {
      await api.post(`/models/${modelId}/unload`);
      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Entladen');
    } finally {
      setLoadingModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  // Filter models by type
  const availableModels = installedModels.filter(
    m => m.install_status === 'available' || m.status === 'available'
  );
  const llmModels = availableModels.filter(m => !m.model_type || m.model_type === 'llm');
  const ocrModels = availableModels.filter(m => m.model_type === 'ocr');

  // Build loaded model lookup from budget
  const loadedIds = new Set(budget?.loadedModels?.map(m => m.id) || []);
  const loadedOllamaNames = new Set(budget?.loadedModels?.map(m => m.ollamaName) || []);

  const isLlmLoaded = (model: InstalledModel) =>
    loadedIds.has(model.id) || loadedOllamaNames.has(model.id);

  const getBudgetModel = (model: InstalledModel) =>
    budget?.loadedModels?.find(m => m.id === model.id || m.ollamaName === model.id);

  // Memory calculations
  const modelUsedMb = budget?.usedMb || 0;
  const totalBudgetMb = budget?.totalBudgetMb || 0;
  const safetyMb = budget?.safetyBufferMb || 0;
  const modelUsedPercent = totalBudgetMb > 0 ? (modelUsedMb / totalBudgetMb) * 100 : 0;
  const safetyPercent = totalBudgetMb > 0 ? (safetyMb / totalBudgetMb) * 100 : 0;
  const availableGb = (budget?.availableMb || 0) / 1024;

  const canLoadModel = (model: InstalledModel) => {
    if (!budget || !model.ram_required_gb) return true;
    return model.ram_required_gb * 1024 <= budget.availableMb;
  };

  return (
    <div className="dashboard-card md">
      {/* Header */}
      <div className="md-header">
        <div className="md-title-row">
          <Cpu size={18} />
          <h3 className="dashboard-card-title">KI-Modelle</h3>
        </div>
        <div className="md-header-actions">
          <button
            className="mcp-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            title="Aktualisieren"
          >
            <RefreshCw size={14} className={isRefreshing ? 'mcp-spin' : ''} />
          </button>
          {lifecycle && (
            <span
              className="mcp-phase-badge"
              style={{ borderColor: PHASE_COLORS[lifecycle.currentPhase] }}
            >
              <span
                className="mcp-phase-dot"
                style={{ background: PHASE_COLORS[lifecycle.currentPhase] }}
              />
              {PHASE_LABELS[lifecycle.currentPhase] || lifecycle.currentPhase}{' '}
              {lifecycle.keepAliveMinutes}m
            </span>
          )}
        </div>
      </div>

      {/* Memory Budget */}
      {budget && (
        <div className="mcp-memory">
          <div className="mcp-memory-bar-bg">
            <div
              className="mcp-memory-bar-models"
              style={{ width: `${Math.min(modelUsedPercent, 100)}%` }}
            />
            <div
              className="mcp-memory-bar-overhead"
              style={{
                width: `${Math.min(safetyPercent, 100 - modelUsedPercent)}%`,
                left: `${modelUsedPercent}%`,
              }}
            />
          </div>
          <div className="mcp-memory-legend">
            <span className="mcp-legend-item">
              <span className="mcp-legend-dot mcp-legend-models" />
              Modelle: {(modelUsedMb / 1024).toFixed(1)} GB
            </span>
            <span className="mcp-legend-item">
              <Shield size={10} className="mcp-legend-shield" />
              Reserviert: {(safetyMb / 1024).toFixed(1)} GB
            </span>
            <span className="mcp-memory-available">
              {availableGb.toFixed(1)} / {(totalBudgetMb / 1024).toFixed(0)} GB frei
            </span>
          </div>
        </div>
      )}

      {/* Connection Error */}
      {pollErrors >= 3 && (
        <div className="mcp-connection-error">
          <AlertTriangle size={12} />
          <span>Verbindung unterbrochen</span>
        </div>
      )}

      {/* Operation Error */}
      {error && (
        <div className="mcp-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <button className="mcp-error-dismiss" onClick={() => setError(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Two-Column Grid: LLMs | OCR */}
      <div className="md-columns">
        {/* LLM Section */}
        <div className="md-section">
          <div className="md-section-title">
            <Cpu size={14} />
            <span>LLM-Modelle</span>
            <span className="md-section-count">{llmModels.length}</span>
          </div>
          <div className="mcp-model-list">
            {llmModels.length === 0 && (
              <div className="mcp-empty">Keine LLM-Modelle installiert</div>
            )}
            {llmModels.map(model => {
              const loaded = isLlmLoaded(model);
              const budgetModel = getBudgetModel(model);
              const loading = loadingModels.has(model.id);
              const statusMsg = loadingStatus[model.id];
              const ramGb = budgetModel
                ? (budgetModel.ramMb / 1024).toFixed(1)
                : model.ram_required_gb || '?';
              const canLoad = canLoadModel(model);

              return (
                <div key={model.id} className={`mcp-model ${loaded ? 'mcp-model-loaded' : ''}`}>
                  <div className="mcp-model-main">
                    <div className="mcp-model-info">
                      <span
                        className={`mcp-dot ${loaded ? 'mcp-dot-active' : 'mcp-dot-inactive'}`}
                      />
                      <span className="mcp-model-name" title={model.id}>
                        {model.name || model.id}
                      </span>
                    </div>
                    <div className="mcp-model-actions">
                      <span className={`mcp-model-ram ${loaded ? 'mcp-model-ram-active' : ''}`}>
                        {ramGb} GB
                      </span>
                      {loading ? (
                        <button className="mcp-btn-text mcp-btn-text-loading" disabled>
                          <Loader2 size={13} className="mcp-spin" />
                          <span>{loaded ? 'Stoppe…' : 'Lade…'}</span>
                        </button>
                      ) : loaded ? (
                        <button
                          className="mcp-btn-text mcp-btn-text-stop"
                          onClick={() => handleUnload(model.id)}
                        >
                          Stoppen
                        </button>
                      ) : (
                        <button
                          className="mcp-btn-text mcp-btn-text-start"
                          onClick={() => handleLoadLlm(model.id)}
                          disabled={!canLoad}
                          title={canLoad ? 'Modell laden' : 'Nicht genug RAM'}
                        >
                          Starten
                        </button>
                      )}
                    </div>
                  </div>
                  {loading && statusMsg && <div className="mcp-model-status">{statusMsg}</div>}
                  {!loaded && !canLoad && (model.ram_required_gb || 0) > 0 && budget && (
                    <div className="mcp-model-warning">
                      <AlertTriangle size={11} />
                      Braucht {model.ram_required_gb} GB — nur {availableGb.toFixed(1)} GB frei
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* OCR Section */}
        <div className="md-section">
          <div className="md-section-title">
            <Type size={14} />
            <span>OCR-Modelle</span>
            <span className="md-section-count">{ocrModels.length}</span>
          </div>
          <div className="mcp-model-list">
            {ocrModels.length === 0 && <div className="mcp-empty">Keine OCR-Modelle verfügbar</div>}
            {ocrModels.map(model => {
              const running = model.is_running === true;
              const loading = loadingModels.has(model.id);
              const ramGb = model.ram_required_gb || '?';

              return (
                <div key={model.id} className={`mcp-model ${running ? 'mcp-model-loaded' : ''}`}>
                  <div className="mcp-model-main">
                    <div className="mcp-model-info">
                      <span
                        className={`mcp-dot ${running ? 'mcp-dot-active' : 'mcp-dot-inactive'}`}
                      />
                      <span className="mcp-model-name" title={model.id}>
                        {model.name || model.id}
                      </span>
                    </div>
                    <div className="mcp-model-actions">
                      <span className={`mcp-model-ram ${running ? 'mcp-model-ram-active' : ''}`}>
                        {ramGb} GB
                      </span>
                      {loading ? (
                        <button className="mcp-btn-text mcp-btn-text-loading" disabled>
                          <Loader2 size={13} className="mcp-spin" />
                          <span>{running ? 'Stoppe…' : 'Starte…'}</span>
                        </button>
                      ) : running ? (
                        <button
                          className="mcp-btn-text mcp-btn-text-stop"
                          onClick={() => handleUnload(model.id)}
                        >
                          Stoppen
                        </button>
                      ) : (
                        <button
                          className="mcp-btn-text mcp-btn-text-start"
                          onClick={() => handleLoadOcr(model.id)}
                        >
                          Starten
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
