import { useCallback, useState } from 'react';
import { Activity, Gauge, FileSearch, Clock } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useFetchData } from '../../hooks/useFetchData';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

type Window = '24h' | '7d' | '30d';

interface RagMetrics {
  window: Window;
  total_queries: number;
  retrieval_rate: number;
  no_document_rate: number;
  no_relevant_rate: number;
  marginal_rate: number;
  error_rate: number;
  avg_retrieved: number | null;
  avg_top_rerank_score: number | null;
  avg_rerank_score: number | null;
  avg_response_length: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '–';
  return `${Math.round(v * 100)}%`;
}

function formatNum(v: number | null | undefined, suffix = ''): string {
  if (v == null) return '–';
  return `${v}${suffix}`;
}

function RagMetricsCard() {
  const api = useApi();
  const [window, setWindow] = useState<Window>('24h');

  const fetcher = useCallback(
    (signal: AbortSignal) =>
      api.get<RagMetrics>(`/rag/metrics?window=${window}`, { signal, showError: false }),
    [api, window]
  );

  const { data, loading, error } = useFetchData<RagMetrics | null>(fetcher, {
    initialData: null,
    errorMessage: 'Fehler beim Laden der RAG-Metriken',
  });

  if (error) {
    return (
      <div className="bg-[var(--gradient-card)] border border-border rounded-lg p-4 mb-6">
        <div className="text-sm text-muted-foreground">
          RAG-Metriken konnten nicht geladen werden.
        </div>
      </div>
    );
  }

  const windows: Window[] = ['24h', '7d', '30d'];

  return (
    <section
      className="bg-[var(--gradient-card)] border border-border rounded-lg p-4 mb-6"
      aria-label="RAG-Metriken"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">RAG-Metriken</h2>
          <span className="text-xs text-muted-foreground">
            {data ? `${data.total_queries} Queries` : loading ? '…' : '0 Queries'}
          </span>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Zeitfenster">
          {windows.map(w => (
            <Button
              key={w}
              variant={window === w ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setWindow(w)}
              role="tab"
              aria-selected={window === w}
            >
              {w}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3',
          loading && 'opacity-60'
        )}
      >
        <MetricTile
          icon={<FileSearch size={18} />}
          label="Retrieval-Quote"
          value={formatPct(data?.retrieval_rate)}
          hint={`ohne Dokumente: ${formatPct(data?.no_document_rate)}`}
        />
        <MetricTile
          icon={<Gauge size={18} />}
          label="Ø Top-Rerank-Score"
          value={data?.avg_top_rerank_score != null ? data.avg_top_rerank_score.toFixed(3) : '–'}
          hint={`Ø Chunks: ${formatNum(data?.avg_retrieved)}`}
        />
        <MetricTile
          icon={<Activity size={18} />}
          label="Ø Antwortlänge"
          value={formatNum(data?.avg_response_length, ' Z.')}
          hint={`marginal: ${formatPct(data?.marginal_rate)}`}
        />
        <MetricTile
          icon={<Clock size={18} />}
          label="Ø Latenz"
          value={formatNum(data?.avg_latency_ms, ' ms')}
          hint={`p95: ${formatNum(data?.p95_latency_ms, ' ms')}`}
        />
      </div>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 border border-border/60 rounded-md px-3 py-2 bg-background/40">
      <div className="text-primary shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
    </div>
  );
}

export default RagMetricsCard;
