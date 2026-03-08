import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List, Database, FileText } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { SkeletonCard } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

interface Table {
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

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateTableModal = memo(function CreateTableModal({
  isOpen,
  onClose,
  onCreated,
}: CreateTableModalProps) {
  const api = useApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#45ADFF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icons = ['📦', '📊', '📋', '📝', '💼', '🛒', '👥', '🏢', '📁', '🔧', '💰', '📅'];
  const colors = [
    '#45ADFF',
    '#22C55E',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#06B6D4',
    '#EC4899',
    '#14B8A6',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await api.post(
        '/v1/datentabellen/tables',
        {
          name: name.trim(),
          description: description.trim() || null,
          icon,
          color,
        },
        { showError: false }
      );

      setName('');
      setDescription('');
      setIcon('📦');
      setColor('#45ADFF');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Fehler beim Erstellen der Tabelle');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Neue Tabelle erstellen">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] rounded-lg text-[var(--danger-color)] text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="table-name" className="text-sm font-medium text-[var(--text-secondary)]">
            Name *
          </label>
          <input
            id="table-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Produkte, Kunden, Aufträge"
            autoFocus
            required
            className="py-2.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all duration-150 focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-15)]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="table-description"
            className="text-sm font-medium text-[var(--text-secondary)]"
          >
            Beschreibung
          </label>
          <textarea
            id="table-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung der Tabelle..."
            rows={2}
            className="py-2.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all duration-150 resize-none focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-15)]"
          />
        </div>

        <div className="flex gap-4 max-md:flex-col">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Icon</label>
            <div className="flex flex-wrap gap-2">
              {icons.map(i => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    'w-10 h-10 flex items-center justify-center bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-xl cursor-pointer transition-all duration-150 hover:border-[var(--primary-color)]',
                    icon === i && 'bg-[var(--primary-alpha-15)] border-[var(--primary-color)]'
                  )}
                  onClick={() => setIcon(i)}
                  aria-label={`Icon ${i}`}
                  aria-pressed={icon === i}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded-full border-2 border-transparent cursor-pointer transition-all duration-150 hover:scale-110',
                    color === c && 'border-[var(--text-primary)] shadow-[0_0_0_2px_var(--bg-dark)]'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Farbe ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Erstelle...' : 'Tabelle erstellen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
});

const TableCard = memo(function TableCard({ table }: { table: Table }) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Nie';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Gerade eben';
    if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min.`;
    if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
    if (diff < 604800000) return `vor ${Math.floor(diff / 86400000)} Tagen`;

    return date.toLocaleDateString('de-DE');
  };

  return (
    <Link
      to={`/database/${table.slug}`}
      className="dt-table-card flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 no-underline text-inherit transition-all duration-150 hover:border-[var(--primary-color)] hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-[2rem] mb-3" style={{ color: table.color }}>
        {table.icon}
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-[var(--text-primary)] m-0 mb-1">
          {table.name}
        </h3>
        {table.description && (
          <p className="text-sm text-[var(--text-muted)] m-0 mb-3 line-clamp-2">
            {table.description}
          </p>
        )}
        <div className="flex gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <FileText className="w-3.5 h-3.5" /> {table.row_count || 0} Einträge
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <LayoutGrid className="w-3.5 h-3.5" /> {table.field_count || 0} Felder
          </span>
        </div>
        <div className="text-xs text-[var(--text-disabled)]">
          Aktualisiert: {formatDate(table.updated_at)}
        </div>
      </div>
    </Link>
  );
});

const DatabaseOverview = memo(function DatabaseOverview() {
  const api = useApi();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchTables = useCallback(async () => {
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    fetchAbortRef.current = new AbortController();

    try {
      setLoading(true);
      const data = await api.get('/v1/datentabellen/tables', {
        signal: fetchAbortRef.current.signal,
        showError: false,
      });
      setTables(data.data || []);
      setError(null);
    } catch (err: any) {
      if (
        err.name === 'AbortError' ||
        err.name === 'CanceledError' ||
        err.code === 'ERR_CANCELED'
      ) {
        return;
      }
      console.error('[Database] Fetch error:', err);
      setError(err.data?.error || err.message || 'Fehler beim Laden der Tabellen');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTables();
    return () => {
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    };
  }, [fetchTables]);

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
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-[var(--text-muted)]">
          <h3 className="text-[var(--text-primary)] mb-2">Fehler beim Laden</h3>
          <p>{error}</p>
          <button
            type="button"
            onClick={fetchTables}
            className="inline-flex items-center gap-2 py-2.5 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-[var(--primary-hover)]"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dt-container p-6 w-full min-h-full box-border max-md:p-4">
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap max-md:flex-col max-md:items-start">
        <div className="flex items-center gap-4">
          <Database className="text-[2rem] text-[var(--primary-color)]" />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] m-0">Datenbank</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 m-0">{tables.length} Tabellen</p>
          </div>
        </div>
        <div className="flex items-center gap-3 max-md:w-full">
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2.5 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-[var(--primary-hover)] max-md:w-full max-md:justify-center"
            onClick={handleCreateTable}
          >
            <Plus className="w-4 h-4" /> Neue Tabelle
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap max-md:flex-col max-md:items-stretch">
        <div className="relative flex-1 max-w-[400px] max-md:max-w-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none w-4 h-4" />
          <input
            type="text"
            placeholder="Tabellen durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Tabellen durchsuchen"
            className="w-full py-2.5 pl-10 pr-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all duration-150 focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-15)]"
          />
        </div>
        <div className="flex bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden">
          <button
            type="button"
            className={cn(
              'flex items-center justify-center w-10 h-10 bg-transparent border-none text-[var(--text-muted)] cursor-pointer transition-colors duration-150 hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]',
              viewMode === 'grid' && 'text-[var(--primary-color)] bg-[var(--primary-alpha-10)]'
            )}
            onClick={() => setViewMode('grid')}
            title="Kachelansicht"
            aria-label="Kachelansicht"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center w-10 h-10 bg-transparent border-none text-[var(--text-muted)] cursor-pointer transition-colors duration-150 hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]',
              viewMode === 'list' && 'text-[var(--primary-color)] bg-[var(--primary-alpha-10)]'
            )}
            onClick={() => setViewMode('list')}
            title="Listenansicht"
            aria-label="Listenansicht"
            aria-pressed={viewMode === 'list'}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filteredTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-[var(--text-muted)]">
          {searchQuery ? (
            <>
              <Search className="text-[3rem] mb-4 opacity-50" />
              <h3 className="text-[var(--text-primary)] mb-2">Keine Tabellen gefunden</h3>
              <p>Keine Tabellen entsprechen &bdquo;{searchQuery}&ldquo;</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Filter zurücksetzen
              </Button>
            </>
          ) : (
            <>
              <Database className="text-[3rem] mb-4 opacity-50" />
              <h3 className="text-[var(--text-primary)] mb-2">Noch keine Tabellen</h3>
              <p>Erstellen Sie Ihre erste Tabelle, um Daten zu verwalten.</p>
              <button
                type="button"
                className="inline-flex items-center gap-2 py-2.5 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-[var(--primary-hover)]"
                onClick={handleCreateTable}
              >
                <Plus className="w-4 h-4" /> Erste Tabelle erstellen
              </button>
            </>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            viewMode === 'list'
              ? 'grid-cols-1'
              : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]'
          )}
        >
          {filteredTables.map(table => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}

      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchTables}
      />
    </div>
  );
});

export default DatabaseOverview;
