import { memo } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import type { TableData } from '../types';
import Breadcrumb from './Breadcrumb';

interface EditorHeaderProps {
  table: TableData | null;
  tableName?: string;
  saving: boolean;
  saveStatus: 'success' | 'error' | null;
  rows: number;
  fields: number;
  onClose?: () => void;
}

const EditorHeader = memo(function EditorHeader({
  table,
  tableName,
  saving,
  saveStatus,
  rows,
  fields,
  onClose,
}: EditorHeaderProps) {
  return (
    <header className="flex items-center justify-between py-2 px-6 max-md:px-4 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <Breadcrumb tableName={tableName || table?.name || ''} />
        {/* Save status dot */}
        <div
          className={cn(
            'size-2 rounded-full transition-colors duration-300',
            saving && 'bg-primary animate-pulse',
            !saving && saveStatus === 'success' && 'bg-primary',
            !saving && saveStatus === 'error' && 'bg-destructive',
            !saving && !saveStatus && 'bg-transparent'
          )}
          title={
            saving
              ? 'Speichere...'
              : saveStatus === 'success'
                ? 'Gespeichert'
                : saveStatus === 'error'
                  ? 'Fehler beim Speichern'
                  : ''
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {rows} Zeilen, {fields} Spalten
        </span>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="size-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            title="Schließen"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </header>
  );
});

export default EditorHeader;
