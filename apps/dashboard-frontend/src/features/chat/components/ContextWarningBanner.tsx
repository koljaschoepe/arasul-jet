/**
 * Phase 4.4 — heads-up banner shown above the chat input when the
 * estimated conversation tokens approach the model's context window.
 *
 * The backend has full auto-compaction (services/context/contextBudgetManager.js),
 * so going past the limit is recoverable — the user just needs to know
 * it's happening so the resulting "older messages were summarized" feels
 * intentional rather than buggy.
 */

import { AlertTriangle } from 'lucide-react';

interface Props {
  estimatedTokens: number;
  contextWindow: number;
  utilization: number;
}

export default function ContextWarningBanner({
  estimatedTokens,
  contextWindow,
  utilization,
}: Props) {
  const percent = Math.min(100, Math.round(utilization * 100));
  const tone = utilization >= 1 ? 'critical' : 'warning';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="context-warning-banner"
      className="mx-auto mt-2 max-w-[960px] px-4"
    >
      <div
        className="flex items-start gap-2 rounded-md border px-3 py-2 text-[0.825rem]"
        style={{
          borderColor: tone === 'critical' ? 'var(--color-error)' : 'var(--color-warning, #b58900)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
        }}
      >
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0"
          style={{
            color: tone === 'critical' ? 'var(--color-error)' : 'var(--color-warning, #b58900)',
          }}
          aria-hidden
        />
        <div className="flex-1">
          <strong>Konversation wird lang ({percent}%)</strong> — ältere Nachrichten werden vom
          Backend automatisch zusammengefasst, wenn das Kontextfenster überschritten wird.
          <span className="ml-1 text-[var(--text-muted)]">
            ~{estimatedTokens.toLocaleString('de-DE')} / {contextWindow.toLocaleString('de-DE')}{' '}
            Tokens
          </span>
        </div>
      </div>
    </div>
  );
}
