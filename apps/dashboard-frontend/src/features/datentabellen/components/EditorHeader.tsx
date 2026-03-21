import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TableData } from '../types';
import Breadcrumb from './Breadcrumb';

interface EditorHeaderProps {
  table: TableData | null;
  tableName?: string;
  saving: boolean;
  saveStatus: 'success' | 'error' | null;
  rows: number;
  fields: number;
}

const EditorHeader = memo(function EditorHeader({
  table,
  tableName,
  saving,
  saveStatus,
  rows,
  fields,
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
            !saving && saveStatus === 'success' && 'bg-green-500',
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

      <span className="text-xs text-muted-foreground">
        {rows} Zeilen, {fields} Spalten
      </span>
    </header>
  );
});

export default EditorHeader;
