import { Link } from 'react-router-dom';
import { FiMessageSquare } from 'react-icons/fi';
import { formatRelativeTime } from './utils';

export default function RecentChatCard({ chat, hasActiveJob }) {
  return (
    <Link to={`/chat/${chat.id}`} className="recent-chat-card">
      <span
        className="project-dot"
        style={{ background: chat.project_color || 'var(--text-muted)' }}
      />
      <div className="recent-chat-info">
        <span className="recent-chat-title">
          <FiMessageSquare className="recent-chat-icon" />
          {chat.title || 'Neuer Chat'}
        </span>
        <span className="recent-chat-meta">
          {chat.project_name || 'Allgemein'} &middot; {formatRelativeTime(chat.updated_at)}
        </span>
      </div>
      {hasActiveJob && <span className="pulse-dot active" title="Verarbeitung läuft" />}
    </Link>
  );
}
