/**
 * StoreApps Component
 * Apps catalog with simplified filters (Empfohlen/Alle)
 * Based on the original AppStore component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../../contexts/ToastContext';
import {
  FiPackage,
  FiDownload,
  FiPlay,
  FiSquare,
  FiRefreshCw,
  FiExternalLink,
  FiTrash2,
  FiAlertCircle,
  FiCheck,
  FiClock,
  FiZap,
  FiDatabase,
  FiCode,
  FiGitBranch,
  FiX,
  FiTerminal,
  FiStar,
} from 'react-icons/fi';
import AppDetailModal from '../AppDetailModal';
import ConfirmIconButton from '../ConfirmIconButton';
import { API_BASE } from '../../config/api';

// Icon mapping
const iconMap = {
  FiZap: FiZap,
  FiDatabase: FiDatabase,
  FiCode: FiCode,
  FiGitBranch: FiGitBranch,
  FiPackage: FiPackage,
  FiTerminal: FiTerminal,
};

// Featured apps
const FEATURED_APPS = ['n8n', 'telegram-bot', 'claude-code'];

// Category labels
const categoryLabels = {
  development: 'Entwicklung',
  productivity: 'Produktivitaet',
  ai: 'KI & ML',
  storage: 'Speicher',
  monitoring: 'Monitoring',
  networking: 'Netzwerk',
};

// Status configuration - uses CSS variables from Design System
const statusConfig = {
  running: { color: 'var(--primary-color)', label: 'Aktiv', icon: FiCheck },
  installed: { color: 'var(--status-neutral)', label: 'Gestoppt', icon: FiClock },
  available: { color: 'var(--text-disabled)', label: 'Verfuegbar', icon: FiDownload },
  installing: { color: 'var(--primary-light)', label: 'Installiert...', icon: FiRefreshCw },
  starting: { color: 'var(--primary-light)', label: 'Startet...', icon: FiRefreshCw },
  stopping: { color: 'var(--status-neutral)', label: 'Stoppt...', icon: FiRefreshCw },
  uninstalling: { color: 'var(--text-disabled)', label: 'Deinstalliert...', icon: FiRefreshCw },
  error: { color: 'var(--text-disabled)', label: 'Fehler', icon: FiAlertCircle },
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
  const knownPorts = {
    minio: 9001,
    'code-server': 8443,
    gitea: 3002,
  };
  if (knownPorts[app.id]) {
    return `http://${window.location.hostname}:${knownPorts[app.id]}`;
  }
  return '#';
};

function StoreApps() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const toast = useToast();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('recommended'); // 'recommended' or 'all'
  const [selectedApp, setSelectedApp] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [uninstallDialog, setUninstallDialog] = useState({
    open: false,
    appId: null,
    appName: null,
  });

  // Load apps
  const loadApps = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/apps`);
      setApps(response.data.apps || []);
      setError(null);
    } catch (err) {
      console.error('Error loading apps:', err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadApps, 5000);
    return () => clearInterval(interval);
  }, [loadApps]);

  // Highlight app from search
  useEffect(() => {
    if (highlightId && apps.length > 0) {
      const app = apps.find(a => a.id === highlightId);
      if (app) {
        setSelectedApp(app);
      }
    }
  }, [highlightId, apps]);

  // Handle app actions
  const handleAction = async (appId, action, options = {}) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));

    try {
      await axios.post(`${API_BASE}/apps/${appId}/${action}`, options);
      await loadApps();
    } catch (err) {
      console.error(`Error ${action} app ${appId}:`, err);
      const dependentApps = err.response?.data?.dependentApps;
      if (dependentApps && dependentApps.length > 0) {
        toast.warning(
          `Diese App kann nicht gestoppt werden. Folgende Apps haengen davon ab: ${dependentApps.join(', ')}`
        );
      } else {
        toast.error(err.response?.data?.message || `${action} fehlgeschlagen`);
      }
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  // Uninstall dialog
  const openUninstallDialog = (appId, appName) => {
    setUninstallDialog({ open: true, appId, appName });
  };

  const handleUninstall = async removeVolumes => {
    const { appId } = uninstallDialog;
    setUninstallDialog({ open: false, appId: null, appName: null });
    if (appId) {
      await handleAction(appId, 'uninstall', { removeVolumes });
    }
  };

  // Get icon component
  const getIcon = iconName => {
    const IconComponent = iconMap[iconName] || FiPackage;
    return <IconComponent />;
  };

  // Get status config
  const getStatusConfig = status => {
    return statusConfig[status] || statusConfig.available;
  };

  // Filter apps
  const filteredApps = apps.filter(app => {
    if (filter === 'recommended') {
      return FEATURED_APPS.includes(app.id) || app.featured;
    }
    return true;
  });

  // Render app card
  const renderAppCard = app => {
    const status = getStatusConfig(app.status);
    const StatusIcon = status.icon;
    const isLoading = actionLoading[app.id];
    const isSystem = app.appType === 'system';
    const isFeatured = FEATURED_APPS.includes(app.id) || app.featured;

    return (
      <div
        key={app.id}
        className={`app-card ${app.status === 'running' ? 'active' : ''}`}
        onClick={() => setSelectedApp(app)}
      >
        <div className="app-card-header">
          <div className="app-icon">{getIcon(app.icon)}</div>
          <div className="app-badges">
            {isFeatured && (
              <span className="badge badge-featured">
                <FiStar /> Empfohlen
              </span>
            )}
            {isSystem && <span className="badge badge-system">System</span>}
            <span className={`badge badge-status badge-${app.status}`}>
              {isLoading ? <FiRefreshCw className="spin" /> : <StatusIcon />}
              {status.label}
            </span>
          </div>
        </div>

        <h3 className="app-name">{app.name}</h3>
        <p className="app-description">{app.description}</p>

        <div className="app-meta">
          <span className="app-version">v{app.version}</span>
          <span className="app-category">{categoryLabels[app.category] || app.category}</span>
        </div>

        <div className="app-actions" onClick={e => e.stopPropagation()}>
          {app.status === 'available' && (
            <button
              className="btn btn-primary"
              onClick={() => handleAction(app.id, 'install')}
              disabled={isLoading}
            >
              {isLoading === 'install' ? <FiRefreshCw className="spin" /> : <FiDownload />}
              Installieren
            </button>
          )}

          {app.status === 'installed' && (
            <>
              <button
                className="btn btn-success"
                onClick={() => handleAction(app.id, 'start')}
                disabled={isLoading}
              >
                {isLoading === 'start' ? <FiRefreshCw className="spin" /> : <FiPlay />}
                Starten
              </button>
              <button
                className="btn btn-danger btn-icon"
                onClick={() => openUninstallDialog(app.id, app.name)}
                disabled={isLoading}
                title="Deinstallieren"
              >
                <FiTrash2 />
              </button>
            </>
          )}

          {app.status === 'running' && (
            <>
              {app.hasCustomPage && app.customPageRoute ? (
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
              )}
              <ConfirmIconButton
                icon={<FiSquare />}
                label="Stoppen"
                confirmText="Stoppen?"
                onConfirm={() => handleAction(app.id, 'stop')}
                variant="warning"
                disabled={isLoading}
              />
            </>
          )}

          {app.status === 'error' && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => handleAction(app.id, 'start')}
                disabled={isLoading}
              >
                <FiRefreshCw /> Erneut starten
              </button>
              <button
                className="btn btn-danger btn-icon"
                onClick={() => openUninstallDialog(app.id, app.name)}
                disabled={isLoading}
                title="Deinstallieren"
              >
                <FiTrash2 />
              </button>
            </>
          )}

          {(app.status === 'installing' ||
            app.status === 'starting' ||
            app.status === 'stopping' ||
            app.status === 'uninstalling') && (
            <button className="btn btn-disabled" disabled>
              <FiRefreshCw className="spin" /> {status.label}
            </button>
          )}
        </div>

        {app.lastError && (
          <div className="app-error">
            <FiAlertCircle />
            {app.lastError}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="store-apps-loading">
        <FiRefreshCw className="spin" />
        <span>Apps werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="store-apps">
      {/* Error */}
      {error && (
        <div className="store-error">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={loadApps}>Erneut versuchen</button>
        </div>
      )}

      {/* Filter */}
      <div className="store-filters">
        <div className="filter-group">
          <div className="filter-chips">
            <button
              className={`filter-chip ${filter === 'recommended' ? 'active' : ''}`}
              onClick={() => setFilter('recommended')}
            >
              <FiStar /> Empfohlen
            </button>
            <button
              className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              Alle
            </button>
          </div>
        </div>
      </div>

      {/* Apps Grid */}
      <div className="app-grid">
        {filteredApps.length > 0 ? (
          filteredApps.map(renderAppCard)
        ) : (
          <div className="store-empty">
            <FiPackage />
            <p>Keine Apps gefunden</p>
          </div>
        )}
      </div>

      {/* App Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onAction={handleAction}
          onUninstall={openUninstallDialog}
          actionLoading={actionLoading}
          statusConfig={statusConfig}
          getIcon={getIcon}
        />
      )}

      {/* Uninstall Dialog */}
      {uninstallDialog.open && (
        <div
          className="modal-overlay"
          onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}
        >
          <div className="modal-content uninstall-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FiTrash2 /> App deinstallieren
              </h3>
              <button
                className="modal-close"
                onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}
              >
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Moechten Sie <strong>{uninstallDialog.appName}</strong> wirklich deinstallieren?
              </p>
              <p className="uninstall-warning">
                <FiAlertCircle /> Waehlen Sie, ob die App-Daten behalten oder geloescht werden
                sollen:
              </p>
            </div>
            <div className="modal-footer uninstall-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}
              >
                Abbrechen
              </button>
              <button className="btn btn-warning" onClick={() => handleUninstall(false)}>
                <FiTrash2 /> Nur App entfernen
              </button>
              <button className="btn btn-danger" onClick={() => handleUninstall(true)}>
                <FiTrash2 /> App + Daten loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StoreApps;
