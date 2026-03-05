import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiTrash2 } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useChatContext } from '../../contexts/ChatContext';
import useConfirm from '../../hooks/useConfirm';

export default function ChatTopBar({ chatId, title, onTitleChange, project }) {
  const navigate = useNavigate();
  const api = useApi();
  const toast = useToast();
  const { activeJobIds } = useChatContext();
  const { confirm, ConfirmDialog } = useConfirm();

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback(() => {
    setEditValue(title || '');
    setEditing(true);
  }, [title]);

  const saveTitle = useCallback(async () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    try {
      await api.patch(`/chats/${chatId}`, { title: trimmed }, { showError: false });
      onTitleChange(trimmed);
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [editValue, title, chatId, api, onTitleChange]);

  const handleTitleKeyDown = useCallback(
    e => {
      if (e.key === 'Enter') saveTitle();
      else if (e.key === 'Escape') setEditing(false);
    },
    [saveTitle]
  );

  const handleExport = useCallback(async () => {
    try {
      const response = await api.get(`/chats/${chatId}/export?format=json`, {
        raw: true,
        showError: false,
      });
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `chat-${chatId}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting chat:', err);
      toast.error('Export fehlgeschlagen');
    }
  }, [chatId, api, toast]);

  const handleDelete = useCallback(async () => {
    const hasActiveJob = !!activeJobIds[chatId];
    const ok = await confirm({
      title: 'Chat löschen',
      message: hasActiveJob
        ? 'Dieser Chat hat eine aktive Verarbeitung. Wirklich löschen?'
        : 'Dieser Chat und alle Nachrichten werden unwiderruflich gelöscht.',
      confirmText: 'Löschen',
    });
    if (!ok) return;
    try {
      await api.del(`/chats/${chatId}`, { showError: false });
      localStorage.removeItem('arasul_last_chat_id');
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Error deleting chat:', err);
      toast.error('Löschen fehlgeschlagen');
    }
  }, [chatId, api, confirm, navigate, toast, activeJobIds]);

  return (
    <header className="chat-top-bar">
      <button
        type="button"
        className="back-btn"
        onClick={() => {
          localStorage.removeItem('arasul_last_chat_id');
          navigate('/chat');
        }}
        aria-label="Zurück zur Übersicht"
      >
        <FiArrowLeft />
      </button>

      <div className="chat-title-area">
        {editing ? (
          <input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            autoFocus
          />
        ) : (
          <h2 onClick={startEdit} title="Klicken zum Bearbeiten">
            {title || 'Neuer Chat'}
          </h2>
        )}
        {project && (
          <span className="chat-top-bar-project" style={{ borderColor: project.color }}>
            <span className="project-dot" style={{ background: project.color }} />
            {project.name}
          </span>
        )}
      </div>

      <div className="chat-top-bar-actions">
        <button type="button" className="btn-icon" onClick={handleExport} title="Chat exportieren">
          <FiDownload />
        </button>
        <button
          type="button"
          className="btn-icon danger"
          onClick={handleDelete}
          title="Chat löschen"
        >
          <FiTrash2 />
        </button>
      </div>

      {ConfirmDialog}
    </header>
  );
}
