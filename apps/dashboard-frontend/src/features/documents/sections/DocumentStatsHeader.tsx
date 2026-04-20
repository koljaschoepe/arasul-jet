import { AlertCircle, Check, Clock, Database, RefreshCw, Table } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import type { DocumentStatistics } from '../../../types';

interface DocumentStatsHeaderProps {
  statistics: DocumentStatistics | null;
  statsError: boolean;
  activeSpaceId: string | null;
  statusFilter: string;
  categoryFilter: string;
  onReload: () => void;
}

export default function DocumentStatsHeader({
  statistics,
  statsError,
  activeSpaceId,
  statusFilter,
  categoryFilter,
  onReload,
}: DocumentStatsHeaderProps) {
  return (
    <header className="mb-6" aria-label="Dokumenten-Statistiken">
      {statsError && (
        <div
          className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md py-2 px-3 mb-3 text-destructive text-sm"
          role="alert"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>Statistiken konnten nicht geladen werden</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive h-7 px-2"
            onClick={onReload}
          >
            <RefreshCw size={12} className="mr-1" /> Erneut versuchen
          </Button>
        </div>
      )}
      <div
        className={cn(
          'dm-stats-row grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4',
          statsError && 'opacity-50'
        )}
        role="group"
        aria-label="Übersicht"
      >
        <div
          className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
          aria-label={`${statistics?.total_documents || 0} Dokumente`}
        >
          <Database className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
          <div>
            <span className="dm-stat-value text-2xl font-bold text-foreground block">
              {statistics?.total_documents || 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Dokumente{activeSpaceId || statusFilter || categoryFilter ? ' (gefiltert)' : ''}
            </span>
          </div>
        </div>
        <div
          className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
          aria-label={`${statistics?.total_chunks || 0} indexierte Chunks`}
        >
          <Check className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
          <div>
            <span className="dm-stat-value text-2xl font-bold text-foreground block">
              {statistics?.total_chunks || 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Indexierte Chunks
            </span>
          </div>
        </div>
        <div
          className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
          aria-label={`${statistics?.pending_documents || 0} Dokumente wartend`}
        >
          <Clock
            className="text-3xl text-muted-foreground opacity-80 shrink-0"
            aria-hidden="true"
          />
          <div>
            <span className="dm-stat-value text-2xl font-bold text-foreground block">
              {statistics?.pending_documents || 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Wartend</span>
          </div>
        </div>
        <div
          className="dm-stat-card flex items-center gap-4 bg-[var(--gradient-card)] border border-border rounded-lg py-4 px-5"
          aria-label={`${statistics?.table_count || 0} Tabellen`}
        >
          <Table className="text-3xl text-primary opacity-80 shrink-0" aria-hidden="true" />
          <div>
            <span className="dm-stat-value text-2xl font-bold text-foreground block">
              {statistics?.table_count || 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Tabellen</span>
          </div>
        </div>
      </div>
    </header>
  );
}
