import React, { useState, useEffect, useCallback } from 'react';
import { SkeletonCard } from '../../components/ui/Skeleton';
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
  FiAlertCircle,
  FiSend,
  FiServer,
  FiRefreshCw,
  FiX,
  FiAlertTriangle,
  FiTerminal,
  FiLogOut,
  FiSun,
  FiMoon,
  FiUser,
} from 'react-icons/fi';
import UpdatePage from '../system/UpdatePage';
import SelfHealingEvents from '../system/SelfHealingEvents';
import PasswordManagement from './PasswordManagement';
import { Link } from 'react-router-dom';
import ClaudeTerminal from '../claude/ClaudeTerminal';
import { formatDate } from '../../utils/formatting';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useApi } from '../../hooks/useApi';
import './settings.css';

function Settings({ handleLogout, theme, onToggleTheme }) {
  const [activeSection, setActiveSection] = useState('general');

  const sections = [
    {
      id: 'general',
      label: 'General',
      icon: <FiInfo />,
      description: 'System information and configuration',
    },
    {
      id: 'ai-profile',
      label: 'KI-Profil',
      icon: <FiUser />,
      description: 'Firmen- und KI-Verhalten konfigurieren',
    },
    {
      id: 'company-context',
      label: 'Unternehmenskontext',
      icon: <FiFileText />,
      description: 'Globaler Kontext für alle KI-Anfragen',
    },
    {
      id: 'updates',
      label: 'Updates',
      icon: <FiUpload />,
      description: 'Manage system updates',
    },
    {
      id: 'selfhealing',
      label: 'Self-Healing',
      icon: <FiTool />,
      description: 'View system recovery events',
    },
    {
      id: 'services',
      label: 'Services',
      icon: <FiServer />,
      description: 'Dienste verwalten und neustarten',
    },
    {
      id: 'telegram',
      label: 'Telegram',
      icon: <FiSend />,
      description: 'Im Store verwalten',
    },
    {
      id: 'claude-terminal',
      label: 'Claude Terminal',
      icon: <FiTerminal />,
      description: 'Freie Textanfragen an das LLM',
    },
    {
      id: 'security',
      label: 'Security',
      icon: <FiLock />,
      description: 'Password and access management',
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings theme={theme} onToggleTheme={onToggleTheme} />
          </ComponentErrorBoundary>
        );
      case 'ai-profile':
        return (
          <ComponentErrorBoundary componentName="KI-Profil">
            <AIProfileSettings />
          </ComponentErrorBoundary>
        );
      case 'company-context':
        return (
          <ComponentErrorBoundary componentName="Firmenkontext">
            <CompanyContextSettings />
          </ComponentErrorBoundary>
        );
      case 'updates':
        return (
          <ComponentErrorBoundary componentName="Updates">
            <UpdatePage />
          </ComponentErrorBoundary>
        );
      case 'selfhealing':
        return (
          <ComponentErrorBoundary componentName="Self-Healing">
            <SelfHealingEvents />
          </ComponentErrorBoundary>
        );
      case 'services':
        return (
          <ComponentErrorBoundary componentName="Services">
            <ServicesSettings />
          </ComponentErrorBoundary>
        );
      case 'telegram':
        return (
          <div className="settings-section">
            <div className="settings-section-header">
              <h1 className="settings-section-title">Telegram Bot</h1>
              <p className="settings-section-description">
                Die Telegram Bot Verwaltung wurde in den Store verschoben.
              </p>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div
                  className="settings-card-body"
                  style={{ textAlign: 'center', padding: '2rem' }}
                >
                  <FiSend
                    size={32}
                    style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}
                  />
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    Bots erstellen, System-Benachrichtigungen konfigurieren und Logs einsehen
                    &ndash; alles im Telegram Bot App.
                  </p>
                  <Link
                    to="/telegram-bot"
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      background: 'var(--primary-color)',
                      color: 'white',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                    }}
                  >
                    <FiSend /> Im Store öffnen
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      case 'claude-terminal':
        return (
          <ComponentErrorBoundary componentName="Claude Terminal">
            <ClaudeTerminal />
          </ComponentErrorBoundary>
        );
      case 'security':
        return (
          <div className="settings-section">
            <ComponentErrorBoundary componentName="Passwortverwaltung">
              <PasswordManagement />
            </ComponentErrorBoundary>

            {/* Logout-Bereich */}
            <div className="security-logout-section">
              <h3>
                <FiLogOut /> Abmelden
              </h3>
              <p>Beendet Ihre aktuelle Sitzung und leitet Sie zur Login-Seite weiter.</p>
              <button type="button" onClick={handleLogout} className="logout-button-settings">
                <FiLogOut /> Abmelden
              </button>
            </div>
          </div>
        );
      default:
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings />
          </ComponentErrorBoundary>
        );
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
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
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
        <div className="settings-content-wrapper">{renderContent()}</div>
      </div>
    </div>
  );
}

// AI Profile Settings Component
const AI_INDUSTRIES = [
  'IT & Software',
  'Handel & E-Commerce',
  'Produktion & Fertigung',
  'Beratung & Dienstleistungen',
  'Gesundheit & Medizin',
];

const AI_TEAM_SIZES = [
  { label: '1-5', value: '5' },
  { label: '6-20', value: '20' },
  { label: '21-50', value: '50' },
  { label: '51-200', value: '200' },
  { label: '200+', value: '200+' },
];

function AIProfileSettings() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [products, setProducts] = useState('');
  const [answerLength, setAnswerLength] = useState('mittel');
  const [formality, setFormality] = useState('normal');

  // Track original state to detect changes
  const [original, setOriginal] = useState(null);

  const parseYaml = useCallback(yamlStr => {
    if (!yamlStr) return {};
    const data = {};
    for (const line of yamlStr.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || !trimmed || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        const val = trimmed
          .substring(colonIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
        data[key] = val;
      }
    }
    // Parse produkte list
    const lines = yamlStr.split('\n');
    const produkteIdx = lines.findIndex(l => l.trim() === 'produkte:');
    if (produkteIdx >= 0) {
      const items = [];
      for (let i = produkteIdx + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith('- ')) {
          items.push(l.substring(2).trim());
        } else if (l && !l.startsWith('#')) {
          break;
        }
      }
      data._produkte = items;
    }
    // Parse praeferenzen
    const praefIdx = lines.findIndex(l => l.trim() === 'praeferenzen:');
    if (praefIdx >= 0) {
      for (let i = praefIdx + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith('antwortlaenge:')) {
          data._antwortlaenge = l
            .split(':')[1]
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (l.startsWith('formalitaet:')) {
          data._formalitaet = l
            .split(':')[1]
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (l && !l.startsWith('#') && !l.startsWith('-')) {
          if (l.indexOf(':') > 0 && !l.startsWith(' ')) break;
        }
      }
    }
    return data;
  }, []);

  const fetchProfile = useCallback(
    async signal => {
      try {
        const data = await api.get('/memory/profile', { signal, showError: false });
        if (data.profile) {
          const parsed = parseYaml(data.profile);
          const firma = parsed.firma || '';
          const branche = parsed.branche || '';
          const team = parsed.mitarbeiter || '';
          const prods = parsed._produkte ? parsed._produkte.join(', ') : '';
          const aLen = parsed._antwortlaenge || 'mittel';
          const form = parsed._formalitaet || 'normal';

          setCompanyName(firma);
          if (AI_INDUSTRIES.includes(branche)) {
            setIndustry(branche);
            setCustomIndustry('');
          } else if (branche) {
            setIndustry('custom');
            setCustomIndustry(branche);
          }
          setTeamSize(team);
          setProducts(prods);
          setAnswerLength(aLen);
          setFormality(form);
          setOriginal({ firma, branche, team, prods, aLen, form });
        } else {
          setOriginal({
            firma: '',
            branche: '',
            team: '',
            prods: '',
            aLen: 'mittel',
            form: 'normal',
          });
        }
      } catch (error) {
        if (signal?.aborted) return;
        console.error('Error fetching profile:', error);
        setOriginal({
          firma: '',
          branche: '',
          team: '',
          prods: '',
          aLen: 'mittel',
          form: 'normal',
        });
      } finally {
        setLoading(false);
      }
    },
    [api, parseYaml]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchProfile(controller.signal);
    return () => controller.abort();
  }, [fetchProfile]);

  const currentState = {
    firma: companyName,
    branche: industry === 'custom' ? customIndustry : industry,
    team: teamSize,
    prods: products,
    aLen: answerLength,
    form: formality,
  };

  const hasChanges =
    original &&
    (currentState.firma !== original.firma ||
      currentState.branche !== original.branche ||
      currentState.team !== original.team ||
      currentState.prods !== original.prods ||
      currentState.aLen !== original.aLen ||
      currentState.form !== original.form);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const resolvedIndustry = industry === 'custom' ? customIndustry : industry;
      const productList = products
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);

      await api.post(
        '/memory/profile',
        {
          companyName: companyName || 'Unbekannt',
          industry: resolvedIndustry,
          teamSize,
          products: productList,
          preferences: {
            antwortlaenge: answerLength,
            formalitaet: formality,
          },
        },
        { showError: false }
      );

      setOriginal({ ...currentState });
      setMessage({ type: 'success', text: 'KI-Profil erfolgreich gespeichert' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.data?.error || error.message || 'Fehler beim Speichern',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h1 className="settings-section-title">KI-Profil</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={4} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">KI-Profil</h1>
        <p className="settings-section-description">
          Firmen- und KI-Verhalten konfigurieren. Diese Einstellungen werden automatisch bei jedem
          Chat als Kontext mitgegeben.
        </p>
      </div>

      <div className="settings-cards">
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              <FiUser style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              Unternehmensprofil
            </h3>
            <p className="settings-card-description">
              Grundlegende Informationen über Ihr Unternehmen
            </p>
          </div>
          <div className="settings-card-body">
            {message && (
              <div className={`company-context-message ${message.type}`}>
                {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
                <span>{message.text}</span>
              </div>
            )}

            <div className="ai-profile-form">
              {/* Firma */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">Firmenname</label>
                <input
                  type="text"
                  className="ai-profile-input"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="z.B. Muster GmbH"
                />
              </div>

              {/* Branche */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">Branche</label>
                <select
                  className="ai-profile-select"
                  value={industry}
                  onChange={e => {
                    setIndustry(e.target.value);
                    if (e.target.value !== 'custom') setCustomIndustry('');
                  }}
                >
                  <option value="">-- Bitte wählen --</option>
                  {AI_INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                  <option value="custom">Sonstige...</option>
                </select>
                {industry === 'custom' && (
                  <input
                    type="text"
                    className="ai-profile-input"
                    style={{ marginTop: '0.5rem' }}
                    value={customIndustry}
                    onChange={e => setCustomIndustry(e.target.value)}
                    placeholder="Ihre Branche eingeben..."
                  />
                )}
              </div>

              {/* Teamgröße */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">Teamgröße</label>
                <div className="ai-profile-radio-group">
                  {AI_TEAM_SIZES.map(ts => (
                    <label key={ts.value} className="ai-profile-radio-label">
                      <input
                        type="radio"
                        name="teamSize"
                        value={ts.value}
                        checked={teamSize === ts.value}
                        onChange={e => setTeamSize(e.target.value)}
                      />
                      <span className="ai-profile-radio-text">{ts.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Produkte */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">
                  Produkte & Services{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="ai-profile-input"
                  value={products}
                  onChange={e => setProducts(e.target.value)}
                  placeholder="z.B. Webentwicklung, Cloud-Hosting, Beratung"
                />
                <span className="ai-profile-hint">Komma-getrennt eingeben</span>
              </div>

              {/* Antwortlänge */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">Antwortlänge</label>
                <div className="ai-profile-radio-group">
                  {[
                    { value: 'kurz', label: 'Kurz' },
                    { value: 'mittel', label: 'Mittel' },
                    { value: 'ausfuehrlich', label: 'Ausführlich' },
                  ].map(opt => (
                    <label key={opt.value} className="ai-profile-radio-label">
                      <input
                        type="radio"
                        name="answerLength"
                        value={opt.value}
                        checked={answerLength === opt.value}
                        onChange={e => setAnswerLength(e.target.value)}
                      />
                      <span className="ai-profile-radio-text">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Formalität */}
              <div className="ai-profile-field">
                <label className="ai-profile-label">Formalität</label>
                <div className="ai-profile-radio-group">
                  {[
                    { value: 'formell', label: 'Formell' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'locker', label: 'Locker' },
                  ].map(opt => (
                    <label key={opt.value} className="ai-profile-radio-label">
                      <input
                        type="radio"
                        name="formality"
                        value={opt.value}
                        checked={formality === opt.value}
                        onChange={e => setFormality(e.target.value)}
                      />
                      <span className="ai-profile-radio-text">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="company-context-footer">
              <div className="company-context-meta">
                {hasChanges && (
                  <span className="company-context-unsaved">Ungespeicherte Änderungen</span>
                )}
              </div>
              <button
                type="button"
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
            <h3 className="settings-card-title">Wie wird das Profil genutzt?</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div className="settings-feature-icon">1</div>
                <div className="settings-feature-text">
                  <strong>Automatischer Kontext</strong>
                  <span>
                    Diese Einstellungen werden bei jedem Chat automatisch an die KI übergeben
                  </span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">2</div>
                <div className="settings-feature-text">
                  <strong>Bessere Antworten</strong>
                  <span>
                    Die KI kennt Ihre Branche und passt Sprache und Detailgrad entsprechend an
                  </span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">3</div>
                <div className="settings-feature-text">
                  <strong>Ergänzt Unternehmenskontext</strong>
                  <span>
                    Wird zusammen mit dem Unternehmenskontext und Projekt-Prompts kombiniert
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Company Context Settings Component (RAG 2.0)
function CompanyContextSettings() {
  const api = useApi();
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
*Diese Informationen werden bei allen KI-Anfragen als Hintergrundkontext bereitgestellt.*`;

  const fetchContent = useCallback(
    async signal => {
      try {
        const data = await api.get('/settings/company-context', { signal, showError: false });
        setContent(data.content || defaultTemplate);
        setOriginalContent(data.content || defaultTemplate);
        setLastUpdated(data.updated_at);
      } catch (error) {
        if (signal?.aborted) return;
        console.error('Error fetching company context:', error);
        setContent(defaultTemplate);
        setOriginalContent(defaultTemplate);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchContent(controller.signal);
    return () => controller.abort();
  }, [fetchContent]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const data = await api.put('/settings/company-context', { content }, { showError: false });
      setOriginalContent(content);
      setLastUpdated(data.updated_at);
      setMessage({ type: 'success', text: 'Unternehmenskontext erfolgreich gespeichert' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.data?.error || error.message || 'Fehler beim Speichern',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h1 className="settings-section-title">Unternehmenskontext</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={4} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">Unternehmenskontext</h1>
        <p className="settings-section-description">
          Dieser Text wird bei <strong>allen</strong> KI-Anfragen als Hintergrundkontext mitgegeben
          (Chat und RAG).
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
              Beschreiben Sie Ihr Unternehmen, Ihre Produkte und Ihre Zielgruppen. Diese
              Informationen helfen der KI, Ihre Fragen besser zu verstehen.
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
              onChange={e => setContent(e.target.value)}
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
                type="button"
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
            <p className="settings-card-description">
              So nutzen Sie den Unternehmenskontext optimal
            </p>
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
function GeneralSettings({ theme, onToggleTheme }) {
  const [systemInfo, setSystemInfo] = useState({
    version: '1.0.0',
    hostname: 'arasul-edge',
    jetpack_version: '6.0',
    docker_version: '24.0.7',
    compose_version: '2.21.0',
  });

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">General</h1>
        <p className="settings-section-description">System information and configuration</p>
      </div>

      <div className="settings-cards">
        {/* Theme Toggle */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              {theme === 'dark' ? (
                <FiMoon style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              ) : (
                <FiSun style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              )}
              Erscheinungsbild
            </h3>
            <p className="settings-card-description">
              Wählen Sie zwischen hellem und dunklem Design
            </p>
          </div>
          <div className="settings-card-body">
            <div className="theme-toggle-row">
              <div className="theme-toggle-info">
                <span className="theme-toggle-current">
                  Aktuelles Theme: <strong>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</strong>
                </span>
                <span className="theme-toggle-hint">
                  {theme === 'dark'
                    ? 'Dunkles Design für reduzierte Augenbelastung'
                    : 'Helles Design für bessere Lesbarkeit bei Tageslicht'}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                className="theme-toggle-switch-settings"
                title={theme === 'dark' ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
                aria-label="Theme umschalten"
              >
                <span className="theme-toggle-label">
                  {theme === 'dark' ? <FiMoon /> : <FiSun />}
                  <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
                </span>
                <span className="theme-toggle-track" />
              </button>
            </div>
          </div>
        </div>

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
              Arasul ist eine autonome Edge-AI-Plattform, die auf NVIDIA Jetson AGX Orin läuft. Die
              Plattform bietet lokale KI-Funktionen, Multi-Jahres-Betrieb ohne Wartung und ein
              einheitliches Dashboard-Interface.
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

// Services Settings Component
function ServicesSettings() {
  const api = useApi();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restartingService, setRestartingService] = useState(null);
  const [confirmRestart, setConfirmRestart] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchServices = useCallback(
    async signal => {
      try {
        const data = await api.get('/services/all', { signal, showError: false });
        setServices(data.services || []);
      } catch (error) {
        if (signal?.aborted) return;
        console.error('Error fetching services:', error);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchServices(controller.signal);
    // Refresh services every 15 seconds
    const interval = setInterval(() => fetchServices(controller.signal), 15000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchServices]);

  const handleRestartClick = service => {
    setConfirmRestart(service);
    setMessage(null);
  };

  const handleConfirmRestart = async () => {
    if (!confirmRestart) return;

    const serviceName = confirmRestart.name;
    setRestartingService(serviceName);
    setConfirmRestart(null);
    setMessage(null);

    try {
      const data = await api.post(`/services/restart/${serviceName}`, null, { showError: false });
      if (data.success) {
        setMessage({
          type: 'success',
          text: `Service "${serviceName}" wurde erfolgreich neugestartet (${data.duration_ms}ms)`,
        });
        // Refresh services list
        setTimeout(fetchServices, 2000);
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Fehler beim Neustart des Service',
        });
      }
    } catch (error) {
      if (error.status === 429) {
        setMessage({
          type: 'error',
          text:
            error.data?.message || 'Bitte warten Sie, bevor Sie diesen Service erneut neustarten',
        });
      } else {
        setMessage({
          type: 'error',
          text: error.data?.message || error.message || 'Netzwerkfehler beim Neustart des Service',
        });
      }
    } finally {
      setRestartingService(null);
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'healthy':
        return 'service-status-healthy';
      case 'starting':
      case 'restarting':
        return 'service-status-warning';
      case 'failed':
      case 'exited':
      case 'unhealthy':
        return 'service-status-error';
      default:
        return 'service-status-unknown';
    }
  };

  const getStatusLabel = status => {
    switch (status) {
      case 'healthy':
        return 'Aktiv';
      case 'starting':
        return 'Startet...';
      case 'restarting':
        return 'Neustart...';
      case 'failed':
      case 'unhealthy':
        return 'Fehler';
      case 'exited':
        return 'Beendet';
      default:
        return 'Unbekannt';
    }
  };

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h1 className="settings-section-title">Services</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={3} />
        <SkeletonCard hasAvatar={false} lines={3} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">Services</h1>
        <p className="settings-section-description">
          Verwalten Sie die Arasul Platform Dienste. Hier können Sie den Status einsehen und Dienste
          bei Bedarf neustarten.
        </p>
      </div>

      {message && (
        <div className={`services-message ${message.type}`}>
          {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
          <span>{message.text}</span>
          <button type="button" className="services-message-close" onClick={() => setMessage(null)}>
            <FiX />
          </button>
        </div>
      )}

      <div className="settings-cards">
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              <FiServer style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              Platform Dienste
            </h3>
            <p className="settings-card-description">Alle aktiven Dienste der Arasul Platform</p>
          </div>
          <div className="settings-card-body">
            <div className="services-list-settings">
              {services.map(service => (
                <div key={service.id} className="service-item-settings">
                  <div className="service-info-settings">
                    <div className={`service-status-dot ${getStatusColor(service.status)}`} />
                    <div className="service-details-settings">
                      <span className="service-name-settings">{service.name}</span>
                      <span className={`service-status-text ${getStatusColor(service.status)}`}>
                        {getStatusLabel(service.status)}
                      </span>
                    </div>
                  </div>
                  <div className="service-actions-settings">
                    {service.canRestart && (
                      <button
                        type="button"
                        className={`service-restart-btn ${restartingService === service.name ? 'restarting' : ''}`}
                        onClick={() => handleRestartClick(service)}
                        disabled={restartingService === service.name}
                        title={`${service.name} neustarten`}
                      >
                        <FiRefreshCw
                          className={restartingService === service.name ? 'spinning' : ''}
                        />
                        <span>
                          {restartingService === service.name ? 'Neustart...' : 'Neustart'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Warning Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              <FiAlertTriangle
                style={{
                  marginRight: '0.5rem',
                  verticalAlign: 'middle',
                  color: 'var(--warning-color)',
                }}
              />
              Hinweise
            </h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div
                  className="settings-feature-icon"
                  style={{
                    background: 'color-mix(in srgb, var(--warning-color) 20%, transparent)',
                    color: 'var(--warning-color)',
                  }}
                >
                  !
                </div>
                <div className="settings-feature-text">
                  <strong>Downtime beachten</strong>
                  <span>Während des Neustarts ist der Dienst kurzzeitig nicht verfügbar</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div
                  className="settings-feature-icon"
                  style={{
                    background: 'color-mix(in srgb, var(--warning-color) 20%, transparent)',
                    color: 'var(--warning-color)',
                  }}
                >
                  !
                </div>
                <div className="settings-feature-text">
                  <strong>Rate Limit</strong>
                  <span>Jeder Dienst kann maximal einmal pro Minute neugestartet werden</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div
                  className="settings-feature-icon"
                  style={{
                    background: 'color-mix(in srgb, var(--primary-color) 20%, transparent)',
                    color: 'var(--primary-color)',
                  }}
                >
                  i
                </div>
                <div className="settings-feature-text">
                  <strong>Audit-Log</strong>
                  <span>Alle Neustarts werden im Self-Healing Event-Log protokolliert</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmRestart && (
        <div className="modal-overlay" onClick={() => setConfirmRestart(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <FiAlertTriangle className="modal-warning-icon" />
              <h3>Service neustarten?</h3>
            </div>
            <div className="modal-body">
              <p>
                Möchten Sie den Service <strong>{confirmRestart.name}</strong> wirklich neustarten?
              </p>
              <p className="modal-warning-text">
                Der Dienst wird während des Neustarts kurzzeitig nicht verfügbar sein.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-cancel"
                onClick={() => setConfirmRestart(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-confirm"
                onClick={handleConfirmRestart}
              >
                <FiRefreshCw />
                Neustarten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
