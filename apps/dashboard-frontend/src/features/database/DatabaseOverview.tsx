import { useState, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List, Database, FileText } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useFetchData } from '../../hooks/useFetchData';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { Input } from '@/components/ui/shadcn/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { cn } from '@/lib/utils';
import CreateTableDialog from './components/CreateTableDialog';
import TableCard from './components/TableCard';

interface TableItem {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  row_count?: number;
  field_count?: number;
  updated_at?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Nie';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Gerade eben';
  if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min.`;
  if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
  if (diff < 604800000) return `vor ${Math.floor(diff / 86400000)} Tagen`;

  return date.toLocaleDateString('de-DE');
}

const DatabaseOverview = memo(function DatabaseOverview() {
  const api = useApi();

  const tableFetcher = useCallback(
    async (signal: AbortSignal) => {
      const data = await api.get<{ data: TableItem[] }>('/v1/datentabellen/tables', {
        signal,
        showError: false,
      });
      return data.data || [];
    },
    [api]
  );

  const {
    data: tables,
    loading,
    error,
    refetch: fetchTables,
  } = useFetchData<TableItem[]>(tableFetcher, {
    initialData: [],
    errorMessage: 'Fehler beim Laden der Tabellen',
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredTables = tables.filter(
    t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateTable = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  if (loading) {
    return (
      <div className="dt-container p-6 w-full min-h-full box-border">
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          role="status"
          aria-label="Lade Tabellen..."
        >
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <SkeletonCard key={i} hasAvatar={false} lines={2} />
            ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-container p-6 w-full min-h-full box-border">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-muted-foreground">
          <h3 className="text-foreground mb-2">Fehler beim Laden</h3>
          <p>{error}</p>
          <Button onClick={fetchTables}>Erneut versuchen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dt-container p-6 w-full min-h-full box-border max-md:p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap max-md:flex-col max-md:items-start">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground m-0">Datenbank</h1>
          <Badge variant="secondary">{tables.length} Tabellen</Badge>
        </div>
        <Button className="max-md:w-full max-md:justify-center" onClick={handleCreateTable}>
          <Plus className="size-4" /> Neue Tabelle
        </Button>
      </div>

      {/* Search + View toggle */}
      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap max-md:flex-col max-md:items-stretch">
        <div className="relative flex-1 max-w-[400px] max-md:max-w-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none size-4" />
          <Input
            type="text"
            placeholder="Tabellen durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Tabellen durchsuchen"
            className="pl-10"
          />
        </div>
        <div className="flex bg-card border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            className={cn(
              'flex items-center justify-center size-10 bg-transparent border-none text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground hover:bg-accent',
              viewMode === 'grid' && 'text-primary bg-primary/10'
            )}
            onClick={() => setViewMode('grid')}
            title="Kachelansicht"
            aria-label="Kachelansicht"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center size-10 bg-transparent border-none text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground hover:bg-accent',
              viewMode === 'list' && 'text-primary bg-primary/10'
            )}
            onClick={() => setViewMode('list')}
            title="Listenansicht"
            aria-label="Listenansicht"
            aria-pressed={viewMode === 'list'}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {filteredTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-muted-foreground">
          {searchQuery ? (
            <>
              <Search className="size-12 mb-4 opacity-30" />
              <h3 className="text-foreground mb-2">Keine Tabellen gefunden</h3>
              <p className="mb-4">Keine Tabellen entsprechen &bdquo;{searchQuery}&ldquo;</p>
              <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                Filter zurücksetzen
              </Button>
            </>
          ) : (
            <>
              <Database className="size-12 mb-4 opacity-30" />
              <h3 className="text-foreground mb-2">Noch keine Tabellen</h3>
              <p className="mb-4">Erstellen Sie Ihre erste Tabelle, um Daten zu verwalten.</p>
              <Button onClick={handleCreateTable}>
                <Plus className="size-4" /> Erste Tabelle erstellen
              </Button>
            </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Einträge</TableHead>
              <TableHead>Felder</TableHead>
              <TableHead className="text-right">Aktualisiert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTables.map(table => (
              <TableRow key={table.id} className="cursor-pointer">
                <TableCell>
                  <span className="text-lg" style={{ color: table.color }}>
                    {table.icon}
                  </span>
                </TableCell>
                <TableCell>
                  <Link
                    to={`/database/${table.slug}`}
                    className="no-underline text-foreground font-medium hover:text-primary transition-colors"
                  >
                    {table.name}
                  </Link>
                  {table.description && (
                    <p className="text-xs text-muted-foreground m-0 mt-0.5 line-clamp-1">
                      {table.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <FileText className="size-3" /> {table.row_count || 0} Einträge
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <LayoutGrid className="size-3" /> {table.field_count || 0} Felder
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatDate(table.updated_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {filteredTables.map(table => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}

      <CreateTableDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchTables}
      />
    </div>
  );
});

export default DatabaseOverview;
