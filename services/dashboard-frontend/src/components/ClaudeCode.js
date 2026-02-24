/**
 * ClaudeCode Component
 * Dedicated page for Claude Code web terminal integration
 * Features First-Time Setup Wizard and Dynamic Workspace Management
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useConfirm from '../hooks/useConfirm';
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
  FiMinimize2,
  FiChevronRight,
  FiChevronLeft,
  FiExternalLink,
  FiCpu,
  FiZap,
  FiPlus,
  FiTrash2,
  FiStar,
  FiEdit2,
  FiUser,
  FiLogIn,
  FiClock,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import Modal from './Modal';
import '../claudecode.css';

// Workspace Manager Modal Component
function WorkspaceManager({
  workspaces,
  onClose,
  onWorkspaceCreated,
  onWorkspaceDeleted,
  onSetDefault,
}) {
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog: WorkspaceConfirmDialog } = useConfirm();
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('/home/arasul/');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreate = async e => {
    e.preventDefault();
    if (!newName.trim() || !newPath.trim()) {
      setError('Name und Pfad sind erforderlich');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: newName.trim(),
          hostPath: newPath.trim(),
          description: newDescription.trim(),
        }),
      });
      const data = await response.json();

      onWorkspaceCreated(data.workspace);
      toast.success('Workspace erstellt');
      setNewName('');
      setNewPath('/home/arasul/');
      setNewDescription('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err.message || 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async workspace => {
    if (!(await showConfirm({ message: `Workspace "${workspace.name}" wirklich löschen?` }))) {
      return;
    }

    try {
      await fetch(`${API_BASE}/workspaces/${workspace.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      onWorkspaceDeleted(workspace.id);
      toast.success('Workspace gelöscht');
    } catch (err) {
      setError(err.message || 'Fehler beim Löschen');
    }
  };

  const handleSetDefault = async workspace => {
    try {
      await fetch(`${API_BASE}/workspaces/${workspace.id}/default`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      onSetDefault(workspace.id);
      toast.success('Standard-Workspace geändert');
    } catch (err) {
      setError(err.message || 'Fehler beim Setzen des Standards');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <>
          <FiFolder /> Workspace-Verwaltung
        </>
      }
      size="medium"
      className="workspace-manager-wrapper"
    >
      {error && (
        <div className="workspace-error">
          <FiAlertCircle /> {error}
          <button type="button" onClick={() => setError(null)}>
            <FiX />
          </button>
        </div>
      )}

      <div className="workspace-list">
        {workspaces.map(ws => (
          <div key={ws.id} className={`workspace-item ${ws.is_default ? 'default' : ''}`}>
            <div className="workspace-item-info">
              <div className="workspace-item-name">
                {ws.is_default && <FiStar className="default-star" title="Standard-Workspace" />}
                {ws.name}
                {ws.is_system && <span className="system-badge">System</span>}
              </div>
              <div className="workspace-item-path">
                <code>{ws.host_path}</code>
              </div>
              {ws.description && <div className="workspace-item-desc">{ws.description}</div>}
            </div>
            <div className="workspace-item-actions">
              {!ws.is_default && (
                <button
                  type="button"
                  className="ws-action-btn"
                  onClick={() => handleSetDefault(ws)}
                  title="Als Standard setzen"
                >
                  <FiStar />
                </button>
              )}
              {!ws.is_system && !ws.is_default && (
                <button
                  type="button"
                  className="ws-action-btn delete"
                  onClick={() => handleDelete(ws)}
                  title="Löschen"
                >
                  <FiTrash2 />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!showCreateForm ? (
        <button type="button" className="workspace-add-btn" onClick={() => setShowCreateForm(true)}>
          <FiPlus /> Neuen Workspace erstellen
        </button>
      ) : (
        <form className="workspace-create-form" onSubmit={handleCreate}>
          <h3>Neuen Workspace erstellen</h3>

          <div className="form-group">
            <label htmlFor="ws-name">Name *</label>
            <input
              id="ws-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Mein Projekt"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="ws-path">Host-Pfad *</label>
            <input
              id="ws-path"
              type="text"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="/home/arasul/mein-projekt"
              required
            />
            <span className="form-hint">
              Absoluter Pfad auf dem Jetson (wird erstellt falls nicht vorhanden)
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="ws-desc">Beschreibung</label>
            <input
              id="ws-desc"
              type="text"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Kurze Beschreibung des Projekts"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => setShowCreateForm(false)}>
              Abbrechen
            </button>
            <button type="submit" className="btn-create" disabled={creating}>
              {creating ? (
                <>
                  <FiRefreshCw className="spinning" /> Erstellen...
                </>
              ) : (
                <>
                  <FiPlus /> Erstellen
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="workspace-manager-footer">
        <p>
          <FiAlertTriangle /> Nach dem Erstellen eines neuen Workspace muss Claude Code neu
          gestartet werden, damit der Workspace verfügbar ist.
        </p>
      </div>
      <WorkspaceConfirmDialog />
    </Modal>
  );
}

// Setup Wizard Component
function SetupWizard({
  config,
  setConfig,
  onComplete,
  onSkip,
  workspaces,
  onOpenWorkspaceManager,
}) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const totalSteps = 3;

  // Set default workspace when workspaces are loaded
  useEffect(() => {
    if (workspaces.length > 0 && !workspace) {
      const defaultWs = workspaces.find(ws => ws.is_default);
      setWorkspace(defaultWs ? defaultWs.container_path : workspaces[0].container_path);
    }
  }, [workspaces, workspace]);

  const handleApiKeyChange = e => {
    setApiKey(e.target.value);
    setError(null);
  };

  const validateApiKey = () => {
    if (!apiKey || apiKey.trim() === '') {
      setError('Bitte gib deinen Anthropic API-Key ein.');
      return false;
    }
    if (!apiKey.startsWith('sk-ant-')) {
      setError('Ungültiges API-Key Format. Der Key sollte mit "sk-ant-" beginnen.');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 1 && !validateApiKey()) {
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    setStep(step - 1);
  };

  const completeSetup = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save configuration
      const newConfig = {
        ANTHROPIC_API_KEY: apiKey,
        CLAUDE_WORKSPACE: workspace,
      };

      await fetch(`${API_BASE}/apps/claude-code/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ config: newConfig }),
      });

      // Start the app
      await fetch(`${API_BASE}/apps/claude-code/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      // Mark workspace as used
      const selectedWs = workspaces.find(ws => ws.container_path === workspace);
      if (selectedWs) {
        try {
          await fetch(`${API_BASE}/workspaces/${selectedWs.id}/use`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });
        } catch (e) {
          // Non-critical
        }
      }

      // Complete setup
      onComplete();
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Fehler bei der Einrichtung. Bitte versuche es erneut.');
      setSaving(false);
    }
  };

  const getWorkspaceName = containerPath => {
    const ws = workspaces.find(w => w.container_path === containerPath);
    return ws ? ws.name : containerPath;
  };

  return (
    <div className="setup-wizard">
      <div className="setup-wizard-container">
        {/* Progress Bar */}
        <div className="setup-progress">
          <div className="setup-progress-bar" style={{ width: `${(step / totalSteps) * 100}%` }} />
          <div className="setup-progress-steps">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`setup-progress-step ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}
              >
                {step > s ? <FiCheck /> : s}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="setup-content">
          {step === 1 && (
            <div className="setup-step">
              <div className="setup-icon">
                <FiZap />
              </div>
              <h2>Willkommen bei Claude Code</h2>
              <p className="setup-description">
                Claude Code ist ein KI-Programmierassistent, der direkt in deinem Browser läuft. Um
                loszulegen, benötigst du einen Anthropic API-Key.
              </p>

              <div className="setup-form">
                <label htmlFor="setup-api-key" className="setup-label">
                  <FiKey /> Anthropic API Key
                </label>
                <input
                  id="setup-api-key"
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="sk-ant-api03-..."
                  className={`setup-input ${error ? 'error' : ''}`}
                  autoFocus
                />
                {error && (
                  <span className="setup-error">
                    <FiAlertCircle /> {error}
                  </span>
                )}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="setup-link"
                >
                  <FiExternalLink /> API-Key bei Anthropic erstellen
                </a>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-step">
              <div className="setup-icon">
                <FiFolder />
              </div>
              <h2>Workspace auswählen</h2>
              <p className="setup-description">
                Wähle das Verzeichnis, in dem Claude Code arbeiten soll.
              </p>

              <div className="setup-form">
                <div className="workspace-options">
                  {workspaces.map(ws => (
                    <div
                      key={ws.id}
                      className={`workspace-option ${workspace === ws.container_path ? 'selected' : ''}`}
                      onClick={() => setWorkspace(ws.container_path)}
                    >
                      <div className="workspace-option-icon">
                        {ws.is_system ? <FiCpu /> : <FiFolder />}
                      </div>
                      <div className="workspace-option-content">
                        <h4>
                          {ws.name}
                          {ws.is_default && (
                            <FiStar className="default-indicator" title="Standard" />
                          )}
                        </h4>
                        <p>{ws.description || 'Keine Beschreibung'}</p>
                        <code>{ws.container_path}</code>
                      </div>
                      {workspace === ws.container_path && <FiCheck className="workspace-check" />}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="workspace-manage-link"
                  onClick={onOpenWorkspaceManager}
                >
                  <FiPlus /> Neuen Workspace erstellen oder verwalten
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-step">
              <div className="setup-icon success">
                <FiCheck />
              </div>
              <h2>Bereit zum Starten!</h2>
              <p className="setup-description">
                Deine Konfiguration ist vollständig. Claude Code wird jetzt eingerichtet und
                gestartet.
              </p>

              <div className="setup-summary">
                <div className="summary-item">
                  <span className="summary-label">
                    <FiKey /> API-Key:
                  </span>
                  <span className="summary-value">****{apiKey.slice(-8)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">
                    <FiFolder /> Workspace:
                  </span>
                  <span className="summary-value">{getWorkspaceName(workspace)}</span>
                </div>
              </div>

              {error && (
                <div className="setup-error-banner">
                  <FiAlertCircle /> {error}
                </div>
              )}

              <div className="setup-info">
                <FiAlertTriangle />
                <span>Claude Code läuft im autonomen Modus für beste Performance.</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="setup-actions">
          {step > 1 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={prevStep}
              disabled={saving}
            >
              <FiChevronLeft /> Zurück
            </button>
          )}

          <div className="setup-actions-right">
            {step === 1 && (
              <button type="button" className="btn btn-text" onClick={onSkip}>
                Später einrichten
              </button>
            )}

            {step < totalSteps ? (
              <button type="button" className="btn btn-primary" onClick={nextStep}>
                Weiter <FiChevronRight />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-finish"
                onClick={completeSetup}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <FiRefreshCw className="spinning" /> Einrichten...
                  </>
                ) : (
                  <>
                    <FiPlay /> Claude Code starten
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaudeCode() {
  const navigate = useNavigate();
  const [appStatus, setAppStatus] = useState(null);
  const [config, setConfig] = useState({});
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
  const [workspaces, setWorkspaces] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState('');
  const [error, setError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [authStatus, setAuthStatus] = useState(null);
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const setupPollRef = useRef(null);

  // Load workspaces
  const loadWorkspaces = useCallback(async signal => {
    try {
      const response = await fetch(`${API_BASE}/workspaces`, { headers: getAuthHeaders(), signal });
      const data = await response.json();
      setWorkspaces(data.workspaces || []);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading workspaces:', err);
      // Fallback to default workspaces if API fails
      setWorkspaces([
        {
          id: 1,
          name: 'Arasul Projekt',
          slug: 'arasul',
          description: 'Das Hauptprojekt dieser Plattform',
          host_path: '/home/arasul/arasul/arasul-jet',
          container_path: '/workspace/arasul',
          is_default: true,
          is_system: true,
        },
        {
          id: 2,
          name: 'Eigener Workspace',
          slug: 'custom',
          description: 'Dein persönliches Verzeichnis',
          host_path: '/home/arasul/workspace',
          container_path: '/workspace/custom',
          is_default: false,
          is_system: false,
        },
      ]);
    }
  }, []);

  // Load auth status
  const loadAuthStatus = useCallback(async signal => {
    try {
      const response = await fetch(`${API_BASE}/apps/claude-code/auth-status`, {
        headers: getAuthHeaders(),
        signal,
      });
      const data = await response.json();
      setAuthStatus(data);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading auth status:', err);
      setAuthStatus(null);
    }
  }, []);

  // Refresh OAuth token
  const handleAuthRefresh = async () => {
    setAuthRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/apps/claude-code/auth-refresh`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setAuthStatus(data.status);
      if (data.success) {
        setSaveMessage({ type: 'success', text: data.message });
      } else {
        setSaveMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      console.error('Error refreshing auth:', err);
      setSaveMessage({
        type: 'error',
        text: err.message || 'Token-Refresh fehlgeschlagen',
      });
    } finally {
      setAuthRefreshing(false);
      // Clear message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  // Load app status and config
  const loadAppData = useCallback(async signal => {
    try {
      setError(null);
      const [statusRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/apps/claude-code`, { headers: getAuthHeaders(), signal }).then(r =>
          r.json()
        ),
        fetch(`${API_BASE}/apps/claude-code/config`, { headers: getAuthHeaders(), signal }).then(
          r => r.json()
        ),
      ]);

      const app = statusRes.app || statusRes;
      setAppStatus(app);
      const loadedConfig = configRes.config || {};
      setConfig(loadedConfig);

      // Show setup wizard if no API key is set and app is not running
      if (!loadedConfig.ANTHROPIC_API_KEY_set && app.status !== 'running') {
        setShowSetupWizard(true);
      }

      // Set terminal URL if app is running
      if (app.status === 'running') {
        // Use Traefik route instead of direct port for LAN access support
        const protocol = window.location.protocol;
        setTerminalUrl(`${protocol}//${window.location.host}/claude-terminal/`);
      } else {
        setTerminalUrl('');
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading Claude Code:', err);
      setError('Fehler beim Laden der App-Daten.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAppData(controller.signal);
    loadWorkspaces(controller.signal);
    loadAuthStatus(controller.signal);

    // Cleanup setup polling on unmount
    return () => {
      controller.abort();
      if (setupPollRef.current) {
        clearInterval(setupPollRef.current);
      }
    };
  }, [loadAppData, loadWorkspaces, loadAuthStatus]);

  // Poll auth status every 30 seconds when app is running
  useEffect(() => {
    if (appStatus?.status === 'running') {
      const controller = new AbortController();
      const interval = setInterval(() => loadAuthStatus(controller.signal), 30000);
      return () => {
        controller.abort();
        clearInterval(interval);
      };
    }
  }, [appStatus?.status, loadAuthStatus]);

  // Poll for status updates when action is in progress
  useEffect(() => {
    if (actionLoading) {
      const controller = new AbortController();
      const interval = setInterval(() => loadAppData(controller.signal), 2000);
      return () => {
        controller.abort();
        clearInterval(interval);
      };
    }
  }, [actionLoading, loadAppData]);

  // Loading timeout - show message after 15s
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => setLoadingTimeout(true), 15000);
      return () => clearTimeout(timeout);
    }
    setLoadingTimeout(false);
  }, [loading]);

  const handleSetupComplete = () => {
    setShowSetupWizard(false);
    setActionLoading(true);

    // Clear any previous poll
    if (setupPollRef.current) {
      clearInterval(setupPollRef.current);
    }

    // Poll for app to be running
    setupPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/apps/claude-code`, { headers: getAuthHeaders() }).then(
          r => r.json()
        );
        if (res.status === 'running' || res.app?.status === 'running') {
          clearInterval(setupPollRef.current);
          setupPollRef.current = null;
          setActionLoading(false);
          loadAppData();
        }
      } catch (err) {
        // Continue polling
      }
    }, 2000);

    // Stop polling after 60 seconds
    setTimeout(() => {
      if (setupPollRef.current) {
        clearInterval(setupPollRef.current);
        setupPollRef.current = null;
        setActionLoading(false);
        setError('Setup dauert länger als erwartet. Bitte prüfe den Status manuell.');
        loadAppData();
      }
    }, 60000);
  };

  const handleSetupSkip = () => {
    setShowSetupWizard(false);
  };

  const handleWorkspaceCreated = workspace => {
    setWorkspaces([...workspaces, workspace]);
  };

  const handleWorkspaceDeleted = workspaceId => {
    setWorkspaces(workspaces.filter(ws => ws.id !== workspaceId));
  };

  const handleSetDefault = workspaceId => {
    setWorkspaces(
      workspaces.map(ws => ({
        ...ws,
        is_default: ws.id === workspaceId,
      }))
    );
  };

  const saveConfig = async () => {
    try {
      setActionLoading(true);
      setSaveMessage(null);

      // Step 1: Save configuration
      try {
        await fetch(`${API_BASE}/apps/claude-code/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ config }),
        });
      } catch (configErr) {
        console.error('Config save error:', configErr);
        const errorMsg = configErr.message || 'Unbekannter Fehler';
        setSaveMessage({ type: 'error', text: `Fehler beim Speichern: ${errorMsg}` });
        return;
      }

      // Mark workspace as used
      const selectedWs = workspaces.find(ws => ws.container_path === config.CLAUDE_WORKSPACE);
      if (selectedWs) {
        try {
          await fetch(`${API_BASE}/workspaces/${selectedWs.id}/use`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });
        } catch (e) {
          // Non-critical
        }
      }

      // Step 2: Restart if running to apply new config (async mode - returns immediately)
      if (appStatus?.status === 'running') {
        setSaveMessage({
          type: 'success',
          text: 'Konfiguration gespeichert. Container wird neu erstellt...',
        });
        try {
          const restartResponse = await fetch(`${API_BASE}/apps/claude-code/restart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ applyConfig: true }),
          });
          const restartRes = await restartResponse.json();

          if (restartRes.async) {
            // Async mode - poll for completion
            setSaveMessage({
              type: 'success',
              text: 'Container wird im Hintergrund neu erstellt. Bitte warten...',
            });

            // Poll status every 2 seconds for up to 30 seconds
            let attempts = 0;
            const maxAttempts = 15;
            const pollInterval = setInterval(async () => {
              attempts++;
              try {
                const statusRes = await fetch(`${API_BASE}/apps/claude-code`, {
                  headers: getAuthHeaders(),
                }).then(r => r.json());
                if (statusRes.status === 'running') {
                  clearInterval(pollInterval);
                  setSaveMessage({
                    type: 'success',
                    text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!',
                  });
                  setTimeout(() => {
                    loadAppData();
                    setSaveMessage(null);
                    setShowSettings(false);
                  }, 2000);
                } else if (statusRes.status === 'error') {
                  clearInterval(pollInterval);
                  setSaveMessage({
                    type: 'error',
                    text: `Fehler: ${statusRes.last_error || 'Unbekannter Fehler'}`,
                  });
                }
              } catch (pollErr) {
                // Ignore poll errors during restart
              }

              if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                setSaveMessage({
                  type: 'warning',
                  text: 'Container-Neustart dauert länger als erwartet. Prüfe den Status manuell.',
                });
                setTimeout(() => {
                  loadAppData();
                  setSaveMessage(null);
                }, 3000);
              }
            }, 2000);
            return; // Don't continue to the normal flow
          } else {
            setSaveMessage({
              type: 'success',
              text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!',
            });
          }
        } catch (restartErr) {
          console.error('Restart error:', restartErr);
          const restartErrorMsg = restartErr.message || 'Unbekannter Fehler';
          setSaveMessage({
            type: 'warning',
            text: `Konfiguration gespeichert, aber Neustart fehlgeschlagen: ${restartErrorMsg}`,
          });
          setTimeout(() => {
            loadAppData();
            setSaveMessage(null);
          }, 5000);
          return;
        }
      } else {
        setSaveMessage({
          type: 'success',
          text: 'Konfiguration gespeichert. Starte die App, um die Konfiguration anzuwenden.',
        });
      }

      // Reload after a short delay
      setTimeout(() => {
        loadAppData();
        setSaveMessage(null);
        setShowSettings(false);
      }, 2000);
    } catch (err) {
      console.error('Error saving config:', err);
      const errorMsg = err.message || 'Unbekannter Fehler';
      setSaveMessage({
        type: 'error',
        text: `Fehler beim Speichern der Konfiguration: ${errorMsg}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const startApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await fetch(`${API_BASE}/apps/claude-code/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

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
      await fetch(`${API_BASE}/apps/claude-code/stop`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

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
      await fetch(`${API_BASE}/apps/claude-code/restart`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

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

  const getStatusBadge = status => {
    const statusMap = {
      running: { class: 'status-running', text: 'Läuft' },
      stopped: { class: 'status-stopped', text: 'Gestoppt' },
      installed: { class: 'status-installed', text: 'Installiert' },
      installing: { class: 'status-installing', text: 'Installiert...' },
      restarting: { class: 'status-installing', text: 'Neustart...' },
      error: { class: 'status-error', text: 'Fehler' },
    };
    const statusInfo = statusMap[status] || {
      class: 'status-unknown',
      text: status || 'Unbekannt',
    };
    return <span className={`claude-status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  const getCurrentWorkspaceName = () => {
    const currentPath = config.CLAUDE_WORKSPACE || '/workspace/arasul';
    const ws = workspaces.find(w => w.container_path === currentPath);
    return ws ? ws.name : currentPath;
  };

  if (loading) {
    return (
      <div className="claude-code-page">
        <div className="claude-loading">
          <div className="claude-loading-spinner"></div>
          <p>Lade Claude Code...</p>
          {loadingTimeout && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--warning-color)', marginBottom: '1rem' }}>
                <FiAlertTriangle style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Laden dauert länger als erwartet.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setLoading(true);
                    setLoadingTimeout(false);
                    loadAppData();
                  }}
                >
                  <FiRefreshCw /> Erneut versuchen
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
                  Zurück zum Dashboard
                </button>
              </div>
            </div>
          )}
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
          <div
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null);
                setLoading(true);
                loadAppData();
              }}
            >
              <FiRefreshCw /> Erneut versuchen
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
              Zurück zum Dashboard
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/store')}>
              Zum Store
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show Setup Wizard for first-time users
  if (showSetupWizard) {
    return (
      <div className="claude-code-page">
        <SetupWizard
          config={config}
          setConfig={setConfig}
          onComplete={handleSetupComplete}
          onSkip={handleSetupSkip}
          workspaces={workspaces}
          onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
        />
        {showWorkspaceManager && (
          <WorkspaceManager
            workspaces={workspaces}
            onClose={() => setShowWorkspaceManager(false)}
            onWorkspaceCreated={handleWorkspaceCreated}
            onWorkspaceDeleted={handleWorkspaceDeleted}
            onSetDefault={handleSetDefault}
          />
        )}
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
            <span className="title-subtitle">{getCurrentWorkspaceName()}</span>
          </div>
          {getStatusBadge(appStatus?.status)}
        </div>

        {/* Auth Status Badge */}
        {authStatus && appStatus?.status === 'running' && (
          <div className="claude-auth-status">
            {authStatus.oauth?.valid ? (
              <div
                className="auth-badge auth-valid"
                title={`Token gültig für ${authStatus.oauth.expiresInHours}h`}
              >
                <FiUser />
                <span>
                  {authStatus.oauth.account?.displayName ||
                    authStatus.oauth.account?.email ||
                    'Angemeldet'}
                </span>
                <span className="auth-timer">
                  <FiClock /> {authStatus.oauth.expiresInHours}h
                </span>
              </div>
            ) : (
              <div className="auth-badge auth-expired">
                <FiAlertTriangle />
                <span>Session abgelaufen</span>
                <button
                  type="button"
                  className="auth-refresh-btn"
                  onClick={handleAuthRefresh}
                  disabled={authRefreshing}
                  title="Token erneuern"
                >
                  {authRefreshing ? <FiRefreshCw className="spinning" /> : <FiLogIn />}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="claude-code-actions">
          {appStatus?.status === 'running' && (
            <>
              <button
                type="button"
                className="btn btn-icon"
                onClick={restartApp}
                disabled={actionLoading}
                title="Neustarten"
              >
                <FiRefreshCw className={actionLoading ? 'spinning' : ''} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={stopApp}
                disabled={actionLoading}
                title="Stoppen"
              >
                <FiSquare />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
            </>
          )}
          <button
            type="button"
            className={`btn ${showSettings ? 'btn-active' : ''}`}
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
          <button type="button" onClick={() => setError(null)}>
            <FiX />
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="claude-code-settings">
          <h3>Konfiguration</h3>

          <div className="settings-grid">
            <div className="setting-item">
              <label htmlFor="cc-api-key">
                <FiKey /> Anthropic API Key
                <span className="setting-required">*</span>
              </label>
              <input
                id="cc-api-key"
                type="password"
                value={
                  config.ANTHROPIC_API_KEY?.startsWith('****') ? '' : config.ANTHROPIC_API_KEY || ''
                }
                onChange={e => setConfig({ ...config, ANTHROPIC_API_KEY: e.target.value })}
                placeholder={
                  config.ANTHROPIC_API_KEY_set
                    ? 'Aktuell gesetzt - zum Ändern neuen Wert eingeben'
                    : 'sk-ant-api03-...'
                }
                className="setting-input"
              />
              <span className="setting-hint">
                {config.ANTHROPIC_API_KEY_set
                  ? 'API-Key ist gesetzt. Leer lassen um beizubehalten, neuen Wert eingeben zum Ändern.'
                  : 'Dein API-Key von anthropic.com'}
              </span>
            </div>

            <div className="setting-item">
              <label htmlFor="cc-workspace">
                <FiFolder /> Workspace
              </label>
              <div className="workspace-select-row">
                <select
                  id="cc-workspace"
                  value={config.CLAUDE_WORKSPACE || '/workspace/arasul'}
                  onChange={e => setConfig({ ...config, CLAUDE_WORKSPACE: e.target.value })}
                  className="setting-select"
                >
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.container_path}>
                      {ws.name} {ws.is_default ? '(Standard)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="workspace-manage-btn"
                  onClick={() => setShowWorkspaceManager(true)}
                  title="Workspaces verwalten"
                >
                  <FiEdit2 />
                </button>
              </div>
              <span className="setting-hint">Arbeitsverzeichnis für Claude Code</span>
            </div>
          </div>

          <div
            className="setting-hint"
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'rgba(69, 173, 255, 0.1)',
              borderRadius: '8px',
            }}
          >
            <strong>Hinweis:</strong> Claude Code läuft im autonomen Modus
            (--dangerously-skip-permissions). Das Terminal ist ohne Passwort zugänglich.
          </div>

          {saveMessage && (
            <div className={`save-message ${saveMessage.type}`}>
              {saveMessage.type === 'success' ? (
                <FiCheck />
              ) : saveMessage.type === 'warning' ? (
                <FiAlertTriangle />
              ) : (
                <FiAlertCircle />
              )}
              {saveMessage.text}
            </div>
          )}

          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowSettings(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
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

      {/* Workspace Manager Modal */}
      {showWorkspaceManager && (
        <WorkspaceManager
          workspaces={workspaces}
          onClose={() => setShowWorkspaceManager(false)}
          onWorkspaceCreated={handleWorkspaceCreated}
          onWorkspaceDeleted={handleWorkspaceDeleted}
          onSetDefault={handleSetDefault}
        />
      )}

      {/* Terminal Area */}
      <div className="claude-code-terminal">
        {!config.ANTHROPIC_API_KEY_set ? (
          <div className="terminal-placeholder">
            <div className="placeholder-icon">
              <FiKey />
            </div>
            <h3>API-Key erforderlich</h3>
            <p>
              Bitte gib deinen Anthropic API-Key in den Einstellungen ein, um Claude Code zu nutzen.
            </p>
            <div className="placeholder-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowSetupWizard(true)}
              >
                <FiZap /> Einrichtung starten
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSettings(true)}
              >
                <FiSettings /> Einstellungen öffnen
              </button>
            </div>
          </div>
        ) : appStatus?.status !== 'running' ? (
          <div className="terminal-placeholder">
            <div className="placeholder-icon">
              <FiTerminal />
            </div>
            <h3>Claude Code ist nicht gestartet</h3>
            <p>Klicke auf Starten, um das Terminal zu öffnen.</p>
            <button
              type="button"
              className="btn btn-primary"
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
      {ConfirmDialog}
    </div>
  );
}

export default ClaudeCode;
