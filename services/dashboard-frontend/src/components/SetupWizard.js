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
  FiServer,
  FiShield,
  FiSkipForward,
  FiCode,
  FiShoppingCart,
  FiSettings,
  FiBriefcase,
  FiHeart,
  FiEdit3,
  FiUser,
  FiUsers,
  FiGrid,
  FiMessageCircle,
  FiFileText,
  FiZap,
  FiCoffee,
  FiStar,
  FiDownload,
  FiInfo,
} from 'react-icons/fi';
import { useDownloads } from '../contexts/DownloadContext';
import { API_BASE, getAuthHeaders } from '../config/api';
import './SetupWizard.css';

const STEPS = [
  { id: 1, title: 'Willkommen', description: 'System einrichten' },
  { id: 2, title: 'KI-Profil', description: 'Ihr Unternehmen' },
  { id: 3, title: 'Passwort', description: 'Admin-Passwort ändern' },
  { id: 4, title: 'Netzwerk', description: 'Konnektivität prüfen' },
  { id: 5, title: 'KI-Modelle', description: 'Modell auswählen' },
  { id: 6, title: 'Zusammenfassung', description: 'Einrichtung abschließen' },
];

const INDUSTRIES = [
  { label: 'IT & Software', value: 'IT & Software', icon: FiCode },
  { label: 'Handel & E-Commerce', value: 'Handel & E-Commerce', icon: FiShoppingCart },
  { label: 'Produktion & Fertigung', value: 'Produktion & Fertigung', icon: FiSettings },
  { label: 'Beratung & Dienstleistung', value: 'Beratung & Dienstleistungen', icon: FiBriefcase },
  { label: 'Gesundheit & Medizin', value: 'Gesundheit & Medizin', icon: FiHeart },
  { label: 'Andere Branche', value: 'custom', icon: FiEdit3 },
];

const TEAM_SIZES = [
  { label: '1-5', sublabel: 'Kleinteam', value: '5', icon: FiUser },
  { label: '6-20', sublabel: 'Mittelgroß', value: '20', icon: FiUsers },
  { label: '21-100', sublabel: 'Unternehmen', value: '100', icon: FiGrid },
  { label: '100+', sublabel: 'Konzern', value: '100+', icon: FiBriefcase },
];

const ANSWER_STYLES = [
  {
    label: 'Kurz & prägnant',
    desc: 'Kompakte Antworten, direkt zum Punkt',
    value: 'kurz',
    icon: FiZap,
  },
  {
    label: 'Ausführlich',
    desc: 'Detaillierte Erklärungen mit Kontext',
    value: 'ausfuehrlich',
    icon: FiFileText,
  },
  {
    label: 'Professionell',
    desc: 'Formeller Ton, geschäftliche Sprache',
    value: 'formell',
    icon: FiMessageCircle,
  },
  {
    label: 'Locker & direkt',
    desc: 'Ungezwungen, wie ein Kollege',
    value: 'locker',
    icon: FiCoffee,
  },
];

const MODEL_CATEGORIES = {
  small: { title: 'Schnell & Kompakt', desc: '7-12 GB RAM' },
  medium: { title: 'Ausgewogen', desc: '15-25 GB RAM' },
  large: { title: 'Leistungsstark', desc: '30-40 GB RAM' },
  xlarge: { title: 'Maximum', desc: '45+ GB RAM' },
};

const RECOMMENDED_MODEL = 'qwen3:14b-q8';

const formatModelSize = bytes => {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function SetupWizard({ onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Welcome
  const [companyName, setCompanyName] = useState('');

  // Step 2: KI-Profil
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [products, setProducts] = useState('');
  const [answerStyle, setAnswerStyle] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  // Step 3: Password
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

  // Downloads (DownloadContext)
  const { startDownload, getDownloadState } = useDownloads();

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

  // Save KI-Profil
  const saveProfile = async () => {
    try {
      const selectedIndustry = customIndustry || industry;
      const productList = products
        ? products
            .split(',')
            .map(p => p.trim())
            .filter(Boolean)
        : [];

      await fetch(`${API_BASE}/memory/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          companyName: companyName || 'Mein Unternehmen',
          industry: selectedIndustry,
          teamSize: teamSize,
          products: productList,
          preferences: {
            antwortlaenge: answerStyle || 'mittel',
            formalitaet: answerStyle === 'formell' ? 'formell' : 'locker',
          },
        }),
      });
      setProfileSaved(true);
    } catch {
      // Non-critical
    }
  };

  // Step navigation
  const goNext = useCallback(() => {
    if (currentStep < 6) {
      if (currentStep === 2 && !profileSaved) {
        saveProfile();
      }
      // Trigger model download when leaving step 5
      if (currentStep === 5 && selectedModel) {
        const model = models.find(m => m.id === selectedModel);
        if (model && model.install_status !== 'available') {
          startDownload(selectedModel, model.name);
        }
      }
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setError('');
      saveStepProgress(nextStep);
    }
  }, [currentStep, saveStepProgress, profileSaved, selectedModel, models, startDownload]);

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

    if (newPassword.length < 4) {
      setPasswordError('Passwort muss mindestens 4 Zeichen lang sein');
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

  // Step 4: Fetch model catalog
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/models/catalog`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const llmModels = (data.models || []).filter(m => (m.model_type || 'llm') === 'llm');
        setModels(llmModels);
        if (!selectedModel) {
          setSelectedModel(RECOMMENDED_MODEL);
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
    if (currentStep === 4) fetchNetworkInfo();
    if (currentStep === 5) fetchModels();
    if (currentStep === 6) fetchSystemInfo();
  }, [currentStep, fetchNetworkInfo, fetchModels, fetchSystemInfo]);

  // Complete setup
  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // Set default model if already installed
      if (selectedModel) {
        const model = models.find(m => m.id === selectedModel);
        if (model?.install_status === 'available') {
          await fetch(`${API_BASE}/models/default`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ model_id: selectedModel }),
          }).catch(() => {});
        }
      }

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
    if (currentStep === 3 && !passwordChanged) return false;
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

          {/* Step 2: KI-Profil */}
          {currentStep === 2 && (
            <div className="setup-step-content profile-step">
              <div className="step-icon-large">
                <FiCpu />
              </div>
              <h2>KI-Profil einrichten</h2>
              <p className="step-description">
                Damit die KI Sie optimal unterstützt, erzählen Sie kurz etwas über Ihr Unternehmen.
              </p>

              {/* Industry */}
              <div className="profile-section">
                <h3 className="profile-section-title">Branche</h3>
                <div className="card-grid cols-3">
                  {INDUSTRIES.map(ind => {
                    const Icon = ind.icon;
                    const isSelected = industry === ind.value;
                    return (
                      <button
                        key={ind.value}
                        type="button"
                        className={`select-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setIndustry(ind.value);
                          if (ind.value !== 'custom') setCustomIndustry('');
                        }}
                      >
                        <Icon className="select-card-icon" />
                        <span className="select-card-label">{ind.label}</span>
                      </button>
                    );
                  })}
                </div>
                {industry === 'custom' && (
                  <input
                    type="text"
                    value={customIndustry}
                    onChange={e => setCustomIndustry(e.target.value)}
                    placeholder="Ihre Branche eingeben..."
                    className="setup-input custom-industry-input"
                    autoFocus
                  />
                )}
              </div>

              {/* Team Size */}
              <div className="profile-section">
                <h3 className="profile-section-title">Teamgröße</h3>
                <div className="card-grid cols-4">
                  {TEAM_SIZES.map(ts => {
                    const Icon = ts.icon;
                    const isSelected = teamSize === ts.value;
                    return (
                      <button
                        key={ts.value}
                        type="button"
                        className={`select-card compact ${isSelected ? 'selected' : ''}`}
                        onClick={() => setTeamSize(ts.value)}
                      >
                        <Icon className="select-card-icon" />
                        <span className="select-card-label">{ts.label}</span>
                        <span className="select-card-sub">{ts.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Products */}
              <div className="profile-section">
                <h3 className="profile-section-title">
                  Produkte & Services <span className="optional-badge">optional</span>
                </h3>
                <input
                  type="text"
                  value={products}
                  onChange={e => setProducts(e.target.value)}
                  placeholder="z.B. Webentwicklung, Cloud-Hosting, Beratung"
                  className="setup-input"
                />
                <span className="form-hint">Komma-getrennt eingeben</span>
              </div>

              {/* Answer Style */}
              <div className="profile-section">
                <h3 className="profile-section-title">Antwort-Stil</h3>
                <div className="card-grid cols-2">
                  {ANSWER_STYLES.map(style => {
                    const Icon = style.icon;
                    const isSelected = answerStyle === style.value;
                    return (
                      <button
                        key={style.value}
                        type="button"
                        className={`select-card horizontal ${isSelected ? 'selected' : ''}`}
                        onClick={() => setAnswerStyle(style.value)}
                      >
                        <div className="select-card-icon-wrap">
                          <Icon className="select-card-icon" />
                        </div>
                        <div className="select-card-text">
                          <span className="select-card-label">{style.label}</span>
                          <span className="select-card-desc">{style.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {profileSaved && (
                <div className="profile-saved-hint">
                  <FiCheck /> Profil gespeichert
                </div>
              )}
            </div>
          )}

          {/* Step 3: Password Change */}
          {currentStep === 3 && (
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
                      placeholder="Mindestens 4 Zeichen"
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

          {/* Step 4: Network Check */}
          {currentStep === 4 && (
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

          {/* Step 5: AI Models */}
          {currentStep === 5 && (
            <div className="setup-step-content model-step">
              <div className="step-icon-large">
                <FiCpu />
              </div>
              <h2>KI-Modell auswählen</h2>
              <p className="step-description">
                Wählen Sie ein Startmodell für Ihren KI-Assistenten. Es wird im Hintergrund
                heruntergeladen.
              </p>

              {modelsLoading ? (
                <div className="setup-loading">
                  <FiLoader className="spin" />
                  <p>Modell-Katalog wird geladen...</p>
                </div>
              ) : models.length > 0 ? (
                <>
                  {['small', 'medium', 'large', 'xlarge'].map(cat => {
                    const catModels = models.filter(m => m.category === cat);
                    if (catModels.length === 0) return null;
                    const catInfo = MODEL_CATEGORIES[cat];
                    return (
                      <div key={cat} className="model-category">
                        <div className="model-category-header">
                          <span className="model-category-title">{catInfo.title}</span>
                          <span className="model-category-desc">{catInfo.desc}</span>
                        </div>
                        {catModels.map(model => {
                          const isSelected = selectedModel === model.id;
                          const isRecommended = model.id === RECOMMENDED_MODEL;
                          const isInstalled = model.install_status === 'available';
                          const dlState = getDownloadState(model.id);
                          return (
                            <button
                              key={model.id}
                              type="button"
                              className={`model-catalog-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedModel(model.id)}
                            >
                              <div className="model-catalog-top">
                                <span className="model-catalog-name">{model.name}</span>
                                <div className="model-catalog-badges">
                                  {isRecommended && (
                                    <span className="badge-recommended">
                                      <FiStar /> Empfohlen
                                    </span>
                                  )}
                                  {isInstalled && (
                                    <span className="badge-installed">
                                      <FiCheck /> Installiert
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="model-catalog-desc">{model.description}</span>
                              <div className="model-catalog-meta">
                                <span>
                                  <FiDownload /> {formatModelSize(model.size_bytes)}
                                </span>
                                <span>
                                  <FiHardDrive /> {model.ram_required_gb} GB RAM
                                </span>
                              </div>
                              {dlState && (
                                <div className="model-download-inline">
                                  <div className="model-download-bar">
                                    <div
                                      className="model-download-fill"
                                      style={{ width: `${dlState.progress}%` }}
                                    />
                                  </div>
                                  <span className="model-download-text">
                                    {dlState.status} ({dlState.progress}%)
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="setup-info-box">
                    <FiInfo className="info-icon" />
                    <div>
                      <p>
                        Das Standardmodell kann später jederzeit unter{' '}
                        <strong>Store &rarr; Modelle</strong> geändert werden. Weitere Modelle
                        können dort ebenfalls heruntergeladen werden.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="setup-info-box">
                  <FiAlertCircle className="info-icon" />
                  <div>
                    <strong>Keine Modelle verfügbar</strong>
                    <p>
                      Der Modell-Katalog konnte nicht geladen werden. Modelle können später im Store
                      heruntergeladen werden.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Summary */}
          {currentStep === 6 && (
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
                  <span className="summary-value">
                    {selectedModel ? (
                      <>
                        {models.find(m => m.id === selectedModel)?.name || selectedModel}
                        {(() => {
                          const dlState = getDownloadState(selectedModel);
                          if (!dlState) return null;
                          if (dlState.phase === 'complete')
                            return (
                              <span className="summary-ok" style={{ marginLeft: '0.5rem' }}>
                                <FiCheck /> Fertig
                              </span>
                            );
                          if (dlState.phase === 'error')
                            return (
                              <span className="summary-warn" style={{ marginLeft: '0.5rem' }}>
                                <FiAlertCircle /> Fehler
                              </span>
                            );
                          return (
                            <span className="summary-info" style={{ marginLeft: '0.5rem' }}>
                              <FiLoader className="spin" /> {dlState.progress}%
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      'Keins ausgewählt'
                    )}
                  </span>
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

            {currentStep < 6 ? (
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
