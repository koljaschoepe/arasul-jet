import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Cpu, BookOpen, Folder } from 'lucide-react';
import MermaidDiagram from '../../components/editor/MermaidDiagram';
import { cn } from '@/lib/utils';
import './chat.css';

interface ChatMessageProps {
  message: any;
  index: number;
  chatId: number | string;
  isLoading: boolean;
  onToggleThinking: (index: number) => void;
  onToggleSources: (index: number) => void;
}

const ChatMessage = memo(function ChatMessage({
  message,
  index,
  chatId,
  isLoading,
  onToggleThinking,
  onToggleSources,
}: ChatMessageProps) {
  // Compaction banner (system message)
  if (message.role === 'system' && message.type === 'compaction') {
    const saved =
      message.tokensBefore && message.tokensAfter
        ? Math.round((1 - message.tokensAfter / message.tokensBefore) * 100)
        : 0;
    return (
      <div
        className="compaction-banner flex items-center justify-center gap-2 py-2 px-4 my-2 rounded-lg bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)] border border-[color-mix(in_srgb,var(--primary-color)_30%,transparent)] text-xs text-[var(--text-muted)]"
        role="status"
        aria-label="Kontext zusammengefasst"
      >
        <span className="text-base text-[var(--primary-color)]" aria-hidden="true">
          &#x2702;
        </span>
        <span>
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
      className={cn(
        'message flex flex-col gap-2 py-5 border-b border-[var(--border-color)] last:border-b-0',
        message.role === 'user' ? 'user' : 'assistant'
      )}
      aria-label={message.role === 'user' ? 'Deine Nachricht' : 'AI Antwort'}
    >
      <div
        className={cn(
          'message-label text-xs font-semibold uppercase tracking-wide pl-0.5',
          message.role === 'user' ? 'text-[var(--primary-color)]' : 'text-[var(--text-muted)]'
        )}
        aria-hidden="true"
      >
        {message.role === 'user' ? 'Du' : 'AI'}
      </div>

      {/* Thinking Block */}
      {message.hasThinking && message.thinking && (
        <div
          className={cn(
            'thinking-block rounded-lg overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)] transition-all duration-300',
            message.thinkingCollapsed && 'collapsed',
            message.thinkingCollapsing && 'collapsing opacity-70'
          )}
        >
          <button
            type="button"
            className="thinking-header flex items-center gap-2 py-3 px-4 cursor-pointer select-none text-[var(--text-muted)] transition-colors duration-150 text-sm w-full border-none bg-transparent text-left font-[inherit] hover:bg-[var(--bg-card-hover)]"
            onClick={() => onToggleThinking(index)}
            aria-expanded={!message.thinkingCollapsed}
          >
            <Cpu className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1">Gedankengang</span>
            {message.thinkingCollapsed ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </button>
          <div className="thinking-content py-4 px-[18px] text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap border-t border-[var(--border-color)] bg-[var(--bg-dark)] max-h-[350px] overflow-y-auto">
            {message.thinking}
          </div>
        </div>
      )}

      {/* Message Content */}
      {message.content && (
        <div
          className={cn(
            'message-body text-[var(--text-secondary)] text-[1.05rem] leading-[1.8] py-5 px-6 bg-[var(--bg-card)] rounded-xl',
            message.role === 'user' &&
              'bg-[var(--primary-alpha-8)] border-l-[3px] border-l-[var(--primary-color)]'
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
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
        <div
          className="message-loading flex gap-1.5 py-5 px-6"
          role="status"
          aria-label="AI antwortet..."
        >
          <span
            className="w-2 h-2 bg-[var(--primary-color)] rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both]"
            aria-hidden="true"
          />
          <span
            className="w-2 h-2 bg-[var(--primary-color)] rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both] [animation-delay:150ms]"
            aria-hidden="true"
          />
          <span
            className="w-2 h-2 bg-[var(--primary-color)] rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both] [animation-delay:300ms]"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Matched Spaces Display */}
      {message.matchedSpaces && message.matchedSpaces.length > 0 && (
        <div className="matched-spaces-block flex flex-wrap items-center gap-2 py-2.5 px-3.5 bg-[var(--primary-alpha-5)] border border-[var(--primary-alpha-15)] rounded-lg mt-3 text-sm">
          <span className="matched-spaces-label flex items-center text-[var(--text-muted)] text-xs whitespace-nowrap">
            <Folder className="mr-1.5 w-4 h-4" />
            Durchsuchte Bereiche:
          </span>
          <div className="matched-spaces-chips flex flex-wrap gap-1.5">
            {message.matchedSpaces.map((space: any, i: number) => (
              <span
                key={space.id || i}
                className="matched-space-chip inline-flex items-center py-1 px-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] border-l-[3px] rounded-md text-xs text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--bg-hover)] hover:border-[var(--primary-color)]"
                style={{ borderLeftColor: space.color || 'var(--primary-color)' }}
                title={`Relevanz: ${((space.score || 0) * 100).toFixed(0)}%`}
              >
                <Folder
                  className="w-3.5 h-3.5 mr-1"
                  style={{ color: space.color || 'var(--primary-color)' }}
                />
                {space.name}
                <span className="space-score ml-1.5 py-px px-1.5 bg-[var(--primary-alpha-15)] rounded text-[0.7rem] text-[var(--primary-color)]">
                  {((space.score || 0) * 100).toFixed(0)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sources Block */}
      {message.sources && message.sources.length > 0 && (
        <div
          className={cn(
            'sources-block rounded-lg overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)] mt-3',
            message.sourcesCollapsed && 'collapsed'
          )}
        >
          <button
            type="button"
            className="sources-header flex items-center gap-2 py-3 px-4 cursor-pointer select-none text-[var(--text-muted)] transition-colors duration-150 text-sm w-full border-none bg-transparent text-left font-[inherit] hover:bg-[var(--bg-card-hover)]"
            onClick={() => onToggleSources(index)}
            aria-expanded={!message.sourcesCollapsed}
          >
            <BookOpen className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1">Quellen ({message.sources.length})</span>
            {message.sourcesCollapsed ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </button>
          {!message.sourcesCollapsed && (
            <div className="sources-content py-4 px-[18px] text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap border-t border-[var(--border-color)] bg-[var(--bg-dark)] max-h-[350px] overflow-y-auto">
              {message.sources.map((source: any, sourceIndex: number) => (
                <div
                  key={sourceIndex}
                  className="source-item py-3.5 px-4 bg-[var(--bg-card)] rounded-lg mb-2.5 border-l-[3px] border-l-[var(--primary-color)] last:mb-0"
                >
                  <div className="source-name text-sm font-semibold text-[var(--text-primary)] mb-2">
                    <span className="source-index font-semibold text-[var(--primary-color)] mr-1.5">
                      [{sourceIndex + 1}]
                    </span>
                    {source.document_name}
                    {source.space_name && (
                      <span className="source-space-badge text-xs bg-[color-mix(in_srgb,var(--primary-color)_15%,transparent)] text-[var(--primary-color)] py-px px-2 rounded-lg ml-2">
                        {source.space_name}
                      </span>
                    )}
                  </div>
                  <div className="source-preview text-sm text-[var(--text-muted)] leading-relaxed mb-2">
                    {source.text_preview}
                  </div>
                  <div className="source-scores flex gap-3 items-center">
                    {source.rerank_score != null ? (
                      <>
                        <span className="text-xs text-[var(--primary-color)] font-medium">
                          Rerank: {(source.rerank_score * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          Vektor: {(source.score * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--primary-color)] font-medium">
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
