/**
 * BotDetailsModal - Modal for viewing and editing bot details
 * Tabs: Übersicht & Einstellungen | Befehle | Chats | Erweitert
 */

import React, { useState, useEffect } from 'react';
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
  FiBook,
} from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import CommandsEditor from './CommandsEditor';

const TABS = [
  { id: 'settings', label: 'Übersicht', icon: FiSettings },
  { id: 'commands', label: 'Befehle', icon: FiCommand },
  { id: 'chats', label: 'Chats', icon: FiUsers },
  { id: 'advanced', label: 'Erweitert', icon: FiSliders },
];

function BotDetailsModal({ bot, onClose, onUpdate }) {
  const api = useApi();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('settings');
  const [formData, setFormData] = useState({
    name: bot.name || '',
    llmModel: bot.llmModel || bot.llm_model || '',
    systemPrompt: bot.systemPrompt || bot.system_prompt || '',
    ragEnabled: bot.ragEnabled || bot.rag_enabled || false,
    ragSpaceIds: bot.ragSpaceIds || bot.rag_space_ids || null,
    ragShowSources: bot.ragShowSources ?? bot.rag_show_sources ?? true,
    token: '',
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [commands, setCommands] = useState([]);
  const [chats, setChats] = useState([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const username = bot.username || bot.bot_username;

  // Fetch models and spaces
  useEffect(() => {
    const fetchData = async () => {
      const [modelsResult, spacesResult] = await Promise.allSettled([
        api.get('/telegram-bots/models/ollama', { showError: false }),
        api.get('/spaces', { showError: false }),
      ]);

      if (modelsResult.status === 'fulfilled') {
        setOllamaModels(modelsResult.value.models || []);
      }
      if (spacesResult.status === 'fulfilled') {
        setSpaces(spacesResult.value.spaces || spacesResult.value || []);
      }
    };
    fetchData();
  }, [api]);

  // Fetch commands on tab switch
  useEffect(() => {
    if (activeTab === 'commands') {
      setLoadingCommands(true);
      api
        .get(`/telegram-bots/${bot.id}/commands`, { showError: false })
        .then(data => setCommands(data.commands || []))
        .catch(() => toast.error('Fehler beim Laden der Befehle'))
        .finally(() => setLoadingCommands(false));
    }
  }, [activeTab, bot.id, api, toast]);

  // Fetch chats on tab switch
  useEffect(() => {
    if (activeTab === 'chats') {
      setLoadingChats(true);
      api
        .get(`/telegram-bots/${bot.id}/chats`, { showError: false })
        .then(data => setChats(data.chats || []))
        .catch(() => toast.error('Fehler beim Laden der Chats'))
        .finally(() => setLoadingChats(false));
    }
  }, [activeTab, bot.id, api, toast]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        name: formData.name,
        llmProvider: 'ollama',
        llmModel: formData.llmModel,
        systemPrompt: formData.systemPrompt,
        ragEnabled: formData.ragEnabled,
        ragSpaceIds: formData.ragSpaceIds,
        ragShowSources: formData.ragShowSources,
      };

      if (formData.token) payload.token = formData.token;

      const data = await api.put(`/telegram-bots/${bot.id}`, payload, { showError: false });
      setMessage({ type: 'success', text: 'Einstellungen gespeichert' });
      setFormData(prev => ({ ...prev, token: '' }));
      if (onUpdate) onUpdate(data.bot);
    } catch (err) {
      setMessage({ type: 'error', text: err.data?.error || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleCommandsChange = updatedCommands => setCommands(updatedCommands);

  const handleRemoveChat = async chatRowId => {
    try {
      await api.del(`/telegram-bots/${bot.id}/chats/${chatRowId}`, { showError: false });
      setChats(prev => prev.filter(c => c.id !== chatRowId));
    } catch {
      toast.error('Fehler beim Entfernen des Chats');
    }
  };

  const toggleSpace = spaceId => {
    setFormData(prev => {
      const ids = prev.ragSpaceIds || [];
      const next = ids.includes(spaceId) ? ids.filter(id => id !== spaceId) : [...ids, spaceId];
      return { ...prev, ragSpaceIds: next.length > 0 ? next : [] };
    });
  };

  const isMaster = formData.ragEnabled && formData.ragSpaceIds === null;

  // Tab 1: Übersicht & Einstellungen
  const renderSettings = () => (
    <div className="bot-details-settings">
      {message && activeTab === 'settings' && (
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
        </div>

        <div className="bot-details-form-group">
          <label>System-Prompt</label>
          <textarea
            value={formData.systemPrompt}
            onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            rows={5}
            placeholder="Definiere die Persönlichkeit deines Bots..."
          />
        </div>

        <div className="bot-details-form-group">
          <label>LLM-Modell</label>
          <select
            value={formData.llmModel}
            onChange={e => setFormData(prev => ({ ...prev, llmModel: e.target.value }))}
          >
            {ollamaModels.length === 0 && <option value="">Keine Modelle verfügbar</option>}
            {ollamaModels.map(model => {
              const name = typeof model === 'string' ? model : model.name;
              return (
                <option key={name} value={name}>
                  {name}
                </option>
              );
            })}
          </select>
          <small>Lokales Modell via Ollama</small>
        </div>

        {/* RAG Configuration */}
        <div className="bot-details-rag-section">
          <h4>
            <FiBook /> RAG-Konfiguration
          </h4>

          <label className="bot-details-checkbox">
            <input
              type="checkbox"
              checked={formData.ragEnabled}
              onChange={e => setFormData(prev => ({ ...prev, ragEnabled: e.target.checked }))}
            />
            RAG aktivieren (Dokument-Wissen nutzen)
          </label>

          {formData.ragEnabled && (
            <>
              <div className="bot-details-form-group" style={{ marginTop: '0.75rem' }}>
                <label>Space-Zuordnung</label>
                <div className="bot-details-space-list">
                  <button
                    type="button"
                    className={`bot-details-space-tag ${formData.ragSpaceIds === null ? 'selected' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, ragSpaceIds: null }))}
                  >
                    Alle Spaces {isMaster && '(Master)'}
                  </button>
                  {spaces.map(space => (
                    <button
                      key={space.id}
                      type="button"
                      className={`bot-details-space-tag ${formData.ragSpaceIds?.includes(space.id) ? 'selected' : ''}`}
                      onClick={() => {
                        if (formData.ragSpaceIds === null) {
                          setFormData(prev => ({ ...prev, ragSpaceIds: [space.id] }));
                        } else {
                          toggleSpace(space.id);
                        }
                      }}
                    >
                      {space.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="bot-details-checkbox">
                <input
                  type="checkbox"
                  checked={formData.ragShowSources}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, ragShowSources: e.target.checked }))
                  }
                />
                Quellen in Antworten anzeigen
              </label>
            </>
          )}
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
                <FiRefreshCw className="spinning" /> Speichern...
              </>
            ) : (
              <>
                <FiSave /> Speichern
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
        <CommandsEditor botId={bot.id} commands={commands} onChange={handleCommandsChange} />
      )}
    </div>
  );

  // Tab 3: Chats
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
                <span>{chat.messageCount || chat.message_count || 0} Nachrichten</span>
                <span className="chat-item-date">
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

        {formData.token && (
          <div className="bot-details-actions">
            <button
              type="button"
              className="bot-details-btn primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <FiRefreshCw className="spinning" /> Speichern...
                </>
              ) : (
                <>
                  <FiSave /> Änderungen speichern
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
              <Icon /> <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

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
