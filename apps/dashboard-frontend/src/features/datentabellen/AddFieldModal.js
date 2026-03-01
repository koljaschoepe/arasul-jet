/**
 * AddFieldModal - Modal for adding a new field to a DataTable
 */

import React, { useState, memo } from 'react';
import { useApi } from '../../hooks/useApi';
import Modal from '../../components/ui/Modal';
import { FIELD_TYPES } from './constants';

const AddFieldModal = memo(function AddFieldModal({ isOpen, onClose, tableSlug, onFieldAdded }) {
  const api = useApi();
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await api.post(
        `/v1/datentabellen/tables/${tableSlug}/fields`,
        {
          name: name.trim(),
          field_type: fieldType,
          is_required: false,
          is_unique: false,
        },
        { showError: false }
      );

      setName('');
      setFieldType('text');
      onFieldAdded();
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Fehler beim Hinzufügen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Neue Spalte">
      <form onSubmit={handleSubmit} className="dt-create-form">
        {error && <div className="dt-error-message">{error}</div>}

        <div className="dt-form-group">
          <label>Spaltenname *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. E-Mail, Preis, Status"
            autoFocus
          />
        </div>

        <div className="dt-form-group">
          <label>Typ</label>
          <select value={fieldType} onChange={e => setFieldType(e.target.value)}>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dt-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
            {loading ? 'Füge hinzu...' : 'Hinzufügen'}
          </button>
        </div>
      </form>
    </Modal>
  );
});

export default AddFieldModal;
