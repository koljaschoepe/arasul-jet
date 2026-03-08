/**
 * DataStateRenderer Component
 * Reusable wrapper that handles loading / error / empty states
 * so each feature doesn't duplicate the same conditional rendering.
 */

import React, { type ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { SkeletonCard } from './Skeleton';
import EmptyState from './EmptyState';

interface DataStateRendererProps {
  /** Whether data is currently loading */
  loading: boolean;
  /** Error message, or null when there is no error */
  error: string | null;
  /** Whether the loaded data set is empty */
  empty: boolean;
  /** Callback for the "retry" button in the error state */
  onRetry?: () => void;

  // --- Customisation slots ---

  /** Custom skeleton to show while loading (default: 4 SkeletonCards in a grid) */
  loadingSkeleton?: ReactNode;
  /** Custom empty-state to show when data is empty */
  emptyState?: ReactNode;
  /** Extra content rendered below the loading skeleton (e.g. a timeout hint) */
  loadingFooter?: ReactNode;

  /** The actual content to render when data is available */
  children: ReactNode;
}

/**
 * Default loading skeleton: a responsive grid of 4 SkeletonCards.
 */
function DefaultLoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5"
      role="status"
      aria-label="Lade Inhalte..."
    >
      {Array(4)
        .fill(0)
        .map((_, i) => (
          <SkeletonCard key={i} hasAvatar={false} lines={3} />
        ))}
    </div>
  );
}

function DataStateRenderer({
  loading,
  error,
  empty,
  onRetry,
  loadingSkeleton,
  emptyState,
  loadingFooter,
  children,
}: DataStateRendererProps) {
  if (loading) {
    return (
      <div className="animate-in fade-in">
        {loadingSkeleton ?? <DefaultLoadingSkeleton />}
        {loadingFooter}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <AlertCircle className="size-12 text-destructive" />
        <h3 className="text-lg font-semibold text-foreground">Fehler beim Laden</h3>
        <p className="text-muted-foreground max-w-md">{error}</p>
        {onRetry && <Button onClick={onRetry}>Erneut versuchen</Button>}
      </div>
    );
  }

  if (empty) {
    return <>{emptyState ?? <EmptyState icon={<Inbox />} title="Keine Daten gefunden" />}</>;
  }

  return <>{children}</>;
}

export default DataStateRenderer;
