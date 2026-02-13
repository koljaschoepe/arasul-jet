/**
 * BotCard - Card component displaying a single Telegram bot
 */

import React from 'react';
import { FiMessageCircle, FiEdit2, FiTrash2, FiPower } from 'react-icons/fi';

function BotCard({ bot, onEdit, onToggleActive, onDelete, isToggling }) {
  const isActive = bot.isActive || bot.is_active;
  const provider = bot.llmProvider || bot.llm_provider || 'ollama';
  const model = bot.llmModel || bot.llm_model || '';
  const username = bot.username || bot.bot_username;
  const systemPrompt = bot.systemPrompt || bot.system_prompt || '';
  const chatCount = bot.chatCount || bot.chat_count || 0;
  const promptPreview =
    systemPrompt.length > 80 ? systemPrompt.substring(0, 80) + '…' : systemPrompt;

  return (
    <div className={`bot-card ${isActive ? 'active' : 'inactive'}`}>
      {/* Header */}
      <div className="bot-card-header">
        <div className="bot-card-avatar">
          <FiMessageCircle />
        </div>
        <div className="bot-card-info">
          <h3 className="bot-card-name">{bot.name}</h3>
          <span className="bot-card-username">@{username || 'nicht verbunden'}</span>
        </div>
        <div className={`bot-card-status ${isActive ? 'active' : 'inactive'}`}>
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </div>
      </div>

      {/* System Prompt Preview */}
      {promptPreview && <p className="bot-card-prompt">{promptPreview}</p>}

      {/* Provider + Stats */}
      <div className="bot-card-meta">
        <span className={`provider-badge ${provider}`}>
          {provider === 'ollama' ? 'Lokale KI' : 'Cloud KI'}
          {model && <span className="model-name"> ({model.split(':')[0]})</span>}
        </span>
        <span className="bot-card-chats">{chatCount} Chats</span>
      </div>

      {/* Actions */}
      <div className="bot-card-actions">
        <button className="bot-action-btn edit" onClick={onEdit} title="Bearbeiten">
          <FiEdit2 /> <span>Bearbeiten</span>
        </button>
        <button
          className={`bot-action-btn power ${isActive ? 'active' : ''}`}
          onClick={() => onToggleActive(!isActive)}
          title={isActive ? 'Deaktivieren' : 'Aktivieren'}
          disabled={isToggling}
        >
          <FiPower className={isToggling ? 'spinning' : ''} />
        </button>
        <button className="bot-action-btn delete" onClick={onDelete} title="Löschen">
          <FiTrash2 />
        </button>
      </div>
    </div>
  );
}

export default BotCard;
