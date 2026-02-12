import React, { useState, useEffect, useCallback } from 'react';
import {
  FiX,
  FiPlus,
  FiSend,
  FiSettings,
  FiBell,
  FiMessageCircle,
  FiPower,
  FiTrash2,
  FiEdit2,
  FiRefreshCw,
} from 'react-icons/fi';
import Modal from './Modal';
import BotSetupWizard from './TelegramBots/BotSetupWizard';
import BotDetailsModal from './TelegramBots/BotDetailsModal';
import useConfirm from '../hooks/useConfirm';
import './TelegramAppModal.css';

/**
 * Telegram App Modal
 * Main interface for managing Telegram bots
 */
function TelegramAppModal({ isOpen, onClose }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState('bots');
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [appStatus, setAppStatus] = useState(null);
  const [togglingBot, setTogglingBot] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('arasul_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [botsRes, statusRes] = await Promise.all([
        fetch('/api/telegram-bots', { headers }),
        fetch('/api/telegram-app/status', { headers }),
      ]);

      if (!botsRes.ok) {
        throw new Error('Fehler beim Laden der Bots');
      }

      const botsData = await botsRes.json();
      const statusData = await statusRes.json();

      setBots(botsData.bots || []);
      setAppStatus(statusData);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching telegram data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleBotCreated = newBot => {
    setBots(prev => [...prev, newBot]);
    setShowWizard(false);
  };

  const handleToggleBot = async (botId, currentActive) => {
    setTogglingBot(botId);
    try {
      const token = localStorage.getItem('arasul_token');
      const endpoint = currentActive ? 'deactivate' : 'activate';

      const response = await fetch(`/api/telegram-bots/${botId}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Fehler beim Umschalten des Bots');
      }

      setBots(prev =>
        prev.map(bot => (bot.id === botId ? { ...bot, is_active: !currentActive } : bot))
      );
    } catch (err) {
      console.error('Error toggling bot:', err);
      setError(err.message);
    } finally {
      setTogglingBot(null);
    }
  };

  const handleDeleteBot = async botId => {
    if (
      !(await confirm({
        message: 'Bot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      }))
    ) {
      return;
    }

    try {
      const token = localStorage.getItem('arasul_token');
      const response = await fetch(`/api/telegram-bots/${botId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Fehler beim Loeschen des Bots');
      }

      setBots(prev => prev.filter(bot => bot.id !== botId));
    } catch (err) {
      console.error('Error deleting bot:', err);
      setError(err.message);
    }
  };

  const handleBotUpdated = updatedBot => {
    setBots(prev => prev.map(b => (b.id === updatedBot.id ? updatedBot : b)));
    setSelectedBot(null);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Telegram Bot" size="large">
      <div className="telegram-app-modal">
        {/* Tab Navigation */}
        <div className="telegram-tabs">
          <button
            className={`telegram-tab ${activeTab === 'bots' ? 'active' : ''}`}
            onClick={() => setActiveTab('bots')}
            type="button"
          >
            <FiMessageCircle /> Meine Bots
          </button>
          <button
            className={`telegram-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
            type="button"
          >
            <FiBell /> Benachrichtigungen
          </button>
          <button
            className={`telegram-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            <FiSettings /> Einstellungen
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="telegram-error">
            <span>{error}</span>
            <button onClick={() => setError(null)} type="button">
              <FiX />
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="telegram-tab-content">
          {activeTab === 'bots' && (
            <div className="telegram-bots-tab">
              <div className="telegram-bots-header">
                <h3>
                  {bots.length} Bot{bots.length !== 1 ? 's' : ''}
                </h3>
                <div className="telegram-bots-actions">
                  <button
                    className="btn-icon"
                    onClick={fetchData}
                    title="Aktualisieren"
                    disabled={loading}
                    type="button"
                  >
                    <FiRefreshCw className={loading ? 'spinning' : ''} />
                  </button>
                  <button className="btn-primary" onClick={() => setShowWizard(true)} type="button">
                    <FiPlus /> Neuer Bot
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="telegram-loading">
                  <FiRefreshCw className="spinning" />
                  <span>Lade Bots...</span>
                </div>
              ) : bots.length === 0 ? (
                <div className="telegram-empty">
                  <FiSend size={48} />
                  <h4>Noch keine Bots</h4>
                  <p>Erstelle deinen ersten Telegram Bot, um loszulegen.</p>
                  <button className="btn-primary" onClick={() => setShowWizard(true)} type="button">
                    <FiPlus /> Bot erstellen
                  </button>
                </div>
              ) : (
                <div className="telegram-bots-grid">
                  {bots.map(bot => (
                    <div key={bot.id} className="telegram-bot-card">
                      <div className="bot-card-header">
                        <div className="bot-info">
                          <h4>{bot.name}</h4>
                          <span className="bot-username">
                            @{bot.bot_username || 'nicht verbunden'}
                          </span>
                        </div>
                        <span className={`bot-status ${bot.is_active ? 'active' : 'inactive'}`}>
                          {bot.is_active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>

                      <div className="bot-card-stats">
                        <div className="bot-stat">
                          <span className="stat-value">{bot.chat_count || 0}</span>
                          <span className="stat-label">Chats</span>
                        </div>
                        <div className="bot-stat">
                          <span className="stat-value">{bot.command_count || 0}</span>
                          <span className="stat-label">Commands</span>
                        </div>
                        <div className="bot-stat">
                          <span className="stat-value">{bot.llm_provider || 'ollama'}</span>
                          <span className="stat-label">LLM</span>
                        </div>
                      </div>

                      <div className="bot-card-actions">
                        <button
                          className={`btn-icon ${bot.is_active ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => handleToggleBot(bot.id, bot.is_active)}
                          title={bot.is_active ? 'Deaktivieren' : 'Aktivieren'}
                          disabled={togglingBot === bot.id}
                          type="button"
                        >
                          <FiPower className={togglingBot === bot.id ? 'spinning' : ''} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => setSelectedBot(bot)}
                          title="Bearbeiten"
                          type="button"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => handleDeleteBot(bot.id)}
                          title="Loeschen"
                          type="button"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="telegram-notifications-tab">
              <div className="telegram-coming-soon">
                <FiBell size={48} />
                <h4>Benachrichtigungs-Regeln</h4>
                <p>
                  Hier kannst du benutzerdefinierte Regeln erstellen, um Benachrichtigungen von
                  Claude, System-Events und n8n-Workflows zu erhalten.
                </p>
                <p className="text-muted">
                  Diese Funktion wird in einem zukuenftigen Update verfuegbar sein.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="telegram-settings-tab">
              <div className="telegram-coming-soon">
                <FiSettings size={48} />
                <h4>App-Einstellungen</h4>
                <p>Globale Einstellungen fuer die Telegram Bot App.</p>
                {appStatus && (
                  <div className="settings-info">
                    <p>
                      <strong>Status:</strong> {appStatus.isEnabled ? 'Aktiviert' : 'Deaktiviert'}
                    </p>
                    <p>
                      <strong>Bots:</strong> {appStatus.botCount?.total || 0} total,{' '}
                      {appStatus.botCount?.active || 0} aktiv
                    </p>
                    <p>
                      <strong>Chats:</strong> {appStatus.stats?.totalChats || 0}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Modal */}
        {showWizard && (
          <BotSetupWizard
            isOpen={showWizard}
            onClose={() => setShowWizard(false)}
            onBotCreated={handleBotCreated}
          />
        )}

        {/* Bot Details Modal */}
        {selectedBot && (
          <BotDetailsModal
            bot={selectedBot}
            isOpen={!!selectedBot}
            onClose={() => setSelectedBot(null)}
            onUpdate={handleBotUpdated}
          />
        )}
      </div>
      {ConfirmDialog}
    </Modal>
  );
}

export default TelegramAppModal;
