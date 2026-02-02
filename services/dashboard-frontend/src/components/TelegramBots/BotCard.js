/**
 * BotCard - Card component displaying a single Telegram bot
 */

import React from 'react';
import { FiMessageCircle, FiEdit2, FiTrash2, FiPower, FiUsers, FiCommand } from 'react-icons/fi';

function BotCard({ bot, onEdit, onToggleActive, onDelete }) {
  const isActive = bot.isActive || bot.is_active;

  return (
    <div className={`bot-card ${isActive ? 'active' : 'inactive'}`}>
      {/* Header */}
      <div className="bot-card-header">
        <div className="bot-card-avatar">
          <FiMessageCircle />
        </div>
        <div className="bot-card-info">
          <h3 className="bot-card-name">{bot.name}</h3>
          <span className="bot-card-username">@{bot.username || 'nicht verbunden'}</span>
        </div>
        <div className={`bot-card-status ${isActive ? 'active' : 'inactive'}`}>
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </div>
      </div>

      {/* Stats */}
      <div className="bot-card-stats">
        <div className="bot-card-stat">
          <FiUsers className="bot-card-stat-icon" />
          <span className="bot-card-stat-value">{bot.chatCount || bot.chat_count || 0}</span>
          <span className="bot-card-stat-label">Chats</span>
        </div>
        <div className="bot-card-stat">
          <FiCommand className="bot-card-stat-icon" />
          <span className="bot-card-stat-value">{bot.commandCount || bot.command_count || 0}</span>
          <span className="bot-card-stat-label">Commands</span>
        </div>
        <div className="bot-card-stat">
          <FiMessageCircle className="bot-card-stat-icon" />
          <span className="bot-card-stat-value">{bot.messageCount || bot.message_count || 0}</span>
          <span className="bot-card-stat-label">Nachrichten</span>
        </div>
      </div>

      {/* Provider Badge */}
      <div className="bot-card-provider">
        <span className={`provider-badge ${bot.llmProvider || bot.llm_provider || 'ollama'}`}>
          {(bot.llmProvider || bot.llm_provider || 'ollama').toUpperCase()}
        </span>
        <span className="bot-card-model">{bot.llmModel || bot.llm_model || 'Standard'}</span>
      </div>

      {/* Actions */}
      <div className="bot-card-actions">
        <button
          className={`bot-action-btn power ${isActive ? 'active' : ''}`}
          onClick={() => onToggleActive(!isActive)}
          title={isActive ? 'Deaktivieren' : 'Aktivieren'}
        >
          <FiPower />
        </button>
        <button className="bot-action-btn edit" onClick={onEdit} title="Bearbeiten">
          <FiEdit2 />
        </button>
        <button className="bot-action-btn delete" onClick={onDelete} title="Loeschen">
          <FiTrash2 />
        </button>
      </div>
    </div>
  );
}

export default BotCard;
