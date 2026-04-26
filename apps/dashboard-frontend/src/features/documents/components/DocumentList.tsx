import React from 'react';
import {
  File,
  FileText,
  Search,
  Database,
  Upload,
  Star,
  Eye,
  Pencil,
  Download,
  RefreshCw,
  Trash2,
  Grid3x3,
  CheckSquare,
  Square,
  Minus,
  Table,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import EmptyState from '../../../components/ui/EmptyState';
import { SkeletonDocumentList } from '../../../components/ui/Skeleton';
import { TableBadge, StatusBadge, TableStatusBadge, IndexStatusBadge, SpaceBadge } from './Badges';
import { formatFileSize } from '../../../utils/formatting';
import type { Document, DocumentSpace, DataTable } from '../../../types';

type TaggedDocument = Document & { _type: 'document' };
type TaggedTable = DataTable & { _type: 'table' };
export type CombinedItem = TaggedDocument | TaggedTable;

interface DocumentListProps {
  items: CombinedItem[];
  spaces: DocumentSpace[];
  loading: boolean;
  loadingTables: boolean;
  selectedIds: Set<string>;
  allDocsSelected: boolean;
  someDocsSelected: boolean;
  hasActiveFilter: boolean;
  searchQuery: string;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onResetFilters: () => void;
  onUploadClick: () => void;
  onCreateDocument: () => void;
  onMoveDocument: (
    docId: string,
    newSpaceId: string | null,
    newSpaceName: string | null
  ) => void | Promise<void>;
  onViewDocument: (doc: Document) => void | Promise<void>;
  onEditDocument: (doc: Document) => void;
  onDownloadDocument: (id: string, filename: string) => void | Promise<void>;
  onDeleteDocument: (id: string, filename: string) => void | Promise<void>;
  onReindexDocument: (id: string) => void | Promise<void>;
  onToggleFavorite: (doc: Document) => void | Promise<void>;
  onEditTable: (table: DataTable) => void;
  onDeleteTable: (table: DataTable) => void | Promise<void>;
}

const isEditableDoc = (doc: Document) => {
  const editableExtensions = ['.md', '.markdown', '.txt'];
  return editableExtensions.includes(doc.file_extension?.toLowerCase() ?? '');
};

const getFileIcon = (doc: Document) => (isEditableDoc(doc) ? FileText : File);

const TH_CLASS =
  'bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-4 text-left border-b border-[var(--border-table)]';

/**
 * DocumentList — Combined table for documents and PostgreSQL tables, with
 * loading skeleton and empty state. Stateless, controlled by props.
 */
export default function DocumentList({
  items,
  spaces,
  loading,
  loadingTables,
  selectedIds,
  allDocsSelected,
  someDocsSelected,
  hasActiveFilter,
  searchQuery,
  onToggleSelect,
  onToggleSelectAll,
  onResetFilters,
  onUploadClick,
  onCreateDocument,
  onMoveDocument,
  onViewDocument,
  onEditDocument,
  onDownloadDocument,
  onDeleteDocument,
  onReindexDocument,
  onToggleFavorite,
  onEditTable,
  onDeleteTable,
}: DocumentListProps) {
  const tables = items.filter((item): item is TaggedTable => item._type === 'table');
  const documents = items.filter((item): item is TaggedDocument => item._type === 'document');

  const getTableSpaceName = (table: DataTable) => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.name || 'Allgemein';
  };

  const getTableSpaceColor = (table: DataTable) => {
    const space = spaces.find(s => s.id === table.space_id);
    return space?.color || 'var(--primary-color)';
  };

  return (
    <section
      className="bg-[var(--gradient-card)] border border-border rounded-lg overflow-hidden"
      aria-label="Datenliste"
    >
      {(loading || loadingTables) && items.length === 0 ? (
        <SkeletonDocumentList count={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={hasActiveFilter ? <Search /> : <Database />}
          title={hasActiveFilter ? 'Keine Ergebnisse' : 'Noch keine Dokumente'}
          description={
            hasActiveFilter
              ? `Keine Einträge für die aktuelle Filterung gefunden.${searchQuery ? ` Suchbegriff: "${searchQuery}"` : ''}`
              : 'Laden Sie Ihre ersten Dokumente hoch oder erstellen Sie eine Tabelle, um loszulegen.'
          }
          action={
            hasActiveFilter ? (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                Filter zurücksetzen
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 hover:text-primary"
                  onClick={onUploadClick}
                >
                  <Upload className="size-4 mr-1" /> Datei hochladen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="border border-border text-muted-foreground hover:text-foreground"
                  onClick={onCreateDocument}
                >
                  <FileText className="size-4 mr-1" /> Dokument erstellen
                </Button>
              </div>
            )
          }
        />
      ) : (
        <table className="w-full border-collapse" aria-label={`${items.length} Einträge`}>
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-[var(--bg-table-header)] text-muted-foreground font-semibold text-xs uppercase tracking-wide py-3 px-2 text-center border-b border-[var(--border-table)] w-10"
              >
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  onClick={onToggleSelectAll}
                  aria-label={allDocsSelected ? 'Alle abwählen' : 'Alle auswählen'}
                >
                  {allDocsSelected ? (
                    <CheckSquare size={16} className="text-primary" />
                  ) : someDocsSelected ? (
                    <Minus size={16} className="text-primary" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              </th>
              <th scope="col" className={TH_CLASS} aria-label="Favorit"></th>
              <th scope="col" className={TH_CLASS}>
                Name
              </th>
              <th scope="col" className={TH_CLASS}>
                Typ
              </th>
              <th scope="col" className={TH_CLASS}>
                Bereich
              </th>
              <th scope="col" className={TH_CLASS}>
                Status
              </th>
              <th scope="col" className={TH_CLASS}>
                Info
              </th>
              <th scope="col" className={TH_CLASS}>
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody>
            {tables.map(table => (
              <tr
                key={`table-${table.id}`}
                className="cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                onClick={() => onEditTable(table)}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onEditTable(table)}
                aria-label={`Tabelle: ${table.name}`}
              >
                <td className="py-3 px-2 text-center border-b border-border/50 text-sm w-10">
                  <span className="inline-flex items-center justify-center size-6 text-muted-foreground/40">
                    <Square size={14} />
                  </span>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <span className="inline-flex items-center justify-center size-6 text-primary opacity-60">
                    <Grid3x3 aria-hidden="true" size={16} />
                  </span>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm max-w-[300px]">
                  <div className="flex items-center gap-3">
                    <Table className="text-primary text-xl shrink-0" aria-hidden="true" size={20} />
                    <div className="min-w-0 flex-1">
                      <span
                        className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                        title={table.name}
                      >
                        {table.name}
                      </span>
                      {table.description && (
                        <span
                          className="block text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap"
                          title={table.description}
                        >
                          {table.description}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <TableBadge />
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <SpaceBadge name={getTableSpaceName(table)} color={getTableSpaceColor(table)} />
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TableStatusBadge status={table.status || 'active'} />
                    <IndexStatusBadge
                      needsReindex={table.needs_reindex}
                      lastIndexedAt={table.last_indexed_at}
                    />
                  </div>
                </td>
                <td className="py-3 px-4 text-muted-foreground border-b border-border/50 text-sm">
                  <span>{table.field_count || 0} Spalten</span>
                </td>
                <td
                  className="py-3 px-4 text-foreground border-b border-border/50 text-sm whitespace-nowrap"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1"
                    onClick={() => onEditTable(table)}
                    aria-label={`${table.name} bearbeiten`}
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDeleteTable(table)}
                    aria-label={`${table.name} löschen`}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </td>
              </tr>
            ))}

            {documents.map(doc => (
              <tr
                key={`doc-${doc.id}`}
                className={cn(
                  'cursor-pointer transition-all hover:bg-[var(--bg-table-row-active)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
                  doc.is_favorite && 'bg-primary/5',
                  selectedIds.has(doc.id) && 'bg-primary/10'
                )}
                onClick={() => onViewDocument(doc)}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onViewDocument(doc)}
                aria-label={`${doc.title || doc.filename}, Status: ${doc.status}`}
              >
                <td
                  className="py-3 px-2 text-center border-b border-border/50 text-sm w-10"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => onToggleSelect(doc.id)}
                    aria-label={selectedIds.has(doc.id) ? 'Abwählen' : 'Auswählen'}
                  >
                    {selectedIds.has(doc.id) ? (
                      <CheckSquare size={16} className="text-primary" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <button
                    type="button"
                    className={cn(
                      'bg-transparent border-none text-muted-foreground cursor-pointer p-1 transition-colors hover:text-primary',
                      doc.is_favorite && 'text-primary'
                    )}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleFavorite(doc);
                    }}
                    aria-label={
                      doc.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'
                    }
                    aria-pressed={doc.is_favorite}
                  >
                    <Star aria-hidden="true" size={16} />
                  </button>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm max-w-[300px]">
                  <div className="flex items-center gap-3">
                    {React.createElement(getFileIcon(doc), {
                      className: 'text-primary text-xl shrink-0',
                      'aria-hidden': 'true',
                      size: 20,
                    })}
                    <div className="min-w-0 flex-1">
                      <span
                        className="block font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                        title={doc.title || doc.filename}
                      >
                        {doc.title || doc.filename}
                      </span>
                      {doc.title && doc.title !== doc.filename && (
                        <span
                          className="block text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap"
                          title={doc.filename}
                        >
                          {doc.filename}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-sm text-xs font-medium uppercase tracking-wide bg-primary/10 text-primary">
                    Dokument
                  </span>
                </td>
                <td
                  className="py-3 px-4 text-foreground border-b border-border/50 text-sm"
                  onClick={e => e.stopPropagation()}
                >
                  <SpaceBadge
                    name={doc.space_name}
                    color={doc.space_color}
                    docId={doc.id}
                    spaces={spaces}
                    onMove={onMoveDocument}
                  />
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="py-3 px-4 text-foreground border-b border-border/50 text-sm">
                  {formatFileSize(doc.file_size)}
                </td>
                <td
                  className="py-3 px-4 text-foreground border-b border-border/50 text-sm whitespace-nowrap"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1"
                    onClick={() => onViewDocument(doc)}
                    aria-label={`Details für ${doc.title || doc.filename} anzeigen`}
                  >
                    <Eye aria-hidden="true" size={16} />
                  </Button>
                  {isEditableDoc(doc) && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="mr-1"
                      onClick={() => onEditDocument(doc)}
                      aria-label={`${doc.title || doc.filename} bearbeiten`}
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1"
                    onClick={() => onDownloadDocument(doc.id, doc.filename)}
                    aria-label={`${doc.filename} herunterladen`}
                  >
                    <Download aria-hidden="true" size={16} />
                  </Button>
                  {doc.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="mr-1"
                      onClick={() => onReindexDocument(doc.id)}
                      aria-label={`${doc.title || doc.filename} neu indexieren`}
                    >
                      <RefreshCw aria-hidden="true" size={16} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDeleteDocument(doc.id, doc.filename)}
                    aria-label={`${doc.title || doc.filename} löschen`}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
