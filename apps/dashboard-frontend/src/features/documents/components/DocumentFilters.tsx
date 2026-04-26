import { Search, Filter, Folder, RefreshCw, Trash2, Table, FileText } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import type { DocumentCategory } from '../../../types';

interface DocumentFiltersProps {
  searchQuery: string;
  statusFilter: string;
  categoryFilter: string;
  categories: DocumentCategory[];
  loading: boolean;
  cleaningUp: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onReload: () => void;
  onCleanup: () => void;
  onCreateTable: () => void;
  onCreateDocument: () => void;
}

const SELECT_OPTION_STYLE = {
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
};

/**
 * DocumentFilters — Filter bar (search, status, category) plus quick-action
 * buttons (refresh, cleanup, new table, new document).
 */
export default function DocumentFilters({
  searchQuery,
  statusFilter,
  categoryFilter,
  categories,
  loading,
  cleaningUp,
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onReload,
  onCleanup,
  onCreateTable,
  onCreateDocument,
}: DocumentFiltersProps) {
  return (
    <div
      className="flex gap-3 mb-6 flex-wrap items-center w-full"
      role="group"
      aria-label="Dokumenten-Filter"
    >
      <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
        <Search className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
        <input
          type="text"
          className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none"
          placeholder="Suchen..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          aria-label="Nach Namen suchen"
        />
      </div>

      <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
        <Filter className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
        <select
          className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none cursor-pointer"
          value={statusFilter}
          onChange={e => onStatusChange(e.target.value)}
          aria-label="Nach Status filtern"
        >
          <option value="" style={SELECT_OPTION_STYLE}>
            Alle Status
          </option>
          <option value="indexed" style={SELECT_OPTION_STYLE}>
            Indexiert
          </option>
          <option value="pending" style={SELECT_OPTION_STYLE}>
            Wartend
          </option>
          <option value="processing" style={SELECT_OPTION_STYLE}>
            Verarbeitung
          </option>
          <option value="failed" style={SELECT_OPTION_STYLE}>
            Fehlgeschlagen
          </option>
        </select>
      </div>

      <div className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-3 gap-2 flex-1 min-w-[150px]">
        <Folder className="text-muted-foreground shrink-0" aria-hidden="true" size={16} />
        <select
          className="flex-1 bg-transparent border-none text-foreground text-sm w-full placeholder:text-muted-foreground focus:outline-none cursor-pointer"
          value={categoryFilter}
          onChange={e => onCategoryChange(e.target.value)}
          aria-label="Nach Kategorie filtern"
        >
          <option value="" style={SELECT_OPTION_STYLE}>
            Alle Kategorien
          </option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id} style={SELECT_OPTION_STYLE}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <Button variant="ghost" size="icon" onClick={onReload} aria-label="Aktualisieren">
        <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" size={16} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onCleanup}
        disabled={cleaningUp}
        aria-label="Verwaiste Dateien bereinigen"
        title="Bereinigung: Verwaiste Dateien aufräumen"
      >
        <Trash2 className={cleaningUp ? 'animate-pulse' : ''} aria-hidden="true" size={16} />
      </Button>

      <Button onClick={onCreateTable} aria-label="Neue Tabelle erstellen">
        <Table aria-hidden="true" size={16} />
        <span>Neue Tabelle</span>
      </Button>

      <Button onClick={onCreateDocument} aria-label="Neues Dokument erstellen">
        <FileText aria-hidden="true" size={16} />
        <span>Neues Dokument</span>
      </Button>
    </div>
  );
}
