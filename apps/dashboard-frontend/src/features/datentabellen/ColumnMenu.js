/**
 * ColumnMenu - Dropdown menu for column actions (rename, change type, delete)
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import { FiEdit2, FiType, FiTrash2 } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import { FIELD_TYPES } from './constants';

const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}) {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog: ColumnConfirmDialog } = useConfirm();
  const [mode, setMode] = useState('menu'); // 'menu' | 'rename' | 'type'
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Focus input when mode changes
  useEffect(() => {
    if (mode === 'rename' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle rename
  const handleRename = async () => {
    if (!newName.trim() || newName === field.name) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.patch(
        `/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        { name: newName.trim() },
        { showError: false }
      );
      toast.success('Spalte umbenannt');
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Fehler beim Umbenennen');
    } finally {
      setLoading(false);
    }
  };

  // Handle type change
  const handleTypeChange = async () => {
    if (newType === field.field_type) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.patch(
        `/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        { field_type: newType },
        { showError: false }
      );
      toast.success('Spaltentyp geändert');
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Fehler beim Ändern des Typs');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (
      !(await showConfirm({
        message: `Spalte "${field.name}" wirklich löschen? Alle Daten in dieser Spalte gehen verloren.`,
      }))
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.del(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, {
        showError: false,
      });
      toast.success('Spalte gelöscht');
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Fehler beim Löschen');
    } finally {
      setLoading(false);
    }
  };

  // Handle key events
  const handleKeyDown = e => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && mode === 'rename') {
      handleRename();
    }
  };

  return (
    <div
      className="dt-column-menu"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      onKeyDown={handleKeyDown}
    >
      {error && <div className="dt-column-menu-error">{error}</div>}

      {mode === 'menu' && (
        <>
          <button
            type="button"
            className="dt-column-menu-item"
            onClick={() => setMode('rename')}
            disabled={loading}
          >
            <FiEdit2 /> Umbenennen
          </button>
          <button
            type="button"
            className="dt-column-menu-item"
            onClick={() => setMode('type')}
            disabled={loading}
          >
            <FiType /> Typ ändern
          </button>
          <div className="dt-column-menu-divider" />
          <button
            type="button"
            className="dt-column-menu-item dt-column-menu-danger"
            onClick={handleDelete}
            disabled={loading}
          >
            <FiTrash2 /> Löschen
          </button>
        </>
      )}

      {mode === 'rename' && (
        <div className="dt-column-menu-form">
          <label>Neuer Name</label>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Spaltenname"
          />
          <div className="dt-column-menu-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleRename}
              disabled={loading || !newName.trim()}
            >
              {loading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="dt-column-menu-form">
          <label>Spaltentyp</label>
          <select value={newType} onChange={e => setNewType(e.target.value)}>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="dt-column-menu-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleTypeChange}
              disabled={loading}
            >
              {loading ? '...' : 'Ändern'}
            </button>
          </div>
        </div>
      )}
      <ColumnConfirmDialog />
    </div>
  );
});

export default ColumnMenu;
