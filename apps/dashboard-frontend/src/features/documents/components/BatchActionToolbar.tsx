import { Trash2, RefreshCw, FolderInput, X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import type { DocumentSpace } from '../../../types';

interface BatchActionToolbarProps {
  selectionCount: number;
  spaces: DocumentSpace[];
  onDelete: () => void;
  onReindex: () => void;
  onMove: (spaceId: string | null, spaceName: string) => void;
  onClear: () => void;
}

/**
 * BatchActionToolbar — appears when ≥1 documents are selected. Provides
 * delete, reindex, and move-to-space actions.
 */
export default function BatchActionToolbar({
  selectionCount,
  spaces,
  onDelete,
  onReindex,
  onMove,
  onClear,
}: BatchActionToolbarProps) {
  if (selectionCount === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg py-2.5 px-4 mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <span className="text-sm font-medium text-primary">{selectionCount} ausgewählt</span>
      <div className="h-4 w-px bg-primary/30" />
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7"
        onClick={onDelete}
      >
        <Trash2 size={14} className="mr-1" /> Löschen
      </Button>
      <Button variant="ghost" size="sm" className="h-7" onClick={onReindex}>
        <RefreshCw size={14} className="mr-1" /> Neu indexieren
      </Button>
      <div className="relative group">
        <Button variant="ghost" size="sm" className="h-7">
          <FolderInput size={14} className="mr-1" /> Verschieben
        </Button>
        <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] hidden group-hover:block z-50">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-foreground"
            onClick={() => onMove(null, 'Kein Bereich')}
          >
            Kein Bereich
          </button>
          {spaces.map(s => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-foreground"
              onClick={() => onMove(s.id, s.name)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 text-muted-foreground"
        onClick={onClear}
      >
        <X size={14} className="mr-1" /> Auswahl aufheben
      </Button>
    </div>
  );
}
