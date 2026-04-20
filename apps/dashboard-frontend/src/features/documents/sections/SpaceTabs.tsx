import { AlertCircle, Folder, Plus, RefreshCw, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import type { DocumentSpace, DocumentStatistics } from '../../../types';

interface SpaceTabsProps {
  spaces: DocumentSpace[];
  activeSpaceId: string | null;
  statistics: DocumentStatistics | null;
  spacesError: boolean;
  onSpaceChange: (spaceId: string | null) => void;
  onEditSpace: (space: DocumentSpace, e: React.MouseEvent) => void;
  onCreateSpace: () => void;
  onReloadSpaces: () => void;
}

export default function SpaceTabs({
  spaces,
  activeSpaceId,
  statistics,
  spacesError,
  onSpaceChange,
  onEditSpace,
  onCreateSpace,
  onReloadSpaces,
}: SpaceTabsProps) {
  const activeSpace = activeSpaceId ? spaces.find(s => s.id === activeSpaceId) : null;

  return (
    <>
      <nav className="mb-4 overflow-hidden" aria-label="Wissensbereiche">
        {spacesError && (
          <div
            className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md py-2 px-3 mb-2 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>Wissensbereiche nicht verfügbar</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive h-7 px-2"
              onClick={onReloadSpaces}
            >
              <RefreshCw size={12} className="mr-1" /> Laden
            </Button>
          </div>
        )}
        <div
          className="flex gap-2 overflow-x-auto py-1"
          role="tablist"
          aria-label="Dokumenten-Bereiche"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSpaceId === null}
            className={cn(
              'flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-border rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-accent hover:text-foreground',
              activeSpaceId === null && 'border-primary bg-primary/10 text-foreground shadow-sm'
            )}
            onClick={() => onSpaceChange(null)}
          >
            <Folder aria-hidden="true" size={16} />
            <span>Alle</span>
            <span
              className="bg-primary/10 text-primary py-0.5 px-1.5 rounded-xs text-xs font-semibold"
              aria-label={`${statistics?.total_documents || 0} Dokumente`}
            >
              {statistics?.total_documents || 0}
            </span>
          </button>
          {spaces.map(space => (
            <button
              type="button"
              key={space.id}
              role="tab"
              aria-selected={activeSpaceId === space.id}
              className={cn(
                'group/tab flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-border rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-[var(--border-hover)] hover:bg-accent hover:text-foreground',
                activeSpaceId === space.id &&
                  'border-[var(--space-color,var(--primary-color))] bg-primary/10 text-foreground shadow-sm'
              )}
              onClick={() => onSpaceChange(space.id)}
              style={{ '--space-color': space.color } as React.CSSProperties}
            >
              <Folder style={{ color: space.color }} aria-hidden="true" size={16} />
              <span>{space.name}</span>
              <span
                className="bg-primary/10 text-primary py-0.5 px-1.5 rounded-xs text-xs font-semibold"
                aria-label={`${space.document_count || 0} Dokumente`}
              >
                {space.document_count || 0}
              </span>
              {!space.is_default && !space.is_system && (
                <button
                  type="button"
                  className="hidden group-hover/tab:flex bg-transparent border-none text-muted-foreground cursor-pointer p-0.5 ml-1 rounded-xs transition-colors hover:text-primary hover:bg-primary/10"
                  onClick={e => onEditSpace(space, e)}
                  aria-label={`${space.name} bearbeiten`}
                >
                  <Settings aria-hidden="true" size={14} />
                </button>
              )}
            </button>
          ))}
          <button
            type="button"
            className="flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-card)] border border-dashed border-border rounded-md text-primary text-sm font-medium cursor-pointer transition-all whitespace-nowrap shrink-0 relative hover:border-primary hover:bg-primary/10"
            onClick={onCreateSpace}
            aria-label="Neuen Bereich erstellen"
          >
            <Plus aria-hidden="true" size={16} />
            <span>Neu</span>
          </button>
        </div>
      </nav>

      {activeSpace && (
        <div className="bg-muted border border-border rounded-md py-4 px-5 mb-4">
          <div>
            <h4>{activeSpace.name}</h4>
            <p>{activeSpace.description?.substring(0, 200)}...</p>
          </div>
        </div>
      )}
    </>
  );
}
