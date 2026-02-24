/**
 * BotDetailsModal - Modal for viewing and editing bot details
 * Tabs: Allgemein | Befehle | Verbundene Chats | Erweitert
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FiX,
  FiSave,
  FiMessageCircle,
  FiSettings,
  FiCommand,
  FiUsers,
  FiEye,
  FiEyeOff,
  FiAlertCircle,
  FiCheck,
  FiRefreshCw,
  FiSliders,
  FiExternalLink,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders as getAuthHeadersBase } from '../../config/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../Modal';
import LoadingSpinner from '../LoadingSpinner';
import CommandsEditor from './CommandsEditor';

const TABS = [
  { id: 'settings', label: 'Allgemein', icon: FiSettings },
  { id: 'commands', label: 'Befehle', icon: FiCommand },
  { id: 'chats', label: 'Verbundene Chats', icon: FiUsers },
  { id: 'advanced', label: 'Erweitert', icon: FiSliders },
];

function BotDetailsModal({ bot, onClose, onUpdate }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('settings');
  const [formData, setFormData] = useState({
    name: bot.name || '',
    llmProvider: bot.llmProvider || bot.llm_provider || 'ollama',
    llmModel: bot.llmModel || bot.llm_model || '',
    systemPrompt: bot.systemPrompt || bot.system_prompt || '',
    claudeApiKey: '',
    token: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [claudeModels, setClaudeModels] = useState([]);
  const [commands, setCommands] = useState([]);
  const [chats, setChats] = useState([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const username = bot.username || bot.bot_username;

  // Auth headers - includes Content-Type for JSON requests
  const getAuthHeaders = useCallback(
    () => ({
      ...getAuthHeadersBase(),
      'Content-Type': 'application/json',
    }),
    []
  );

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const [ollamaRes, claudeRes] = await Promise.all([
          fetch(`${API_BASE}/telegram-bots/models/ollama`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE}/telegram-bots/models/claude`, { headers: getAuthHeaders() }),
        ]);

        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          setOllamaModels(data.models || []);
        }

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          setClaudeModels(data.models || []);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };

    fetchModels();
  }, [getAuthHeaders]);

  // Fetch commands
  useEffect(() => {
    if (activeTab === 'commands') {
      setLoadingCommands(true);
      fetch(`${API_BASE}/telegram-bots/${bot.id}/commands`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => setCommands(data.commands || []))
        .catch(err => {
          console.error('Error fetching commands:', err);
          toast.error('Fehler beim Laden der Befehle');
        })
        .finally(() => setLoadingCommands(false));
    }
  }, [activeTab, bot.id, getAuthHeaders]);

  // Fetch chats
  useEffect(() => {
    if (activeTab === 'chats') {
      setLoadingChats(true);
      fetch(`${API_BASE}/telegram-bots/${bot.id}/chats`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => setChats(data.chats || []))
        .catch(err => {
          console.error('Error fetching chats:', err);
          toast.error('Fehler beim Laden der Chats');
        })
        .finally(() => setLoadingChats(false));
    }
  }, [activeTab, bot.id, getAuthHeaders]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        name: formData.name,
        llmProvider: formData.llmProvider,
        llmModel: formData.llmModel,
        systemPrompt: formData.systemPrompt,
      };

      if (formData.claudeApiKey) {
        payload.claudeApiKey = formData.claudeApiKey;
      }

      if (formData.token) {
        payload.token = formData.token;
      }

      const response = await fetch(`${API_BASE}/telegram-bots/${bot.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      const data = await response.json();
      setMessage({ type: 'success', text: 'Einstellungen gespeichert' });
      setFormData(prev => ({ ...prev, claudeApiKey: '', token: '' }));
      if (onUpdate) onUpdate(data.bot);
    } catch (err) {
      console.error('Bot-Einstellungen speichern fehlgeschlagen:', err);
      setMessage({ type: 'error', text: 'Fehler beim Speichern der Einstellungen' });
    } finally {
      setSaving(false);
    }
  };

  // Handle command updates
  const handleCommandsChange = updatedCommands => {
    setCommands(updatedCommands);
  };

  // Remove chat
  const handleRemoveChat = async chatRowId => {
    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${bot.id}/chats/${chatRowId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Entfernen');
      }

      setChats(prev => prev.filter(c => c.id !== chatRowId));
    } catch (err) {
      console.error('Error removing chat:', err);
      toast.error('Fehler beim Entfernen des Chats');
    }
  };

  // Tab 1: Allgemein
  const renderSettings = () => (
    <div className="bot-details-settings">
      {message && (
        <div className={`bot-details-message ${message.type}`}>
          {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="bot-details-form">
        <div className="bot-details-form-group">
          <label>Bot Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          />
          <small>Wie soll dein Bot heißen?</small>
        </div>

        <div className="bot-details-form-row">
          <div className="bot-details-form-group">
            <label>KI-Anbieter</label>
            <select
              value={formData.llmProvider}
              onChange={e => {
                const provider = e.target.value;
                const models = provider === 'ollama' ? ollamaModels : claudeModels;
                setFormData(prev => ({
                  ...prev,
                  llmProvider: provider,
                  llmModel: models[0]?.name || models[0]?.id || models[0] || '',
                }));
              }}
            >
              <option value="ollama">Lokale KI (Ollama)</option>
              <option value="claude">Cloud KI (Claude)</option>
            </select>
            <small>
              {formData.llmProvider === 'ollama'
                ? 'Kostenlos, privat, läuft auf deinem Jetson'
                : 'Leistungsstärker, benötigt API-Key'}
            </small>
          </div>

          <div className="bot-details-form-group">
            <label>Modell</label>
            <select
              value={formData.llmModel}
              onChange={e => setFormData(prev => ({ ...prev, llmModel: e.target.value }))}
            >
              {formData.llmProvider === 'ollama' ? (
                ollamaModels.length > 0 ? (
                  ollamaModels.map(model => (
                    <option key={model.name || model} value={model.name || model}>
                      {model.name || model}
                    </option>
                  ))
                ) : (
                  <option value="">Keine Modelle verfügbar</option>
                )
              ) : (
                claudeModels.map(model => (
                  <option key={model.id || model} value={model.id || model}>
                    {model.name || model.id || model}
                  </option>
                ))
              )}
            </select>
            <small>Welches KI-Modell soll antworten?</small>
          </div>
        </div>

        <div className="bot-details-form-group">
          <label>Basis-Kontext</label>
          <textarea
            value={formData.systemPrompt}
            onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            rows={6}
            placeholder="z.B. Du bist ein hilfreicher Assistent, der auf Deutsch antwortet..."
          />
          <small>
            Definiere wer dein Bot ist und was er kann. Dieser Text wird bei jeder Unterhaltung
            geladen.
          </small>
        </div>

        <div className="bot-details-actions">
          <button
            type="button"
            className="bot-details-btn primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <FiRefreshCw className="spinning" />
                Speichern...
              </>
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
  );

  // Tab 2: Befehle
  const renderCommands = () => (
    <div className="bot-details-commands">
      {loadingCommands ? (
        <div className="bot-details-loading">
          <LoadingSpinner size="small" message="" />
          <span>Lade Befehle...</span>
        </div>
      ) : (
        <CommandsEditor
          botId={bot.id}
          commands={commands}
          onChange={handleCommandsChange}
          getAuthHeaders={getAuthHeaders}
        />
      )}
    </div>
  );

  // Tab 3: Verbundene Chats
  const renderChats = () => (
    <div className="bot-details-chats">
      {loadingChats ? (
        <div className="bot-details-loading">
          <LoadingSpinner size="small" message="" />
          <span>Lade Chats...</span>
        </div>
      ) : chats.length === 0 ? (
        <div className="bot-details-empty">
          <FiUsers className="bot-details-empty-icon" />
          <p>Noch keine Chats verbunden</p>
          <small>Öffne deinen Bot in Telegram und sende /start</small>
          {username && (
            <a
              href={`https://t.me/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bot-details-btn secondary"
              style={{ marginTop: '1rem' }}
            >
              <FiExternalLink /> Bot in Telegram öffnen
            </a>
          )}
        </div>
      ) : (
        <div className="bot-details-chat-list">
          {chats.map(chat => (
            <div key={chat.id} className="bot-details-chat-item">
              <div className="chat-item-info">
                <span className="chat-item-name">
                  {chat.firstName || chat.first_name || 'Unbekannt'}{' '}
                  {chat.lastName || chat.last_name || ''}
                </span>
                <span className="chat-item-id">ID: {chat.chatId || chat.chat_id}</span>
                {chat.username && <span className="chat-item-username">@{chat.username}</span>}
              </div>
              <div className="chat-item-stats">
                <span className="chat-item-messages">
                  {chat.messageCount || chat.message_count || 0} Nachrichten
                </span>
                <span className="chat-item-date">
                  Zuletzt:{' '}
                  {new Date(chat.lastMessageAt || chat.last_message_at).toLocaleDateString('de-DE')}
                </span>
              </div>
              <button
                type="button"
                className="chat-item-remove"
                onClick={() => handleRemoveChat(chat.id)}
                title="Chat entfernen"
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Tab 4: Erweitert
  const renderAdvanced = () => (
    <div className="bot-details-advanced">
      {message && activeTab === 'advanced' && (
        <div className={`bot-details-message ${message.type}`}>
          {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="bot-details-form">
        <div className="bot-details-form-group">
          <label>Bot-Token ändern</label>
          <div className="bot-details-input-wrapper">
            <input
              type={showToken ? 'text' : 'password'}
              value={formData.token}
              onChange={e => setFormData(prev => ({ ...prev, token: e.target.value }))}
              placeholder="Neues Token eingeben..."
            />
            <button
              type="button"
              className="bot-details-toggle-visibility"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <small>Leer lassen um das aktuelle Token beizubehalten</small>
        </div>

        {formData.llmProvider === 'claude' && (
          <div className="bot-details-form-group">
            <label>Claude API Key ändern</label>
            <div className="bot-details-input-wrapper">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.claudeApiKey}
                onChange={e => setFormData(prev => ({ ...prev, claudeApiKey: e.target.value }))}
                placeholder={
                  bot.hasClaudeKey || bot.has_claude_key
                    ? '(Key gespeichert)'
                    : 'API Key eingeben...'
                }
              />
              <button
                type="button"
                className="bot-details-toggle-visibility"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            <small>Leer lassen um den aktuellen Key beizubehalten</small>
          </div>
        )}

        <div className="bot-details-info-section">
          <h4>Bot-Informationen</h4>
          <div className="bot-details-info-grid">
            <div className="bot-details-info-item">
              <span className="info-label">Bot-ID</span>
              <span className="info-value">{bot.id}</span>
            </div>
            <div className="bot-details-info-item">
              <span className="info-label">Username</span>
              <span className="info-value">@{username || '–'}</span>
            </div>
            <div className="bot-details-info-item">
              <span className="info-label">Erstellt</span>
              <span className="info-value">
                {bot.createdAt || bot.created_at
                  ? new Date(bot.createdAt || bot.created_at).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
            <div className="bot-details-info-item">
              <span className="info-label">Letzte Nachricht</span>
              <span className="info-value">
                {bot.lastMessageAt || bot.last_message_at
                  ? new Date(bot.lastMessageAt || bot.last_message_at).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
          </div>
        </div>

        {(formData.token || formData.claudeApiKey) && (
          <div className="bot-details-actions">
            <button
              type="button"
              className="bot-details-btn primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <FiRefreshCw className="spinning" />
                  Speichern...
                </>
              ) : (
                <>
                  <FiSave />
                  Änderungen speichern
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="bot-details-title">
          <FiMessageCircle className="bot-details-icon" />
          <div>
            <span>{bot.name}</span>
            <span className="bot-details-username">@{username || 'nicht verbunden'}</span>
          </div>
        </div>
      }
      size="large"
      className="bot-details-modal-wrapper"
    >
      {/* Tabs */}
      <div className="bot-details-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              className={`bot-details-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bot-details-content">
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'commands' && renderCommands()}
        {activeTab === 'chats' && renderChats()}
        {activeTab === 'advanced' && renderAdvanced()}
      </div>
    </Modal>
  );
}

export default BotDetailsModal;
