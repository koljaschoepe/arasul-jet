import { useState, memo } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import type { CellValue, Field, Row } from '../types';
import { FIELD_LABELS, formatCellValue } from '../utils';

interface RecordDetailSheetProps {
  row: Row;
  fields: Field[];
  onClose: () => void;
  onCellSave: (rowId: string, fieldSlug: string, value: CellValue) => void;
  onDelete: (rowId: string) => void;
  rowIndex: number;
}

const RecordDetailSheet = memo(function RecordDetailSheet({
  row,
  fields,
  onClose,
  onCellSave,
  onDelete,
  rowIndex,
}: RecordDetailSheetProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (field: Field) => {
    setEditingField(field.slug);
    setEditValue(String(row[field.slug] ?? ''));
  };

  const saveEdit = (fieldSlug: string) => {
    onCellSave(row._id, fieldSlug, editValue);
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row md:justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet - bottom on mobile, side panel on tablet */}
      <div className="relative mt-auto md:mt-0 md:ml-auto bg-background border-t md:border-t-0 md:border-l border-border w-full md:w-96 max-h-[85vh] md:max-h-full md:h-full flex flex-col rounded-t-xl md:rounded-none animate-in slide-in-from-bottom md:slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground m-0">Zeile {rowIndex + 1}</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(row._id)}
              title="Zeile löschen"
            >
              <Trash2 className="size-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Schließen">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto">
          {fields.map(field => {
            const isEditing = editingField === field.slug;
            const typeLabel = FIELD_LABELS[field.field_type] || field.field_type;

            return (
              <div key={field.slug} className="px-4 py-3 border-b border-border last:border-b-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">{field.name}</span>
                  <span className="text-[0.625rem] text-muted-foreground/60">
                    {typeLabel}
                    {field.unit ? ` (${field.unit})` : ''}
                  </span>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(field.slug);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                      className="h-8 text-sm"
                    />
                    <Button size="icon-xs" onClick={() => saveEdit(field.slug)}>
                      <Check className="size-3" />
                    </Button>
                    <Button variant="outline" size="icon-xs" onClick={cancelEdit}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'text-sm text-foreground cursor-pointer rounded px-2 py-1.5 -mx-2 hover:bg-card transition-colors min-h-[32px]',
                      !row[field.slug] && 'text-muted-foreground/60 italic'
                    )}
                    onClick={() => startEdit(field)}
                  >
                    {row[field.slug]
                      ? formatCellValue(row[field.slug], field.field_type)
                      : 'Leer — tippen zum Bearbeiten'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default RecordDetailSheet;
