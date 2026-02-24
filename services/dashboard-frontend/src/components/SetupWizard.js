/**
 * SetupWizard - First-Run Setup Experience
 *
 * Multi-step wizard shown after first login when setup is not yet completed.
 * Steps: 1) Welcome, 2) Password Change, 3) Network Check, 4) AI Models, 5) Summary
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiAlertCircle,
  FiLoader,
  FiWifi,
  FiWifiOff,
  FiCpu,
  FiHardDrive,
  FiThermometer,
  FiServer,
  FiShield,
  FiSkipForward,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../config/api';
import './SetupWizard.css';

const STEPS = [
  { id: 1, title: 'Willkommen', description: 'System einrichten' },
  { id: 2, title: 'Passwort', description: 'Admin-Passwort ändern' },
  { id: 3, title: 'Netzwerk', description: 'Konnektivität prüfen' },
  { id: 4, title: 'KI-Modelle', description: 'Modell auswählen' },
  { id: 5, title: 'Zusammenfassung', description: 'Einrichtung abschließen' },
];

function SetupWizard({ onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Welcome
  const [companyName, setCompanyName] = useState('');

  // Step 2: Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Step 3: Network
  const [networkInfo, setNetworkInfo] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(false);

  // Step 4: AI Models
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  // Step 5: System info
  const [systemInfo, setSystemInfo] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // Save step progress
  const saveStepProgress = useCallback(
    async step => {
      try {
        await fetch(`${API_BASE}/system/setup-step`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            step,
            companyName: companyName || undefined,
            selectedModel: selectedModel || undefined,
          }),
        });
      } catch {
        // Non-critical, silently ignore
      }
    },
    [companyName, selectedModel]
  );

  // Step navigation
  const goNext = useCallback(() => {
    if (currentStep < 5) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setError('');
      saveStepProgress(nextStep);
    }
  }, [currentStep, saveStepProgress]);

  const goBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setError('');
    }
  }, [currentStep]);

  // Step 2: Change password
  const handlePasswordChange = async () => {
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Alle Felder müssen ausgefüllt werden');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Neue Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Passwort-Änderung fehlgeschlagen');
      }

      setPasswordChanged(true);
      // Re-login with new password
      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: newPassword }),
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        localStorage.setItem('arasul_token', loginData.token);
        localStorage.setItem('arasul_user', JSON.stringify(loginData.user));
      }
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Fetch network info
  const fetchNetworkInfo = useCallback(async () => {
    setNetworkLoading(true);
    try {
      const response = await fetch(`${API_BASE}/system/network`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setNetworkInfo(await response.json());
      }
    } catch {
      setNetworkInfo({ ip_addresses: [], internet_reachable: false, error: true });
    } finally {
      setNetworkLoading(false);
    }
  }, []);

  // Step 4: Fetch available models
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      // SETUP-001 FIX: Use correct endpoint (GET /api/models returns 404)
      const response = await fetch(`${API_BASE}/models/installed`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
        // Auto-select first model if none selected
        if (!selectedModel && data.models?.length > 0) {
          setSelectedModel(data.models[0].id || data.models[0].name);
        }
      }
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [selectedModel]);

  // Step 5: Fetch system info
  const fetchSystemInfo = useCallback(async () => {
    try {
      const [infoRes, thresholdRes] = await Promise.all([
        fetch(`${API_BASE}/system/info`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/system/thresholds`, { headers: getAuthHeaders() }),
      ]);

      if (infoRes.ok) setSystemInfo(await infoRes.json());
      if (thresholdRes.ok) {
        const data = await thresholdRes.json();
        setDeviceInfo(data.device);
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Load data when step changes
  useEffect(() => {
    if (currentStep === 3) fetchNetworkInfo();
    if (currentStep === 4) fetchModels();
    if (currentStep === 5) fetchSystemInfo();
  }, [currentStep, fetchNetworkInfo, fetchModels, fetchSystemInfo]);

  // Complete setup
  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/system/setup-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          companyName: companyName || undefined,
          selectedModel: selectedModel || undefined,
          hostname: networkInfo?.mdns || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Setup konnte nicht abgeschlossen werden');
      }

      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Skip setup
  const handleSkip = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/system/setup-skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      onSkip();
    } catch {
      onSkip();
    } finally {
      setLoading(false);
    }
  };

  // Can advance to next step?
  const canAdvance = () => {
    if (currentStep === 2 && !passwordChanged) return false;
    return true;
  };

  return (
    <div className="setup-wizard-container">
      <div className="setup-wizard">
        {/* Header */}
        <div className="setup-header">
          <h1 className="setup-title">Arasul Platform</h1>
          <p className="setup-subtitle">Ersteinrichtung</p>
        </div>

        {/* Progress Steps */}
        <div className="setup-progress" role="navigation" aria-label="Setup-Fortschritt">
          {STEPS.map(step => (
            <div
              key={step.id}
              className={`setup-step-indicator ${
                currentStep === step.id ? 'active' : currentStep > step.id ? 'completed' : ''
              }`}
            >
              <div className="step-circle">
                {currentStep > step.id ? <FiCheck aria-hidden="true" /> : step.id}
              </div>
              <span className="step-label">{step.title}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="setup-content">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="setup-step-content">
              <div className="step-icon-large">
                <FiServer />
              </div>
              <h2>Willkommen bei Arasul</h2>
              <p className="step-description">
                Ihr Edge-AI-System ist bereit für die Einrichtung. Dieser Assistent führt Sie durch
                die wichtigsten Konfigurationsschritte.
              </p>

              <div className="form-group">
                <label htmlFor="company-name">Firmenname (optional)</label>
                <input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="z.B. Meine Firma GmbH"
                  className="setup-input"
                />
              </div>

              <div className="setup-info-box">
                <FiShield className="info-icon" />
                <div>
                  <strong>Was wird eingerichtet?</strong>
                  <ul>
                    <li>Sicheres Admin-Passwort</li>
                    <li>Netzwerk-Konnektivität</li>
                    <li>KI-Modell-Auswahl</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Password Change */}
          {currentStep === 2 && (
            <div className="setup-step-content">
              <div className="step-icon-large">
                <FiShield />
              </div>
              <h2>Admin-Passwort ändern</h2>
              <p className="step-description">
                Ändern Sie das Standard-Passwort für mehr Sicherheit. Dies ist ein Pflichtschritt.
              </p>

              {passwordChanged ? (
                <div className="setup-success-box">
                  <FiCheck className="success-icon" />
                  <p>Passwort wurde erfolgreich geändert!</p>
                </div>
              ) : (
                <>
                  {passwordError && (
                    <div className="setup-error" role="alert">
                      <FiAlertCircle /> {passwordError}
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="current-password">Aktuelles Passwort</label>
                    <input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Aktuelles Passwort eingeben"
                      className="setup-input"
                      autoComplete="current-password"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-password">Neues Passwort</label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mindestens 8 Zeichen"
                      className="setup-input"
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirm-password">Passwort bestätigen</label>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Neues Passwort wiederholen"
                      className="setup-input"
                      autoComplete="new-password"
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePasswordChange}
                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {loading ? (
                      <>
                        <FiLoader className="spin" /> Wird geändert...
                      </>
                    ) : (
                      'Passwort ändern'
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Network Check */}
          {currentStep === 3 && (
            <div className="setup-step-content">
              <div className="step-icon-large">
                {networkInfo?.internet_reachable ? <FiWifi /> : <FiWifiOff />}
              </div>
              <h2>Netzwerk-Status</h2>
              <p className="step-description">
                Überprüfung der Netzwerk-Konnektivität Ihres Systems.
              </p>

              {networkLoading ? (
                <div className="setup-loading">
                  <FiLoader className="spin" />
                  <p>Netzwerk wird geprüft...</p>
                </div>
              ) : networkInfo ? (
                <div className="network-check-results">
                  <div className="network-item">
                    <div
                      className={`network-status ${networkInfo.internet_reachable ? 'ok' : 'warning'}`}
                    >
                      {networkInfo.internet_reachable ? <FiCheck /> : <FiWifiOff />}
                    </div>
                    <div>
                      <strong>Internet</strong>
                      <p>
                        {networkInfo.internet_reachable
                          ? 'Verbunden'
                          : 'Nicht verfügbar (Offline-Modus)'}
                      </p>
                    </div>
                  </div>

                  <div className="network-item">
                    <div className="network-status ok">
                      <FiCheck />
                    </div>
                    <div>
                      <strong>IP-Adressen</strong>
                      <p>{networkInfo.ip_addresses?.join(', ') || 'Keine gefunden'}</p>
                    </div>
                  </div>

                  <div className="network-item">
                    <div className="network-status ok">
                      <FiCheck />
                    </div>
                    <div>
                      <strong>mDNS</strong>
                      <p>{networkInfo.mdns || 'arasul.local'}</p>
                    </div>
                  </div>

                  {!networkInfo.internet_reachable && (
                    <div className="setup-info-box">
                      <FiAlertCircle className="info-icon" />
                      <div>
                        <strong>Offline-Modus</strong>
                        <p>
                          Das System funktioniert vollständig ohne Internet. Updates können per USB
                          eingespielt werden.
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={fetchNetworkInfo}
                    disabled={networkLoading}
                  >
                    Erneut prüfen
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 4: AI Models */}
          {currentStep === 4 && (
            <div className="setup-step-content">
              <div className="step-icon-large">
                <FiCpu />
              </div>
              <h2>KI-Modell auswählen</h2>
              <p className="step-description">
                Wählen Sie das Standard-Sprachmodell für den KI-Chat.
              </p>

              {modelsLoading ? (
                <div className="setup-loading">
                  <FiLoader className="spin" />
                  <p>Modelle werden geladen...</p>
                </div>
              ) : models.length > 0 ? (
                <div className="model-selection">
                  {models.map(model => {
                    const modelId = model.id || model.name;
                    return (
                      <label
                        key={modelId}
                        className={`model-option ${selectedModel === modelId ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={modelId}
                          checked={selectedModel === modelId}
                          onChange={() => setSelectedModel(modelId)}
                        />
                        <div className="model-info">
                          <strong>{model.name || modelId}</strong>
                          {model.size && (
                            <span className="model-size">
                              <FiHardDrive /> {(model.size / 1e9).toFixed(1)} GB
                            </span>
                          )}
                          {model.parameter_size && (
                            <span className="model-params">{model.parameter_size}</span>
                          )}
                        </div>
                        <div
                          className={`model-radio ${selectedModel === modelId ? 'checked' : ''}`}
                        >
                          {selectedModel === modelId && <FiCheck />}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="setup-info-box">
                  <FiAlertCircle className="info-icon" />
                  <div>
                    <strong>Keine Modelle gefunden</strong>
                    <p>
                      Der LLM-Service ist möglicherweise noch nicht bereit. Modelle können später im
                      Store heruntergeladen werden.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Summary */}
          {currentStep === 5 && (
            <div className="setup-step-content">
              <div className="step-icon-large completed">
                <FiCheck />
              </div>
              <h2>Zusammenfassung</h2>
              <p className="step-description">
                Ihre Einrichtung ist fast abgeschlossen. Überprüfen Sie die Konfiguration.
              </p>

              <div className="summary-list">
                {companyName && (
                  <div className="summary-item">
                    <span className="summary-label">Firma</span>
                    <span className="summary-value">{companyName}</span>
                  </div>
                )}

                <div className="summary-item">
                  <span className="summary-label">Passwort</span>
                  <span className="summary-value">
                    {passwordChanged ? (
                      <span className="summary-ok">
                        <FiCheck /> Geändert
                      </span>
                    ) : (
                      <span className="summary-warn">
                        <FiAlertCircle /> Nicht geändert
                      </span>
                    )}
                  </span>
                </div>

                <div className="summary-item">
                  <span className="summary-label">Netzwerk</span>
                  <span className="summary-value">
                    {networkInfo?.internet_reachable ? (
                      <span className="summary-ok">
                        <FiWifi /> Online
                      </span>
                    ) : (
                      <span className="summary-info">
                        <FiWifiOff /> Offline-Modus
                      </span>
                    )}
                  </span>
                </div>

                {networkInfo?.ip_addresses?.[0] && (
                  <div className="summary-item">
                    <span className="summary-label">IP-Adresse</span>
                    <span className="summary-value">{networkInfo.ip_addresses[0]}</span>
                  </div>
                )}

                <div className="summary-item">
                  <span className="summary-label">KI-Modell</span>
                  <span className="summary-value">{selectedModel || 'Keins ausgewählt'}</span>
                </div>

                {deviceInfo && (
                  <div className="summary-item">
                    <span className="summary-label">Gerät</span>
                    <span className="summary-value">{deviceInfo.name}</span>
                  </div>
                )}

                {systemInfo && (
                  <div className="summary-item">
                    <span className="summary-label">Version</span>
                    <span className="summary-value">{systemInfo.version || '1.0.0'}</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="setup-error" role="alert">
                  <FiAlertCircle /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="setup-footer">
          <div className="setup-footer-left">
            {currentStep > 1 && (
              <button type="button" className="btn btn-ghost" onClick={goBack}>
                <FiChevronLeft /> Zurück
              </button>
            )}
          </div>

          <div className="setup-footer-right">
            <button
              type="button"
              className="btn btn-ghost skip-btn"
              onClick={handleSkip}
              disabled={loading}
              title="Einrichtung überspringen (für erfahrene Admins)"
            >
              <FiSkipForward /> Überspringen
            </button>

            {currentStep < 5 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                disabled={!canAdvance()}
              >
                Weiter <FiChevronRight />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FiLoader className="spin" /> Wird abgeschlossen...
                  </>
                ) : (
                  <>
                    <FiCheck /> Einrichtung abschließen
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

export default SetupWizard;
