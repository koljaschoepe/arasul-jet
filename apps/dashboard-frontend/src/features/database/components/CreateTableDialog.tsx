import { useState, memo } from 'react';
import { useApi } from '../../../hooks/useApi';
import Modal from '../../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { cn } from '@/lib/utils';

interface CreateTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ICONS = ['📦', '📊', '📋', '📝', '💼', '🛒', '👥', '🏢', '📁', '🔧', '💰', '📅'];
const COLORS = [
  '#45ADFF',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#14B8A6',
];

const CreateTableDialog = memo(function CreateTableDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateTableDialogProps) {
  const api = useApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#45ADFF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="table-name">Name *</Label>
          <Input
            id="table-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Produkte, Kunden, Aufträge"
            autoFocus
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="table-description">Beschreibung</Label>
          <textarea
            id="table-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung der Tabelle..."
            rows={2}
            className="py-2.5 px-3 bg-transparent border border-input rounded-md text-foreground text-sm transition-all duration-150 resize-none focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div className="flex gap-4 max-md:flex-col">
          <div className="flex flex-col gap-2 flex-1">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(i => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    'size-10 flex items-center justify-center bg-transparent border border-input rounded-lg text-xl cursor-pointer transition-all duration-150 hover:border-ring',
                    icon === i && 'bg-primary/15 border-primary'
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
            <Label>Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'size-8 rounded-full border-2 border-transparent cursor-pointer transition-all duration-150 hover:scale-110',
                    color === c && 'border-foreground shadow-[0_0_0_2px_var(--background)]'
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

export default CreateTableDialog;
