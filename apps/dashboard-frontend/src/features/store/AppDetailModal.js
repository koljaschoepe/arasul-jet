import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sanitizeUrl } from '../../utils/sanitizeUrl';
import {
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
  FiPlus,
  FiMinus,
} from 'react-icons/fi';
import ConfirmIconButton from '../../components/ui/ConfirmIconButton';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { useApi } from '../../hooks/useApi';
import { formatDate } from '../../utils/formatting';

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
  const api = useApi();
  const [expandedSection, setExpandedSection] = useState(null);
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

  const canShowLogs =
    app.status === 'running' || app.status === 'installed' || app.status === 'error';

  // Load logs when section is expanded
  useEffect(() => {
    if (expandedSection === 'logs' && canShowLogs) {
      loadLogs();
    }
  }, [expandedSection, app.id, app.status]);

  // Load events when section is expanded
  useEffect(() => {
    if (expandedSection === 'events') {
      loadEvents();
    }
  }, [expandedSection, app.id]);

  // Load n8n credentials when section is expanded
  useEffect(() => {
    if (expandedSection === 'n8n' && app.hasN8nIntegration) {
      loadN8nCredentials();
    }
  }, [expandedSection, app.id, app.hasN8nIntegration]);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await api.get(`/apps/${app.id}/logs?tail=100`, { showError: false });
      setLogs(data.logs || 'Keine Logs verfügbar');
    } catch (err) {
      setLogs(`Fehler beim Laden der Logs: ${err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const data = await api.get(`/apps/${app.id}/events?limit=20`, { showError: false });
      setEvents(data.events || []);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const loadN8nCredentials = async () => {
    setN8nLoading(true);
    try {
      const data = await api.get(`/apps/${app.id}/n8n-credentials`, { showError: false });
      setN8nCredentials(data.credentials);
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

  const toggleSection = section => {
    setExpandedSection(prev => (prev === section ? null : section));
  };

  const appTitle = (
    <div className="modal-header-left">
      <div className="app-icon-large">{getIcon(app.icon)}</div>
      <div className="app-header-info">
        <span>{app.name}</span>
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
  );

  const appFooter = (
    <>
      {app.status === 'available' && (
        <button
          type="button"
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
            type="button"
            className="btn btn-success btn-large"
            onClick={() => onAction(app.id, 'start')}
            disabled={isLoading}
          >
            {isLoading === 'start' ? <FiRefreshCw className="spin" /> : <FiPlay />}
            Starten
          </button>
          <button
            type="button"
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
            <Link to={app.customPageRoute} className="btn btn-primary btn-large" onClick={onClose}>
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
            type="button"
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
            type="button"
            className="btn btn-primary btn-large"
            onClick={() => onAction(app.id, 'start')}
            disabled={isLoading}
          >
            <FiRefreshCw />
            Erneut starten
          </button>
          <button
            type="button"
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
    </>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={appTitle}
      size="large"
      className="app-detail-modal"
      footer={appFooter}
    >
      <div className="modal-body">
        {/* Description */}
        <p className="model-detail-description">{app.longDescription || app.description}</p>

        {/* Specs Grid */}
        <div className="model-detail-specs">
          <div className="detail-spec">
            <span className="detail-label">Kategorie</span>
            <span className="detail-value">{app.category}</span>
          </div>

          {app.author && (
            <div className="detail-spec">
              <span className="detail-label">Autor</span>
              <span className="detail-value">{app.author}</span>
            </div>
          )}

          {app.homepage && (
            <div className="detail-spec">
              <span className="detail-label">Homepage</span>
              <a
                href={sanitizeUrl(app.homepage)}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-link"
              >
                {app.homepage}
              </a>
            </div>
          )}

          {app.ports?.external && (
            <div className="detail-spec">
              <span className="detail-label">Port</span>
              <span className="detail-value">{app.ports.external}</span>
            </div>
          )}

          {app.requirements?.minRam && (
            <div className="detail-spec">
              <span className="detail-label">Min. RAM</span>
              <span className="detail-value">{app.requirements.minRam}</span>
            </div>
          )}

          {app.installedAt && (
            <div className="detail-spec">
              <span className="detail-label">Installiert am</span>
              <span className="detail-value">{formatDate(app.installedAt)}</span>
            </div>
          )}

          {app.startedAt && (
            <div className="detail-spec">
              <span className="detail-label">Gestartet am</span>
              <span className="detail-value">{formatDate(app.startedAt)}</span>
            </div>
          )}
        </div>

        {/* Error Display */}
        {app.lastError && (
          <div className="store-error">
            <FiAlertCircle />
            <span>{app.lastError}</span>
          </div>
        )}

        {/* Expandable: Logs */}
        {canShowLogs && (
          <div className="model-detail-section">
            <button type="button" className="section-toggle" onClick={() => toggleSection('logs')}>
              <FiTerminal /> Logs
              <span className="toggle-indicator">
                {expandedSection === 'logs' ? <FiMinus /> : <FiPlus />}
              </span>
            </button>
            {expandedSection === 'logs' && (
              <div className="section-expandable">
                <div className="tab-content tab-logs">
                  <div className="logs-header">
                    <span>Container Logs</span>
                    <button
                      type="button"
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
              </div>
            )}
          </div>
        )}

        {/* Expandable: Events */}
        <div className="model-detail-section">
          <button type="button" className="section-toggle" onClick={() => toggleSection('events')}>
            <FiClock /> Verlauf
            <span className="toggle-indicator">
              {expandedSection === 'events' ? <FiMinus /> : <FiPlus />}
            </span>
          </button>
          {expandedSection === 'events' && (
            <div className="section-expandable">
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
                  <EmptyState icon={<FiInfo />} title="Keine Events vorhanden" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expandable: n8n */}
        {app.hasN8nIntegration && (
          <div className="model-detail-section">
            <button type="button" className="section-toggle" onClick={() => toggleSection('n8n')}>
              <FiZap /> n8n Integration
              <span className="toggle-indicator">
                {expandedSection === 'n8n' ? <FiMinus /> : <FiPlus />}
              </span>
            </button>
            {expandedSection === 'n8n' && (
              <div className="section-expandable">
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
                          Verwende diese Credentials in n8n, um {app.name} per SSH zu triggern.
                          Wähle in n8n "Private Key" als Authentifizierungsmethode.
                        </p>

                        <div className="credentials-grid">
                          <div className="credential-item">
                            <label>Host</label>
                            <div className="credential-value">
                              <code>{n8nCredentials.ssh?.host}</code>
                              <button
                                type="button"
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
                                type="button"
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
                                type="button"
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
                              type="button"
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
                            type="button"
                            className="copy-btn"
                            onClick={() =>
                              copyToClipboard(n8nCredentials.exampleCommand, 'command')
                            }
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
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AppDetailModal;
