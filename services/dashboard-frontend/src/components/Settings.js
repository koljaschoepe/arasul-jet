import React, { useState, useEffect, useCallback } from 'react';
import {
  FiSettings,
  FiUpload,
  FiTool,
  FiLock,
  FiInfo,
  FiChevronRight,
  FiFileText,
  FiSave,
  FiCheck,
  FiAlertCircle
} from 'react-icons/fi';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import PasswordManagement from './PasswordManagement';
import '../settings.css';

function Settings() {
  const [activeSection, setActiveSection] = useState('general');

  const sections = [
    {
      id: 'general',
      label: 'General',
      icon: <FiInfo />,
      description: 'System information and configuration'
    },
    {
      id: 'company-context',
      label: 'Unternehmenskontext',
      icon: <FiFileText />,
      description: 'Globaler Kontext für RAG-Anfragen'
    },
    {
      id: 'updates',
      label: 'Updates',
      icon: <FiUpload />,
      description: 'Manage system updates'
    },
    {
      id: 'selfhealing',
      label: 'Self-Healing',
      icon: <FiTool />,
      description: 'View system recovery events'
    },
    {
      id: 'security',
      label: 'Security',
      icon: <FiLock />,
      description: 'Password and access management'
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'company-context':
        return <CompanyContextSettings />;
      case 'updates':
        return <UpdatePage />;
      case 'selfhealing':
        return <SelfHealingEvents />;
      case 'security':
        return <PasswordManagement />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="settings-layout">
      {/* Sidebar Navigation */}
      <div className="settings-sidebar">
        <div className="settings-sidebar-header">
          <FiSettings className="settings-sidebar-icon" />
          <div>
            <h2 className="settings-sidebar-title">Einstellungen</h2>
            <p className="settings-sidebar-subtitle">System-Konfiguration</p>
          </div>
        </div>

        <nav className="settings-nav">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <div className="settings-nav-item-content">
                <div className="settings-nav-item-icon">{section.icon}</div>
                <div className="settings-nav-item-text">
                  <span className="settings-nav-item-label">{section.label}</span>
                  <span className="settings-nav-item-description">{section.description}</span>
                </div>
              </div>
              <FiChevronRight className="settings-nav-item-arrow" />
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="settings-content-area">
        <div className="settings-content-wrapper">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// Company Context Settings Component (RAG 2.0)
function CompanyContextSettings() {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const defaultTemplate = `# Unternehmensprofil

**Firma:** [Firmenname]
**Branche:** [Branche]
**Gegründet:** [Jahr]

## Hauptprodukte/Dienstleistungen
- [Produkt 1]
- [Produkt 2]
- [Produkt 3]

## Kunden
- [Kundensegment 1]
- [Kundensegment 2]

## Besonderheiten
- [Besonderheit 1]
- [Besonderheit 2]

---
*Diese Informationen werden bei jeder RAG-Anfrage als Hintergrundkontext bereitgestellt.*`;

  const fetchContent = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/company-context', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setContent(data.content || defaultTemplate);
        setOriginalContent(data.content || defaultTemplate);
        setLastUpdated(data.updated_at);
      }
    } catch (error) {
      console.error('Error fetching company context:', error);
      setContent(defaultTemplate);
      setOriginalContent(defaultTemplate);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/company-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        const data = await response.json();
        setOriginalContent(content);
        setLastUpdated(data.updated_at);
        setMessage({ type: 'success', text: 'Unternehmenskontext erfolgreich gespeichert' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Fehler beim Speichern' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Netzwerkfehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h1 className="settings-section-title">Unternehmenskontext</h1>
          <p className="settings-section-description">Lade...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">Unternehmenskontext</h1>
        <p className="settings-section-description">
          Dieser Text wird bei jeder RAG-Anfrage als Hintergrundkontext an die KI übergeben.
        </p>
      </div>

      <div className="settings-cards">
        <div className="settings-card company-context-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              <FiFileText style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              Unternehmensprofil
            </h3>
            <p className="settings-card-description">
              Beschreiben Sie Ihr Unternehmen, Ihre Produkte und Ihre Zielgruppen.
              Diese Informationen helfen der KI, Ihre Fragen besser zu verstehen.
            </p>
          </div>
          <div className="settings-card-body">
            {message && (
              <div className={`company-context-message ${message.type}`}>
                {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
                <span>{message.text}</span>
              </div>
            )}

            <textarea
              className="company-context-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Beschreiben Sie Ihr Unternehmen..."
              spellCheck="false"
            />

            <div className="company-context-footer">
              <div className="company-context-meta">
                {lastUpdated && (
                  <span className="company-context-updated">
                    Zuletzt aktualisiert: {formatDate(lastUpdated)}
                  </span>
                )}
                {hasChanges && (
                  <span className="company-context-unsaved">Ungespeicherte Änderungen</span>
                )}
              </div>
              <button
                className={`company-context-save-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saving ? (
                  <>Speichern...</>
                ) : (
                  <>
                    <FiSave />
                    Speichern
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Tipps für guten Kontext</h3>
            <p className="settings-card-description">So nutzen Sie den Unternehmenskontext optimal</p>
          </div>
          <div className="settings-card-body">
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div className="settings-feature-icon">1</div>
                <div className="settings-feature-text">
                  <strong>Seien Sie spezifisch</strong>
                  <span>Nennen Sie konkrete Produktnamen, Dienstleistungen und Fachbegriffe</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">2</div>
                <div className="settings-feature-text">
                  <strong>Beschreiben Sie Ihre Zielgruppe</strong>
                  <span>Wer sind Ihre Kunden? In welcher Branche sind Sie tätig?</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">3</div>
                <div className="settings-feature-text">
                  <strong>Halten Sie es aktuell</strong>
                  <span>Aktualisieren Sie den Kontext bei wichtigen Änderungen</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// General Settings Component
function GeneralSettings() {
  const [systemInfo, setSystemInfo] = useState({
    version: '1.0.0',
    hostname: 'arasul-edge',
    jetpack_version: '6.0',
    docker_version: '24.0.7',
    compose_version: '2.21.0'
  });

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">General</h1>
        <p className="settings-section-description">System information and configuration</p>
      </div>

      <div className="settings-cards">
        {/* System Information */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">System Information</h3>
            <p className="settings-card-description">Basic system details and versions</p>
          </div>
          <div className="settings-card-body">
            <div className="settings-info-grid">
              <div className="settings-info-item">
                <span className="settings-info-label">Platform Version</span>
                <span className="settings-info-value">{systemInfo.version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Hostname</span>
                <span className="settings-info-value">{systemInfo.hostname}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">JetPack Version</span>
                <span className="settings-info-value">{systemInfo.jetpack_version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Docker Version</span>
                <span className="settings-info-value">{systemInfo.docker_version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Docker Compose</span>
                <span className="settings-info-value">{systemInfo.compose_version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Platform Info */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">About Arasul Platform</h3>
            <p className="settings-card-description">Edge AI platform for NVIDIA Jetson</p>
          </div>
          <div className="settings-card-body">
            <p className="settings-about-text">
              Arasul ist eine autonome Edge-AI-Plattform, die auf NVIDIA Jetson AGX Orin läuft.
              Die Plattform bietet lokale KI-Funktionen, Multi-Jahres-Betrieb ohne Wartung und
              ein einheitliches Dashboard-Interface.
            </p>
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>Offline-First Design</strong>
                  <span>Funktioniert ohne Internetverbindung</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>Self-Healing System</strong>
                  <span>Automatische Fehlerkorrektur und Recovery</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>GPU-Accelerated AI</strong>
                  <span>Lokale LLMs und Embedding-Modelle</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
