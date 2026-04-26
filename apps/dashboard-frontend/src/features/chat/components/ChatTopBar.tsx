import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, Cpu, Star, Check } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import { useChatContext } from '../../../contexts/ChatContext';
import useConfirm from '../../../hooks/useConfirm';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { cn } from '@/lib/utils';

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
  const ctx = useChatContext();
  const { activeJobIds } = ctx;
  // Defensive defaults — older tests mock this context with only `activeJobIds`
  const installedModels = ctx.installedModels ?? [];
  const selectedModel = ctx.selectedModel ?? '';
  const setSelectedModel = ctx.setSelectedModel ?? (() => {});
  const defaultModel = ctx.defaultModel ?? '';
  const loadedModel = ctx.loadedModel ?? '';
  const favoriteModels = ctx.favoriteModels ?? [];
  const toggleFavorite = ctx.toggleFavorite ?? (() => {});
  const setModelAsDefault = ctx.setModelAsDefault ?? (() => {});
  const { confirm, ConfirmDialog } = useConfirm();

  // Effective active model: explicit selection wins, else default, else loaded
  const activeModelId = selectedModel || defaultModel || loadedModel || '';
  const activeModel = installedModels.find(m => m.id === activeModelId);
  const sortedModels = [...installedModels].sort((a, b) => {
    // Favorites first, then alphabetic
    const aFav = favoriteModels.includes(a.id);
    const bFav = favoriteModels.includes(b.id);
    if (aFav !== bFav) return aFav ? -1 : 1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

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
    <header className="chat-top-bar flex items-center gap-2 px-6 py-2 border-b border-border bg-card shrink-0 min-h-14">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          localStorage.removeItem('arasul_last_chat_id');
          navigate('/chat');
        }}
        aria-label="Zurück zur Übersicht"
      >
        <ArrowLeft />
      </Button>

      <div className="chat-title-area flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            className="flex-1 bg-card border border-ring rounded-md text-foreground text-base font-semibold py-1 px-2 outline-none ring-[3px] ring-ring/50"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            autoFocus
          />
        ) : (
          <h2
            className="m-0 text-base font-semibold text-foreground cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis py-1 px-2 rounded-md transition-colors duration-150 hover:bg-primary/5"
            onClick={startEdit}
            title="Klicken zum Bearbeiten"
          >
            {title || 'Neuer Chat'}
          </h2>
        )}
        {project && (
          <span
            className="chat-top-bar-project inline-flex items-center gap-1.5 py-0.5 px-2.5 border border-border rounded-full text-xs text-muted-foreground shrink-0"
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
        {/* Model switcher — only shown when models are available */}
        {installedModels.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 max-w-[200px]"
                title={`Aktives Modell: ${activeModel?.name || activeModelId || 'Kein Modell'}`}
                aria-label="Modell wechseln"
              >
                <Cpu className="size-3.5 text-primary shrink-0" />
                <span className="truncate text-xs font-medium">
                  {activeModel?.name || activeModelId || 'Modell wählen'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                Modell auswählen
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sortedModels.map(model => {
                const isActive = model.id === activeModelId;
                const isDefault = model.id === defaultModel;
                const isLoaded = model.id === loadedModel;
                const isFav = favoriteModels.includes(model.id);
                return (
                  <DropdownMenuItem
                    key={model.id}
                    onSelect={() => setSelectedModel(model.id)}
                    className="flex items-start gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isActive && <Check className="size-3 text-primary shrink-0" />}
                        <span
                          className={cn(
                            'truncate text-sm',
                            isActive && 'font-semibold text-foreground'
                          )}
                        >
                          {model.name || model.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        {isLoaded && <span className="text-primary font-medium">● Geladen</span>}
                        {isDefault && <span>Standard</span>}
                        {model.supports_thinking && <span>Thinking</span>}
                        {model.supports_vision_input && <span>Vision</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        className={cn(
                          'p-1 rounded hover:bg-muted',
                          isFav ? 'text-primary' : 'text-muted-foreground'
                        )}
                        onClick={e => {
                          e.stopPropagation();
                          toggleFavorite(model.id);
                        }}
                        title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                        aria-label={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                      >
                        <Star className="size-3" />
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          onClick={e => {
                            e.stopPropagation();
                            setModelAsDefault(model.id);
                          }}
                          title="Als Standard setzen"
                          aria-label="Als Standard setzen"
                        >
                          <Cpu className="size-3" />
                        </button>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          title="Chat exportieren"
          aria-label="Chat exportieren"
        >
          <Download className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-destructive/10 hover:text-destructive hover:border-transparent"
          onClick={handleDelete}
          title="Chat löschen"
          aria-label="Chat löschen"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {ConfirmDialog}
    </header>
  );
}
