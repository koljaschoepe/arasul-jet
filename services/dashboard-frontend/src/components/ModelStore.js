/**
 * ModelStore Component
 * UI for managing LLM models on Jetson AGX Orin
 * - Browse curated model catalog
 * - Download/install models
 * - Activate/deactivate models (only one in RAM at a time)
 * - Set default model for new chats
 */

import React, { useState, useEffect, useCallback } from 'react';
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
    FiInfo
} from 'react-icons/fi';
import '../modelstore.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

// Category configuration
const categoryConfig = {
    small: { label: 'Klein', color: '#10b981', description: '7-12 GB RAM' },
    medium: { label: 'Mittel', color: '#3b82f6', description: '15-25 GB RAM' },
    large: { label: 'Gross', color: '#8b5cf6', description: '30-40 GB RAM' },
    xlarge: { label: 'Sehr Gross', color: '#ef4444', description: '45+ GB RAM' }
};

// Format bytes to human readable
const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function ModelStore() {
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadedModel, setLoadedModel] = useState(null);
    const [defaultModel, setDefaultModel] = useState(null);
    const [downloading, setDownloading] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [activating, setActivating] = useState(null);
    const [queueByModel, setQueueByModel] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);

    // Get auth token
    const getAuthHeaders = () => {
        const token = localStorage.getItem('arasul_token');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    };

    // Load catalog and status
    const loadData = useCallback(async () => {
        try {
            const headers = getAuthHeaders();

            // Debug: Log API base URL
            console.log('[ModelStore] Loading data from:', API_BASE, 'Host:', window.location.host);

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
                fetchWithCheck(`${API_BASE}/models/default`, 'Default')
            ]);

            // Debug: Log responses
            console.log('[ModelStore] Catalog:', catalogRes.total, 'models');
            console.log('[ModelStore] Status:', statusRes.loaded_model ? statusRes.loaded_model.model_id : 'no model loaded');

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

    // Download model with SSE progress
    const handleDownload = async (modelId) => {
        setDownloading(modelId);
        setDownloadProgress(0);
        setDownloadStatus('Starte Download...');

        try {
            const token = localStorage.getItem('arasul_token');
            const response = await fetch(`${API_BASE}/models/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ model_id: modelId })
            });

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
                            if (data.progress !== undefined) {
                                setDownloadProgress(data.progress);
                            }
                            if (data.status) {
                                setDownloadStatus(data.status);
                            }
                            if (data.done) {
                                if (data.success) {
                                    await loadData();
                                }
                                if (data.error) {
                                    setError(data.error);
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Download error:', err);
            setError(err.message);
        } finally {
            setDownloading(null);
            setDownloadProgress(0);
            setDownloadStatus('');
        }
    };

    // Activate model
    const handleActivate = async (modelId) => {
        setActivating(modelId);
        try {
            const response = await fetch(`${API_BASE}/models/${modelId}/activate`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Aktivierung fehlgeschlagen');
            }
            await loadData();
        } catch (err) {
            console.error('Activation error:', err);
            setError(err.message);
        } finally {
            setActivating(null);
        }
    };

    // Delete model
    const handleDelete = async (modelId) => {
        if (!window.confirm(`Modell "${modelId}" wirklich loeschen? Der Download-Fortschritt geht verloren.`)) return;

        try {
            const response = await fetch(`${API_BASE}/models/${modelId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Loeschen fehlgeschlagen');
            }
            await loadData();
        } catch (err) {
            console.error('Delete error:', err);
            setError(err.message);
        }
    };

    // Set as default
    const handleSetDefault = async (modelId) => {
        try {
            const response = await fetch(`${API_BASE}/models/default`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ model_id: modelId })
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
    const getQueueCount = (modelId) => {
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
                    Verwalte LLM-Modelle fuer deinen Jetson AGX Orin (64 GB RAM)
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
                            {loadedModel.ram_usage_mb ? `${(loadedModel.ram_usage_mb / 1024).toFixed(1)} GB RAM` : 'RAM wird berechnet...'}
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
                    const isLoaded = loadedModel?.model_id === model.id;
                    const isDownloading = downloading === model.id;
                    const isActivating = activating === model.id;
                    const isDefault = defaultModel === model.id;
                    const pendingJobs = getQueueCount(model.id);
                    const category = categoryConfig[model.category] || categoryConfig.medium;

                    return (
                        <div
                            key={model.id}
                            className={`model-card ${isLoaded ? 'active' : ''} ${isInstalled ? 'installed' : ''}`}
                            onClick={() => setSelectedModel(model)}
                        >
                            <div className="model-card-header">
                                <div className="model-icon">
                                    <FiCpu />
                                </div>
                                <div className="model-badges">
                                    {isDefault && (
                                        <span className="badge badge-default" title="Standard-Modell fuer neue Chats">
                                            <FiStar /> Standard
                                        </span>
                                    )}
                                    {isLoaded && (
                                        <span className="badge badge-loaded">
                                            <FiZap /> Aktiv
                                        </span>
                                    )}
                                    {pendingJobs > 0 && (
                                        <span className="badge badge-queue">
                                            {pendingJobs} wartend
                                        </span>
                                    )}
                                    <span
                                        className="badge badge-category"
                                        style={{ backgroundColor: category.color }}
                                        title={category.description}
                                    >
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
                                        <span key={cap} className="capability-tag">{cap}</span>
                                    ))}
                                </div>
                            )}

                            {/* Download Progress */}
                            {isDownloading && (
                                <div className="download-progress" onClick={e => e.stopPropagation()}>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${downloadProgress}%` }}
                                        />
                                    </div>
                                    <div className="progress-info">
                                        <span className="progress-percent">{downloadProgress}%</span>
                                        <span className="progress-status">{downloadStatus}</span>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="model-actions" onClick={e => e.stopPropagation()}>
                                {!isInstalled && !isDownloading && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleDownload(model.id)}
                                    >
                                        <FiDownload /> Herunterladen
                                    </button>
                                )}

                                {isInstalled && !isLoaded && (
                                    <>
                                        <button
                                            className="btn btn-success"
                                            onClick={() => handleActivate(model.id)}
                                            disabled={isActivating}
                                        >
                                            {isActivating ? (
                                                <><FiRefreshCw className="spin" /> Lade...</>
                                            ) : (
                                                <><FiPlay /> Aktivieren</>
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

            {/* Model Detail Modal */}
            {selectedModel && (
                <div className="modal-overlay" onClick={() => setSelectedModel(null)}>
                    <div className="modal-content model-detail-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><FiCpu /> {selectedModel.name}</h2>
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
                                    <span
                                        className="detail-value badge"
                                        style={{ backgroundColor: categoryConfig[selectedModel.category]?.color }}
                                    >
                                        {categoryConfig[selectedModel.category]?.label}
                                    </span>
                                </div>
                                <div className="detail-spec">
                                    <span className="detail-label">Performance-Tier</span>
                                    <span className="detail-value">
                                        {selectedModel.performance_tier === 1 ? 'Schnell' :
                                         selectedModel.performance_tier === 2 ? 'Mittel' : 'Langsam'}
                                    </span>
                                </div>
                            </div>

                            {selectedModel.capabilities && selectedModel.capabilities.length > 0 && (
                                <div className="model-detail-section">
                                    <h3>Faehigkeiten</h3>
                                    <div className="model-capabilities">
                                        {selectedModel.capabilities.map(cap => (
                                            <span key={cap} className="capability-tag">{cap}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedModel.recommended_for && selectedModel.recommended_for.length > 0 && (
                                <div className="model-detail-section">
                                    <h3>Empfohlen fuer</h3>
                                    <div className="model-capabilities">
                                        {selectedModel.recommended_for.map(use => (
                                            <span key={use} className="capability-tag recommended">{use}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedModel.ollama_library_url && (
                                <div className="model-detail-section">
                                    <a
                                        href={selectedModel.ollama_library_url}
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
        </div>
    );
}

export default ModelStore;
