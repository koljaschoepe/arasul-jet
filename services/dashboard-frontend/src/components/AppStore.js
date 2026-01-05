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
import '../appstore.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

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
  productivity: 'Produktivitaet',
  ai: 'KI & ML',
  storage: 'Speicher',
  monitoring: 'Monitoring',
  networking: 'Netzwerk'
};

// Status configuration - Blue/Gray/White theme
const statusConfig = {
  running: { color: '#45ADFF', label: 'Aktiv', icon: FiCheck },
  installed: { color: '#94a3b8', label: 'Gestoppt', icon: FiClock },
  available: { color: '#64748b', label: 'Verfuegbar', icon: FiDownload },
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
  const handleAction = async (appId, action) => {
    setActionLoading(prev => ({ ...prev, [appId]: action }));

    try {
      await axios.post(`${API_BASE}/apps/${appId}/${action}`);
      await loadApps();
    } catch (err) {
      console.error(`Error ${action} app ${appId}:`, err);
      alert(err.response?.data?.message || `${action} fehlgeschlagen`);
    } finally {
      setActionLoading(prev => ({ ...prev, [appId]: null }));
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
              style={{ backgroundColor: status.color }}
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
              {!isSystem && (
                <button
                  className="btn btn-danger btn-icon"
                  onClick={() => handleAction(app.id, 'uninstall')}
                  disabled={isLoading}
                  title="Deinstallieren"
                >
                  <FiTrash2 />
                </button>
              )}
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
                  Oeffnen
                </Link>
              ) : app.traefikRoute && (
                <a
                  href={app.traefikRoute.replace("PathPrefix(`", "").replace("`)", "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  <FiExternalLink />
                  Oeffnen
                </a>
              )}
              {!isSystem && (
                <button
                  className="btn btn-warning"
                  onClick={() => handleAction(app.id, 'stop')}
                  disabled={isLoading}
                >
                  {isLoading === 'stop' ? (
                    <FiRefreshCw className="spin" />
                  ) : (
                    <FiSquare />
                  )}
                  Stoppen
                </button>
              )}
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
              {!isSystem && (
                <button
                  className="btn btn-danger btn-icon"
                  onClick={() => handleAction(app.id, 'uninstall')}
                  disabled={isLoading}
                  title="Deinstallieren"
                >
                  <FiTrash2 />
                </button>
              )}
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
          actionLoading={actionLoading}
          statusConfig={statusConfig}
          getIcon={getIcon}
        />
      )}
    </div>
  );
}

export default AppStore;
