import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiChevronDown,
  FiChevronUp,
  FiCpu,
  FiBook,
  FiFolder,
  FiSearch,
  FiActivity,
} from 'react-icons/fi';
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
  onToggleQueryOpt,
  onToggleContext,
}) {
  // Compaction banner (system message)
  if (message.role === 'system' && message.type === 'compaction') {
    const saved =
      message.tokensBefore && message.tokensAfter
        ? Math.round((1 - message.tokensAfter / message.tokensBefore) * 100)
        : 0;
    return (
      <div className="compaction-banner" role="status" aria-label="Kontext zusammengefasst">
        <span className="compaction-icon" aria-hidden="true">
          &#x2702;
        </span>
        <span className="compaction-text">
          Kontext zusammengefasst
          {message.tokensBefore > 0 && (
            <>
              {' '}
              &mdash; {message.tokensBefore.toLocaleString('de-DE')} &rarr;{' '}
              {message.tokensAfter.toLocaleString('de-DE')} Tokens ({saved}% Einsparung)
            </>
          )}
        </span>
      </div>
    );
  }

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
            type="button"
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

      {/* Query Optimization Details (collapsible) */}
      {message.queryOptimization && (
        <div className={`query-opt-block ${message.queryOptCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
            className="query-opt-header"
            onClick={() => onToggleQueryOpt(index)}
            aria-expanded={!message.queryOptCollapsed}
          >
            <FiSearch className="query-opt-icon" aria-hidden="true" />
            <span>Suchdetails ({message.queryOptimization.duration}ms)</span>
            {message.queryOptCollapsed ? (
              <FiChevronDown aria-hidden="true" />
            ) : (
              <FiChevronUp aria-hidden="true" />
            )}
          </button>
          {!message.queryOptCollapsed && (
            <div className="query-opt-content">
              {message.queryOptimization.decompoundResult && (
                <div className="query-opt-item">
                  <span className="query-opt-label">Worttrennung:</span>
                  <span className="query-opt-value">
                    {message.queryOptimization.decompoundResult}
                  </span>
                </div>
              )}
              {message.queryOptimization.multiQueryVariants &&
                message.queryOptimization.multiQueryVariants.length > 0 && (
                  <div className="query-opt-item">
                    <span className="query-opt-label">Suchvarianten:</span>
                    <ul className="query-opt-variants">
                      {message.queryOptimization.multiQueryVariants.map((variant, i) => (
                        <li key={i}>{variant}</li>
                      ))}
                    </ul>
                  </div>
                )}
              {message.queryOptimization.hydeGenerated && (
                <div className="query-opt-item">
                  <span className="query-opt-badge">HyDE aktiv</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Context Debug Panel */}
      {message.tokenBreakdown && (
        <div className={`context-debug-block ${message.contextCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
            className="context-debug-header"
            onClick={() => onToggleContext(index)}
            aria-expanded={!message.contextCollapsed}
          >
            <FiActivity className="context-debug-icon" aria-hidden="true" />
            <span>Kontext {Math.round(message.tokenBreakdown.utilization * 100)}%</span>
            <span className="context-debug-summary">
              {message.tokenBreakdown.total.toLocaleString('de-DE')}/
              {message.tokenBreakdown.budget.toLocaleString('de-DE')} Tokens
            </span>
            {message.contextCollapsed ? (
              <FiChevronDown aria-hidden="true" />
            ) : (
              <FiChevronUp aria-hidden="true" />
            )}
          </button>
          {!message.contextCollapsed && (
            <div className="context-debug-content">
              <div className="context-util-bar">
                <div
                  className="context-util-fill"
                  style={{
                    width: `${Math.min(100, Math.round(message.tokenBreakdown.utilization * 100))}%`,
                    background:
                      message.tokenBreakdown.utilization > 0.9
                        ? 'var(--danger-color)'
                        : message.tokenBreakdown.utilization > 0.7
                          ? 'var(--warning-color)'
                          : 'var(--primary-color)',
                  }}
                />
              </div>
              <div className="context-debug-grid">
                <div className="context-debug-item">
                  <span className="context-debug-label">System</span>
                  <span className="context-debug-value">{message.tokenBreakdown.system}</span>
                </div>
                <div className="context-debug-item">
                  <span className="context-debug-label">Profil (T1)</span>
                  <span className="context-debug-value">{message.tokenBreakdown.tier1}</span>
                </div>
                <div className="context-debug-item">
                  <span className="context-debug-label">Memory (T2)</span>
                  <span className="context-debug-value">{message.tokenBreakdown.tier2}</span>
                </div>
                <div className="context-debug-item">
                  <span className="context-debug-label">Summary (T3)</span>
                  <span className="context-debug-value">{message.tokenBreakdown.tier3}</span>
                </div>
                {message.tokenBreakdown.rag > 0 && (
                  <div className="context-debug-item">
                    <span className="context-debug-label">RAG</span>
                    <span className="context-debug-value">{message.tokenBreakdown.rag}</span>
                  </div>
                )}
                <div className="context-debug-item">
                  <span className="context-debug-label">History</span>
                  <span className="context-debug-value">{message.tokenBreakdown.history}</span>
                </div>
                <div className="context-debug-item">
                  <span className="context-debug-label">Reserve</span>
                  <span className="context-debug-value">
                    {message.tokenBreakdown.responseReserve}
                  </span>
                </div>
                <div className="context-debug-item">
                  <span className="context-debug-label">Nachrichten</span>
                  <span className="context-debug-value">
                    {message.tokenBreakdown.messagesIncluded}
                    {message.tokenBreakdown.messagesDropped > 0 && (
                      <span className="context-debug-dropped">
                        {' '}
                        (-{message.tokenBreakdown.messagesDropped})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {message.tokenBreakdown.compacted && (
                <div className="context-debug-compacted">Kompaktierung durchgeführt</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sources Block */}
      {message.sources && message.sources.length > 0 && (
        <div className={`sources-block ${message.sourcesCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
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
                  <div className="source-name">
                    <span className="source-index">[{sourceIndex + 1}]</span>
                    {source.document_name}
                    {source.space_name && (
                      <span className="source-space-badge">{source.space_name}</span>
                    )}
                  </div>
                  <div className="source-preview">{source.text_preview}</div>
                  <div className="source-scores">
                    {source.rerank_score != null ? (
                      <>
                        <span className="source-score-main">
                          Rerank: {(source.rerank_score * 100).toFixed(0)}%
                        </span>
                        <span className="source-score-secondary">
                          Vektor: {(source.score * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span className="source-score-main">
                        Relevanz: {(source.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
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
