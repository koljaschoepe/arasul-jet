import { useState, memo } from 'react';
import { AlertCircle, Save } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import Modal from '../../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';

interface CreateTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateTableDialog = memo(function CreateTableDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateTableDialogProps) {
  const api = useApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
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
          icon: '\u{1F4E6}',
          color: '#45ADFF',
        },
        { showError: false }
      );

      setName('');
      setDescription('');
      onCreated();
      onClose();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Fehler beim Erstellen der Tabelle');
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Neue Tabelle erstellen"
      size="medium"
      footer={
        <div className="flex items-center justify-end w-full max-sm:flex-col max-sm:gap-3">
          <div className="flex gap-3 max-sm:w-full max-sm:ml-0">
            <Button
              type="button"
              variant="outline"
              className="max-sm:flex-1 max-sm:justify-center"
              onClick={handleClose}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              className="max-sm:flex-1 max-sm:justify-center"
              disabled={loading || !name.trim()}
              onClick={handleSubmit}
            >
              {loading ? (
                'Erstelle...'
              ) : (
                <>
                  <Save className="size-4" />
                  Erstellen
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="table-name">Name</Label>
          <Input
            id="table-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Produkte, Kunden, Aufträge"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="table-description" className="flex items-center gap-1.5">
            Beschreibung <span className="font-normal text-muted-foreground text-xs">optional</span>
          </Label>
          <Textarea
            id="table-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung der Tabelle..."
            rows={2}
            className="resize-none"
          />
        </div>
      </form>
    </Modal>
  );
});

export default CreateTableDialog;
