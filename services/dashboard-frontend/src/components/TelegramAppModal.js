import React, { useState, useEffect, useCallback } from 'react';
import {
  FiX,
  FiPlus,
  FiSend,
  FiSliders,
  FiMessageCircle,
  FiPower,
  FiTrash2,
  FiEdit2,
  FiRefreshCw,
  FiLoader,
} from 'react-icons/fi';
import Modal from './Modal';
import useConfirm from '../hooks/useConfirm';
import { useToast } from '../contexts/ToastContext';
import BotSetupWizard from './TelegramBots/BotSetupWizard';
import BotDetailsModal from './TelegramBots/BotDetailsModal';
import { API_BASE, getAuthHeaders } from '../config/api';
import './TelegramAppModal.css';

/**
 * Telegram App Modal
 * Main interface for managing Telegram bots
 */
function TelegramAppModal({ isOpen, onClose }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('bots');
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [appStatus, setAppStatus] = useState(null);
  const [togglingBot, setTogglingBot] = useState(null);
  const [deletingBot, setDeletingBot] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();

      const [botsRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/telegram-bots`, { headers }),
        fetch(`${API_BASE}/telegram-app/status`, { headers }),
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
    toast.success('Bot erfolgreich erstellt');
  };

  const handleToggleBot = async (botId, currentActive) => {
    setTogglingBot(botId);
    try {
      const endpoint = currentActive ? 'deactivate' : 'activate';

      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/${endpoint}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Umschalten des Bots');
      }

      setBots(prev =>
        prev.map(bot => (bot.id === botId ? { ...bot, isActive: !currentActive } : bot))
      );
      toast.success(currentActive ? 'Bot deaktiviert' : 'Bot aktiviert');
    } catch (err) {
      console.error('Error toggling bot:', err);
      toast.error(err.message);
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

    setDeletingBot(botId);
    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Löschen des Bots');
      }

      setBots(prev => prev.filter(bot => bot.id !== botId));
      toast.success('Bot gelöscht');
    } catch (err) {
      console.error('Error deleting bot:', err);
      toast.error(err.message);
    } finally {
      setDeletingBot(null);
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
            className={`telegram-tab ${activeTab === 'advanced' ? 'active' : ''}`}
            onClick={() => setActiveTab('advanced')}
            type="button"
          >
            <FiSliders /> Erweitert
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
                <div className="telegram-bots-grid">
                  {[1, 2].map(i => (
                    <div key={i} className="telegram-bot-card skeleton-card">
                      <div className="bot-card-header">
                        <div className="bot-info">
                          <div className="skeleton-line skeleton-title" />
                          <div className="skeleton-line skeleton-subtitle" />
                        </div>
                        <div className="skeleton-badge" />
                      </div>
                      <div className="skeleton-line skeleton-prompt" />
                      <div className="bot-card-meta">
                        <div className="skeleton-line skeleton-meta" />
                        <div className="skeleton-line skeleton-meta-short" />
                      </div>
                      <div className="bot-card-actions">
                        <div className="skeleton-btn" />
                        <div className="skeleton-btn-sm" />
                        <div className="skeleton-btn-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : bots.length === 0 ? (
                <div className="telegram-empty">
                  <div className="telegram-empty-icon">
                    <FiSend size={32} />
                  </div>
                  <h4>Noch keine Bots</h4>
                  <p>
                    Verbinde deinen ersten Telegram Bot mit einer KI und starte Gespräche direkt aus
                    Telegram.
                  </p>
                  <button className="btn-primary" onClick={() => setShowWizard(true)} type="button">
                    <FiPlus /> Bot erstellen
                  </button>
                </div>
              ) : (
                <div className="telegram-bots-grid">
                  {bots.map(bot => {
                    const isActive = bot.isActive;
                    const provider = bot.llmProvider || 'ollama';
                    const model = bot.llmModel || '';
                    const username = bot.username;
                    const systemPrompt = bot.systemPrompt || '';
                    const chatCount = bot.chatCount || 0;
                    const promptPreview =
                      systemPrompt.length > 80 ? systemPrompt.substring(0, 80) + '…' : systemPrompt;

                    return (
                      <div key={bot.id} className="telegram-bot-card">
                        <div className="bot-card-header">
                          <div className="bot-info">
                            <h4>{bot.name}</h4>
                            <span className="bot-username">@{username || 'nicht verbunden'}</span>
                          </div>
                          <span className={`bot-status ${isActive ? 'active' : 'inactive'}`}>
                            <span className="bot-status-dot" />
                            {isActive ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </div>

                        {promptPreview && <p className="bot-card-prompt">{promptPreview}</p>}

                        <div className="bot-card-meta">
                          <span className={`provider-badge ${provider}`}>
                            {provider === 'ollama' ? 'Lokale KI' : 'Cloud KI'}
                            {model && <span className="model-name"> ({model.split(':')[0]})</span>}
                          </span>
                          <span className="bot-card-chats">{chatCount} Chats</span>
                        </div>

                        <div className="bot-card-actions">
                          <button
                            className="btn-icon btn-edit"
                            onClick={() => setSelectedBot(bot)}
                            title="Bearbeiten"
                            type="button"
                          >
                            <FiEdit2 /> <span>Bearbeiten</span>
                          </button>
                          <button
                            className={`btn-icon ${isActive ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => handleToggleBot(bot.id, isActive)}
                            title={isActive ? 'Deaktivieren' : 'Aktivieren'}
                            disabled={togglingBot === bot.id}
                            type="button"
                          >
                            <FiPower className={togglingBot === bot.id ? 'spinning' : ''} />
                          </button>
                          <button
                            className="btn-icon btn-danger"
                            onClick={() => handleDeleteBot(bot.id)}
                            title="Löschen"
                            disabled={deletingBot === bot.id}
                            type="button"
                          >
                            {deletingBot === bot.id ? (
                              <FiLoader className="spinning" />
                            ) : (
                              <FiTrash2 />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="telegram-advanced-tab">
              <h3>Übersicht</h3>
              {appStatus ? (
                <div className="advanced-status-grid">
                  <div className="advanced-status-card">
                    <span className="advanced-status-label">Status</span>
                    <span
                      className={`advanced-status-value ${appStatus.isEnabled ? 'active' : ''}`}
                    >
                      {appStatus.isEnabled ? 'Aktiviert' : 'Deaktiviert'}
                    </span>
                  </div>
                  <div className="advanced-status-card">
                    <span className="advanced-status-label">Bots gesamt</span>
                    <span className="advanced-status-value">{appStatus.botCount?.total || 0}</span>
                  </div>
                  <div className="advanced-status-card">
                    <span className="advanced-status-label">Bots aktiv</span>
                    <span className="advanced-status-value">{appStatus.botCount?.active || 0}</span>
                  </div>
                  <div className="advanced-status-card">
                    <span className="advanced-status-label">Chats</span>
                    <span className="advanced-status-value">
                      {appStatus.stats?.totalChats || 0}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="telegram-loading">
                  <FiRefreshCw className="spinning" />
                  <span>Lade Status...</span>
                </div>
              )}

              <p className="text-muted" style={{ marginTop: '1.5rem' }}>
                Weitere Einstellungen wie Benachrichtigungs-Regeln und Webhook-Konfiguration findest
                du in den erweiterten Einstellungen der einzelnen Bots.
              </p>
            </div>
          )}
        </div>

        {/* Wizard Modal */}
        {showWizard && (
          <Modal
            isOpen={showWizard}
            onClose={() => setShowWizard(false)}
            title="Neuen Bot erstellen"
            size="large"
          >
            <BotSetupWizard onComplete={handleBotCreated} onCancel={() => setShowWizard(false)} />
          </Modal>
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
        {ConfirmDialog}
      </div>
    </Modal>
  );
}

export default TelegramAppModal;
