/**
 * MarkdownCreateDialog - Dialog for creating a new Markdown document
 */

import React, { useState, memo } from 'react';
import { FiFileText } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import Modal from '../ui/Modal';

const MarkdownCreateDialog = memo(function MarkdownCreateDialog({
  isOpen,
  onClose,
  onCreated,
  spaceId,
  spaces = [],
}) {
  const api = useApi();
  const [filename, setFilename] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setFilename('');
      setSelectedSpaceId(spaceId || '');
      setError(null);
    }
  }, [isOpen, spaceId]);

  // Create the markdown document
  const handleCreate = async e => {
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

      // Reset form
      setFilename('');

      // Notify parent with the created document
      onCreated(data.document);
    } catch (err) {
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
          <FiFileText />
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

        <div className="yaml-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !filename.trim()}>
            {loading ? 'Erstelle...' : 'Dokument erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  );
});

export default MarkdownCreateDialog;
