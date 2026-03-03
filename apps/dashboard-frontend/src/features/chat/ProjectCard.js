import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiChevronRight,
  FiMessageSquare,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiFolder,
  FiFileText,
  FiCheck,
  FiX,
} from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/ui/EmptyState';
import { formatRelativeTime } from './utils';

export default function ProjectCard({
  project,
  activeJobIds,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onDeleteChat,
  onRenameChat,
}) {
  const api = useApi();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);

  const handleNewChat = useCallback(
    async e => {
      e.stopPropagation();
      if (creating) return;
      setCreating(true);
      try {
        const data = await api.post('/chats', { project_id: project.id });
        navigate(`/chat/${data.chat.id}`);
      } catch (err) {
        console.error('Error creating chat:', err);
      } finally {
        setCreating(false);
      }
    },
    [api, project.id, navigate, creating]
  );

  const handleEdit = useCallback(
    e => {
      e.stopPropagation();
      onEdit(project);
    },
    [project, onEdit]
  );

  const handleDelete = useCallback(
    e => {
      e.stopPropagation();
      onDelete(project);
    },
    [project, onDelete]
  );

  const startRename = useCallback((chatId, currentTitle) => {
    setRenamingChatId(chatId);
    setRenameValue(currentTitle || '');
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingChatId(null);
    setRenameValue('');
  }, []);

  const submitRename = useCallback(
    async chatId => {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        cancelRename();
        return;
      }
      try {
        await onRenameChat(chatId, trimmed);
      } finally {
        setRenamingChatId(null);
        setRenameValue('');
      }
    },
    [renameValue, onRenameChat, cancelRename]
  );

  // Auto-focus rename input
  useEffect(() => {
    if (renamingChatId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingChatId]);

  return (
    <div className="project-card" data-expanded={expanded || undefined}>
      <div
        className="project-card-header"
        onClick={() => onToggle(project.id)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(project.id);
          }
        }}
      >
        <FiChevronRight className={`expand-icon ${expanded ? 'rotated' : ''}`} aria-hidden="true" />
        <span className="project-dot" style={{ background: project.color }} />
        <span className="project-name">{project.name}</span>

        {project.system_prompt && (
          <span className="badge badge-info" title="System-Prompt konfiguriert">
            <FiFileText /> Prompt
          </span>
        )}
        {project.space_name && (
          <span className="badge badge-neutral" title={`Knowledge Space: ${project.space_name}`}>
            <FiFolder /> {project.space_name}
          </span>
        )}
        <span className="project-count">
          {project.conversation_count || project.conversations?.length || 0} Chats
        </span>

        <div className="project-card-actions" onClick={e => e.stopPropagation()}>
          {!project.is_default && (
            <>
              <button
                type="button"
                className="btn-icon"
                onClick={handleEdit}
                title="Projekt bearbeiten"
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                className="btn-icon danger"
                onClick={handleDelete}
                title="Projekt löschen"
              >
                <FiTrash2 />
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-icon btn-new-chat"
            onClick={handleNewChat}
            disabled={creating}
            title="Neuen Chat erstellen"
          >
            <FiPlus />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="project-card-chats">
          {project.conversations?.length > 0 ? (
            project.conversations.map(c => (
              <div key={c.id} className="chat-list-item-wrapper">
                {renamingChatId === c.id ? (
                  <div className="chat-rename-row">
                    <FiMessageSquare className="chat-list-icon" />
                    <input
                      ref={renameInputRef}
                      className="chat-rename-input"
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitRename(c.id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      maxLength={200}
                    />
                    <button
                      type="button"
                      className="chat-rename-action confirm"
                      onClick={() => submitRename(c.id)}
                      title="Speichern"
                    >
                      <FiCheck />
                    </button>
                    <button
                      type="button"
                      className="chat-rename-action cancel"
                      onClick={cancelRename}
                      title="Abbrechen"
                    >
                      <FiX />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link to={`/chat/${c.id}`} className="chat-list-item">
                      <FiMessageSquare className="chat-list-icon" />
                      <span className="chat-title">{c.title || 'Neuer Chat'}</span>
                      {activeJobIds[c.id] && <span className="pulse-dot active" />}
                      <span className="chat-time">{formatRelativeTime(c.updated_at)}</span>
                    </Link>
                    <button
                      type="button"
                      className="chat-action-btn"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        startRename(c.id, c.title);
                      }}
                      title="Chat umbenennen"
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className="chat-action-btn danger"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteChat(c.id, c.title);
                      }}
                      title="Chat löschen"
                    >
                      <FiTrash2 />
                    </button>
                  </>
                )}
              </div>
            ))
          ) : (
            <EmptyState
              title="Keine Chats"
              description="Erstelle einen neuen Chat in diesem Projekt."
            />
          )}
        </div>
      )}
    </div>
  );
}
