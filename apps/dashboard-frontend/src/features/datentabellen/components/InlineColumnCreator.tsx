import { useState, memo } from 'react';
import { Plus } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';

interface InlineColumnCreatorProps {
  tableSlug: string;
  onColumnAdded: () => void;
}

const InlineColumnCreator = memo(function InlineColumnCreator({
  tableSlug,
  onColumnAdded,
}: InlineColumnCreatorProps) {
  const api = useApi();
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.post(
        `/v1/datentabellen/tables/${tableSlug}/fields`,
        {
          name: 'Neue Spalte',
          field_type: 'text',
          is_required: false,
          is_unique: false,
        },
        { showError: false }
      );
      onColumnAdded();
    } catch {
      // silently fail — column name conflict will auto-increment on backend
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-10 min-w-10 flex items-center justify-center shrink-0">
      <button
        type="button"
        className="flex items-center justify-center w-full h-full bg-transparent border-none text-muted-foreground cursor-pointer transition-all hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleAdd}
        disabled={loading}
        title="Neue Spalte hinzufügen"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
});

export default InlineColumnCreator;
