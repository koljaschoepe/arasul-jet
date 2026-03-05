/**
 * StoreDetailModal Component
 * Unified detail modal for both models and apps
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  FiCpu,
  FiPackage,
  FiDownload,
  FiPlay,
  FiSquare,
  FiCheck,
  FiRefreshCw,
  FiExternalLink,
  FiTrash2,
  FiStar,
  FiZap,
  FiX,
} from 'react-icons/fi';
import ConfirmIconButton from '../../components/ui/ConfirmIconButton';
import { sanitizeUrl } from '../../utils/sanitizeUrl';
import { formatModelSize as formatSize } from '../../utils/formatting';

// Size config for model categories
const sizeConfig = {
  small: { label: 'Klein', description: '7-12 GB RAM' },
  medium: { label: 'Mittel', description: '15-25 GB RAM' },
  large: { label: 'Groß', description: '30-40 GB RAM' },
  xlarge: { label: 'Sehr Groß', description: '45+ GB RAM' },
};

// Model type config
const typeConfig = {
  llm: { label: 'LLM' },
  ocr: { label: 'OCR' },
  vision: { label: 'Vision' },
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

function StoreDetailModal({
  type,
  item,
  onClose,
  onAction,
  // Model-specific props
  loadedModel,
  defaultModel,
  isDownloading,
  downloadState,
  activating,
  activatingPercent,
  onDownload,
  onActivate,
  onDelete,
  onSetDefault,
  // App-specific props
  actionLoading,
  onUninstall,
}) {
  if (!item) return null;

  const isModel = type === 'model';

  // Model state
  const isInstalled = isModel && item.install_status === 'available';
  const isLoaded =
    isModel &&
    (loadedModel?.model_id === item.id || loadedModel?.model_id === item.effective_ollama_name);
  const isDefault = isModel && defaultModel === item.id;
  const isActivating = isModel && activating === item.id;
  const modelDownloading = isModel && isDownloading?.(item.id);

  // App state
  const appLoading = !isModel && actionLoading?.[item.id];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content model-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>
            {isModel ? <FiCpu /> : <FiPackage />} {item.name}
            <div className="model-badges" style={{ marginLeft: '0.75rem' }}>
              {isModel && isLoaded && (
                <span className="badge badge-loaded">
                  <FiZap /> Aktiv
                </span>
              )}
              {isModel && isDefault && (
                <span className="badge badge-default">
                  <FiStar /> Standard
                </span>
              )}
              {!isModel && item.status === 'running' && (
                <span className="badge badge-running">
                  <FiZap /> Aktiv
                </span>
              )}
              {!isModel && item.status === 'installed' && (
                <span className="badge badge-installed">Gestoppt</span>
              )}
              {isModel && (
                <span className="badge badge-type">
                  {typeConfig[item.model_type]?.label || 'LLM'}
                </span>
              )}
              {!isModel && <span className="badge badge-category">App</span>}
            </div>
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <p className="model-detail-description">
            {isModel ? item.description : item.longDescription || item.description}
          </p>

          {/* Specs Grid */}
          <div className="model-detail-specs">
            {isModel ? (
              <>
                <div className="detail-spec">
                  <span className="detail-label">Modell-ID</span>
                  <code className="detail-value">{item.id}</code>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Download-Größe</span>
                  <span className="detail-value">{formatSize(item.size_bytes)}</span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">RAM-Bedarf</span>
                  <span className="detail-value">{item.ram_required_gb} GB</span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Kategorie</span>
                  <span className="detail-value badge badge-category">
                    {sizeConfig[item.category]?.label}
                  </span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Typ</span>
                  <span className="detail-value badge badge-type">
                    {typeConfig[item.model_type]?.label || 'LLM'}
                  </span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Performance</span>
                  <span className="detail-value">
                    {item.performance_tier === 1
                      ? 'Schnell'
                      : item.performance_tier === 2
                        ? 'Mittel'
                        : 'Langsam'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="detail-spec">
                  <span className="detail-label">Version</span>
                  <span className="detail-value">v{item.version}</span>
                </div>
                <div className="detail-spec">
                  <span className="detail-label">Kategorie</span>
                  <span className="detail-value">{item.category}</span>
                </div>
                {item.author && (
                  <div className="detail-spec">
                    <span className="detail-label">Autor</span>
                    <span className="detail-value">{item.author}</span>
                  </div>
                )}
                <div className="detail-spec">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    {item.status === 'running'
                      ? 'Aktiv'
                      : item.status === 'installed'
                        ? 'Gestoppt'
                        : item.status === 'error'
                          ? 'Fehler'
                          : 'Verfügbar'}
                  </span>
                </div>
                {item.ports?.external && (
                  <div className="detail-spec">
                    <span className="detail-label">Port</span>
                    <span className="detail-value">{item.ports.external}</span>
                  </div>
                )}
                {item.homepage && (
                  <div className="detail-spec">
                    <span className="detail-label">Homepage</span>
                    <a
                      href={sanitizeUrl(item.homepage)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="detail-link"
                    >
                      {item.homepage}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Capabilities/Tags (Models only) */}
          {isModel && item.capabilities && item.capabilities.length > 0 && (
            <div className="model-detail-section">
              <h3>Fähigkeiten</h3>
              <div className="model-capabilities">
                {item.capabilities.map(cap => (
                  <span key={cap} className="capability-tag">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isModel && item.recommended_for && item.recommended_for.length > 0 && (
            <div className="model-detail-section">
              <h3>Empfohlen für</h3>
              <div className="model-capabilities">
                {item.recommended_for.map(use => (
                  <span key={use} className="capability-tag recommended">
                    {use}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isModel && item.ollama_library_url && (
            <div className="model-detail-section">
              <a
                href={sanitizeUrl(item.ollama_library_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Ollama Library ansehen
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {isModel ? (
            <>
              {/* Model: Download */}
              {!isInstalled && !modelDownloading && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onDownload?.(item.id, item.name)}
                >
                  <FiDownload /> Herunterladen
                </button>
              )}

              {/* Model: Activate + Set Default + Delete */}
              {isInstalled && !isLoaded && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onActivate?.(item.id)}
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
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSetDefault?.(item.id)}
                    >
                      <FiStar /> Als Standard setzen
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onDelete?.(item.id)}
                  >
                    <FiTrash2 /> Löschen
                  </button>
                </>
              )}

              {/* Model: Active */}
              {isLoaded && (
                <>
                  <button type="button" className="btn btn-active" disabled>
                    <FiCheck /> Aktiv
                  </button>
                  {!isDefault && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSetDefault?.(item.id)}
                    >
                      <FiStar /> Als Standard setzen
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* App: Install */}
              {item.status === 'available' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onAction?.(item.id, 'install')}
                  disabled={appLoading}
                >
                  {appLoading === 'install' ? <FiRefreshCw className="spin" /> : <FiDownload />}
                  Installieren
                </button>
              )}

              {/* App: Start + Delete */}
              {item.status === 'installed' && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onAction?.(item.id, 'start')}
                    disabled={appLoading}
                  >
                    {appLoading === 'start' ? <FiRefreshCw className="spin" /> : <FiPlay />}
                    Starten
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      onClose();
                      onUninstall?.(item.id, item.name);
                    }}
                    disabled={appLoading}
                  >
                    <FiTrash2 /> Löschen
                  </button>
                </>
              )}

              {/* App: Open + Stop + Restart */}
              {item.status === 'running' && (
                <>
                  {item.hasCustomPage && item.customPageRoute ? (
                    <Link to={item.customPageRoute} className="btn btn-primary" onClick={onClose}>
                      <FiExternalLink /> Öffnen
                    </Link>
                  ) : (
                    <a
                      href={getAppUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      <FiExternalLink /> Öffnen
                    </a>
                  )}
                  {!item.builtin && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onAction?.(item.id, 'restart')}
                        disabled={appLoading}
                      >
                        <FiRefreshCw /> Neustarten
                      </button>
                      <ConfirmIconButton
                        icon={<FiSquare />}
                        label="Stoppen"
                        confirmText="Stoppen?"
                        onConfirm={() => onAction?.(item.id, 'stop')}
                        variant="danger"
                        disabled={appLoading}
                      />
                    </>
                  )}
                </>
              )}

              {/* App: Error - Restart + Delete */}
              {item.status === 'error' && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onAction?.(item.id, 'start')}
                    disabled={appLoading}
                  >
                    <FiRefreshCw /> Erneut starten
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      onClose();
                      onUninstall?.(item.id, item.name);
                    }}
                    disabled={appLoading}
                  >
                    <FiTrash2 /> Löschen
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoreDetailModal;
