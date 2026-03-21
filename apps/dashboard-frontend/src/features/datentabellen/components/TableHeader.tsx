import { memo, type RefObject } from 'react';
import { ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/shadcn/tooltip';
import type { Field } from '../types';
import { FIELD_LABELS } from '../utils';
import InlineColumnCreator from './InlineColumnCreator';

interface TableHeaderProps {
  fields: Field[];
  columnWidths: Record<string, number>;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  resizingColumn: { fieldSlug: string } | null;
  headerScrollRef: RefObject<HTMLDivElement | null>;
  tableSlug: string;
  onSort: (fieldSlug: string) => void;
  onResizeStart: (e: React.MouseEvent, fieldSlug: string, currentWidth: number) => void;
  onColumnMenuOpen: (field: Field, rect: DOMRect) => void;
  onColumnAdded: () => void;
  onToggleSelectAll: () => void;
}

const TableHeader = memo(function TableHeader({
  fields,
  columnWidths,
  sortField,
  sortOrder,
  resizingColumn,
  headerScrollRef,
  tableSlug,
  onSort,
  onResizeStart,
  onColumnMenuOpen,
  onColumnAdded,
  onToggleSelectAll,
}: TableHeaderProps) {
  return (
    <div className="overflow-hidden shrink-0 border-b border-border bg-card" ref={headerScrollRef}>
      <div className="flex min-w-max">
        <div
          className="w-12 min-w-12 h-9 flex items-center justify-center bg-card border-r border-border text-[0.6875rem] font-semibold text-muted-foreground cursor-pointer select-none hover:text-primary hover:bg-primary/10"
          onClick={onToggleSelectAll}
          title="Alle auswählen"
        >
          #
        </div>
        <TooltipProvider>
          {fields.map(field => {
            const typeLabel = FIELD_LABELS[field.field_type] || field.field_type;
            const tooltipText = field.unit ? `${typeLabel} | ${field.unit}` : typeLabel;

            return (
              <div
                key={field.slug}
                className={cn(
                  'group/col relative flex items-center h-9 px-3 border-r border-border shrink-0 select-none',
                  resizingColumn?.fieldSlug === field.slug && 'border-r-primary'
                )}
                style={{ width: columnWidths[field.slug] || 150 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer leading-tight hover:text-primary truncate flex-1 min-w-0"
                      onClick={() => onSort(field.slug)}
                    >
                      <span className="truncate">{field.name}</span>
                      {sortField === field.slug &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp className="size-3 shrink-0" />
                        ) : (
                          <ChevronDown className="size-3 shrink-0" />
                        ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
                <button
                  type="button"
                  className="flex items-center justify-center size-5 bg-transparent border-none rounded text-muted-foreground/60 cursor-pointer opacity-0 transition-all group-hover/col:opacity-100 hover:bg-background hover:text-foreground shrink-0 ml-1"
                  onClick={e => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onColumnMenuOpen(field, rect);
                  }}
                >
                  <MoreVertical className="size-3" />
                </button>
                <div
                  className={cn(
                    'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-primary',
                    resizingColumn?.fieldSlug === field.slug && 'bg-primary'
                  )}
                  onMouseDown={e => onResizeStart(e, field.slug, columnWidths[field.slug] || 150)}
                />
              </div>
            );
          })}
        </TooltipProvider>
        <InlineColumnCreator tableSlug={tableSlug} onColumnAdded={onColumnAdded} />
      </div>
    </div>
  );
});

export default TableHeader;
