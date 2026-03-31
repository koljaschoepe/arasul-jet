import { useState, memo, useCallback } from 'react';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CellValue, Field, Row } from '../types';
import { formatCellValue } from '../utils';
import RecordDetailSheet from './RecordDetailSheet';

interface MobileRecordListProps {
  rows: Row[];
  fields: Field[];
  selectedRows: Set<string>;
  onCellSave: (rowId: string, fieldSlug: string, value: CellValue) => void;
  onToggleSelection: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
}

const MAX_PREVIEW_FIELDS = 4;

const MobileRecordList = memo(function MobileRecordList({
  rows,
  fields,
  selectedRows,
  onCellSave,
  onToggleSelection,
  onDeleteRow,
}: MobileRecordListProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const previewFields = fields.slice(0, MAX_PREVIEW_FIELDS);

  const openRow = rows.find(r => r._id === openRowId);
  const openRowIndex = openRow ? rows.indexOf(openRow) : -1;

  const handleCardClick = useCallback((rowId: string) => {
    if (rowId === '__ghost__') return;
    setOpenRowId(rowId);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {rows.map((row, idx) => {
        if (row._isGhost) {
          return (
            <div
              key="ghost"
              className="flex items-center justify-center py-6 border border-dashed border-border rounded-lg text-muted-foreground/60 text-sm cursor-pointer hover:border-primary hover:text-primary transition-colors"
              onClick={() => handleCardClick(row._id)}
            >
              <Plus className="size-4 mr-2" />
              Neue Zeile
            </div>
          );
        }

        const isSelected = selectedRows.has(row._id);

        return (
          <div
            key={row._id}
            className={cn(
              'bg-card border border-border rounded-lg p-3 cursor-pointer transition-all active:scale-[0.98]',
              isSelected && 'border-primary bg-primary/8'
            )}
            onClick={() => handleCardClick(row._id)}
          >
            <div className="flex items-start gap-3">
              {/* Selection indicator */}
              <div
                className={cn(
                  'mt-0.5 size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? 'border-primary bg-primary' : 'border-border'
                )}
                onClick={e => {
                  e.stopPropagation();
                  onToggleSelection(row._id);
                }}
              >
                {isSelected && <Check className="size-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                {/* Row number */}
                <div className="text-[0.625rem] text-muted-foreground/60 mb-1">#{idx + 1}</div>

                {/* Field previews */}
                <div className="space-y-1">
                  {previewFields.map(field => {
                    const value = row[field.slug];
                    const formatted = formatCellValue(value, field.field_type);

                    return (
                      <div key={field.slug} className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[0.6875rem] text-muted-foreground shrink-0">
                          {field.name}:
                        </span>
                        <span
                          className={cn(
                            'text-sm text-foreground truncate',
                            !formatted && 'text-muted-foreground/60 italic'
                          )}
                        >
                          {formatted || '—'}
                        </span>
                      </div>
                    );
                  })}
                  {fields.length > MAX_PREVIEW_FIELDS && (
                    <span className="text-[0.625rem] text-muted-foreground/60">
                      +{fields.length - MAX_PREVIEW_FIELDS} weitere Felder
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Record detail bottom sheet */}
      {openRow && !openRow._isGhost && (
        <RecordDetailSheet
          row={openRow}
          fields={fields}
          onClose={() => setOpenRowId(null)}
          onCellSave={onCellSave}
          onDelete={rowId => {
            onDeleteRow(rowId);
            setOpenRowId(null);
          }}
          rowIndex={openRowIndex}
        />
      )}
    </div>
  );
});

export default MobileRecordList;
