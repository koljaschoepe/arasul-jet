/**
 * ClaudeCode Component
 * Dedicated page for Claude Code web terminal integration
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  FiTerminal,
  FiSettings,
  FiFolder,
  FiPlay,
  FiRefreshCw,
  FiKey,
  FiAlertCircle,
  FiAlertTriangle,
  FiCheck,
  FiX,
  FiSquare,
  FiMaximize2,
  FiMinimize2
} from 'react-icons/fi';
import '../claudecode.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function ClaudeCode() {
  const [appStatus, setAppStatus] = useState(null);
  const [config, setConfig] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState('');
  const [error, setError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load app status and config
  const loadAppData = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, configRes] = await Promise.all([
        axios.get(`${API_BASE}/apps/claude-code`),
        axios.get(`${API_BASE}/apps/claude-code/config`)
      ]);

      const app = statusRes.data.app || statusRes.data;
      setAppStatus(app);
      setConfig(configRes.data.config || {});

      // Set terminal URL if app is running
      if (app.status === 'running') {
        // Use Traefik route instead of direct port for LAN access support
        const protocol = window.location.protocol;
        setTerminalUrl(`${protocol}//${window.location.host}/terminal/`);
      } else {
        setTerminalUrl('');
      }
    } catch (err) {
      console.error('Error loading Claude Code:', err);
      if (err.response?.status === 404) {
        setError('Claude Code ist nicht installiert. Bitte installiere es zuerst im Store.');
      } else {
        setError('Fehler beim Laden der App-Daten.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppData();
  }, [loadAppData]);

  // Poll for status updates when action is in progress
  useEffect(() => {
    if (actionLoading) {
      const interval = setInterval(loadAppData, 2000);
      return () => clearInterval(interval);
    }
  }, [actionLoading, loadAppData]);

  const saveConfig = async () => {
    try {
      setActionLoading(true);
      setSaveMessage(null);

      // Step 1: Save configuration
      try {
        await axios.post(`${API_BASE}/apps/claude-code/config`, { config });
      } catch (configErr) {
        console.error('Config save error:', configErr);
        const errorMsg = configErr.response?.data?.message || configErr.message || 'Unbekannter Fehler';
        setSaveMessage({ type: 'error', text: `Fehler beim Speichern: ${errorMsg}` });
        return;
      }

      // Step 2: Restart if running to apply new config (async mode - returns immediately)
      if (appStatus?.status === 'running') {
        setSaveMessage({ type: 'success', text: 'Konfiguration gespeichert. Container wird neu erstellt...' });
        try {
          const restartRes = await axios.post(`${API_BASE}/apps/claude-code/restart`, { applyConfig: true });

          if (restartRes.data.async) {
            // Async mode - poll for completion
            setSaveMessage({ type: 'success', text: 'Container wird im Hintergrund neu erstellt. Bitte warten...' });

            // Poll status every 2 seconds for up to 30 seconds
            let attempts = 0;
            const maxAttempts = 15;
            const pollInterval = setInterval(async () => {
              attempts++;
              try {
                const statusRes = await axios.get(`${API_BASE}/apps/claude-code`);
                if (statusRes.data.status === 'running') {
                  clearInterval(pollInterval);
                  setSaveMessage({ type: 'success', text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!' });
                  setTimeout(() => {
                    loadAppData();
                    setSaveMessage(null);
                    setShowSettings(false);
                  }, 2000);
                } else if (statusRes.data.status === 'error') {
                  clearInterval(pollInterval);
                  setSaveMessage({ type: 'error', text: `Fehler: ${statusRes.data.last_error || 'Unbekannter Fehler'}` });
                }
              } catch (pollErr) {
                // Ignore poll errors during restart
              }

              if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                setSaveMessage({ type: 'warning', text: 'Container-Neustart dauert länger als erwartet. Prüfe den Status manuell.' });
                setTimeout(() => {
                  loadAppData();
                  setSaveMessage(null);
                }, 3000);
              }
            }, 2000);
            return; // Don't continue to the normal flow
          } else {
            setSaveMessage({ type: 'success', text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!' });
          }
        } catch (restartErr) {
          console.error('Restart error:', restartErr);
          const restartErrorMsg = restartErr.response?.data?.message || restartErr.message || 'Unbekannter Fehler';
          setSaveMessage({ type: 'warning', text: `Konfiguration gespeichert, aber Neustart fehlgeschlagen: ${restartErrorMsg}` });
          setTimeout(() => {
            loadAppData();
            setSaveMessage(null);
          }, 5000);
          return;
        }
      } else {
        setSaveMessage({ type: 'success', text: 'Konfiguration gespeichert. Starte die App, um die Konfiguration anzuwenden.' });
      }

      // Reload after a short delay
      setTimeout(() => {
        loadAppData();
        setSaveMessage(null);
        setShowSettings(false);
      }, 2000);

    } catch (err) {
      console.error('Error saving config:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Unbekannter Fehler';
      setSaveMessage({ type: 'error', text: `Fehler beim Speichern der Konfiguration: ${errorMsg}` });
    } finally {
      setActionLoading(false);
    }
  };

  const startApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await axios.post(`${API_BASE}/apps/claude-code/start`);

      // Wait a moment for container to start
      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 3000);

    } catch (err) {
      console.error('Error starting app:', err);
      setError('Fehler beim Starten der App.');
      setActionLoading(false);
    }
  };

  const stopApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await axios.post(`${API_BASE}/apps/claude-code/stop`);

      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 2000);

    } catch (err) {
      console.error('Error stopping app:', err);
      setError('Fehler beim Stoppen der App.');
      setActionLoading(false);
    }
  };

  const restartApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await axios.post(`${API_BASE}/apps/claude-code/restart`);

      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 3000);

    } catch (err) {
      console.error('Error restarting app:', err);
      setError('Fehler beim Neustarten der App.');
      setActionLoading(false);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'running': { class: 'status-running', text: 'Läuft' },
      'stopped': { class: 'status-stopped', text: 'Gestoppt' },
      'installed': { class: 'status-installed', text: 'Installiert' },
      'installing': { class: 'status-installing', text: 'Installiert...' },
      'error': { class: 'status-error', text: 'Fehler' }
    };
    const statusInfo = statusMap[status] || { class: 'status-unknown', text: status || 'Unbekannt' };
    return <span className={`claude-status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  if (loading) {
    return (
      <div className="claude-code-page">
        <div className="claude-loading">
          <div className="claude-loading-spinner"></div>
          <p>Lade Claude Code...</p>
        </div>
      </div>
    );
  }

  if (error && !appStatus) {
    return (
      <div className="claude-code-page">
        <div className="claude-error-state">
          <FiAlertCircle className="error-icon" />
          <h2>Claude Code nicht verfügbar</h2>
          <p>{error}</p>
          <a href="/appstore" className="claude-btn claude-btn-primary">
            Zum Store
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`claude-code-page ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="claude-code-header">
        <div className="claude-code-title">
          <FiTerminal className="title-icon" />
          <div className="title-text">
            <h1>Claude Code</h1>
            <span className="title-subtitle">KI-gestützte Programmierung</span>
          </div>
          {getStatusBadge(appStatus?.status)}
        </div>

        <div className="claude-code-actions">
          {appStatus?.status === 'running' && (
            <>
              <button
                className="claude-btn claude-btn-icon"
                onClick={restartApp}
                disabled={actionLoading}
                title="Neustarten"
              >
                <FiRefreshCw className={actionLoading ? 'spinning' : ''} />
              </button>
              <button
                className="claude-btn claude-btn-icon"
                onClick={stopApp}
                disabled={actionLoading}
                title="Stoppen"
              >
                <FiSquare />
              </button>
              <button
                className="claude-btn claude-btn-icon"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
            </>
          )}
          <button
            className={`claude-btn ${showSettings ? 'claude-btn-active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
          >
            <FiSettings /> Einstellungen
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="claude-error-banner">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)}><FiX /></button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="claude-code-settings">
          <h3>Konfiguration</h3>

          <div className="settings-grid">
            <div className="setting-item">
              <label>
                <FiKey /> Anthropic API Key
                <span className="setting-required">*</span>
              </label>
              <input
                type="password"
                value={config.ANTHROPIC_API_KEY?.startsWith('****') ? '' : (config.ANTHROPIC_API_KEY || '')}
                onChange={(e) => setConfig({ ...config, ANTHROPIC_API_KEY: e.target.value })}
                placeholder={config.ANTHROPIC_API_KEY_set ? 'Aktuell gesetzt - zum Ändern neuen Wert eingeben' : 'sk-ant-api03-...'}
                className="setting-input"
              />
              <span className="setting-hint">
                {config.ANTHROPIC_API_KEY_set
                  ? 'API-Key ist gesetzt. Leer lassen um beizubehalten, neuen Wert eingeben zum Ändern.'
                  : 'Dein API-Key von anthropic.com'}
              </span>
            </div>

            <div className="setting-item">
              <label>
                <FiFolder /> Workspace
              </label>
              <select
                value={config.CLAUDE_WORKSPACE || '/workspace/arasul'}
                onChange={(e) => setConfig({ ...config, CLAUDE_WORKSPACE: e.target.value })}
                className="setting-select"
              >
                <option value="/workspace/arasul">Arasul Projekt</option>
                <option value="/workspace/custom">Eigener Workspace</option>
              </select>
              <span className="setting-hint">
                Arbeitsverzeichnis für Claude Code
              </span>
            </div>
          </div>

          <div className="setting-hint" style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(69, 173, 255, 0.1)', borderRadius: '8px' }}>
            <strong>Hinweis:</strong> Claude Code läuft im autonomen Modus (--dangerously-skip-permissions).
            Das Terminal ist ohne Passwort zugänglich.
          </div>

          {saveMessage && (
            <div className={`save-message ${saveMessage.type}`}>
              {saveMessage.type === 'success' ? <FiCheck /> :
               saveMessage.type === 'warning' ? <FiAlertTriangle /> : <FiAlertCircle />}
              {saveMessage.text}
            </div>
          )}

          <div className="settings-actions">
            <button
              className="claude-btn claude-btn-secondary"
              onClick={() => setShowSettings(false)}
            >
              Abbrechen
            </button>
            <button
              className="claude-btn claude-btn-primary"
              onClick={saveConfig}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <FiRefreshCw className="spinning" /> Speichern...
                </>
              ) : (
                <>
                  <FiCheck /> Speichern
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Terminal Area */}
      <div className="claude-code-terminal">
        {!config.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY === '****' ? (
          <div className="terminal-placeholder">
            <div className="placeholder-icon">
              <FiKey />
            </div>
            <h3>API-Key erforderlich</h3>
            <p>Bitte gib deinen Anthropic API-Key in den Einstellungen ein, um Claude Code zu nutzen.</p>
            <button className="claude-btn claude-btn-primary" onClick={() => setShowSettings(true)}>
              <FiSettings /> Einstellungen öffnen
            </button>
          </div>
        ) : appStatus?.status !== 'running' ? (
          <div className="terminal-placeholder">
            <div className="placeholder-icon">
              <FiTerminal />
            </div>
            <h3>Claude Code ist nicht gestartet</h3>
            <p>Klicke auf Starten, um das Terminal zu öffnen.</p>
            <button
              className="claude-btn claude-btn-primary"
              onClick={startApp}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <FiRefreshCw className="spinning" /> Startet...
                </>
              ) : (
                <>
                  <FiPlay /> Starten
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="terminal-wrapper">
            <iframe
              src={terminalUrl}
              title="Claude Code Terminal"
              className="terminal-iframe"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ClaudeCode;
