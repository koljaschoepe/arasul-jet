import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useChatContext } from '../../contexts/ChatContext';
import useConfirm from '../../hooks/useConfirm';

interface ChatTopBarProps {
  chatId: number;
  title: string;
  onTitleChange: (title: string) => void;
  project: { name: string; color: string } | null;
}

export default function ChatTopBar({ chatId, title, onTitleChange, project }: ChatTopBarProps) {
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
    (e: React.KeyboardEvent) => {
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
    <header className="chat-top-bar flex items-center gap-2 px-6 py-2 border-b border-[var(--border-color)] bg-[var(--bg-card)] shrink-0 min-h-14">
      <button
        type="button"
        className="back-btn flex items-center justify-center w-9 h-9 bg-transparent border-none rounded-lg text-[var(--text-muted)] cursor-pointer shrink-0 transition-all duration-150 hover:bg-[var(--primary-alpha-8)] hover:text-[var(--text-primary)]"
        onClick={() => {
          localStorage.removeItem('arasul_last_chat_id');
          navigate('/chat');
        }}
        aria-label="Zurück zur Übersicht"
      >
        <ArrowLeft />
      </button>

      <div className="chat-title-area flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            className="flex-1 bg-[var(--bg-card)] border border-[var(--primary-color)] rounded-md text-[var(--text-primary)] text-base font-semibold py-1 px-2 outline-none shadow-[0_0_0_3px_var(--primary-alpha-15)]"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            autoFocus
          />
        ) : (
          <h2
            className="m-0 text-base font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis py-1 px-2 rounded-md transition-colors duration-150 hover:bg-[var(--primary-alpha-5)]"
            onClick={startEdit}
            title="Klicken zum Bearbeiten"
          >
            {title || 'Neuer Chat'}
          </h2>
        )}
        {project && (
          <span
            className="chat-top-bar-project inline-flex items-center gap-1.5 py-0.5 px-2.5 border border-[var(--border-color)] rounded-full text-xs text-[var(--text-muted)] shrink-0"
            style={{ borderColor: project.color }}
          >
            <span
              className="project-dot w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: project.color }}
            />
            {project.name}
          </span>
        )}
      </div>

      <div className="chat-top-bar-actions flex items-center gap-1 ml-auto shrink-0">
        <button
          type="button"
          className="btn-icon flex items-center justify-center w-9 h-9 bg-transparent border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] cursor-pointer transition-all duration-150 hover:bg-[var(--primary-alpha-8)] hover:text-[var(--text-primary)] hover:border-[var(--primary-color)]"
          onClick={handleExport}
          title="Chat exportieren"
          aria-label="Chat exportieren"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="btn-icon danger flex items-center justify-center w-9 h-9 bg-transparent border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] cursor-pointer transition-all duration-150 hover:bg-[var(--danger-alpha-10)] hover:text-[var(--danger-color)] hover:border-[var(--danger-color)]"
          onClick={handleDelete}
          title="Chat löschen"
          aria-label="Chat löschen"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {ConfirmDialog}
    </header>
  );
}
