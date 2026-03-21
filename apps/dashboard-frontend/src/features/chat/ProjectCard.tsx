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
import { Button } from '@/components/ui/shadcn/button';
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
      className="project-card bg-card border border-border/50 rounded-xl mb-2 overflow-hidden transition-all duration-150 hover:border-border hover:shadow-sm"
      data-expanded={expanded || undefined}
    >
      <div
        className="project-card-header flex items-center gap-2 py-3.5 px-4 cursor-pointer transition-colors duration-150 hover:bg-primary/5"
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
            'shrink-0 size-4 text-muted-foreground transition-transform duration-150',
            expanded && 'rotate-90'
          )}
          aria-hidden="true"
        />
        <span
          className="project-dot w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: project.color }}
        />
        <span className="project-name font-semibold text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {project.name}
        </span>

        {project.system_prompt && (
          <span
            className="badge badge-info inline-flex items-center gap-1 text-xs py-0.5 px-2 rounded-md bg-primary/10 text-primary border border-primary/20"
            title="System-Prompt konfiguriert"
          >
            <FileText className="size-3" /> Prompt
          </span>
        )}
        {project.space_name && (
          <span
            className="badge badge-neutral inline-flex items-center gap-1 text-xs py-0.5 px-2 rounded-md bg-primary/10 text-foreground/60 border border-primary/15"
            title={`Knowledge Space: ${project.space_name}`}
          >
            <Folder className="size-3" /> {project.space_name}
          </span>
        )}
        <span className="project-count ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {project.conversation_count || project.conversations?.length || 0} Chats
        </span>

        <div
          className="project-card-actions flex items-center gap-1 ml-2"
          onClick={e => e.stopPropagation()}
        >
          {!project.is_default && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleEdit}
                title="Projekt bearbeiten"
                aria-label="Projekt bearbeiten"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDelete}
                title="Projekt löschen"
                aria-label="Projekt löschen"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleNewChat}
            disabled={creating}
            title="Neuen Chat erstellen"
            aria-label="Neuen Chat erstellen"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="project-card-chats py-1 px-2 pb-2 pl-[var(--space-xl)] border-t border-border/50 bg-primary/[0.03]">
          {project.conversations?.length > 0 ? (
            project.conversations.map((c: any) => (
              <div
                key={c.id}
                className="chat-list-item-wrapper group flex items-center rounded-md transition-colors duration-150 hover:bg-primary/[0.08]"
              >
                {renamingChatId === c.id ? (
                  <div className="chat-rename-row flex items-center gap-2 py-1.5 px-3 flex-1 min-w-0">
                    <MessageSquare className="chat-list-icon shrink-0 size-3.5 text-muted-foreground" />
                    <input
                      ref={renameInputRef}
                      className="chat-rename-input flex-1 min-w-0 bg-background border border-ring rounded-md text-foreground text-sm py-1 px-2 outline-none ring-[3px] ring-ring/50"
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
                      className="chat-rename-action confirm bg-transparent border-none cursor-pointer p-1.5 rounded-md flex items-center shrink-0 transition-all duration-150 text-primary hover:bg-primary/10"
                      onClick={() => submitRename(c.id)}
                      title="Speichern"
                      aria-label="Speichern"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="chat-rename-action cancel bg-transparent border-none cursor-pointer p-1.5 rounded-md flex items-center shrink-0 transition-all duration-150 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={cancelRename}
                      title="Abbrechen"
                      aria-label="Abbrechen"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to={`/chat/${c.id}`}
                      className="chat-list-item flex items-center gap-2 py-2 px-3 rounded-md no-underline text-inherit flex-1 min-w-0"
                    >
                      <MessageSquare className="chat-list-icon shrink-0 size-3.5 text-muted-foreground" />
                      <span className="chat-title flex-1 text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.title || 'Neuer Chat'}
                      </span>
                      {activeJobIds[c.id] && (
                        <span className="pulse-dot size-2 rounded-full bg-primary shrink-0 animate-[pulse-glow_1.5s_ease-in-out_infinite]" />
                      )}
                      <span className="chat-time text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(c.updated_at)}
                      </span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 shrink-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        startRename(c.id, c.title);
                      }}
                      title="Chat umbenennen"
                      aria-label="Chat umbenennen"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 shrink-0 mr-2 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteChat(c.id, c.title);
                      }}
                      title="Chat löschen"
                      aria-label="Chat löschen"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
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
