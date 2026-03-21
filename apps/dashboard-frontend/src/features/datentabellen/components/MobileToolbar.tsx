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

interface MobileToolbarProps {
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

const MobileToolbar = memo(function MobileToolbar({
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
  fileInputRef,
  onImportCSV,
}: MobileToolbarProps) {
  return (
    <div className="flex items-center gap-2 py-2 px-4 bg-card border-b border-border shrink-0">
      <Button size="sm" onClick={onAddRow}>
        <Plus className="size-4" />
      </Button>

      {selectedCount > 0 && (
        <Button variant="destructive" size="icon-sm" onClick={onDeleteSelected}>
          <Trash2 className="size-4" />
        </Button>
      )}

      <div className="flex-1" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        style={{ display: 'none' }}
        onChange={onImportCSV}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onUndo} disabled={undoCount === 0}>
            <Undo2 className="size-4" /> Rückgängig
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRedo} disabled={redoCount === 0}>
            <Redo2 className="size-4" /> Wiederholen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onImportClick} disabled={saving || fieldsCount === 0}>
            <Upload className="size-4" /> CSV importieren
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportCSV} disabled={saving || rowsCount === 0}>
            <Download className="size-4" /> CSV exportieren
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRefresh} disabled={loading}>
            <RefreshCw className="size-4" /> Aktualisieren
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export default MobileToolbar;
