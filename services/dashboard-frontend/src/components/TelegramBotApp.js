import React, { useState, useEffect, useCallback } from 'react';
import {
  FiSend,
  FiSettings,
  FiList,
  FiClock,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiAlertCircle,
  FiBell,
  FiActivity,
  FiZap,
  FiTerminal,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiChevronRight,
} from 'react-icons/fi';
import TelegramSetupWizard from './TelegramSetupWizard';
import { useToast } from '../contexts/ToastContext';
import useConfirm from '../hooks/useConfirm';
import { API_BASE } from '../config/api';
import '../telegram-bot-app.css';

/**
 * TelegramBotApp - Main component for Telegram Bot App in Store
 * Features:
 * - Zero-Config Magic Setup
 * - Custom Notification Rules
 * - Orchestrator Status
 * - Notification History
 */
function TelegramBotApp() {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState('overview');
  const [config, setConfig] = useState(null);
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [orchestratorStatus, setOrchestratorStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load config
      const configRes = await fetch(`${API_BASE}/telegram-app/config`, {
        credentials: 'include',
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);

        // Show setup wizard if not configured
        if (!configData.configured) {
          setShowSetupWizard(true);
        }
      }

      // Load rules
      const rulesRes = await fetch(`${API_BASE}/telegram-app/rules`, {
        credentials: 'include',
      });
      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setRules(rulesData.rules || []);
      }

      // Load orchestrator status
      const orchestratorRes = await fetch(`${API_BASE}/telegram-app/orchestrator/status`, {
        credentials: 'include',
      });
      if (orchestratorRes.ok) {
        const orchestratorData = await orchestratorRes.json();
        setOrchestratorStatus(orchestratorData);
      }
    } catch (err) {
      console.error('Error loading Telegram App data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle setup completion
  const handleSetupComplete = () => {
    setShowSetupWizard(false);
    loadData();
  };

  // Toggle rule enabled/disabled
  const toggleRule = async (ruleId, currentState) => {
    try {
      await fetch(`${API_BASE}/telegram-app/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isEnabled: !currentState }),
      });

      setRules(rules.map(r => (r.id === ruleId ? { ...r, is_enabled: !currentState } : r)));
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  // Test rule
  const testRule = async ruleId => {
    try {
      const res = await fetch(`${API_BASE}/telegram-app/rules/${ruleId}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        toast.success('Test-Nachricht gesendet!');
      } else {
        const data = await res.json();
        toast.error(`Fehler: ${data.error || 'Unbekannter Fehler'}`);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Delete rule
  const deleteRule = async (ruleId, ruleName) => {
    if (!(await confirm({ message: `Regel "${ruleName}" wirklich loeschen?` }))) return;

    try {
      await fetch(`${API_BASE}/telegram-app/rules/${ruleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      setRules(rules.filter(r => r.id !== ruleId));
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  // Group rules by source
  const groupedRules = rules.reduce((acc, rule) => {
    const source = rule.event_source || 'custom';
    if (!acc[source]) acc[source] = [];
    acc[source].push(rule);
    return acc;
  }, {});

  // Source labels and icons
  const sourceInfo = {
    claude: { label: 'Claude Sessions', icon: FiTerminal, color: '#45ADFF' },
    system: { label: 'System Events', icon: FiActivity, color: '#94A3B8' } /* Grau statt Grün */,
    n8n: { label: 'Workflow Events', icon: FiZap, color: '#F59E0B' },
    custom: { label: 'Benutzerdefiniert', icon: FiBell, color: '#94A3B8' },
  };

  // Severity badges
  const severityBadge = severity => {
    const colors = {
      info: '#45ADFF',
      warning: '#F59E0B',
      error: '#EF4444',
      critical: '#DC2626',
    };
    return (
      <span className="severity-badge" style={{ backgroundColor: colors[severity] || colors.info }}>
        {severity}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="telegram-bot-app">
        <div className="telegram-loading">
          <FiRefreshCw className="spin" />
          <span>Lade Telegram Bot App...</span>
        </div>
      </div>
    );
  }

  if (showSetupWizard) {
    return (
      <div className="telegram-bot-app">
        <TelegramSetupWizard onComplete={handleSetupComplete} />
      </div>
    );
  }

  return (
    <div className="telegram-bot-app">
      {/* Header */}
      <header className="telegram-app-header">
        <div className="telegram-app-title">
          <FiSend className="telegram-app-icon" />
          <div>
            <h1>Telegram Bot</h1>
            <p className="telegram-app-subtitle">
              {config?.configured ? (
                <>
                  Verbunden mit <strong>@{config.config?.bot_username || 'Bot'}</strong>
                </>
              ) : (
                'Nicht konfiguriert'
              )}
            </p>
          </div>
        </div>
        <div className="telegram-app-actions">
          <button className="btn btn-secondary" onClick={() => setShowSetupWizard(true)}>
            <FiSettings /> Neu einrichten
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="telegram-error-banner">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={loadData}>
            <FiRefreshCw /> Erneut laden
          </button>
        </div>
      )}

      {/* Navigation tabs */}
      <nav className="telegram-app-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <FiActivity /> Ubersicht
        </button>
        <button
          className={activeTab === 'rules' ? 'active' : ''}
          onClick={() => setActiveTab('rules')}
        >
          <FiBell /> Benachrichtigungen
        </button>
        <button
          className={activeTab === 'orchestrator' ? 'active' : ''}
          onClick={() => setActiveTab('orchestrator')}
        >
          <FiZap /> Orchestrator
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          <FiClock /> Verlauf
        </button>
      </nav>

      {/* Content */}
      <main className="telegram-app-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="telegram-overview">
            {/* Stats Cards */}
            <div className="telegram-stats-grid">
              <div className="telegram-stat-card">
                <div className="stat-icon">
                  <FiBell />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{rules.length}</span>
                  <span className="stat-label">Benachrichtigungsregeln</span>
                </div>
              </div>
              <div className="telegram-stat-card">
                <div className="stat-icon active">
                  <FiCheck />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{rules.filter(r => r.is_enabled).length}</span>
                  <span className="stat-label">Aktive Regeln</span>
                </div>
              </div>
              <div className="telegram-stat-card">
                <div className="stat-icon">
                  <FiSend />
                </div>
                <div className="stat-content">
                  <span className="stat-value">
                    {rules.reduce((sum, r) => sum + (r.trigger_count || 0), 0)}
                  </span>
                  <span className="stat-label">Gesendete Nachrichten</span>
                </div>
              </div>
              <div className="telegram-stat-card">
                <div className="stat-icon">
                  <FiZap />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{orchestratorStatus?.agents?.length || 3}</span>
                  <span className="stat-label">Aktive Agents</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="telegram-section">
              <h2>Schnellaktionen</h2>
              <div className="telegram-quick-actions">
                <button className="quick-action-btn" onClick={() => setActiveTab('rules')}>
                  <FiPlus />
                  <span>Neue Regel erstellen</span>
                  <FiChevronRight />
                </button>
                <button
                  className="quick-action-btn"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/telegram-app/rules/1/test`, {
                        method: 'POST',
                        credentials: 'include',
                      });
                      if (res.ok) toast.success('Test-Nachricht gesendet!');
                    } catch (e) {
                      toast.error('Fehler beim Senden');
                    }
                  }}
                >
                  <FiSend />
                  <span>Test-Nachricht senden</span>
                  <FiChevronRight />
                </button>
                <button className="quick-action-btn" onClick={() => setActiveTab('orchestrator')}>
                  <FiActivity />
                  <span>Agent-Logs anzeigen</span>
                  <FiChevronRight />
                </button>
              </div>
            </div>

            {/* Active Rules Preview */}
            <div className="telegram-section">
              <h2>Aktive Regeln</h2>
              <div className="telegram-rules-preview">
                {rules
                  .filter(r => r.is_enabled)
                  .slice(0, 5)
                  .map(rule => (
                    <div key={rule.id} className="rule-preview-item">
                      <span
                        className="rule-source-dot"
                        style={{ backgroundColor: sourceInfo[rule.event_source]?.color }}
                      />
                      <span className="rule-name">{rule.name}</span>
                      {severityBadge(rule.severity)}
                    </div>
                  ))}
                {rules.filter(r => r.is_enabled).length === 0 && (
                  <p className="no-data">Keine aktiven Regeln</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div className="telegram-rules">
            <div className="telegram-rules-header">
              <h2>Benachrichtigungsregeln</h2>
              <button className="btn btn-primary">
                <FiPlus /> Neue Regel
              </button>
            </div>

            {Object.entries(groupedRules).map(([source, sourceRules]) => {
              const info = sourceInfo[source] || sourceInfo.custom;
              const Icon = info.icon;

              return (
                <div key={source} className="telegram-rules-group">
                  <h3 className="rules-group-title">
                    <Icon style={{ color: info.color }} />
                    {info.label}
                    <span className="rules-count">{sourceRules.length}</span>
                  </h3>

                  <div className="rules-list">
                    {sourceRules.map(rule => (
                      <div
                        key={rule.id}
                        className={`rule-card ${!rule.is_enabled ? 'disabled' : ''}`}
                      >
                        <div className="rule-header">
                          <div className="rule-info">
                            <span className="rule-name">{rule.name}</span>
                            {severityBadge(rule.severity)}
                          </div>
                          <div className="rule-toggle">
                            <button
                              className={`toggle-btn ${rule.is_enabled ? 'active' : ''}`}
                              onClick={() => toggleRule(rule.id, rule.is_enabled)}
                              title={rule.is_enabled ? 'Deaktivieren' : 'Aktivieren'}
                            >
                              {rule.is_enabled ? <FiToggleRight /> : <FiToggleLeft />}
                            </button>
                          </div>
                        </div>

                        {rule.description && <p className="rule-description">{rule.description}</p>}

                        <div className="rule-meta">
                          <span className="rule-event-type">{rule.event_type}</span>
                          <span className="rule-cooldown">Cooldown: {rule.cooldown_seconds}s</span>
                          <span className="rule-trigger-count">
                            {rule.trigger_count || 0}x ausgeloest
                          </span>
                        </div>

                        <div className="rule-actions">
                          <button
                            className="btn btn-icon"
                            onClick={() => testRule(rule.id)}
                            title="Test senden"
                          >
                            <FiSend />
                          </button>
                          <button className="btn btn-icon" title="Bearbeiten">
                            <FiEdit2 />
                          </button>
                          <button
                            className="btn btn-icon btn-danger"
                            onClick={() => deleteRule(rule.id, rule.name)}
                            title="Löschen"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {rules.length === 0 && (
              <div className="telegram-empty">
                <FiBell />
                <p>Keine Benachrichtigungsregeln vorhanden</p>
                <button className="btn btn-primary">
                  <FiPlus /> Erste Regel erstellen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Orchestrator Tab */}
        {activeTab === 'orchestrator' && (
          <div className="telegram-orchestrator">
            <div className="telegram-section">
              <h2>Orchestrator Status</h2>

              <div className="orchestrator-info-card">
                <div className="orchestrator-config">
                  <div className="config-item">
                    <span className="config-label">Modus</span>
                    <span className="config-value">
                      {orchestratorStatus?.orchestratorMode || 'master'}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Thinking Mode</span>
                    <span
                      className={`config-value ${orchestratorStatus?.thinkingMode ? 'active' : ''}`}
                    >
                      {orchestratorStatus?.thinkingMode ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Skip Permissions</span>
                    <span
                      className={`config-value ${orchestratorStatus?.skipPermissions ? 'active' : ''}`}
                    >
                      {orchestratorStatus?.skipPermissions ? 'Ja' : 'Nein'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="telegram-section">
              <h2>Sub-Agents</h2>

              <div className="agents-grid">
                {['setup', 'notification', 'command'].map(agentType => {
                  const agentState = orchestratorStatus?.state?.find(
                    s => s.agent_type === agentType
                  );

                  return (
                    <div key={agentType} className="agent-card">
                      <div className="agent-header">
                        <span className="agent-name">{agentType}</span>
                        <span className="agent-status active">Bereit</span>
                      </div>
                      <div className="agent-stats">
                        <div className="agent-stat">
                          <span className="stat-label">Aktionen</span>
                          <span className="stat-value">{agentState?.actions_count || 0}</span>
                        </div>
                        <div className="agent-stat">
                          <span className="stat-label">Thinking-Logs</span>
                          <span className="stat-value">{agentState?.thinking_entries || 0}</span>
                        </div>
                      </div>
                      {agentState?.last_action && (
                        <div className="agent-last-action">
                          Letzte Aktion: {new Date(agentState.last_action).toLocaleString('de-DE')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="telegram-history">
            <div className="telegram-section">
              <h2>Benachrichtigungsverlauf</h2>

              {history.length > 0 ? (
                <div className="history-list">
                  {history.map(item => (
                    <div key={item.id} className="history-item">
                      <div className="history-icon">{item.delivered ? <FiCheck /> : <FiX />}</div>
                      <div className="history-content">
                        <span className="history-rule">{item.rule_name || 'System'}</span>
                        <span className="history-message">
                          {item.message_sent?.slice(0, 100)}...
                        </span>
                      </div>
                      <div className="history-meta">
                        <span className="history-time">
                          {new Date(item.created_at).toLocaleString('de-DE')}
                        </span>
                        {severityBadge(item.severity)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="telegram-empty">
                  <FiClock />
                  <p>Noch keine Benachrichtigungen gesendet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {ConfirmDialog}
    </div>
  );
}

export default TelegramBotApp;
