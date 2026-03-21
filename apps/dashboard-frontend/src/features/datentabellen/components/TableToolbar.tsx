import { memo, type RefObject } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  Undo2,
  Redo2,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { cn } from '@/lib/utils';
import SearchBar from './SearchBar';

interface TableToolbarProps {
  onAddRow: () => void;
  onDeleteSelected: () => void;
  selectedCount: number;
  onUndo: () => void;
  onRedo: () => void;
  undoCount: number;
  redoCount: number;
  onImportClick: () => void;
  onExportCSV: (exportAll?: boolean) => void;
  onRefresh: () => void;
  saving: boolean;
  loading: boolean;
  fieldsCount: number;
  rowsCount: number;
  totalRows?: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch?: (query: string) => void;
}

const TableToolbar = memo(function TableToolbar({
  onAddRow,
  onDeleteSelected,
  selectedCount,
  onUndo,
  onRedo,
  undoCount,
  redoCount,
  onImportClick,
  onExportCSV,
  onRefresh,
  saving,
  loading,
  fieldsCount,
  rowsCount,
  totalRows,
  fileInputRef,
  onImportCSV,
  onSearch,
}: TableToolbarProps) {
  const hasMoreRows = totalRows != null && totalRows > rowsCount;

  return (
    <div className="flex items-center gap-2 py-2 px-6 bg-card border-b border-border shrink-0">
      <Button size="sm" onClick={onAddRow}>
        <Plus className="size-4" /> Zeile
      </Button>

      {selectedCount > 0 && (
        <Button variant="destructive" size="sm" onClick={onDeleteSelected}>
          <Trash2 className="size-4" /> {selectedCount}
        </Button>
      )}

      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onUndo}
          disabled={undoCount === 0}
          title="Rückgängig (Strg+Z)"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRedo}
          disabled={redoCount === 0}
          title="Wiederholen (Strg+Y)"
        >
          <Redo2 className="size-4" />
        </Button>
      </div>

      <div className="flex-1" />

      {onSearch && <SearchBar onSearch={onSearch} />}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        style={{ display: 'none' }}
        onChange={onImportCSV}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" title="Weitere Aktionen">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onImportClick} disabled={saving || fieldsCount === 0}>
            <Upload className="size-4" /> CSV importieren
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExportCSV(false)} disabled={saving || rowsCount === 0}>
            <Download className="size-4" /> Aktuelle Seite exportieren
          </DropdownMenuItem>
          {hasMoreRows && (
            <DropdownMenuItem
              onClick={() => onExportCSV(true)}
              disabled={saving || rowsCount === 0}
            >
              <Download className="size-4" /> Alle exportieren
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Aktualisieren
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export default TableToolbar;
