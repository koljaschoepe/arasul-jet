import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [25, 50, 100];

const Pagination = memo(function Pagination({
  page,
  totalPages,
  pageSize,
  totalRows,
  onPrevPage,
  onNextPage,
  onPageSizeChange,
}: PaginationProps) {
  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between py-2 px-6 bg-card border-t border-border shrink-0 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>
          Zeile {startRow}–{endRow} von {totalRows}
        </span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="h-6 px-1.5 bg-background border border-border rounded text-foreground text-xs cursor-pointer"
        >
          {PAGE_SIZES.map(s => (
            <option key={s} value={s}>
              {s} pro Seite
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onPrevPage}
          disabled={page <= 1}
          title="Vorherige Seite"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="px-2">
          Seite {page} von {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNextPage}
          disabled={page >= totalPages}
          title="Nächste Seite"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
});

export default Pagination;
