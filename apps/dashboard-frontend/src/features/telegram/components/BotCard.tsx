import {
  MessageCircle,
  Power,
  Trash2,
  Pencil,
  Loader2,
  BookOpen,
  Cpu,
  Mic,
  Wrench,
  Shield,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { Bot } from './types';

interface BotCardProps {
  bot: Bot;
  toggling: boolean;
  deleting: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export default function BotCard({
  bot,
  toggling,
  deleting,
  onEdit,
  onToggle,
  onDelete,
}: BotCardProps) {
  const isActive = bot.isActive;
  const model = bot.llmModel || '';
  const provider = bot.llmProvider || 'ollama';
  const username = bot.username;
  const chatCount = bot.chatCount || 0;
  const messageCount = bot.messageCount || 0;
  const ragEnabled = bot.ragEnabled || false;
  const ragSpaceIds = bot.ragSpaceIds;
  const isMaster = ragEnabled && !ragSpaceIds;
  const voiceEnabled = bot.voiceEnabled ?? true;
  const toolsEnabled = bot.toolsEnabled ?? true;
  const restrictUsers = bot.restrictUsers || false;

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-5 transition-all hover:border-primary hover:shadow-lg hover:-translate-y-0.5',
        isActive && 'border-primary/30'
      )}
    >
      <div className="flex justify-between items-start mb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="m-0 mb-1 text-foreground text-base">{bot.name}</h4>
            {isMaster && (
              <span className="bg-primary/15 text-primary text-[0.65rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Master
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">@{username || 'nicht verbunden'}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium',
            isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full bg-current shrink-0',
              isActive && 'shadow-[0_0_6px_theme(--color-primary)] animate-pulse'
            )}
          />
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2.5 py-3 border-t border-b border-border mb-3.5 max-[480px]:gap-1.5">
        {ragEnabled && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70">
            <BookOpen size={14} /> {ragSpaceIds ? `${ragSpaceIds.length} Spaces` : 'Alle Spaces'}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70">
          <MessageCircle size={14} /> {chatCount} Chats
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70">
          <Cpu size={14} /> {model ? model.split(':')[0] : provider}
        </span>
        {voiceEnabled && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70"
            title="Sprachnachrichten aktiv"
          >
            <Mic size={14} />
          </span>
        )}
        {toolsEnabled && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70"
            title="Tool-Zugriff aktiv"
          >
            <Wrench size={14} />
          </span>
        )}
        {restrictUsers && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70"
            title="Zugriff eingeschränkt"
          >
            <Shield size={14} />
          </span>
        )}
        {messageCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&_svg]:text-sm [&_svg]:opacity-70">
            <Send size={14} /> {messageCount} Nachr.
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit} title="Bearbeiten">
          <Pencil size={14} /> <span>Bearbeiten</span>
        </Button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center size-9 border border-border rounded-lg bg-background cursor-pointer transition-all hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
            isActive ? 'text-muted-foreground' : 'text-primary'
          )}
          onClick={onToggle}
          disabled={toggling}
          title={isActive ? 'Deaktivieren' : 'Aktivieren'}
          aria-label={isActive ? 'Deaktivieren' : 'Aktivieren'}
        >
          <Power size={16} className={toggling ? 'animate-spin' : ''} />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          title="Löschen"
          aria-label="Löschen"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </Button>
      </div>
    </div>
  );
}
