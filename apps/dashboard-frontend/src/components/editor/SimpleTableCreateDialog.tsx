import React, { useState, useEffect, memo } from 'react';
import { Table } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/shadcn/button';

interface Space {
  id: string;
  name: string;
}

interface SimpleTableCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (table: any) => void;
  spaceId?: string | null;
  spaces?: Space[];
}

const SimpleTableCreateDialog = memo(function SimpleTableCreateDialog({
  isOpen,
  onClose,
  onCreated,
  spaceId = null,
  spaces = [],
}: SimpleTableCreateDialogProps) {
  const api = useApi();
  const [name, setName] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSelectedSpaceId(spaceId || '');
      setError(null);
    }
  }, [isOpen, spaceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Tabellenname ist erforderlich');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const responseData = await api.post(
        '/v1/datentabellen/tables',
        {
          name: name.trim(),
          createDefaultField: true,
          space_id: selectedSpaceId || null,
        },
        { showError: false }
      );

      const newTable = responseData.data;
      setName('');
      onCreated({ ...newTable, space_id: selectedSpaceId || null });
    } catch (err: any) {
      console.error('Error creating table:', err);
      if (err.status === 409) {
        setError('Eine Tabelle mit diesem Namen existiert bereits');
      } else {
        setError(err.data?.error || err.message || 'Fehler beim Erstellen der Tabelle');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Neue Tabelle" size="small">
      <form onSubmit={handleCreate} className="simple-table-form">
        {error && <div className="yaml-form-error">{error}</div>}

        <div className="simple-table-icon">
          <Table />
        </div>

        <div className="yaml-form-group">
          <label htmlFor="table-name">Tabellenname *</label>
          <input
            id="table-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Kunden, Produkte, Aufgaben"
            autoFocus
            required
          />
          <span className="yaml-form-hint">Eine Spalte "Name" wird automatisch erstellt</span>
        </div>

        {spaces.length > 0 && (
          <div className="yaml-form-group">
            <label htmlFor="table-space">Bereich</label>
            <select
              id="table-space"
              value={selectedSpaceId}
              onChange={e => setSelectedSpaceId(e.target.value)}
            >
              <option value="">Allgemein</option>
              {spaces.map(space => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Erstelle...' : 'Erstellen & Bearbeiten'}
          </Button>
        </div>
      </form>
    </Modal>
  );
});

export default SimpleTableCreateDialog;
