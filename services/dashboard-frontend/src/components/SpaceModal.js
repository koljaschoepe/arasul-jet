import React, { memo, useState, useEffect } from 'react';
import { FiFolder, FiSave, FiAlertCircle, FiCheck, FiTrash2 } from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../config/api';
import useConfirm from '../hooks/useConfirm';
import Modal from './Modal';
import '../space-modal.css';

// Available icons for spaces
const SPACE_ICONS = [
  { value: 'folder', label: 'Ordner' },
  { value: 'briefcase', label: 'Aktenkoffer' },
  { value: 'file-text', label: 'Dokument' },
  { value: 'users', label: 'Team' },
  { value: 'settings', label: 'Einstellungen' },
  { value: 'dollar-sign', label: 'Finanzen' },
  { value: 'shopping-cart', label: 'Vertrieb' },
  { value: 'tool', label: 'Technik' },
  { value: 'book', label: 'Wissen' },
  { value: 'archive', label: 'Archiv' },
];

// Available colors for spaces
const SPACE_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

const descriptionTemplate = `**Inhalt:** Beschreiben Sie, welche Dokumente dieser Bereich enthält.

**Zweck:** Wofür werden diese Dokumente genutzt?

**Typische Fragen:**
- Frage 1, die dieser Bereich beantworten kann
- Frage 2
- Frage 3`;

const SpaceModal = memo(function SpaceModal({
  isOpen,
  onClose,
  onSave,
  space = null,
  mode = 'create',
}) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState(descriptionTemplate);
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Reset form when modal opens/closes or space changes
  useEffect(() => {
    if (isOpen) {
      if (space && mode === 'edit') {
        setName(space.name || '');
        setDescription(space.description || '');
        setIcon(space.icon || 'folder');
        setColor(space.color || '#6366f1');
      } else {
        setName('');
        setDescription(descriptionTemplate);
        setIcon('folder');
        setColor('#6366f1');
      }
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, space, mode]);

  const handleSubmit = async e => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Bitte geben Sie einen Namen ein');
      return;
    }

    if (!description.trim() || description === descriptionTemplate) {
      setError('Bitte geben Sie eine Beschreibung ein');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        icon,
        color,
      };

      let response;
      if (mode === 'edit' && space?.id) {
        response = await fetch(`${API_BASE}/spaces/${space.id}`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${API_BASE}/spaces`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      const data = await response.json();
      setSuccess(mode === 'edit' ? 'Bereich aktualisiert' : 'Bereich erstellt');

      setTimeout(() => {
        onSave(data.space || data);
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!space?.id) return;

    if (
      !(await confirm({
        message: `Bereich "${space.name}" wirklich löschen? Dokumente werden in "Allgemein" verschoben.`,
      }))
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/spaces/${space.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Löschen');
      }

      setSuccess('Bereich gelöscht');
      setTimeout(() => {
        onSave(null); // Signal deletion
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <>
          <FiFolder style={{ color }} />
          {mode === 'edit' ? ' Bereich bearbeiten' : ' Neuen Wissensbereich erstellen'}
        </>
      }
      size="medium"
      className="space-modal-wrapper"
      footer={
        <div className="space-modal-footer">
          {mode === 'edit' && space && !space.is_default && !space.is_system && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={saving}
            >
              <FiTrash2 />
              Löschen
            </button>
          )}
          <div className="footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? (
                'Speichern...'
              ) : (
                <>
                  <FiSave />
                  {mode === 'edit' ? 'Speichern' : 'Erstellen'}
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-modal-body">
        {/* Messages */}
        {error && (
          <div className="space-message error">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="space-message success">
            <FiCheck />
            <span>{success}</span>
          </div>
        )}

        {/* Name */}
        <div className="space-form-group">
          <label htmlFor="space-name">Name</label>
          <input
            id="space-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Vertrieb, Technik, Recht..."
            maxLength={100}
            disabled={space?.is_default || space?.is_system}
          />
        </div>

        {/* Icon and Color */}
        <div className="space-form-row">
          <div className="space-form-group half">
            <label>Icon</label>
            <div className="icon-selector">
              {SPACE_ICONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`icon-option ${icon === opt.value ? 'selected' : ''}`}
                  onClick={() => setIcon(opt.value)}
                  title={opt.label}
                >
                  <FiFolder />
                </button>
              ))}
            </div>
          </div>

          <div className="space-form-group half">
            <label>Farbe</label>
            <div className="color-selector">
              {SPACE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-form-group">
          <label htmlFor="space-description">
            Beschreibung
            <span className="label-hint">(wird für intelligentes Routing genutzt)</span>
          </label>
          <textarea
            id="space-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Beschreiben Sie, was dieser Bereich enthält..."
            rows={8}
          />
          <p className="description-hint">
            Je präziser die Beschreibung, desto besser findet die KI relevante Dokumente.
          </p>
        </div>
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default SpaceModal;
