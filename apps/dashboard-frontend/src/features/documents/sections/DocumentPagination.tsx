import { Button } from '@/components/ui/shadcn/button';

interface DocumentPaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalEntries: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (n: number) => void;
}

export default function DocumentPagination({
  currentPage,
  totalPages,
  itemsPerPage,
  totalEntries,
  onPageChange,
  onItemsPerPageChange,
}: DocumentPaginationProps) {
  if (totalPages <= 0) return null;

  return (
    <nav
      className="flex justify-between items-center gap-4 mt-6 flex-wrap"
      role="navigation"
      aria-label="Seitennavigation"
    >
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm">{totalEntries} Einträge</span>
        <label htmlFor="dm-page-size" className="text-muted-foreground text-sm whitespace-nowrap">
          Pro Seite:
        </label>
        <select
          id="dm-page-size"
          className="bg-background border border-border rounded-sm text-foreground py-1.5 px-2 text-sm cursor-pointer"
          value={itemsPerPage}
          onChange={e => {
            onItemsPerPageChange(Number(e.target.value));
            onPageChange(1);
          }}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          aria-label="Erste Seite"
        >
          &laquo;
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Vorherige Seite"
        >
          Zur&uuml;ck
        </Button>
        <span
          className="text-muted-foreground text-sm whitespace-nowrap"
          aria-live="polite"
          aria-atomic="true"
        >
          Seite {currentPage} von {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Nächste Seite"
        >
          Weiter
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Letzte Seite"
        >
          &raquo;
        </Button>
      </div>
    </nav>
  );
}
