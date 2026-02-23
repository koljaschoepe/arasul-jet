/**
 * AddFieldModal - Modal for adding a new field to a DataTable
 */

import React, { useState, memo } from 'react';
import { API_BASE, getAuthHeaders } from '../../config/api';
import Modal from '../Modal';
import { FIELD_TYPES } from './constants';

const AddFieldModal = memo(function AddFieldModal({ isOpen, onClose, tableSlug, onFieldAdded }) {
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
      await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          field_type: fieldType,
          is_required: false,
          is_unique: false,
        }),
      });

      setName('');
      setFieldType('text');
      onFieldAdded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
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
