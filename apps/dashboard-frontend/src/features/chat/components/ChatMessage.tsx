import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Cpu, BookOpen, Folder } from 'lucide-react';
import MermaidDiagram from '../../../components/editor/MermaidDiagram';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '../../../contexts/ChatContext';
import type { MatchedSpace, DocumentSource } from '../../../types';
import '../chat.css';

// PERF: Stable reference - avoid recreating on every render
const remarkPlugins = [remarkGfm];

/**
 * Map server stream-status codes to user-facing labels. Centralised here so
 * adding a new status (e.g. `rag_search`) only touches one place.
 */
function getStreamStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'In Warteschlange...';
    case 'model_loading':
      return 'Lade Modell...';
    case 'model_loaded':
      return 'Modell bereit';
    case 'thinking':
      return 'Denke nach...';
    case 'rag_search':
      return 'Durchsuche Dokumente...';
    case 'generating':
      return 'Generiere Antwort...';
    case 'compacting':
      return 'Komprimiere Verlauf...';
    default:
      return 'Verarbeite...';
  }
}

interface CodeProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

// ReactMarkdown component overrides - typed as Record to satisfy the `components` prop
const markdownComponents: Record<string, React.ComponentType<CodeProps>> = {
  code({ node, inline, className, children, ...props }: CodeProps) {
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
};

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
  chatId: number | string;
  isLoading: boolean;
  onToggleThinking: (index: number) => void;
  onToggleSources: (index: number) => void;
}

// PERF: Custom comparison - only re-render when message content actually changes
function arePropsEqual(prev: ChatMessageProps, next: ChatMessageProps) {
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.index !== next.index) return false;
  const pm = prev.message;
  const nm = next.message;
  return (
    pm.content === nm.content &&
    pm.thinking === nm.thinking &&
    pm.hasThinking === nm.hasThinking &&
    pm.thinkingCollapsed === nm.thinkingCollapsed &&
    pm.sourcesCollapsed === nm.sourcesCollapsed &&
    pm.role === nm.role &&
    pm.sources === nm.sources &&
    pm.matchedSpaces === nm.matchedSpaces &&
    pm.streamStatus === nm.streamStatus &&
    pm.statusMessage === nm.statusMessage &&
    pm.images === nm.images &&
    pm.tokensPerSecond === nm.tokensPerSecond &&
    pm.tokenCount === nm.tokenCount &&
    pm.streamDurationMs === nm.streamDurationMs
  );
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
        className="compaction-banner flex items-center justify-center gap-2 py-2 px-4 my-2 rounded-lg bg-primary/10 border border-primary/30 text-xs text-muted-foreground"
        role="status"
        aria-label="Kontext zusammengefasst"
      >
        <span className="text-base text-primary" aria-hidden="true">
          &#x2702;
        </span>
        <span>
          Kontext zusammengefasst
          {(message.tokensBefore ?? 0) > 0 && (
            <>
              {' '}
              &mdash; {message.tokensBefore!.toLocaleString('de-DE')} &rarr;{' '}
              {message.tokensAfter!.toLocaleString('de-DE')} Tokens ({saved}% Einsparung)
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
        'message flex flex-col gap-1.5 py-4 border-b border-border last:border-b-0',
        message.role === 'user' ? 'user' : 'assistant'
      )}
      aria-label={message.role === 'user' ? 'Deine Nachricht' : 'AI Antwort'}
    >
      <div
        className={cn(
          'message-label text-xs font-semibold uppercase tracking-wide pl-0.5',
          message.role === 'user' ? 'text-primary' : 'text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {message.role === 'user' ? 'Du' : 'AI'}
      </div>

      {/* Thinking Block */}
      {message.hasThinking && message.thinking && (
        <div
          className={cn(
            'thinking-block rounded-lg overflow-hidden bg-card border border-border transition-all duration-300',
            message.thinkingCollapsed && 'collapsed',
            message.thinkingCollapsing && 'collapsing opacity-70'
          )}
        >
          <button
            type="button"
            className="thinking-header flex items-center gap-2 py-3 px-4 cursor-pointer select-none text-muted-foreground transition-colors duration-150 text-sm w-full border-none bg-transparent text-left font-[inherit] hover:bg-accent"
            onClick={() => onToggleThinking(index)}
            aria-expanded={!message.thinkingCollapsed}
          >
            <Cpu className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1">Gedankengang</span>
            {message.thinkingCollapsed ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </button>
          <div className="thinking-content py-4 px-[18px] text-sm leading-relaxed text-muted-foreground border-t border-border bg-background max-h-[350px] overflow-y-auto">
            <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
              {message.thinking}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Attached Images (Vision) */}
      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {message.images.map((img, i) => (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden border border-border max-w-[200px] max-h-[200px]"
            >
              <img
                src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`}
                alt={`Bild ${i + 1}`}
                className="max-w-[200px] max-h-[200px] object-contain"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* Message Content */}
      {message.content && (
        <div
          className={cn(
            'message-body text-foreground text-base leading-[1.7] py-4 px-5 bg-card rounded-xl',
            message.role === 'user' && 'bg-primary/[0.08] border-l-[3px] border-l-primary'
          )}
        >
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Status indicator for model loading / queue / processing */}
      {message.role === 'assistant' &&
        !message.content &&
        !message.thinking &&
        message.streamStatus && (
          <div
            className="flex items-center gap-2 py-3 px-5 text-sm"
            style={{ color: 'var(--text-secondary)' }}
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block size-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--primary-color)' }}
              aria-hidden="true"
            />
            <span>{message.statusMessage || getStreamStatusLabel(message.streamStatus)}</span>
          </div>
        )}

      {/* Loading indicator */}
      {message.role === 'assistant' &&
        !message.content &&
        !message.thinking &&
        isLoading &&
        !message.streamStatus && (
          <div
            className="message-loading flex gap-1.5 py-4 px-5"
            role="status"
            aria-label="AI antwortet..."
          >
            <span
              className="size-2 bg-primary rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both]"
              aria-hidden="true"
            />
            <span
              className="size-2 bg-primary rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both] [animation-delay:150ms]"
              aria-hidden="true"
            />
            <span
              className="size-2 bg-primary rounded-full animate-[loading-dot_1.2s_ease-in-out_infinite_both] [animation-delay:300ms]"
              aria-hidden="true"
            />
          </div>
        )}

      {/* Token-speed badge — small inline metric for completed assistant
          responses. Helps user calibrate model performance expectations. */}
      {message.role === 'assistant' &&
        message.status === 'completed' &&
        message.tokensPerSecond != null &&
        message.tokenCount != null &&
        message.tokenCount > 0 && (
          <div
            className="flex items-center gap-2 px-5 pb-2 text-[11px] text-muted-foreground/70"
            title={`${message.tokenCount} Tokens in ${((message.streamDurationMs ?? 0) / 1000).toFixed(1)}s`}
          >
            <Cpu className="size-3" aria-hidden="true" />
            <span>{message.tokensPerSecond} tokens/sec</span>
          </div>
        )}

      {/* Matched Spaces Display */}
      {message.matchedSpaces && message.matchedSpaces.length > 0 && (
        <div className="matched-spaces-block flex flex-wrap items-center gap-2 py-2.5 px-3.5 bg-primary/5 border border-primary/15 rounded-lg mt-3 text-sm">
          <span className="matched-spaces-label flex items-center text-muted-foreground text-xs whitespace-nowrap">
            <Folder className="mr-1.5 size-4" />
            Durchsuchte Bereiche:
          </span>
          <div className="matched-spaces-chips flex flex-wrap gap-1.5">
            {message.matchedSpaces.map((space: MatchedSpace, i: number) => (
              <span
                key={space.id || i}
                className="matched-space-chip inline-flex items-center py-1 px-2.5 bg-card border border-border border-l-[3px] rounded-md text-xs text-muted-foreground transition-all duration-200 hover:bg-[var(--bg-hover)] hover:border-primary"
                style={{ borderLeftColor: space.color || 'var(--primary)' }}
                title={`Relevanz: ${((space.score || 0) * 100).toFixed(0)}%`}
              >
                <Folder
                  className="size-3.5 mr-1"
                  style={{ color: space.color || 'var(--primary)' }}
                />
                {space.name}
                <span className="space-score ml-1.5 py-px px-1.5 bg-primary/15 rounded text-[0.7rem] text-primary">
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
            'sources-block rounded-lg overflow-hidden bg-card border border-border mt-3',
            message.sourcesCollapsed && 'collapsed'
          )}
        >
          <button
            type="button"
            className="sources-header flex items-center gap-2 py-3 px-4 cursor-pointer select-none text-muted-foreground transition-colors duration-150 text-sm w-full border-none bg-transparent text-left font-[inherit] hover:bg-accent"
            onClick={() => onToggleSources(index)}
            aria-expanded={!message.sourcesCollapsed}
          >
            <BookOpen className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1">Quellen ({message.sources.length})</span>
            {message.sourcesCollapsed ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </button>
          {!message.sourcesCollapsed && (
            <div className="sources-content py-4 px-[18px] text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap border-t border-border bg-background max-h-[350px] overflow-y-auto">
              {message.sources.map((source: DocumentSource, sourceIndex: number) => (
                <div
                  key={sourceIndex}
                  className={cn(
                    'source-item py-3.5 px-4 bg-card rounded-lg mb-2.5 border-l-[3px] last:mb-0',
                    source.rerank_score != null
                      ? source.rerank_score >= 0.1
                        ? 'border-l-primary'
                        : 'border-l-yellow-500'
                      : (source.score ?? 0) >= 0.01
                        ? 'border-l-primary'
                        : 'border-l-yellow-500'
                  )}
                >
                  <div className="source-name text-sm font-semibold text-foreground mb-2">
                    <span className="source-index font-semibold text-primary mr-1.5">
                      [{sourceIndex + 1}]
                    </span>
                    {source.document_name}
                    {source.space_name && (
                      <span className="source-space-badge text-xs bg-primary/15 text-primary py-px px-2 rounded-lg ml-2">
                        {source.space_name}
                      </span>
                    )}
                  </div>
                  <div className="source-preview text-sm text-muted-foreground leading-relaxed mb-2">
                    {source.text_preview}
                  </div>
                  <div className="source-scores flex gap-3 items-center">
                    {source.rerank_score != null ? (
                      <>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            source.rerank_score >= 0.15
                              ? 'text-success'
                              : source.rerank_score >= 0.05
                                ? 'text-warning'
                                : 'text-destructive'
                          )}
                        >
                          Rerank: {(source.rerank_score * 100).toFixed(0)}%
                          {source.rerank_score < 0.1 && (
                            <span
                              className="ml-1"
                              title="Geringe Uebereinstimmung — Angaben pruefen"
                            >
                              &#9888;
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Vektor: {((source.score ?? 0) * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span
                        className={cn(
                          'text-xs font-medium',
                          (source.score ?? 0) >= 0.02
                            ? 'text-success'
                            : (source.score ?? 0) >= 0.005
                              ? 'text-warning'
                              : 'text-destructive'
                        )}
                      >
                        Relevanz: {((source.score ?? 0) * 100).toFixed(0)}%
                        {(source.score ?? 0) < 0.01 && (
                          <span className="ml-1" title="Geringe Uebereinstimmung — Angaben pruefen">
                            &#9888;
                          </span>
                        )}
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
}, arePropsEqual);

export default ChatMessage;
