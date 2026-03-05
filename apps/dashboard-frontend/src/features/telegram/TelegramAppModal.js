import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiX,
  FiPlus,
  FiSend,
  FiMessageCircle,
  FiPower,
  FiTrash2,
  FiEdit2,
  FiRefreshCw,
  FiLoader,
  FiActivity,
  FiSettings,
  FiFileText,
  FiCheck,
  FiAlertCircle,
  FiEye,
  FiEyeOff,
  FiBook,
  FiDatabase,
  FiCpu,
} from 'react-icons/fi';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import BotSetupWizard from './BotSetupWizard';
import BotDetailsModal from './BotDetailsModal';
import { useApi } from '../../hooks/useApi';
import './TelegramAppModal.css';

/**
 * Telegram App Modal - Fullscreen with Sidebar Navigation
 * Sections: Bots, Status, System, Logs
 */
function TelegramAppModal({ isOpen, onClose }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();
  const api = useApi();
  const isMountedRef = useRef(true);

  // Navigation
  const [activeSection, setActiveSection] = useState('bots');

  // Bots state
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [appStatus, setAppStatus] = useState(null);
  const [togglingBot, setTogglingBot] = useState(null);
  const [deletingBot, setDeletingBot] = useState(null);

  // System section state (migrated from TelegramSettings)
  const [systemConfig, setSystemConfig] = useState({ bot_token: '', chat_id: '', enabled: false });
  const [hasToken, setHasToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemTesting, setSystemTesting] = useState(false);
  const [systemMessage, setSystemMessage] = useState(null);
  const [originalSystemConfig, setOriginalSystemConfig] = useState(null);

  // Logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch bots & status
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [botsData, statusData] = await Promise.all([
        api.get('/telegram-bots', { showError: false }),
        api.get('/telegram-app/status', { showError: false }),
      ]);
      if (isMountedRef.current) {
        setBots(botsData.bots || []);
        setAppStatus(statusData);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError('Fehler beim Laden der Telegram-Daten');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [api]);

  // Fetch system config
  const fetchSystemConfig = useCallback(
    async signal => {
      try {
        const data = await api.get('/telegram/config', { showError: false, signal });
        if (isMountedRef.current) {
          setSystemConfig({
            bot_token: '',
            chat_id: data.chat_id || '',
            enabled: data.enabled || false,
          });
          setHasToken(data.configured || false);
          setOriginalSystemConfig({
            bot_token: '',
            chat_id: data.chat_id || '',
            enabled: data.enabled || false,
          });
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (isMountedRef.current)
          setSystemMessage({ type: 'error', text: 'Fehler beim Laden der Konfiguration' });
      } finally {
        if (isMountedRef.current) setSystemLoading(false);
      }
    },
    [api]
  );

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await api.get('/telegram/audit-logs?limit=50', { showError: false });
      if (isMountedRef.current) setAuditLogs(data.logs || []);
    } catch {
      // silently fail
    } finally {
      if (isMountedRef.current) setLogsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchData();
    fetchSystemConfig(controller.signal);
    return () => controller.abort();
  }, [isOpen, fetchData, fetchSystemConfig]);

  // Load logs on tab switch
  useEffect(() => {
    if (activeSection === 'logs' && auditLogs.length === 0) {
      fetchLogs();
    }
  }, [activeSection, auditLogs.length, fetchLogs]);

  // Bot actions
  const handleBotCreated = newBot => {
    setBots(prev => [...prev, newBot]);
    setShowWizard(false);
    toast.success('Bot erfolgreich erstellt');
  };

  const handleToggleBot = async (botId, currentActive) => {
    setTogglingBot(botId);
    try {
      const endpoint = currentActive ? 'deactivate' : 'activate';
      await api.post(`/telegram-bots/${botId}/${endpoint}`, undefined, { showError: false });
      setBots(prev =>
        prev.map(bot => (bot.id === botId ? { ...bot, isActive: !currentActive } : bot))
      );
      toast.success(currentActive ? 'Bot deaktiviert' : 'Bot aktiviert');
    } catch {
      toast.error('Fehler beim Umschalten des Bots');
    } finally {
      setTogglingBot(null);
    }
  };

  const handleDeleteBot = async botId => {
    if (
      !(await confirm({
        message: 'Bot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      }))
    )
      return;
    setDeletingBot(botId);
    try {
      await api.del(`/telegram-bots/${botId}`, { showError: false });
      setBots(prev => prev.filter(bot => bot.id !== botId));
      toast.success('Bot gelöscht');
    } catch {
      toast.error('Fehler beim Löschen des Bots');
    } finally {
      setDeletingBot(null);
    }
  };

  const handleBotUpdated = updatedBot => {
    setBots(prev => prev.map(b => (b.id === updatedBot.id ? updatedBot : b)));
    setSelectedBot(null);
  };

  // System section handlers
  const handleSystemSave = async () => {
    setSystemSaving(true);
    setSystemMessage(null);
    try {
      const payload = { chat_id: systemConfig.chat_id, enabled: systemConfig.enabled };
      if (systemConfig.bot_token) payload.bot_token = systemConfig.bot_token;
      const data = await api.post('/telegram/config', payload, { showError: false });
      if (!isMountedRef.current) return;
      setHasToken(data.has_token || data.success || false);
      setSystemConfig(prev => ({ ...prev, bot_token: '' }));
      setOriginalSystemConfig({
        bot_token: '',
        chat_id: systemConfig.chat_id,
        enabled: systemConfig.enabled,
      });
      setSystemMessage({ type: 'success', text: 'Konfiguration gespeichert' });
    } catch (err) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler beim Speichern' });
    } finally {
      if (isMountedRef.current) setSystemSaving(false);
    }
  };

  const handleSystemToggle = async () => {
    setSystemSaving(true);
    setSystemMessage(null);
    const newEnabled = !systemConfig.enabled;
    try {
      await api.post('/telegram/config', { enabled: newEnabled }, { showError: false });
      if (!isMountedRef.current) return;
      setSystemConfig(prev => ({ ...prev, enabled: newEnabled }));
      setOriginalSystemConfig(prev => ({ ...prev, enabled: newEnabled }));
      setSystemMessage({
        type: 'success',
        text: newEnabled
          ? 'System-Benachrichtigungen aktiviert'
          : 'System-Benachrichtigungen deaktiviert',
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler' });
    } finally {
      if (isMountedRef.current) setSystemSaving(false);
    }
  };

  const handleSystemTest = async () => {
    setSystemTesting(true);
    setSystemMessage(null);
    try {
      await api.post('/telegram/test', undefined, { showError: false });
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'success', text: 'Test-Nachricht erfolgreich gesendet!' });
    } catch (err) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler beim Test' });
    } finally {
      if (isMountedRef.current) setSystemTesting(false);
    }
  };

  const systemHasChanges =
    systemConfig.bot_token !== '' || systemConfig.chat_id !== originalSystemConfig?.chat_id;

  if (!isOpen) return null;

  const sections = [
    { id: 'bots', label: 'Bots', icon: <FiMessageCircle /> },
    { id: 'status', label: 'Status', icon: <FiActivity /> },
    { id: 'system', label: 'System', icon: <FiSettings /> },
    { id: 'logs', label: 'Logs', icon: <FiFileText /> },
  ];

  const activeBots = bots.filter(b => b.isActive).length;

  return (
    <div className="tg-fullscreen-overlay">
      <div className="tg-fullscreen-modal">
        {/* Header */}
        <div className="tg-modal-header">
          <div className="tg-modal-title">
            <FiSend className="tg-modal-icon" />
            <h2>Telegram Bot</h2>
            {activeBots > 0 && <span className="tg-active-badge">{activeBots} aktiv</span>}
          </div>
          <button type="button" className="tg-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="tg-modal-body">
          {/* Sidebar */}
          <nav className="tg-sidebar">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={`tg-sidebar-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="tg-content">
            {activeSection === 'bots' && (
              <BotsSection
                bots={bots}
                loading={loading}
                error={error}
                togglingBot={togglingBot}
                deletingBot={deletingBot}
                onRefresh={fetchData}
                onCreateBot={() => setShowWizard(true)}
                onEditBot={setSelectedBot}
                onToggleBot={handleToggleBot}
                onDeleteBot={handleDeleteBot}
              />
            )}
            {activeSection === 'status' && (
              <StatusSection appStatus={appStatus} bots={bots} loading={loading} />
            )}
            {activeSection === 'system' && (
              <SystemSection
                config={systemConfig}
                setConfig={setSystemConfig}
                hasToken={hasToken}
                showToken={showToken}
                setShowToken={setShowToken}
                loading={systemLoading}
                saving={systemSaving}
                testing={systemTesting}
                message={systemMessage}
                hasChanges={systemHasChanges}
                onSave={handleSystemSave}
                onToggle={handleSystemToggle}
                onTest={handleSystemTest}
              />
            )}
            {activeSection === 'logs' && (
              <LogsSection logs={auditLogs} loading={logsLoading} onRefresh={fetchLogs} />
            )}
          </div>
        </div>

        {/* Sub-modals */}
        {showWizard && (
          <div className="tg-submodal-overlay" onClick={() => setShowWizard(false)}>
            <div className="tg-submodal" onClick={e => e.stopPropagation()}>
              <div className="tg-submodal-header">
                <h3>Neuen Bot erstellen</h3>
                <button type="button" className="tg-close-btn" onClick={() => setShowWizard(false)}>
                  <FiX />
                </button>
              </div>
              <div className="tg-submodal-body">
                <BotSetupWizard
                  onComplete={handleBotCreated}
                  onCancel={() => setShowWizard(false)}
                />
              </div>
            </div>
          </div>
        )}

        {selectedBot && (
          <BotDetailsModal
            bot={selectedBot}
            isOpen={!!selectedBot}
            onClose={() => setSelectedBot(null)}
            onUpdate={handleBotUpdated}
          />
        )}
        {ConfirmDialog}
      </div>
    </div>
  );
}

/* ============================================================================
   BOTS SECTION
   ============================================================================ */
function BotsSection({
  bots,
  loading,
  error,
  togglingBot,
  deletingBot,
  onRefresh,
  onCreateBot,
  onEditBot,
  onToggleBot,
  onDeleteBot,
}) {
  return (
    <div className="tg-section">
      <div className="tg-section-header">
        <h3>
          {bots.length} Bot{bots.length !== 1 ? 's' : ''}
        </h3>
        <div className="tg-section-actions">
          <button
            type="button"
            className="tg-btn-icon"
            onClick={onRefresh}
            disabled={loading}
            title="Aktualisieren"
          >
            <FiRefreshCw className={loading ? 'spinning' : ''} />
          </button>
          <button type="button" className="tg-btn-primary" onClick={onCreateBot}>
            <FiPlus /> Neuer Bot
          </button>
        </div>
      </div>

      {error && <div className="tg-error-banner">{error}</div>}

      {loading ? (
        <div className="tg-bots-grid">
          {[1, 2].map(i => (
            <div key={i} className="tg-bot-card tg-skeleton-card">
              <div className="tg-bot-card-top">
                <div className="tg-skeleton-line" style={{ width: 120, height: 16 }} />
                <div className="tg-skeleton-badge" />
              </div>
              <div className="tg-skeleton-line" style={{ width: '80%', height: 12 }} />
              <div className="tg-bot-card-stats">
                <div className="tg-skeleton-line" style={{ width: 80, height: 12 }} />
                <div className="tg-skeleton-line" style={{ width: 60, height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="tg-empty-state">
          <div className="tg-empty-icon">
            <FiSend size={32} />
          </div>
          <h4>Noch keine Bots</h4>
          <p>
            Verbinde deinen ersten Telegram Bot mit einer KI und starte Gespräche direkt aus
            Telegram.
          </p>
          <button type="button" className="tg-btn-primary" onClick={onCreateBot}>
            <FiPlus /> Bot erstellen
          </button>
        </div>
      ) : (
        <div className="tg-bots-grid">
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              toggling={togglingBot === bot.id}
              deleting={deletingBot === bot.id}
              onEdit={() => onEditBot(bot)}
              onToggle={() => onToggleBot(bot.id, bot.isActive)}
              onDelete={() => onDeleteBot(bot.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   BOT CARD
   ============================================================================ */
function BotCard({ bot, toggling, deleting, onEdit, onToggle, onDelete }) {
  const isActive = bot.isActive;
  const provider = bot.llmProvider || 'ollama';
  const model = bot.llmModel || '';
  const username = bot.username;
  const chatCount = bot.chatCount || 0;
  const messageCount = bot.messageCount || 0;
  const ragEnabled = bot.ragEnabled || false;
  const ragSpaceIds = bot.ragSpaceIds;
  const isMaster = ragEnabled && !ragSpaceIds;

  return (
    <div className={`tg-bot-card ${isActive ? 'active' : ''}`}>
      <div className="tg-bot-card-top">
        <div className="tg-bot-info">
          <div className="tg-bot-name-row">
            <h4>{bot.name}</h4>
            {isMaster && <span className="tg-master-badge">Master</span>}
          </div>
          <span className="tg-bot-username">@{username || 'nicht verbunden'}</span>
        </div>
        <span className={`tg-bot-status ${isActive ? 'active' : 'inactive'}`}>
          <span className="tg-status-dot" />
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      <div className="tg-bot-card-stats">
        {ragEnabled && (
          <span className="tg-stat">
            <FiBook /> {ragSpaceIds ? `${ragSpaceIds.length} Spaces` : 'Alle Spaces'}
          </span>
        )}
        <span className="tg-stat">
          <FiMessageCircle /> {chatCount} Chats
        </span>
        <span className="tg-stat">
          <FiCpu /> {model ? model.split(':')[0] : provider}
        </span>
        {messageCount > 0 && (
          <span className="tg-stat">
            <FiSend /> {messageCount} Nachr.
          </span>
        )}
      </div>

      <div className="tg-bot-card-actions">
        <button type="button" className="tg-btn-edit" onClick={onEdit} title="Bearbeiten">
          <FiEdit2 /> <span>Bearbeiten</span>
        </button>
        <button
          type="button"
          className={`tg-btn-icon ${isActive ? 'warn' : 'success'}`}
          onClick={onToggle}
          disabled={toggling}
          title={isActive ? 'Deaktivieren' : 'Aktivieren'}
        >
          <FiPower className={toggling ? 'spinning' : ''} />
        </button>
        <button
          type="button"
          className="tg-btn-icon danger"
          onClick={onDelete}
          disabled={deleting}
          title="Löschen"
        >
          {deleting ? <FiLoader className="spinning" /> : <FiTrash2 />}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   STATUS SECTION
   ============================================================================ */
function StatusSection({ appStatus, bots, loading }) {
  const totalChats = bots.reduce((sum, b) => sum + (b.chatCount || 0), 0);
  const totalMessages = bots.reduce((sum, b) => sum + (b.messageCount || 0), 0);
  const activeBots = bots.filter(b => b.isActive).length;
  const ragBots = bots.filter(b => b.ragEnabled).length;

  if (loading) {
    return (
      <div className="tg-section">
        <div className="tg-loading">
          <FiRefreshCw className="spinning" /> Lade Status...
        </div>
      </div>
    );
  }

  return (
    <div className="tg-section">
      <h3>Übersicht</h3>
      <div className="tg-status-grid">
        <div className="tg-status-card">
          <span className="tg-status-label">Bots gesamt</span>
          <span className="tg-status-value">{bots.length}</span>
        </div>
        <div className="tg-status-card">
          <span className="tg-status-label">Aktive Bots</span>
          <span className="tg-status-value highlight">{activeBots}</span>
        </div>
        <div className="tg-status-card">
          <span className="tg-status-label">Verbundene Chats</span>
          <span className="tg-status-value">{totalChats}</span>
        </div>
        <div className="tg-status-card">
          <span className="tg-status-label">Nachrichten</span>
          <span className="tg-status-value">{totalMessages}</span>
        </div>
        <div className="tg-status-card">
          <span className="tg-status-label">RAG-Bots</span>
          <span className="tg-status-value">{ragBots}</span>
        </div>
        <div className="tg-status-card">
          <span className="tg-status-label">System-Alerts</span>
          <span className={`tg-status-value ${appStatus?.isEnabled ? 'highlight' : ''}`}>
            {appStatus?.isEnabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
      </div>

      {/* Bot Details Table */}
      {bots.length > 0 && (
        <>
          <h3 style={{ marginTop: '2rem' }}>Bot-Details</h3>
          <div className="tg-table-wrapper">
            <table className="tg-table">
              <thead>
                <tr>
                  <th>Bot</th>
                  <th>Status</th>
                  <th>Modell</th>
                  <th>Chats</th>
                  <th>RAG</th>
                </tr>
              </thead>
              <tbody>
                {bots.map(bot => (
                  <tr key={bot.id}>
                    <td>
                      <strong>{bot.name}</strong>
                      <br />
                      <span className="tg-text-muted">@{bot.username || '—'}</span>
                    </td>
                    <td>
                      <span className={`tg-inline-status ${bot.isActive ? 'active' : ''}`}>
                        {bot.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td>{bot.llmModel || '—'}</td>
                    <td>{bot.chatCount || 0}</td>
                    <td>{bot.ragEnabled ? 'Ja' : 'Nein'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   SYSTEM SECTION (migrated from TelegramSettings)
   ============================================================================ */
function SystemSection({
  config,
  setConfig,
  hasToken,
  showToken,
  setShowToken,
  loading,
  saving,
  testing,
  message,
  hasChanges,
  onSave,
  onToggle,
  onTest,
}) {
  if (loading) {
    return (
      <div className="tg-section">
        <div className="tg-loading">
          <FiRefreshCw className="spinning" /> Lade Konfiguration...
        </div>
      </div>
    );
  }

  return (
    <div className="tg-section">
      <h3>System-Benachrichtigungen</h3>
      <p className="tg-section-desc">
        Konfiguriere einen Bot für automatische System-Alerts (CPU, RAM, Disk, Temperatur).
      </p>

      {/* Status Toggle */}
      <div className="tg-system-card">
        <div className="tg-system-row">
          <div>
            <strong>System-Alerts</strong>
            <p className="tg-text-muted">Automatische Benachrichtigungen bei System-Warnungen</p>
          </div>
          <button
            type="button"
            className={`tg-toggle ${config.enabled ? 'active' : ''}`}
            onClick={onToggle}
            disabled={saving || (!hasToken && !config.enabled)}
            title={!hasToken ? 'Zuerst Bot-Token eingeben' : ''}
          >
            <span className="tg-toggle-slider" />
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="tg-system-card">
        <h4>Bot Konfiguration</h4>
        <p className="tg-text-muted" style={{ marginBottom: '1rem' }}>
          Bot-Token von @BotFather und Chat-ID eingeben
        </p>

        {message && (
          <div className={`tg-message ${message.type}`}>
            {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="tg-form-group">
          <label htmlFor="sys-bot-token">Bot Token</label>
          <div className="tg-input-wrapper">
            <input
              id="sys-bot-token"
              type={showToken ? 'text' : 'password'}
              value={config.bot_token}
              onChange={e => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder={
                hasToken ? '********** (Token gespeichert)' : 'Token von @BotFather eingeben'
              }
              autoComplete="off"
            />
            <button
              type="button"
              className="tg-visibility-btn"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <small>
            Erstelle einen Bot bei <strong>@BotFather</strong> auf Telegram
          </small>
        </div>

        <div className="tg-form-group">
          <label htmlFor="sys-chat-id">Chat ID</label>
          <input
            id="sys-chat-id"
            type="text"
            value={config.chat_id}
            onChange={e => setConfig(prev => ({ ...prev, chat_id: e.target.value }))}
            placeholder="z.B. 123456789"
          />
          <small>
            Nutze <strong>@userinfobot</strong> um deine Chat-ID zu erfahren
          </small>
        </div>

        <div className="tg-form-actions">
          <button
            type="button"
            className={`tg-btn-primary ${hasChanges ? 'has-changes' : ''}`}
            onClick={onSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              'Speichern...'
            ) : (
              <>
                <FiCheck /> Speichern
              </>
            )}
          </button>
          <button
            type="button"
            className="tg-btn-secondary"
            onClick={onTest}
            disabled={testing || !hasToken || !config.chat_id}
          >
            {testing ? (
              <>
                <FiRefreshCw className="spinning" /> Senden...
              </>
            ) : (
              <>
                <FiSend /> Test senden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   LOGS SECTION
   ============================================================================ */
function LogsSection({ logs, loading, onRefresh }) {
  return (
    <div className="tg-section">
      <div className="tg-section-header">
        <h3>Aktivitäts-Log</h3>
        <button
          type="button"
          className="tg-btn-icon"
          onClick={onRefresh}
          disabled={loading}
          title="Aktualisieren"
        >
          <FiRefreshCw className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="tg-loading">
          <FiRefreshCw className="spinning" /> Lade Logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="tg-empty-state small">
          <FiFileText size={24} />
          <p>Noch keine Aktivitäten</p>
        </div>
      ) : (
        <div className="tg-table-wrapper">
          <table className="tg-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Bot</th>
                <th>Benutzer</th>
                <th>Befehl</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="tg-text-muted">
                    {new Date(log.created_at).toLocaleString('de-DE')}
                  </td>
                  <td>{log.bot_name || '—'}</td>
                  <td>{log.user_name || log.chat_id || '—'}</td>
                  <td>
                    <code>{log.command || log.message_type || '—'}</code>
                  </td>
                  <td>
                    <span className={`tg-inline-status ${log.success ? 'active' : 'error'}`}>
                      {log.success ? 'OK' : 'Fehler'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TelegramAppModal;
