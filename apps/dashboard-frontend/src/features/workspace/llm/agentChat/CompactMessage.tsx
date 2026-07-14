/**
 * Eine Nachricht im kompakten Agent-Chat.
 *
 * Muster (Cursor/Claude-Code-Konsens): keine Bubbles, keine Avatare —
 * die User-Nachricht ist die einzige dezent geboxte Fläche, die Antwort
 * fließt flach über die volle Breite. Denk- und Retrieval-Schritte sind
 * einklappbare Ein-Zeilen-Rows, Quellen ein klickbarer Chip-Footer.
 */
import { memo, useState } from 'react';
import { ChevronRight, FileText, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/contexts/ChatContext';
import type { DocumentSource } from '@/types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CompactMarkdown } from './markdown';

/** Einklappbare Ein-Zeilen-Row für Denk-/Tool-Schritte. */
function StepRow({
  icon,
  label,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => children && setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground',
          children && 'hover:bg-accent hover:text-foreground'
        )}
        aria-expanded={children ? open : undefined}
      >
        <span className="shrink-0 opacity-70">{icon}</span>
        <span className="truncate">{label}</span>
        {detail && <span className="truncate opacity-60">· {detail}</span>}
        {children && (
          <ChevronRight
            className={cn('ml-auto size-3 shrink-0 transition-transform', open && 'rotate-90')}
          />
        )}
      </button>
      {open && children && (
        <div className="ml-5 mt-0.5 rounded border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
          {children}
        </div>
      )}
    </div>
  );
}

/** Quellen-Footer: kollabierte Zeile → vertikale, klickbare Chip-Liste. */
function SourcesFooter({ sources }: { sources: DocumentSource[] }) {
  const [open, setOpen] = useState(false);
  const openTab = useWorkspaceStore(s => s.openTab);

  // Nach Dokument deduplizieren (mehrere Chunks derselben Datei = 1 Chip)
  const byDoc = new Map<string, DocumentSource>();
  for (const s of sources) {
    const key = s.document_id || s.document_name;
    if (!byDoc.has(key)) byDoc.set(key, s);
  }
  const docs = [...byDoc.values()];
  if (docs.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {docs.length} {docs.length === 1 ? 'Quelle' : 'Quellen'}
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-0.5 pl-1" data-testid="sources-list">
          {docs.map((s, i) => (
            <li key={s.document_id || `${s.document_name}-${i}`}>
              <button
                type="button"
                disabled={!s.document_id}
                onClick={() =>
                  s.document_id &&
                  openTab({ type: 'document', documentId: s.document_id, title: s.document_name })
                }
                className={cn(
                  'flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs',
                  s.document_id
                    ? 'text-foreground hover:bg-accent'
                    : 'cursor-default text-muted-foreground'
                )}
                title={s.space_name ? `${s.document_name} · ${s.space_name}` : s.document_name}
              >
                <FileText className="mt-0.5 size-3 shrink-0 opacity-60" />
                {/* Dateiname vollständig lesbar — umbrechen statt abschneiden
                    (Plan 005 · Schritt 4). */}
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {s.document_name}
                </span>
                {s.space_name && (
                  <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">
                    {s.space_name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CompactMessageProps {
  message: ChatMessage;
  isStreaming: boolean;
}

function CompactMessageInner({ message, isStreaming }: CompactMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="my-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
        {message.content}
      </div>
    );
  }

  const hasThinking = Boolean(message.thinking && message.thinking.trim());
  const matched = message.matchedSpaces || [];

  return (
    <div className="my-2" data-testid="assistant-message">
      {hasThinking && (
        <StepRow
          icon={<Sparkles className="size-3" />}
          label={isStreaming && !message.content ? 'Denkt nach …' : 'Gedankengang'}
        >
          {message.thinking}
        </StepRow>
      )}
      {matched.length > 0 && (
        <StepRow
          icon={<Search className="size-3" />}
          label="Dokumente durchsucht"
          detail={matched.map(m => m.name).join(', ')}
        />
      )}
      {message.streamStatus && !message.content && (
        <StepRow
          icon={<Search className="size-3" />}
          label={message.statusMessage || 'Arbeitet …'}
        />
      )}

      {message.content ? (
        <CompactMarkdown content={message.content} />
      ) : isStreaming && !hasThinking ? (
        <div className="my-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
          Antwortet …
        </div>
      ) : null}

      {isStreaming && message.content && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-text-bottom" />
      )}

      {message.sources && message.sources.length > 0 && <SourcesFooter sources={message.sources} />}
    </div>
  );
}

const CompactMessage = memo(CompactMessageInner);
export default CompactMessage;
