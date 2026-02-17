/**
 * StoreModels Component
 * Full model catalog with size and type filters
 * Based on the original ModelStore component
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import {
  FiCpu,
  FiDownload,
  FiTrash2,
  FiPlay,
  FiCheck,
  FiAlertCircle,
  FiRefreshCw,
  FiHardDrive,
  FiZap,
  FiStar,
  FiX,
  FiInfo,
  FiEye,
  FiType,
} from 'react-icons/fi';
import { useDownloads } from '../../contexts/DownloadContext';
import { API_BASE, getAuthHeaders } from '../../config/api';
import { sanitizeUrl } from '../../utils/sanitizeUrl';

// Category/Size configuration
const sizeConfig = {
  small: { label: 'Klein', description: '7-12 GB RAM' },
  medium: { label: 'Mittel', description: '15-25 GB RAM' },
  large: { label: 'Gross', description: '30-40 GB RAM' },
  xlarge: { label: 'Sehr Gross', description: '45+ GB RAM' },
};

// Model type configuration
const typeConfig = {
  llm: { label: 'LLM', icon: FiCpu, description: 'Sprachmodelle' },
  ocr: { label: 'OCR', icon: FiType, description: 'Texterkennung' },
  vision: { label: 'Vision', icon: FiEye, description: 'Bildanalyse' },
};

// Format bytes to human readable
const formatSize = bytes => {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function StoreModels() {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedModel, setLoadedModel] = useState(null);
  const [defaultModel, setDefaultModel] = useState(null);
  const [activating, setActivating] = useState(null);
  const [activatingProgress, setActivatingProgress] = useState('');
  const [activatingPercent, setActivatingPercent] = useState(0);
  const [queueByModel, setQueueByModel] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);

  // Filters
  const [sizeFilter, setSizeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { startDownload, isDownloading, getDownloadState, onDownloadComplete } = useDownloads();
  const activatingRef = useRef(false);

  // Load catalog and status
  const loadData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();

      const [catalogRes, statusRes, defaultRes] = await Promise.all([
        fetch(`${API_BASE}/models/catalog`, { headers }),
        fetch(`${API_BASE}/models/status`, { headers }),
        fetch(`${API_BASE}/models/default`, { headers }),
      ]);

      if (!catalogRes.ok) throw new Error('Fehler beim Laden des Katalogs');

      const catalogData = await catalogRes.json();
      const statusData = statusRes.ok ? await statusRes.json() : {};
      const defaultData = defaultRes.ok ? await defaultRes.json() : {};

      setCatalog(catalogData.models || []);
      setLoadedModel(statusData.loaded_model);
      setQueueByModel(statusData.queue_by_model || []);
      setDefaultModel(defaultData.default_model);
      setError(null);
    } catch (err) {
      console.error('[StoreModels] Error loading data:', err);
      setError(`Fehler beim Laden: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
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
  const handleDownload = (modelId, modelName) => {
    startDownload(modelId, modelName);
  };

  // Activate model with SSE streaming
  const handleActivate = async modelId => {
    if (activatingRef.current) return;
    activatingRef.current = true;

    setActivating(modelId);
    setActivatingProgress('Initialisiere...');
    setActivatingPercent(0);

    try {
      const response = await fetch(`${API_BASE}/models/${modelId}/activate?stream=true`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Aktivierung fehlgeschlagen');
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
            } catch (parseErr) {
              if (parseErr.message !== 'Unexpected end of JSON input') {
                console.error('SSE parse error:', parseErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Activation error:', err);
      setError(`Aktivierung fehlgeschlagen: ${err.message}`);
    } finally {
      setActivating(null);
      setActivatingProgress('');
      setActivatingPercent(0);
      activatingRef.current = false;
    }
  };

  // Delete model
  const handleDelete = async modelId => {
    if (!(await confirm({ message: `Modell "${modelId}" wirklich loeschen?` }))) return;

    try {
      const response = await fetch(`${API_BASE}/models/${modelId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Loeschen fehlgeschlagen');
      }
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message);
    }
  };

  // Set as default
  const handleSetDefault = async modelId => {
    try {
      const response = await fetch(`${API_BASE}/models/default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Setzen fehlgeschlagen');
      }
      setDefaultModel(modelId);
    } catch (err) {
      console.error('Set default error:', err);
      setError(err.message);
    }
  };

  // Get queue count for model
  const getQueueCount = modelId => {
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
  const availableTypes = [...new Set(catalog.map(m => m.model_type || 'llm'))];

  if (loading) {
    return (
      <div className="store-models-loading">
        <FiRefreshCw className="spin" />
        <span>Lade Modell-Katalog...</span>
      </div>
    );
  }

  return (
    <div className="store-models">
      {/* Loaded model banner */}
      {loadedModel && (
        <div className="loaded-model-banner">
          <div className="loaded-model-info">
            <FiZap className="pulse" />
            <span>Aktuell geladen:</span>
            <strong>{loadedModel.model_id}</strong>
          </div>
          <div className="loaded-model-stats">
            <span className="ram-usage">
              <FiHardDrive />
              {loadedModel.ram_usage_mb
                ? `${(loadedModel.ram_usage_mb / 1024).toFixed(1)} GB RAM`
                : 'RAM wird berechnet...'}
            </span>
          </div>
        </div>
      )}

      {!loadedModel && (
        <div className="no-model-banner">
          <FiInfo />
          <span>Kein Modell geladen. Aktiviere ein Modell, um zu starten.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="store-error">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <FiX />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="store-filters">
        <div className="filter-group">
          <span className="filter-label">Groesse:</span>
          <div className="filter-chips">
            <button
              className={`filter-chip ${sizeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSizeFilter('all')}
            >
              Alle
            </button>
            {Object.entries(sizeConfig).map(([key, config]) => (
              <button
                key={key}
                className={`filter-chip ${sizeFilter === key ? 'active' : ''}`}
                onClick={() => setSizeFilter(key)}
                title={config.description}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {availableTypes.length > 1 && (
          <div className="filter-group">
            <span className="filter-label">Typ:</span>
            <div className="filter-chips">
              <button
                className={`filter-chip ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                Alle
              </button>
              {availableTypes.map(type => {
                const config = typeConfig[type] || { label: type, icon: FiCpu };
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    className={`filter-chip ${typeFilter === type ? 'active' : ''}`}
                    onClick={() => setTypeFilter(type)}
                  >
                    <Icon /> {config.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Model Grid */}
      <div className="model-grid">
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
          const typeInfo = typeConfig[model.model_type] || typeConfig.llm;
          const TypeIcon = typeInfo.icon;

          return (
            <div
              key={model.id}
              className={`model-card ${isLoaded ? 'active' : ''} ${isInstalled ? 'installed' : ''}`}
              onClick={() => setSelectedModel(model)}
            >
              <div className="model-card-header">
                <div className="model-icon">
                  <TypeIcon />
                </div>
                <div className="model-badges">
                  {isDefault && (
                    <span className="badge badge-default">
                      <FiStar /> Standard
                    </span>
                  )}
                  {isLoaded && (
                    <span className="badge badge-loaded">
                      <FiZap /> Aktiv
                    </span>
                  )}
                  {pendingJobs > 0 && (
                    <span className="badge badge-queue">{pendingJobs} wartend</span>
                  )}
                  <span className="badge badge-type" title={typeInfo.description}>
                    {typeInfo.label}
                  </span>
                  <span className="badge badge-category" title={sizeInfo.description}>
                    {sizeInfo.label}
                  </span>
                </div>
              </div>

              <h3 className="model-name">{model.name}</h3>
              <p className="model-description">{model.description}</p>

              <div className="model-specs">
                <div className="spec">
                  <span className="spec-label">Groesse</span>
                  <span className="spec-value">{formatSize(model.size_bytes)}</span>
                </div>
                <div className="spec">
                  <span className="spec-label">RAM-Bedarf</span>
                  <span className="spec-value">{model.ram_required_gb} GB</span>
                </div>
              </div>

              {model.capabilities && model.capabilities.length > 0 && (
                <div className="model-capabilities">
                  {model.capabilities.slice(0, 4).map(cap => (
                    <span key={cap} className="capability-tag">
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              {/* Download Progress */}
              {modelIsDownloading && downloadState && (
                <div
                  className={`download-progress phase-${downloadState.phase}`}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="progress-header">
                    <span className="progress-phase-label">
                      {downloadState.phase === 'init' && 'Initialisiere'}
                      {downloadState.phase === 'download' && 'Download'}
                      {downloadState.phase === 'verify' && 'Verifiziere'}
                      {downloadState.phase === 'complete' && 'Fertig'}
                      {downloadState.phase === 'error' && 'Fehler'}
                    </span>
                    <span className="progress-percent">{downloadState.progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${downloadState.phase === 'verify' ? 'pulsing' : ''}`}
                      style={{
                        width: `${downloadState.phase === 'verify' && downloadState.progress < 100 ? 100 : downloadState.progress}%`,
                      }}
                    />
                  </div>
                  <div className="progress-status">
                    {downloadState.error || downloadState.status}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="model-actions" onClick={e => e.stopPropagation()}>
                {!isInstalled && !modelIsDownloading && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleDownload(model.id, model.name)}
                  >
                    <FiDownload /> Herunterladen
                  </button>
                )}

                {isInstalled && !isLoaded && (
                  <>
                    <button
                      className={`btn btn-success ${isActivating ? 'activating-btn' : ''}`}
                      onClick={() => handleActivate(model.id)}
                      disabled={isActivating}
                      style={
                        isActivating
                          ? {
                              background: `linear-gradient(90deg, var(--success-color) ${activatingPercent}%, var(--bg-card) ${activatingPercent}%)`,
                              borderColor: 'var(--success-color)',
                            }
                          : {}
                      }
                    >
                      {isActivating ? (
                        <>
                          <FiRefreshCw className="spin" /> {activatingPercent}%
                        </>
                      ) : (
                        <>
                          <FiPlay /> Aktivieren
                        </>
                      )}
                    </button>
                    {!isDefault && (
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => handleSetDefault(model.id)}
                        title="Als Standard setzen"
                      >
                        <FiStar />
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-icon"
                      onClick={() => handleDelete(model.id)}
                      title="Loeschen"
                    >
                      <FiTrash2 />
                    </button>
                  </>
                )}

                {isLoaded && (
                  <>
                    <button className="btn btn-active" disabled>
                      <FiCheck /> Aktiv
                    </button>
                    {!isDefault && (
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => handleSetDefault(model.id)}
                        title="Als Standard setzen"
                      >
                        <FiStar />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredCatalog.length === 0 && (
        <div className="store-empty">
          <FiCpu />
          <p>Keine Modelle gefunden</p>
        </div>
      )}

      {/* Model Detail Modal */}
      {selectedModel && (
        <div className="modal-overlay" onClick={() => setSelectedModel(null)}>
          <div className="modal-content model-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FiCpu /> {selectedModel.name}
              </h2>
              <button className="modal-close" onClick={() => setSelectedModel(null)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p className="model-detail-description">{selectedModel.description}</p>

              <div className="model-detail-specs">
                <div className="detail-spec">
                  <span className="detail-label">Modell-ID</span>
                  <code className="detail-value">{selectedModel.id}</code>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Download-Groesse</span>
                  <span className="detail-value">{formatSize(selectedModel.size_bytes)}</span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">RAM-Bedarf</span>
                  <span className="detail-value">{selectedModel.ram_required_gb} GB</span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Kategorie</span>
                  <span className="detail-value badge badge-category">
                    {sizeConfig[selectedModel.category]?.label}
                  </span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Typ</span>
                  <span className="detail-value badge badge-type">
                    {typeConfig[selectedModel.model_type]?.label || 'LLM'}
                  </span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Performance</span>
                  <span className="detail-value">
                    {selectedModel.performance_tier === 1
                      ? 'Schnell'
                      : selectedModel.performance_tier === 2
                        ? 'Mittel'
                        : 'Langsam'}
                  </span>
                </div>
              </div>

              {selectedModel.capabilities && selectedModel.capabilities.length > 0 && (
                <div className="model-detail-section">
                  <h3>Faehigkeiten</h3>
                  <div className="model-capabilities">
                    {selectedModel.capabilities.map(cap => (
                      <span key={cap} className="capability-tag">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedModel.recommended_for && selectedModel.recommended_for.length > 0 && (
                <div className="model-detail-section">
                  <h3>Empfohlen fuer</h3>
                  <div className="model-capabilities">
                    {selectedModel.recommended_for.map(use => (
                      <span key={use} className="capability-tag recommended">
                        {use}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedModel.ollama_library_url && (
                <div className="model-detail-section">
                  <a
                    href={sanitizeUrl(selectedModel.ollama_library_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    Ollama Library ansehen
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}

export default StoreModels;
