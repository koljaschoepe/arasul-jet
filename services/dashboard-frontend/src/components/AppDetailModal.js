import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  FiX,
  FiDownload,
  FiPlay,
  FiSquare,
  FiRefreshCw,
  FiExternalLink,
  FiTrash2,
  FiTerminal,
  FiAlertCircle,
  FiCheck,
  FiClock,
  FiInfo,
  FiGlobe,
  FiCpu,
  FiHardDrive
} from 'react-icons/fi';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function AppDetailModal({ app, onClose, onAction, actionLoading, statusConfig, getIcon }) {
  const [activeTab, setActiveTab] = useState('info');
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const status = statusConfig[app.status] || statusConfig.available;
  const StatusIcon = status.icon;
  const isLoading = actionLoading[app.id];
  const isSystem = app.appType === 'system';

  // Load logs when tab is selected
  useEffect(() => {
    if (activeTab === 'logs' && (app.status === 'running' || app.status === 'installed' || app.status === 'error')) {
      loadLogs();
    }
  }, [activeTab, app.id, app.status]);

  // Load events when tab is selected
  useEffect(() => {
    if (activeTab === 'events') {
      loadEvents();
    }
  }, [activeTab, app.id]);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/apps/${app.id}/logs?tail=100`);
      setLogs(response.data.logs || 'Keine Logs verfuegbar');
    } catch (err) {
      setLogs(`Fehler beim Laden der Logs: ${err.response?.data?.message || err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/apps/${app.id}/events?limit=20`);
      setEvents(response.data.events || []);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content app-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="app-icon-large">
              {getIcon(app.icon)}
            </div>
            <div className="app-header-info">
              <h2>{app.name}</h2>
              <div className="app-header-meta">
                <span className="version">v{app.version}</span>
                {isSystem && <span className="badge badge-system">System-App</span>}
                <span
                  className="badge badge-status"
                  style={{ backgroundColor: status.color }}
                >
                  <StatusIcon />
                  {status.label}
                </span>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <FiInfo /> Info
          </button>
          {(app.status === 'running' || app.status === 'installed' || app.status === 'error') && (
            <button
              className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              <FiTerminal /> Logs
            </button>
          )}
          <button
            className={`tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            <FiClock /> Verlauf
          </button>
        </div>

        {/* Tab content */}
        <div className="modal-body">
          {activeTab === 'info' && (
            <div className="tab-content tab-info">
              <p className="app-long-description">
                {app.longDescription || app.description}
              </p>

              <div className="info-grid">
                <div className="info-item">
                  <FiInfo />
                  <div>
                    <span className="label">Kategorie</span>
                    <span className="value">{app.category}</span>
                  </div>
                </div>

                {app.author && (
                  <div className="info-item">
                    <FiInfo />
                    <div>
                      <span className="label">Autor</span>
                      <span className="value">{app.author}</span>
                    </div>
                  </div>
                )}

                {app.homepage && (
                  <div className="info-item">
                    <FiGlobe />
                    <div>
                      <span className="label">Homepage</span>
                      <a
                        href={app.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="value link"
                      >
                        {app.homepage}
                      </a>
                    </div>
                  </div>
                )}

                {app.ports?.external && (
                  <div className="info-item">
                    <FiHardDrive />
                    <div>
                      <span className="label">Port</span>
                      <span className="value">{app.ports.external}</span>
                    </div>
                  </div>
                )}

                {app.requirements?.minRam && (
                  <div className="info-item">
                    <FiCpu />
                    <div>
                      <span className="label">Min. RAM</span>
                      <span className="value">{app.requirements.minRam}</span>
                    </div>
                  </div>
                )}

                {app.installedAt && (
                  <div className="info-item">
                    <FiDownload />
                    <div>
                      <span className="label">Installiert am</span>
                      <span className="value">{formatDate(app.installedAt)}</span>
                    </div>
                  </div>
                )}

                {app.startedAt && (
                  <div className="info-item">
                    <FiPlay />
                    <div>
                      <span className="label">Gestartet am</span>
                      <span className="value">{formatDate(app.startedAt)}</span>
                    </div>
                  </div>
                )}
              </div>

              {app.lastError && (
                <div className="error-box">
                  <FiAlertCircle />
                  <div>
                    <span className="label">Letzter Fehler</span>
                    <span className="value">{app.lastError}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="tab-content tab-logs">
              <div className="logs-header">
                <span>Container Logs</span>
                <button
                  className="btn btn-small"
                  onClick={loadLogs}
                  disabled={logsLoading}
                >
                  <FiRefreshCw className={logsLoading ? 'spin' : ''} />
                  Aktualisieren
                </button>
              </div>
              <pre className="logs-content">
                {logsLoading ? 'Logs werden geladen...' : logs}
              </pre>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="tab-content tab-events">
              {eventsLoading ? (
                <div className="loading">
                  <FiRefreshCw className="spin" />
                  Events werden geladen...
                </div>
              ) : events.length > 0 ? (
                <div className="events-list">
                  {events.map((event, index) => (
                    <div key={index} className="event-item">
                      <div className="event-time">
                        {formatDate(event.created_at)}
                      </div>
                      <div className={`event-type event-${event.event_type}`}>
                        {event.event_type}
                      </div>
                      <div className="event-message">
                        {event.event_message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">Keine Events vorhanden</div>
              )}
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="modal-footer">
          {app.status === 'available' && (
            <button
              className="btn btn-primary btn-large"
              onClick={() => onAction(app.id, 'install')}
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
                className="btn btn-success btn-large"
                onClick={() => onAction(app.id, 'start')}
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
                  className="btn btn-danger"
                  onClick={() => onAction(app.id, 'uninstall')}
                  disabled={isLoading}
                >
                  <FiTrash2 />
                  Deinstallieren
                </button>
              )}
            </>
          )}

          {app.status === 'running' && (
            <>
              {app.hasCustomPage && app.customPageRoute ? (
                <Link
                  to={app.customPageRoute}
                  className="btn btn-primary btn-large"
                  onClick={onClose}
                >
                  <FiExternalLink />
                  App oeffnen
                </Link>
              ) : app.traefikRoute && (
                <a
                  href={app.traefikRoute.replace("PathPrefix(`", "").replace("`)", "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-large"
                >
                  <FiExternalLink />
                  App oeffnen
                </a>
              )}
              <button
                className="btn btn-warning"
                onClick={() => onAction(app.id, 'restart')}
                disabled={isLoading}
              >
                <FiRefreshCw />
                Neustarten
              </button>
              {!isSystem && (
                <button
                  className="btn btn-danger"
                  onClick={() => onAction(app.id, 'stop')}
                  disabled={isLoading}
                >
                  <FiSquare />
                  Stoppen
                </button>
              )}
            </>
          )}

          {app.status === 'error' && (
            <>
              <button
                className="btn btn-primary btn-large"
                onClick={() => onAction(app.id, 'start')}
                disabled={isLoading}
              >
                <FiRefreshCw />
                Erneut starten
              </button>
              {!isSystem && (
                <button
                  className="btn btn-danger"
                  onClick={() => onAction(app.id, 'uninstall')}
                  disabled={isLoading}
                >
                  <FiTrash2 />
                  Deinstallieren
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppDetailModal;
