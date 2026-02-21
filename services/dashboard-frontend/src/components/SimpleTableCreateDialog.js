/**
 * SimpleTableCreateDialog - Simplified dialog for creating a new table
 * Only requires name and optional space selection.
 * Creates table with default "Name" column and opens editor directly.
 */

import React, { useState, useEffect, memo } from 'react';
import axios from 'axios';
import { FiTable } from 'react-icons/fi';
import { API_BASE } from '../config/api';
import Modal from './Modal';

const SimpleTableCreateDialog = memo(function SimpleTableCreateDialog({
  isOpen,
  onClose,
  onCreated,
  spaceId = null,
  spaces = [],
}) {
  const [name, setName] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSelectedSpaceId(spaceId || '');
      setError(null);
    }
  }, [isOpen, spaceId]);

  // Create the table with default "Name" column
  const handleCreate = async e => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Tabellenname ist erforderlich');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/v1/datentabellen/tables`, {
        name: name.trim(),
        createDefaultField: true, // Creates default "Name" column
        space_id: selectedSpaceId || null,
      });

      const newTable = response.data.data;

      // Reset form
      setName('');

      // Notify parent with the created table
      // Pass slug so parent can open editor
      onCreated({
        ...newTable,
        space_id: selectedSpaceId || null,
      });
    } catch (err) {
      console.error('Error creating table:', err);
      if (err.response?.status === 409) {
        setError('Eine Tabelle mit diesem Namen existiert bereits');
      } else {
        setError(err.response?.data?.error || 'Fehler beim Erstellen der Tabelle');
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
          <FiTable />
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

        <div className="yaml-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
            {loading ? 'Erstelle...' : 'Erstellen & Bearbeiten'}
          </button>
        </div>
      </form>
    </Modal>
  );
});

export default SimpleTableCreateDialog;
