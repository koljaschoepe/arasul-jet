/**
 * StoreHome Component
 * Landing page with recommended models and apps
 * Shows loaded-model banner + 2 model + 2 app recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCpu,
  FiArrowRight,
  FiDownload,
  FiPlay,
  FiCheck,
  FiStar,
  FiRefreshCw,
  FiZap,
  FiPackage,
  FiExternalLink,
  FiHardDrive,
  FiInfo,
} from 'react-icons/fi';
import { useDownloads } from '../../contexts/DownloadContext';
import { useToast } from '../../contexts/ToastContext';
import { useApi } from '../../hooks/useApi';
import { formatModelSize as formatSize } from '../../utils/formatting';

function StoreHome({ systemInfo }) {
  const api = useApi();
  const toast = useToast();
  const [recommendations, setRecommendations] = useState({ models: [], apps: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedModel, setLoadedModel] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

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
  const handleModelDownload = (modelId, modelName) => {
    startDownload(modelId, modelName);
  };

  // Handle model activation with SSE streaming for progress feedback
  const handleModelActivate = async modelId => {
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
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) throw new Error(data.error);
            } catch (e) {
              if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
            }
          }
        }
      }

      await loadRecommendations();
    } catch (err) {
      console.error('Activation error:', err);
      toast.error(err.message || 'Aktivierung fehlgeschlagen');
    } finally {
      setActionLoading(prev => ({ ...prev, [modelId]: null }));
    }
  };

  // Handle app action (install/start)
  const handleAppAction = async (appId, action) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));
    try {
      await api.post(`/apps/${appId}/${action}`, null, { showError: false });
      await loadRecommendations();
    } catch (err) {
      console.error(`App ${action} error:`, err);
      toast.error('Aktion fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  // Get app URL
  const getAppUrl = app => {
    if (app.hasCustomPage && app.customPageRoute) {
      return app.customPageRoute;
    }
    const traefikPaths = { n8n: '/n8n' };
    if (traefikPaths[app.id]) {
      return `${window.location.origin}${traefikPaths[app.id]}`;
    }
    if (app.ports?.external) {
      return `http://${window.location.hostname}:${app.ports.external}`;
    }
    return '#';
  };

  if (loading) {
    return (
      <div className="store-home-loading">
        <FiRefreshCw className="spin" />
        <span>Lade Empfehlungen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="store-home-error">
        <p>{error}</p>
        <button type="button" onClick={loadRecommendations}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="store-home">
      {/* Loaded Model Banner */}
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

      {/* Recommendations Section */}
      <section className="store-home-section">
        <div className="section-header">
          <h2>
            <FiZap /> Empfohlen fuer dein System
          </h2>
          <div className="section-links">
            <Link to="/store/models" className="section-link">
              Alle Modelle <FiArrowRight />
            </Link>
            <Link to="/store/apps" className="section-link">
              Alle Apps <FiArrowRight />
            </Link>
          </div>
        </div>
        <p className="section-subtitle">Optimiert fuer {systemInfo?.availableRamGB || 64} GB RAM</p>

        <div className="model-grid">
          {/* Model Cards */}
          {recommendations.models.slice(0, 2).map(model => {
            const isInstalled = model.install_status === 'available';
            const isLoaded = loadedModel?.model_id === model.id;
            const modelIsDownloading = isDownloading(model.id);
            const downloadState = getDownloadState(model.id);
            const isActivating = actionLoading[model.id] === 'activating';

            return (
              <div key={model.id} className={`model-card ${isLoaded ? 'active' : ''}`}>
                <div className="model-card-header">
                  <div className="model-icon">
                    <FiCpu />
                  </div>
                  <div className="model-badges">
                    {model.is_default && (
                      <span className="badge badge-default">
                        <FiStar /> Standard
                      </span>
                    )}
                    {isLoaded && (
                      <span className="badge badge-loaded">
                        <FiZap /> Aktiv
                      </span>
                    )}
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
                    <span className="spec-label">RAM</span>
                    <span className="spec-value">{model.ram_required_gb} GB</span>
                  </div>
                </div>

                {model.capabilities && (
                  <div className="model-capabilities">
                    {model.capabilities.slice(0, 3).map(cap => (
                      <span key={cap} className="capability-tag">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                {/* Download Progress */}
                {modelIsDownloading && downloadState && (
                  <div className="download-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${downloadState.progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{downloadState.progress}%</span>
                  </div>
                )}

                <div className="model-actions">
                  {!isInstalled && !modelIsDownloading && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleModelDownload(model.id, model.name)}
                    >
                      <FiDownload /> Herunterladen
                    </button>
                  )}
                  {isInstalled && !isLoaded && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleModelActivate(model.id)}
                      disabled={isActivating}
                    >
                      {isActivating ? (
                        <>
                          <FiRefreshCw className="spin" /> Aktiviere...
                        </>
                      ) : (
                        <>
                          <FiPlay /> Aktivieren
                        </>
                      )}
                    </button>
                  )}
                  {isLoaded && (
                    <button type="button" className="btn btn-active" disabled>
                      <FiCheck /> Aktiv
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* App Cards (in model-card style) */}
          {recommendations.apps.slice(0, 2).map(app => {
            const isRunning = app.status === 'running';
            const isInstalled = app.status === 'installed';
            const isLoading = actionLoading[app.id];

            return (
              <div key={app.id} className={`model-card ${isRunning ? 'active' : ''}`}>
                <div className="model-card-header">
                  <div className="model-icon">
                    <FiPackage />
                  </div>
                  <div className="model-badges">
                    <span className="badge badge-category">App</span>
                    {app.featured && (
                      <span className="badge badge-featured">
                        <FiStar /> Empfohlen
                      </span>
                    )}
                    {isRunning && (
                      <span className="badge badge-running">
                        <FiZap /> Aktiv
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="model-name">{app.name}</h3>
                <p className="model-description">{app.description}</p>

                <div className="model-specs">
                  <div className="spec">
                    <span className="spec-label">Version</span>
                    <span className="spec-value">v{app.version}</span>
                  </div>
                  <div className="spec">
                    <span className="spec-label">Kategorie</span>
                    <span className="spec-value">{app.category}</span>
                  </div>
                </div>

                <div className="model-actions">
                  {app.status === 'available' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleAppAction(app.id, 'install')}
                      disabled={isLoading}
                    >
                      {isLoading === 'install' ? (
                        <>
                          <FiRefreshCw className="spin" /> Installiere...
                        </>
                      ) : (
                        <>
                          <FiDownload /> Installieren
                        </>
                      )}
                    </button>
                  )}
                  {isInstalled && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleAppAction(app.id, 'start')}
                      disabled={isLoading}
                    >
                      {isLoading === 'start' ? (
                        <>
                          <FiRefreshCw className="spin" /> Starte...
                        </>
                      ) : (
                        <>
                          <FiPlay /> Starten
                        </>
                      )}
                    </button>
                  )}
                  {isRunning &&
                    (app.hasCustomPage ? (
                      <Link to={app.customPageRoute} className="btn btn-primary">
                        <FiExternalLink /> Oeffnen
                      </Link>
                    ) : (
                      <a
                        href={getAppUrl(app)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                      >
                        <FiExternalLink /> Oeffnen
                      </a>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default StoreHome;
