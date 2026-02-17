/**
 * ModelStore Component
 * UI for managing LLM models on Jetson AGX Orin
 * - Browse curated model catalog
 * - Download/install models
 * - Activate/deactivate models (only one in RAM at a time)
 * - Set default model for new chats
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import useConfirm from '../hooks/useConfirm';
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
} from 'react-icons/fi';
import { useDownloads } from '../contexts/DownloadContext';
import { API_BASE, getAuthHeaders } from '../config/api';
import { sanitizeUrl } from '../utils/sanitizeUrl';
import '../modelstore.css';

// Category configuration - neutral per Design System
const categoryConfig = {
  small: { label: 'Klein', color: 'var(--bg-elevated)', description: '7-12 GB RAM' },
  medium: { label: 'Mittel', color: 'var(--bg-elevated)', description: '15-25 GB RAM' },
  large: { label: 'Gross', color: 'var(--bg-elevated)', description: '30-40 GB RAM' },
  xlarge: { label: 'Sehr Gross', color: 'var(--bg-elevated)', description: '45+ GB RAM' },
};

// Format bytes to human readable
const formatSize = bytes => {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function ModelStore() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedModel, setLoadedModel] = useState(null);
  const [defaultModel, setDefaultModel] = useState(null);
  const [activating, setActivating] = useState(null);
  const [activatingProgress, setActivatingProgress] = useState(''); // Loading status text
  const [activatingPercent, setActivatingPercent] = useState(0); // P3-001: Progress percentage
  const [queueByModel, setQueueByModel] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);

  // Global download state from context
  const { startDownload, isDownloading, getDownloadState, onDownloadComplete } = useDownloads();

  // Load catalog and status
  const loadData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();

      // Debug: Log API base URL
      // [ModelStore] Loading data from:', API_BASE, 'Host:', window.location.host);

      // Fetch with explicit error checking
      const fetchWithCheck = async (url, name) => {
        const response = await fetch(url, { headers });
        if (!response.ok) {
          console.error(`[ModelStore] ${name} failed:`, response.status, response.statusText);
          throw new Error(`${name}: ${response.status} ${response.statusText}`);
        }
        return response.json();
      };

      const [catalogRes, statusRes, defaultRes] = await Promise.all([
        fetchWithCheck(`${API_BASE}/models/catalog`, 'Catalog'),
        fetchWithCheck(`${API_BASE}/models/status`, 'Status'),
        fetchWithCheck(`${API_BASE}/models/default`, 'Default'),
      ]);

      // Debug: Log responses
      // [ModelStore] Catalog:', catalogRes.total, 'models');
      // [ModelStore] Status:', statusRes.loaded_model ? statusRes.loaded_model.model_id : 'no model loaded');

      setCatalog(catalogRes.models || []);
      setLoadedModel(statusRes.loaded_model);
      setQueueByModel(statusRes.queue_by_model || []);
      setDefaultModel(defaultRes.default_model);
      setError(null);
    } catch (err) {
      console.error('[ModelStore] Error loading model data:', err);
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

  // Reload data when a download completes
  useEffect(() => {
    const unsubscribe = onDownloadComplete((modelId, success) => {
      // [ModelStore] Download ${success ? 'completed' : 'failed'} for ${modelId}
      loadData();
    });
    return unsubscribe;
  }, [onDownloadComplete, loadData]);

  // Download model using global download context
  // Downloads persist even when navigating away from this page
  const handleDownload = (modelId, modelName) => {
    startDownload(modelId, modelName);
  };

  // ML-002 FIX: Ref to prevent double-click race condition
  const activatingRef = useRef(false);

  // Activate model - improved with progress feedback and double-click protection
  const handleActivate = async modelId => {
    // ML-002: Guard against double-clicks before React re-renders
    if (activatingRef.current) {
      // [ModelStore] Activation already in progress, ignoring click');
      return;
    }
    activatingRef.current = true;

    setActivating(modelId);
    setActivatingProgress('Initialisiere...');
    setActivatingPercent(0);

    try {
      // P3-001: Use SSE streaming for real-time progress
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

              if (data.progress !== undefined) {
                setActivatingPercent(data.progress);
              }
              if (data.message) {
                setActivatingProgress(data.message);
              }
              if (data.error) {
                throw new Error(data.error);
              }
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
      activatingRef.current = false; // ML-002: Reset guard
    }
  };

  // Delete model
  const handleDelete = async modelId => {
    if (
      !(await confirm({
        message: `Modell "${modelId}" wirklich loeschen? Der Download-Fortschritt geht verloren.`,
      }))
    )
      return;

    try {
      const response = await fetch(`${API_BASE}/models/${modelId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Löschen fehlgeschlagen');
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
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Setzen fehlgeschlagen');
      }
      setDefaultModel(modelId);
    } catch (err) {
      console.error('Set default error:', err);
      setError(err.message);
    }
  };

  // Get pending job count for a model
  const getQueueCount = modelId => {
    const entry = queueByModel.find(q => q.model === modelId);
    return entry?.pending_count || 0;
  };

  if (loading) {
    return (
      <div className="model-store">
        <div className="model-store-loading">
          <FiRefreshCw className="spin" />
          <span>Lade Modell-Katalog...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="model-store">
      {/* Header */}
      <div className="model-store-header">
        <div className="model-store-title">
          <FiCpu />
          <h1>KI-Modelle</h1>
        </div>
        <p className="model-store-subtitle">
          Verwalte LLM-Modelle für deinen Jetson AGX Orin (64 GB RAM)
        </p>
      </div>

      {/* Currently loaded model banner */}
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

      {/* Error message */}
      {error && (
        <div className="model-store-error">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)} title="Schliessen">
            <FiX />
          </button>
        </div>
      )}

      {/* Model Grid */}
      <div className="model-grid">
        {catalog.map(model => {
          const isInstalled = model.install_status === 'available';
          const isLoaded =
            loadedModel?.model_id === model.id ||
            loadedModel?.model_id === model.effective_ollama_name;
          const modelIsDownloading = isDownloading(model.id);
          const downloadState = getDownloadState(model.id);
          const isActivating = activating === model.id;
          const isDefault = defaultModel === model.id;
          const pendingJobs = getQueueCount(model.id);
          const category = categoryConfig[model.category] || categoryConfig.medium;

          return (
            <div
              key={model.id}
              className={`model-card ${isLoaded ? 'active' : ''} ${isInstalled ? 'installed' : ''} ${modelIsDownloading ? 'downloading' : ''}`}
              onClick={() => setSelectedModel(model)}
            >
              <div className="model-card-header">
                <div className="model-icon">
                  <FiCpu />
                </div>
                <div className="model-badges">
                  {isDefault && (
                    <span className="badge badge-default" title="Standard-Modell für neue Chats">
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
                  <span className="badge badge-category" title={category.description}>
                    {category.label}
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

              {/* Capabilities */}
              {model.capabilities && model.capabilities.length > 0 && (
                <div className="model-capabilities">
                  {model.capabilities.slice(0, 4).map(cap => (
                    <span key={cap} className="capability-tag">
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              {/* Download Progress - Using global context */}
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
                          <FiRefreshCw className="spin" /> {activatingPercent}% -{' '}
                          {activatingProgress || 'Lade...'}
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
                      title="Löschen"
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
                    {categoryConfig[selectedModel.category]?.label}
                  </span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Performance-Tier</span>
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
                  <h3>Empfohlen für</h3>
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

export default ModelStore;
