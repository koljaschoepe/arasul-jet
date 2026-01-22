import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  FiSearch,
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
  FiTerminal
} from 'react-icons/fi';
import AppDetailModal from './AppDetailModal';
import ConfirmIconButton from './ConfirmIconButton';
import { API_BASE } from '../config/api';
import '../appstore.css';

// Icon mapping
const iconMap = {
  FiZap: FiZap,
  FiDatabase: FiDatabase,
  FiCode: FiCode,
  FiGitBranch: FiGitBranch,
  FiPackage: FiPackage,
  FiTerminal: FiTerminal
};

// Category labels
const categoryLabels = {
  all: 'Alle',
  development: 'Entwicklung',
  productivity: 'Produktivität',
  ai: 'KI & ML',
  storage: 'Speicher',
  monitoring: 'Monitoring',
  networking: 'Netzwerk'
};

// Get app URL based on port or traefik route
const getAppUrl = (app) => {
  // Apps with custom pages should link internally
  if (app.hasCustomPage && app.customPageRoute) {
    return app.customPageRoute;
  }
  // Apps routed through Traefik path (use same origin, no port)
  const traefikPaths = {
    'n8n': '/n8n'
  };
  if (traefikPaths[app.id]) {
    return `${window.location.origin}${traefikPaths[app.id]}`;
  }
  // Use external port if available
  if (app.ports?.external) {
    return `http://${window.location.hostname}:${app.ports.external}`;
  }
  // Fallback to known ports for direct access
  const knownPorts = {
    'minio': 9001,
    'code-server': 8443,
    'gitea': 3002
  };
  if (knownPorts[app.id]) {
    return `http://${window.location.hostname}:${knownPorts[app.id]}`;
  }
  return '#';
};

// Status configuration - Blue/Gray/White theme
const statusConfig = {
  running: { color: '#45ADFF', label: 'Aktiv', icon: FiCheck },
  installed: { color: '#94a3b8', label: 'Gestoppt', icon: FiClock },
  available: { color: '#64748b', label: 'Verfügbar', icon: FiDownload },
  installing: { color: '#60a5fa', label: 'Installiert...', icon: FiRefreshCw },
  starting: { color: '#60a5fa', label: 'Startet...', icon: FiRefreshCw },
  stopping: { color: '#94a3b8', label: 'Stoppt...', icon: FiRefreshCw },
  uninstalling: { color: '#475569', label: 'Deinstalliert...', icon: FiRefreshCw },
  error: { color: '#475569', label: 'Fehler', icon: FiAlertCircle }
};

function AppStore() {
  const [apps, setApps] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedApp, setSelectedApp] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [uninstallDialog, setUninstallDialog] = useState({ open: false, appId: null, appName: null });

  // Load apps
  const loadApps = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await axios.get(`${API_BASE}/apps?${params.toString()}`);
      setApps(response.data.apps || []);
      setError(null);
    } catch (err) {
      console.error('Error loading apps:', err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  // Load categories
  const loadCategories = async () => {
    try {
      const response = await axios.get(`${API_BASE}/apps/categories`);
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  // Initial load
  useEffect(() => {
    loadApps();
    loadCategories();
  }, [loadApps]);

  // Refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadApps, 5000);
    return () => clearInterval(interval);
  }, [loadApps]);

  // Handle app actions
  const handleAction = async (appId, action, options = {}) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));

    try {
      await axios.post(`${API_BASE}/apps/${appId}/${action}`, options);
      await loadApps();
    } catch (err) {
      console.error(`Error ${action} app ${appId}:`, err);
      // Show dependent apps in error message if available
      const dependentApps = err.response?.data?.dependentApps;
      if (dependentApps && dependentApps.length > 0) {
        alert(`Diese App kann nicht gestoppt werden.\n\nFolgende Apps hängen davon ab:\n- ${dependentApps.join('\n- ')}\n\nBitte stoppen Sie zuerst diese Apps.`);
      } else {
        alert(err.response?.data?.message || `${action} fehlgeschlagen`);
      }
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
    }
  };

  // Open uninstall dialog
  const openUninstallDialog = (appId, appName) => {
    setUninstallDialog({ open: true, appId, appName });
  };

  // Handle uninstall with volume option
  const handleUninstall = async (removeVolumes) => {
    const { appId } = uninstallDialog;
    setUninstallDialog({ open: false, appId: null, appName: null });

    if (appId) {
      await handleAction(appId, 'uninstall', { removeVolumes });
    }
  };

  // Get icon component
  const getIcon = (iconName) => {
    const IconComponent = iconMap[iconName] || FiPackage;
    return <IconComponent />;
  };

  // Get status config
  const getStatusConfig = (status) => {
    return statusConfig[status] || statusConfig.available;
  };

  // Filter apps client-side for instant search
  const filteredApps = apps.filter(app => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        app.name.toLowerCase().includes(search) ||
        app.description.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Render app card
  const renderAppCard = (app) => {
    const status = getStatusConfig(app.status);
    const StatusIcon = status.icon;
    const isLoading = actionLoading[app.id];
    const isSystem = app.appType === 'system';

    return (
      <div
        key={app.id}
        className="app-card"
        onClick={() => setSelectedApp(app)}
      >
        <div className="app-card-header">
          <div className="app-icon">
            {getIcon(app.icon)}
          </div>
          <div className="app-badges">
            {isSystem && (
              <span className="badge badge-system">System</span>
            )}
            <span
              className={`badge badge-status badge-${app.status}`}
            >
              {isLoading ? (
                <FiRefreshCw className="spin" />
              ) : (
                <StatusIcon />
              )}
              {status.label}
            </span>
          </div>
        </div>

        <h3 className="app-name">{app.name}</h3>
        <p className="app-description">{app.description}</p>

        <div className="app-meta">
          <span className="app-version">v{app.version}</span>
          <span className="app-category">
            {categoryLabels[app.category] || app.category}
          </span>
        </div>

        <div className="app-actions" onClick={(e) => e.stopPropagation()}>
          {app.status === 'available' && (
            <button
              className="btn btn-primary"
              onClick={() => handleAction(app.id, 'install')}
              disabled={isLoading}
            >
              {isLoading === 'install' ? (
                <FiRefreshCw className="spin" />
              ) : (
                <FiDownload />
              )}
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
                {isLoading === 'start' ? (
                  <FiRefreshCw className="spin" />
                ) : (
                  <FiPlay />
                )}
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
                <Link
                  to={app.customPageRoute}
                  className="btn btn-primary"
                >
                  <FiExternalLink />
                  Öffnen
                </Link>
              ) : (
                <a
                  href={getAppUrl(app)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  <FiExternalLink />
                  Öffnen
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
                <FiRefreshCw />
                Erneut starten
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

          {(app.status === 'installing' || app.status === 'starting' ||
            app.status === 'stopping' || app.status === 'uninstalling') && (
            <button className="btn btn-disabled" disabled>
              <FiRefreshCw className="spin" />
              {status.label}
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
      <div className="appstore">
        <div className="appstore-loading">
          <FiRefreshCw className="spin" />
          <span>Apps werden geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="appstore">
      {/* Header */}
      <div className="appstore-header">
        <div className="appstore-title">
          <FiPackage />
          <h1>Store</h1>
        </div>

        <div className="appstore-search">
          <FiSearch />
          <input
            type="text"
            placeholder="Apps suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              <FiX />
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div className="appstore-categories">
        <button
          className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          Alle
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="appstore-error">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={loadApps}>Erneut versuchen</button>
        </div>
      )}

      {/* Apps grid */}
      <div className="appstore-grid">
        {filteredApps.length > 0 ? (
          filteredApps.map(renderAppCard)
        ) : (
          <div className="appstore-empty">
            <FiPackage />
            <p>Keine Apps gefunden</p>
          </div>
        )}
      </div>

      {/* App detail modal */}
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

      {/* Uninstall confirmation dialog */}
      {uninstallDialog.open && (
        <div className="modal-overlay" onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}>
          <div className="modal-content uninstall-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FiTrash2 /> App deinstallieren</h3>
              <button
                className="modal-close"
                onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}
              >
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Möchten Sie <strong>{uninstallDialog.appName}</strong> wirklich deinstallieren?
              </p>
              <p className="uninstall-warning">
                <FiAlertCircle /> Wählen Sie, ob die App-Daten behalten oder gelöscht werden sollen:
              </p>
            </div>
            <div className="modal-footer uninstall-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => setUninstallDialog({ open: false, appId: null, appName: null })}
              >
                Abbrechen
              </button>
              <button
                className="btn btn-warning"
                onClick={() => handleUninstall(false)}
              >
                <FiTrash2 /> Nur App entfernen
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleUninstall(true)}
              >
                <FiTrash2 /> App + Daten löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppStore;
