import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { formatRelativeTime } from './utils';

interface RecentChatCardProps {
  chat: {
    id: number;
    title?: string;
    project_color?: string;
    project_name?: string;
    updated_at?: string;
  };
  hasActiveJob: boolean;
}

export default function RecentChatCard({ chat, hasActiveJob }: RecentChatCardProps) {
  return (
    <Link
      to={`/chat/${chat.id}`}
      className="recent-chat-card flex items-center gap-2 bg-[var(--bg-card)] px-4 py-3.5 rounded-xl no-underline text-inherit border border-[var(--border-subtle)] border-b-2 border-b-transparent transition-all duration-300 hover:border-[var(--border-color)] hover:border-b-[var(--primary-color)] hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        className="project-dot w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: chat.project_color || 'var(--text-muted)' }}
      />
      <div className="recent-chat-info flex-1 min-w-0">
        <span className="recent-chat-title flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
          <MessageSquare className="shrink-0 w-3.5 h-3.5 text-[var(--text-muted)]" />
          {chat.title || 'Neuer Chat'}
        </span>
        <span className="recent-chat-meta block text-xs text-[var(--text-muted)] mt-0.5">
          {chat.project_name || 'Allgemein'} &middot; {formatRelativeTime(chat.updated_at || '')}
        </span>
      </div>
      {hasActiveJob && (
        <span
          className="pulse-dot w-2 h-2 rounded-full bg-[var(--success-color)] shrink-0 animate-[pulse-glow_1.5s_ease-in-out_infinite]"
          title="Verarbeitung läuft"
        />
      )}
    </Link>
  );
}
