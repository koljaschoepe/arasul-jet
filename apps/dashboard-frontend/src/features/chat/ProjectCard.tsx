import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Folder,
  FileText,
  Check,
  X,
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import EmptyState from '../../components/ui/EmptyState';
import { formatRelativeTime } from './utils';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: any;
  activeJobIds: Record<string, any>;
  expanded: boolean;
  onToggle: (projectId: number) => void;
  onEdit: (project: any) => void;
  onDelete: (project: any) => void;
  onDeleteChat: (chatId: number, title: string) => void;
  onRenameChat: (chatId: number, title: string) => Promise<void>;
}

export default function ProjectCard({
  project,
  activeJobIds,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onDeleteChat,
  onRenameChat,
}: ProjectCardProps) {
  const api = useApi();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleNewChat = useCallback(
    async (e: React.MouseEvent) => {
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
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(project);
    },
    [project, onEdit]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(project);
    },
    [project, onDelete]
  );

  const startRename = useCallback((chatId: number, currentTitle: string) => {
    setRenamingChatId(chatId);
    setRenameValue(currentTitle || '');
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingChatId(null);
    setRenameValue('');
  }, []);

  const submitRename = useCallback(
    async (chatId: number) => {
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

  useEffect(() => {
    if (renamingChatId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingChatId]);

  return (
    <div
      className="project-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl mb-2 overflow-hidden transition-all duration-150 hover:border-[var(--border-color)] hover:shadow-sm"
      data-expanded={expanded || undefined}
    >
      <div
        className="project-card-header flex items-center gap-2 py-3.5 px-4 cursor-pointer transition-colors duration-150 hover:bg-[var(--primary-alpha-5)]"
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
        <ChevronRight
          className={cn(
            'shrink-0 w-4 h-4 text-[var(--text-muted)] transition-transform duration-150',
            expanded && 'rotate-90'
          )}
          aria-hidden="true"
        />
        <span
          className="project-dot w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: project.color }}
        />
        <span className="project-name font-semibold text-sm text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
          {project.name}
        </span>

        {project.system_prompt && (
          <span
            className="badge badge-info inline-flex items-center gap-1 text-[0.7rem] py-0.5 px-2 rounded-md bg-[var(--primary-alpha-10)] text-[var(--primary-color)] border border-[var(--primary-alpha-20)]"
            title="System-Prompt konfiguriert"
          >
            <FileText className="w-3 h-3" /> Prompt
          </span>
        )}
        {project.space_name && (
          <span
            className="badge badge-neutral inline-flex items-center gap-1 text-[0.7rem] py-0.5 px-2 rounded-md bg-[var(--primary-alpha-5)] text-[var(--text-muted)] border border-[var(--border-color)]"
            title={`Knowledge Space: ${project.space_name}`}
          >
            <Folder className="w-3 h-3" /> {project.space_name}
          </span>
        )}
        <span className="project-count ml-auto text-xs text-[var(--text-muted)] whitespace-nowrap">
          {project.conversation_count || project.conversations?.length || 0} Chats
        </span>

        <div
          className="project-card-actions flex items-center gap-1 ml-2"
          onClick={e => e.stopPropagation()}
        >
          {!project.is_default && (
            <>
              <button
                type="button"
                className="btn-icon bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md flex items-center transition-all duration-150 hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]"
                onClick={handleEdit}
                title="Projekt bearbeiten"
                aria-label="Projekt bearbeiten"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="btn-icon danger bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md flex items-center transition-all duration-150 hover:text-[var(--danger-color)] hover:bg-[var(--danger-alpha-10)]"
                onClick={handleDelete}
                title="Projekt löschen"
                aria-label="Projekt löschen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-icon btn-new-chat bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md flex items-center transition-all duration-150 hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]"
            onClick={handleNewChat}
            disabled={creating}
            title="Neuen Chat erstellen"
            aria-label="Neuen Chat erstellen"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="project-card-chats py-1 px-2 pb-2 pl-[var(--space-xl)] border-t border-[var(--border-subtle)] bg-[rgba(69,173,255,0.03)]">
          {project.conversations?.length > 0 ? (
            project.conversations.map((c: any) => (
              <div
                key={c.id}
                className="chat-list-item-wrapper group flex items-center rounded-md transition-colors duration-150 hover:bg-[var(--primary-alpha-8)]"
              >
                {renamingChatId === c.id ? (
                  <div className="chat-rename-row flex items-center gap-2 py-1.5 px-3 flex-1 min-w-0">
                    <MessageSquare className="chat-list-icon shrink-0 w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <input
                      ref={renameInputRef}
                      className="chat-rename-input flex-1 min-w-0 bg-[var(--bg-input)] border border-[var(--primary-color)] rounded-md text-[var(--text-primary)] text-sm py-1 px-2 outline-none shadow-[0_0_0_3px_var(--primary-alpha-15)]"
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
                      className="chat-rename-action confirm bg-transparent border-none cursor-pointer p-1.5 rounded-md flex items-center shrink-0 transition-all duration-150 text-[var(--success-color)] hover:bg-[rgba(34,197,94,0.1)]"
                      onClick={() => submitRename(c.id)}
                      title="Speichern"
                      aria-label="Speichern"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="chat-rename-action cancel bg-transparent border-none cursor-pointer p-1.5 rounded-md flex items-center shrink-0 transition-all duration-150 text-[var(--text-muted)] hover:text-[var(--danger-color)] hover:bg-[var(--danger-alpha-10)]"
                      onClick={cancelRename}
                      title="Abbrechen"
                      aria-label="Abbrechen"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to={`/chat/${c.id}`}
                      className="chat-list-item flex items-center gap-2 py-2 px-3 rounded-md no-underline text-inherit flex-1 min-w-0"
                    >
                      <MessageSquare className="chat-list-icon shrink-0 w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span className="chat-title flex-1 text-sm text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.title || 'Neuer Chat'}
                      </span>
                      {activeJobIds[c.id] && (
                        <span className="pulse-dot w-2 h-2 rounded-full bg-[var(--success-color)] shrink-0 animate-[pulse-glow_1.5s_ease-in-out_infinite]" />
                      )}
                      <span className="chat-time text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatRelativeTime(c.updated_at)}
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="chat-action-btn bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md flex items-center opacity-0 transition-all duration-150 shrink-0 group-hover:opacity-100 hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        startRename(c.id, c.title);
                      }}
                      title="Chat umbenennen"
                      aria-label="Chat umbenennen"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="chat-action-btn danger bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-md flex items-center opacity-0 transition-all duration-150 shrink-0 mr-2 group-hover:opacity-100 hover:text-[var(--danger-color)] hover:bg-[var(--danger-alpha-10)]"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteChat(c.id, c.title);
                      }}
                      title="Chat löschen"
                      aria-label="Chat löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
