import React, { useState, useEffect, memo } from 'react';
import { FileText } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/shadcn/button';

interface Space {
  id: string;
  name: string;
}

interface MarkdownCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (document: any) => void;
  spaceId?: string;
  spaces?: Space[];
}

const MarkdownCreateDialog = memo(function MarkdownCreateDialog({
  isOpen,
  onClose,
  onCreated,
  spaceId,
  spaces = [],
}: MarkdownCreateDialogProps) {
  const api = useApi();
  const [filename, setFilename] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFilename('');
      setSelectedSpaceId(spaceId || '');
      setError(null);
    }
  }, [isOpen, spaceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!filename.trim()) {
      setError('Dateiname ist erforderlich');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api.post(
        '/documents/create-markdown',
        {
          filename: filename.trim(),
          space_id: selectedSpaceId || null,
        },
        { showError: false }
      );

      setFilename('');
      onCreated(data.document);
    } catch (err: any) {
      console.error('Error creating markdown document:', err);
      setError(err.data?.error || err.message || 'Fehler beim Erstellen des Dokuments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Neues Markdown-Dokument" size="small">
      <form onSubmit={handleCreate} className="simple-table-form">
        {error && <div className="yaml-form-error">{error}</div>}

        <div className="simple-table-icon">
          <FileText />
        </div>

        <div className="yaml-form-group">
          <label htmlFor="md-filename">Dateiname *</label>
          <input
            id="md-filename"
            type="text"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            placeholder="z.B. notizen, dokumentation, anleitung"
            autoFocus
            required
          />
          <span className="yaml-form-hint">.md wird automatisch angehängt</span>
        </div>

        {spaces.length > 0 && (
          <div className="yaml-form-group">
            <label htmlFor="md-space">Wissensbereich</label>
            <select
              id="md-space"
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
          <Button type="submit" disabled={loading || !filename.trim()}>
            {loading ? 'Erstelle...' : 'Dokument erstellen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
});

export default MarkdownCreateDialog;
