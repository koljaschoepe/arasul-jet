import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiChevronDown, FiChevronUp, FiCpu, FiBook, FiFolder } from 'react-icons/fi';
import MermaidDiagram from '../MermaidDiagram';

/**
 * ChatMessage - Renders a single chat message (user or assistant).
 * Memoized to prevent re-renders when other messages update.
 */
const ChatMessage = memo(function ChatMessage({
  message,
  index,
  chatId,
  isLoading,
  onToggleThinking,
  onToggleSources,
}) {
  return (
    <article
      key={message.id || message.jobId || `${chatId}-msg-${index}`}
      className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
      aria-label={message.role === 'user' ? 'Deine Nachricht' : 'AI Antwort'}
    >
      <div className="message-label" aria-hidden="true">
        {message.role === 'user' ? 'Du' : 'AI'}
      </div>

      {/* Thinking Block */}
      {message.hasThinking && message.thinking && (
        <div
          className={`thinking-block ${message.thinkingCollapsed ? 'collapsed' : ''} ${message.thinkingCollapsing ? 'collapsing' : ''}`}
        >
          <button
            className="thinking-header"
            onClick={() => onToggleThinking(index)}
            aria-expanded={!message.thinkingCollapsed}
          >
            <FiCpu className="thinking-icon" aria-hidden="true" />
            <span>Gedankengang</span>
            {message.thinkingCollapsed ? (
              <FiChevronDown aria-hidden="true" />
            ) : (
              <FiChevronUp aria-hidden="true" />
            )}
          </button>
          <div className="thinking-content">{message.thinking}</div>
        </div>
      )}

      {/* Message Content */}
      {message.content && (
        <div className="message-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';

                if (!inline && language === 'mermaid') {
                  return <MermaidDiagram content={String(children).replace(/\n$/, '')} />;
                }

                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Loading indicator */}
      {message.role === 'assistant' && !message.content && !message.thinking && isLoading && (
        <div className="message-loading" role="status" aria-label="AI antwortet...">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </div>
      )}

      {/* Matched Spaces Display */}
      {message.matchedSpaces && message.matchedSpaces.length > 0 && (
        <div className="matched-spaces-block">
          <span className="matched-spaces-label">
            <FiFolder style={{ marginRight: '6px' }} />
            Durchsuchte Bereiche:
          </span>
          <div className="matched-spaces-chips">
            {message.matchedSpaces.map((space, i) => (
              <span
                key={space.id || i}
                className="matched-space-chip"
                style={{ borderLeftColor: space.color || 'var(--primary-color)' }}
                title={`Relevanz: ${((space.score || 0) * 100).toFixed(0)}%`}
              >
                <FiFolder
                  style={{ color: space.color || 'var(--primary-color)', marginRight: '4px' }}
                />
                {space.name}
                <span className="space-score">{((space.score || 0) * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sources Block */}
      {message.sources && message.sources.length > 0 && (
        <div className={`sources-block ${message.sourcesCollapsed ? 'collapsed' : ''}`}>
          <button
            className="sources-header"
            onClick={() => onToggleSources(index)}
            aria-expanded={!message.sourcesCollapsed}
          >
            <FiBook className="sources-icon" aria-hidden="true" />
            <span>Quellen ({message.sources.length})</span>
            {message.sourcesCollapsed ? (
              <FiChevronDown aria-hidden="true" />
            ) : (
              <FiChevronUp aria-hidden="true" />
            )}
          </button>
          {!message.sourcesCollapsed && (
            <div className="sources-content">
              {message.sources.map((source, sourceIndex) => (
                <div key={sourceIndex} className="source-item">
                  <div className="source-name">{source.document_name}</div>
                  <div className="source-preview">{source.text_preview}</div>
                  <div className="source-score">Relevanz: {(source.score * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
});

export default ChatMessage;
