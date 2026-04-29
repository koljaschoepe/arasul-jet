/**
 * Phase 4.9 — heads-up banner: documents indexed with a different embedding
 * model than the currently configured one will return unreliable RAG results
 * until they're re-indexed. Shown only when there's an actual mismatch.
 */

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import useConfirm from '../../../hooks/useConfirm';
import { Button } from '@/components/ui/shadcn/button';

interface PerModelStat {
  model: string;
  count: number;
}

interface EmbeddingStatus {
  current_model: string;
  per_model: PerModelStat[];
  mismatched_count: number;
  total_indexed: number;
  has_mismatch: boolean;
}

export default function EmbeddingMismatchBanner() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<EmbeddingStatus>('/rag/embedding-status', { showError: false });
      setStatus(data);
    } catch {
      // Indexer down or no docs yet — silently hide the banner.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading || !status || !status.has_mismatch) {
    return null;
  }

  // The "old" model = whichever is most prevalent and not the current one.
  const oldStat = status.per_model.find(s => s.model !== status.current_model);
  const fromModel = oldStat?.model;

  const handleReindex = async () => {
    if (!fromModel) return;
    const ok = await confirm({
      title: 'Dokumente neu indizieren?',
      message: `${status.mismatched_count} Dokument(e) wurden mit ${fromModel} indiziert. Sie werden nach und nach mit ${status.current_model} neu indiziert. Das kann je nach Größe dauern.`,
      confirmText: 'Neu indizieren',
      confirmVariant: 'warning',
    });
    if (!ok) return;

    setReindexing(true);
    try {
      const result = await api.post<{ count: number }>('/rag/reindex-all', {
        from_model: fromModel,
      });
      toast.success(`${result.count} Dokument(e) zur Neu-Indexierung eingereiht`);
      await fetchStatus();
    } catch {
      // useApi already toasted via translateError(INDEXER_UNAVAILABLE)
    } finally {
      setReindexing(false);
    }
  };

  return (
    <>
      {ConfirmDialog}
      <div
        role="status"
        aria-live="polite"
        data-testid="embedding-mismatch-banner"
        className="mb-6 flex items-start gap-3 rounded-md border px-4 py-3"
        style={{
          borderColor: 'var(--color-warning, #b58900)',
          background: 'var(--bg-elevated)',
        }}
      >
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0"
          style={{ color: 'var(--color-warning, #b58900)' }}
          aria-hidden
        />
        <div className="flex-1">
          <strong>Embedding-Modell wurde geändert.</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.mismatched_count} Dokument(e) sind noch mit{' '}
            <code>{fromModel || '(älteres Modell)'}</code> indiziert. Aktuelles Modell:{' '}
            <code>{status.current_model}</code>. Suchergebnisse können bis zur Neu-Indexierung
            unzuverlässig sein.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={handleReindex}
          disabled={reindexing || !fromModel}
          className="shrink-0"
        >
          <RotateCcw className={`size-4 ${reindexing ? 'animate-spin' : ''}`} />
          {reindexing ? 'Wird eingereiht…' : 'Neu indizieren'}
        </Button>
      </div>
    </>
  );
}
