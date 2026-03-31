import { memo } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import GridCellEditor from '../../../components/editor/GridEditor/CellEditor';
import type { CellValue, Field, Row } from '../types';
import { ROW_HEIGHT, formatCellValue } from '../utils';

interface TableRowProps {
  row: Row;
  rowIdx: number;
  fields: Field[];
  columnWidths: Record<string, number>;
  isSelected: boolean;
  activeRow: number;
  activeCol: number;
  editingCell: { rowId: string; fieldSlug: string } | null;
  onCellClick: (rowIdx: number, colIdx: number, rowId: string, fieldSlug: string) => void;
  onContextMenu: (e: React.MouseEvent, rowIdx: number, colIdx: number) => void;
  onCellSave: (rowId: string, fieldSlug: string, value: CellValue, direction?: string) => void;
  onCancelEdit: () => void;
  onToggleSelection: (rowId: string) => void;
}

const TableRow = memo(function TableRow({
  row,
  rowIdx,
  fields,
  columnWidths,
  isSelected,
  activeRow,
  activeCol,
  editingCell,
  onCellClick,
  onContextMenu,
  onCellSave,
  onCancelEdit,
  onToggleSelection,
}: TableRowProps) {
  const isGhost = row._isGhost;

  if (isGhost) {
    return (
      <div
        className="flex border-b border-dashed border-border opacity-40 hover:opacity-70 transition-opacity"
        style={{ height: ROW_HEIGHT }}
      >
        <div className="w-12 min-w-12 flex items-center justify-center bg-card border-r border-border shrink-0">
          <Plus className="size-3 text-muted-foreground/60" />
        </div>
        {fields.map((field, colIdx) => {
          const isEditing = editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
          const isActive = activeRow === rowIdx && activeCol === colIdx;

          return (
            <div
              key={field.slug}
              className={cn(
                'cursor-pointer relative shrink-0 overflow-hidden bg-transparent',
                isActive && 'outline-1 outline outline-primary -outline-offset-1 z-0'
              )}
              style={{ width: columnWidths[field.slug] || 150, height: ROW_HEIGHT }}
              onClick={() => onCellClick(rowIdx, colIdx, row._id, field.slug)}
            >
              {isEditing ? (
                <GridCellEditor
                  value={row[field.slug]}
                  field={field}
                  onSave={(val: CellValue, dir?: string) =>
                    onCellSave(row._id, field.slug, val, dir)
                  }
                  onCancel={onCancelEdit}
                  classPrefix="excel"
                  validate={false}
                />
              ) : null}
            </div>
          );
        })}
        <div style={{ height: ROW_HEIGHT }} className="w-10 min-w-10 bg-card cursor-default" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex border-b border-border transition-colors hover:bg-primary/[0.03]',
        isSelected && 'bg-primary/8'
      )}
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className={cn(
          'w-12 min-w-12 flex items-center justify-center bg-card border-r border-border text-[0.6875rem] text-muted-foreground cursor-pointer select-none shrink-0 hover:text-primary hover:bg-primary/10',
          isSelected && 'bg-primary/15 text-primary font-semibold'
        )}
        onClick={() => onToggleSelection(row._id)}
      >
        {rowIdx + 1}
      </div>
      {fields.map((field, colIdx) => {
        const isEditing = editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
        const isActive = activeRow === rowIdx && activeCol === colIdx;

        return (
          <div
            key={field.slug}
            className={cn(
              'cursor-pointer relative shrink-0 overflow-hidden',
              isSelected ? 'bg-primary/8' : 'bg-background',
              isActive && 'outline-1 outline outline-primary -outline-offset-1 z-0'
            )}
            style={{ width: columnWidths[field.slug] || 150, height: ROW_HEIGHT }}
            onClick={() => onCellClick(rowIdx, colIdx, row._id, field.slug)}
            onContextMenu={e => onContextMenu(e, rowIdx, colIdx)}
          >
            {isEditing ? (
              <GridCellEditor
                value={row[field.slug]}
                field={field}
                onSave={(val: CellValue, dir?: string) => onCellSave(row._id, field.slug, val, dir)}
                onCancel={onCancelEdit}
                classPrefix="excel"
                validate={false}
              />
            ) : (
              <span
                className={cn(
                  'block px-3 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground',
                  field.field_type === 'checkbox' && 'text-primary',
                  (field.field_type === 'currency' || field.field_type === 'number') &&
                    'text-right tabular-nums'
                )}
                style={{ lineHeight: `${ROW_HEIGHT}px`, height: ROW_HEIGHT }}
              >
                {formatCellValue(row[field.slug], field.field_type)}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ height: ROW_HEIGHT }} className="w-10 min-w-10 bg-card cursor-default" />
    </div>
  );
});

export default TableRow;
