import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { sanitizeUrl } from '../utils/sanitizeUrl';
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
  FiHardDrive,
  FiZap,
  FiCopy,
  FiServer,
} from 'react-icons/fi';
import ConfirmIconButton from './ConfirmIconButton';
import { API_BASE } from '../config/api';
import { formatDate } from '../utils/formatting';

// Get app URL based on port or traefik route
const getAppUrl = app => {
  // Apps with custom pages should link internally
  if (app.hasCustomPage && app.customPageRoute) {
    return app.customPageRoute;
  }
  // Apps routed through Traefik path (use same origin, no port)
  const traefikPaths = {
    n8n: '/n8n',
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
    minio: 9001,
    'code-server': 8443,
    gitea: 3002,
  };
  if (knownPorts[app.id]) {
    return `http://${window.location.hostname}:${knownPorts[app.id]}`;
  }
  return '#';
};

function AppDetailModal({
  app,
  onClose,
  onAction,
  onUninstall,
  actionLoading,
  statusConfig,
  getIcon,
}) {
  const [activeTab, setActiveTab] = useState('info');
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [n8nCredentials, setN8nCredentials] = useState(null);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const status = statusConfig[app.status] || statusConfig.available;
  const StatusIcon = status.icon;
  const isLoading = actionLoading[app.id];
  const isSystem = app.appType === 'system';

  // Load logs when tab is selected
  useEffect(() => {
    if (
      activeTab === 'logs' &&
      (app.status === 'running' || app.status === 'installed' || app.status === 'error')
    ) {
      loadLogs();
    }
  }, [activeTab, app.id, app.status]);

  // Load events when tab is selected
  useEffect(() => {
    if (activeTab === 'events') {
      loadEvents();
    }
  }, [activeTab, app.id]);

  // Load n8n credentials when tab is selected
  useEffect(() => {
    if (activeTab === 'n8n' && app.hasN8nIntegration) {
      loadN8nCredentials();
    }
  }, [activeTab, app.id, app.hasN8nIntegration]);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/apps/${app.id}/logs?tail=100`);
      setLogs(response.data.logs || 'Keine Logs verfügbar');
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

  const loadN8nCredentials = async () => {
    setN8nLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/apps/${app.id}/n8n-credentials`);
      setN8nCredentials(response.data.credentials);
    } catch (err) {
      console.error('Error loading n8n credentials:', err);
      setN8nCredentials(null);
    } finally {
      setN8nLoading(false);
    }
  };

  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content app-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="app-icon-large">{getIcon(app.icon)}</div>
            <div className="app-header-info">
              <h2>{app.name}</h2>
              <div className="app-header-meta">
                <span className="version">v{app.version}</span>
                {isSystem && <span className="badge badge-system">System-App</span>}
                <span className="badge badge-status" style={{ backgroundColor: status.color }}>
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
          {app.hasN8nIntegration && (
            <button
              className={`tab ${activeTab === 'n8n' ? 'active' : ''}`}
              onClick={() => setActiveTab('n8n')}
            >
              <FiZap /> n8n
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="modal-body">
          {activeTab === 'info' && (
            <div className="tab-content tab-info">
              <p className="app-long-description">{app.longDescription || app.description}</p>

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
                        href={sanitizeUrl(app.homepage)}
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
                <button className="btn btn-small" onClick={loadLogs} disabled={logsLoading}>
                  <FiRefreshCw className={logsLoading ? 'spin' : ''} />
                  Aktualisieren
                </button>
              </div>
              <pre className="logs-content">{logsLoading ? 'Logs werden geladen...' : logs}</pre>
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
                      <div className="event-time">{formatDate(event.created_at)}</div>
                      <div className={`event-type event-${event.event_type}`}>
                        {event.event_type}
                      </div>
                      <div className="event-message">{event.event_message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">Keine Events vorhanden</div>
              )}
            </div>
          )}

          {activeTab === 'n8n' && (
            <div className="tab-content tab-n8n">
              {n8nLoading ? (
                <div className="loading">
                  <FiRefreshCw className="spin" />
                  Lade n8n-Credentials...
                </div>
              ) : n8nCredentials ? (
                <>
                  <div className="n8n-section">
                    <h4>
                      <FiServer /> SSH Credentials für n8n
                    </h4>
                    <p className="n8n-description">
                      Verwende diese Credentials in n8n, um {app.name} per SSH zu triggern. Wähle in
                      n8n "Private Key" als Authentifizierungsmethode.
                    </p>

                    <div className="credentials-grid">
                      <div className="credential-item">
                        <label>Host</label>
                        <div className="credential-value">
                          <code>{n8nCredentials.ssh?.host}</code>
                          <button
                            className="copy-btn"
                            onClick={() => copyToClipboard(n8nCredentials.ssh?.host, 'host')}
                            title="Kopieren"
                          >
                            {copiedField === 'host' ? <FiCheck /> : <FiCopy />}
                          </button>
                        </div>
                      </div>

                      <div className="credential-item">
                        <label>Port</label>
                        <div className="credential-value">
                          <code>{n8nCredentials.ssh?.port}</code>
                          <button
                            className="copy-btn"
                            onClick={() =>
                              copyToClipboard(String(n8nCredentials.ssh?.port), 'port')
                            }
                            title="Kopieren"
                          >
                            {copiedField === 'port' ? <FiCheck /> : <FiCopy />}
                          </button>
                        </div>
                      </div>

                      <div className="credential-item">
                        <label>Username</label>
                        <div className="credential-value">
                          <code>{n8nCredentials.ssh?.username}</code>
                          <button
                            className="copy-btn"
                            onClick={() =>
                              copyToClipboard(n8nCredentials.ssh?.username, 'username')
                            }
                            title="Kopieren"
                          >
                            {copiedField === 'username' ? <FiCheck /> : <FiCopy />}
                          </button>
                        </div>
                      </div>

                      <div className="credential-item">
                        <label>Passphrase</label>
                        <div className="credential-value">
                          <code className="password-hint">Leer lassen</code>
                        </div>
                      </div>
                    </div>
                  </div>

                  {n8nCredentials.ssh?.privateKey && (
                    <div className="n8n-section">
                      <h4>
                        <FiTerminal /> Private Key
                      </h4>
                      <p className="n8n-description">
                        Kopiere diesen kompletten Key in das "Private Key" Feld in n8n:
                      </p>
                      <div className="private-key-box">
                        <pre>{n8nCredentials.ssh.privateKey}</pre>
                        <button
                          className="copy-btn copy-btn-large"
                          onClick={() =>
                            copyToClipboard(n8nCredentials.ssh.privateKey, 'privateKey')
                          }
                          title="Private Key kopieren"
                        >
                          {copiedField === 'privateKey' ? (
                            <>
                              <FiCheck /> Kopiert!
                            </>
                          ) : (
                            <>
                              <FiCopy /> Key kopieren
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="n8n-section">
                    <h4>
                      <FiTerminal /> Beispiel-Command
                    </h4>
                    <p className="n8n-description">Verwende diesen Command im SSH-Node:</p>
                    <div className="command-box">
                      <code>{n8nCredentials.exampleCommand}</code>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(n8nCredentials.exampleCommand, 'command')}
                        title="Command kopieren"
                      >
                        {copiedField === 'command' ? <FiCheck /> : <FiCopy />}
                      </button>
                    </div>
                  </div>

                  <div className="n8n-section">
                    <h4>
                      <FiInfo /> Anleitung
                    </h4>
                    <ol className="instructions-list">
                      {n8nCredentials.instructions?.map((instruction, index) => (
                        <li key={index}>{instruction}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="n8n-actions">
                    <a
                      href={`http://${window.location.hostname}:5678`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      <FiExternalLink /> n8n öffnen
                    </a>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <FiAlertCircle />
                  <p>n8n-Credentials konnten nicht geladen werden.</p>
                </div>
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
              {isLoading === 'install' ? <FiRefreshCw className="spin" /> : <FiDownload />}
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
                {isLoading === 'start' ? <FiRefreshCw className="spin" /> : <FiPlay />}
                Starten
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  onClose();
                  onUninstall(app.id, app.name);
                }}
                disabled={isLoading}
              >
                <FiTrash2 /> Deinstallieren
              </button>
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
                  App öffnen
                </Link>
              ) : (
                <a
                  href={getAppUrl(app)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-large"
                >
                  <FiExternalLink />
                  App öffnen
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
              <ConfirmIconButton
                icon={<FiSquare />}
                label="Stoppen"
                confirmText="Wirklich stoppen?"
                onConfirm={() => onAction(app.id, 'stop')}
                variant="warning"
                disabled={isLoading}
              />
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
              <button
                className="btn btn-danger"
                onClick={() => {
                  onClose();
                  onUninstall(app.id, app.name);
                }}
                disabled={isLoading}
              >
                <FiTrash2 /> Deinstallieren
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppDetailModal;
