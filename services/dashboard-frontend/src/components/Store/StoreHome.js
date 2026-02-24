/**
 * StoreHome Component
 * Landing page with recommended models and apps
 * Shows 3 model recommendations (based on RAM) + 3 app recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCpu,
  FiGrid,
  FiArrowRight,
  FiDownload,
  FiPlay,
  FiCheck,
  FiStar,
  FiRefreshCw,
  FiZap,
  FiPackage,
  FiExternalLink,
} from 'react-icons/fi';
import { useDownloads } from '../../contexts/DownloadContext';
import { useToast } from '../../contexts/ToastContext';
import { API_BASE, getAuthHeaders } from '../../config/api';

// Format bytes to human readable
const formatSize = bytes => {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function StoreHome({ systemInfo }) {
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
      const headers = getAuthHeaders();

      // Fetch recommendations and model status in parallel
      const [recsRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/store/recommendations`, { headers }),
        fetch(`${API_BASE}/models/status`, { headers }),
      ]);

      if (!recsRes.ok) throw new Error('Fehler beim Laden der Empfehlungen');

      const recsData = await recsRes.json();
      const statusData = statusRes.ok ? await statusRes.json() : {};

      setRecommendations(recsData);
      setLoadedModel(statusData.loaded_model);
      setError(null);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError('Fehler beim Laden der Empfehlungen');
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Handle model activation
  const handleModelActivate = async modelId => {
    setActionLoading(prev => ({ ...prev, [modelId]: 'activating' }));
    try {
      const response = await fetch(`${API_BASE}/models/${modelId}/activate`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Aktivierung fehlgeschlagen');
      await loadRecommendations();
    } catch (err) {
      console.error('Activation error:', err);
      toast.error('Aktivierung fehlgeschlagen');
    } finally {
      setActionLoading(prev => ({ ...prev, [modelId]: null }));
    }
  };

  // Handle app action (install/start)
  const handleAppAction = async (appId, action) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));
    try {
      const response = await fetch(`${API_BASE}/apps/${appId}/${action}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`${action} fehlgeschlagen`);
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
      {/* Models Section */}
      <section className="store-home-section">
        <div className="section-header">
          <h2>
            <FiCpu /> Empfohlene Modelle
          </h2>
          <Link to="/store/models" className="section-link">
            Alle Modelle <FiArrowRight />
          </Link>
        </div>
        <p className="section-subtitle">
          Optimiert für dein System ({systemInfo?.availableRamGB || 64} GB RAM)
        </p>

        <div className="store-home-grid">
          {recommendations.models.slice(0, 3).map(model => {
            const isInstalled = model.install_status === 'available';
            const isLoaded = loadedModel?.model_id === model.id;
            const modelIsDownloading = isDownloading(model.id);
            const downloadState = getDownloadState(model.id);
            const isActivating = actionLoading[model.id] === 'activating';

            return (
              <div
                key={model.id}
                className={`store-home-card model-card ${isLoaded ? 'active' : ''}`}
              >
                <div className="card-header">
                  <div className="card-icon model-icon">
                    <FiCpu />
                  </div>
                  <div className="card-badges">
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

                <h3 className="card-title">{model.name}</h3>
                <p className="card-description">{model.description}</p>

                <div className="card-specs">
                  <span className="spec">{formatSize(model.size_bytes)}</span>
                  <span className="spec">{model.ram_required_gb} GB RAM</span>
                </div>

                {model.capabilities && (
                  <div className="card-tags">
                    {model.capabilities.slice(0, 3).map(cap => (
                      <span key={cap} className="tag">
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

                <div className="card-actions">
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
        </div>
      </section>

      {/* Apps Section */}
      <section className="store-home-section">
        <div className="section-header">
          <h2>
            <FiGrid /> Empfohlene Apps
          </h2>
          <Link to="/store/apps" className="section-link">
            Alle Apps <FiArrowRight />
          </Link>
        </div>
        <p className="section-subtitle">Erweitere dein Arasul-System</p>

        <div className="store-home-grid">
          {recommendations.apps.slice(0, 3).map(app => {
            const isRunning = app.status === 'running';
            const isInstalled = app.status === 'installed';
            const isLoading = actionLoading[app.id];

            return (
              <div key={app.id} className={`store-home-card app-card ${isRunning ? 'active' : ''}`}>
                <div className="card-header">
                  <div className="card-icon app-icon">
                    <FiPackage />
                  </div>
                  <div className="card-badges">
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

                <h3 className="card-title">{app.name}</h3>
                <p className="card-description">{app.description}</p>

                <div className="card-specs">
                  <span className="spec">v{app.version}</span>
                  <span className="spec">{app.category}</span>
                </div>

                <div className="card-actions">
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
