/**
 * CommandsEditor - Editor for managing bot custom commands
 */

import React, { useState } from 'react';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSave,
  FiX,
  FiCommand,
  FiAlertCircle,
  FiMenu,
} from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';

function CommandsEditor({ botId, commands, onChange, getAuthHeaders }) {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingCommand, setEditingCommand] = useState(null);
  const [newCommand, setNewCommand] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Start creating new command
  const handleAddNew = () => {
    setNewCommand({
      command: '',
      description: '',
      prompt: '',
      isEnabled: true,
    });
    setEditingCommand(null);
  };

  // Start editing existing command
  const handleEdit = cmd => {
    setEditingCommand({
      ...cmd,
      command: cmd.command.replace(/^\//, ''), // Remove leading slash for editing
    });
    setNewCommand(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingCommand(null);
    setNewCommand(null);
    setError(null);
  };

  // Save new command
  const handleSaveNew = async () => {
    if (!newCommand.command || !newCommand.description || !newCommand.prompt) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/commands`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          command: newCommand.command.replace(/^\//, ''),
          description: newCommand.description,
          prompt: newCommand.prompt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      const data = await response.json();
      onChange([...commands, data.command]);
      toast.success('Befehl erstellt');
      setNewCommand(null);
    } catch (err) {
      console.error('Befehl erstellen fehlgeschlagen:', err);
      setError('Fehler beim Erstellen des Befehls');
    } finally {
      setSaving(false);
    }
  };

  // Update existing command
  const handleSaveEdit = async () => {
    if (!editingCommand.command || !editingCommand.description || !editingCommand.prompt) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/telegram-bots/${botId}/commands/${editingCommand.id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            command: editingCommand.command.replace(/^\//, ''),
            description: editingCommand.description,
            prompt: editingCommand.prompt,
            isEnabled: editingCommand.isEnabled,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      const data = await response.json();
      onChange(commands.map(c => (c.id === data.command.id ? data.command : c)));
      toast.success('Befehl gespeichert');
      setEditingCommand(null);
    } catch (err) {
      console.error('Befehl speichern fehlgeschlagen:', err);
      setError('Fehler beim Speichern des Befehls');
    } finally {
      setSaving(false);
    }
  };

  // Delete command
  const handleDelete = async cmdId => {
    if (!(await confirm({ message: 'Befehl wirklich löschen?' }))) return;

    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/commands/${cmdId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Löschen');
      }

      onChange(commands.filter(c => c.id !== cmdId));
      toast.success('Befehl gelöscht');
    } catch (err) {
      console.error('Befehl löschen fehlgeschlagen:', err);
      toast.error('Fehler beim Löschen des Befehls');
    }
  };

  // Toggle command enabled/disabled
  const handleToggleEnabled = async cmd => {
    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/commands/${cmd.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isEnabled: !(cmd.isEnabled ?? cmd.is_enabled ?? true),
        }),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Aktualisieren');
      }

      const data = await response.json();
      onChange(commands.map(c => (c.id === data.command.id ? data.command : c)));
    } catch (err) {
      console.error('Befehl aktualisieren fehlgeschlagen:', err);
      toast.error('Fehler beim Aktualisieren des Befehls');
    }
  };

  // Render command form (for new or editing)
  const renderForm = (data, isNew) => (
    <div className="command-form">
      {error && (
        <div className="command-form-error">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <div className="command-form-row">
        <div className="command-form-group command-name-group">
          <label>Befehl</label>
          <div className="command-name-input">
            <span className="command-prefix">/</span>
            <input
              type="text"
              value={data.command}
              onChange={e => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (isNew) {
                  setNewCommand(prev => ({ ...prev, command: value }));
                } else {
                  setEditingCommand(prev => ({ ...prev, command: value }));
                }
              }}
              placeholder="wetter"
              maxLength={32}
            />
          </div>
        </div>

        <div className="command-form-group command-desc-group">
          <label>Beschreibung</label>
          <input
            type="text"
            value={data.description}
            onChange={e => {
              if (isNew) {
                setNewCommand(prev => ({ ...prev, description: e.target.value }));
              } else {
                setEditingCommand(prev => ({ ...prev, description: e.target.value }));
              }
            }}
            placeholder="Zeigt das aktuelle Wetter"
            maxLength={256}
          />
        </div>
      </div>

      <div className="command-form-group">
        <label>Prompt-Vorlage</label>
        <textarea
          value={data.prompt}
          onChange={e => {
            if (isNew) {
              setNewCommand(prev => ({ ...prev, prompt: e.target.value }));
            } else {
              setEditingCommand(prev => ({ ...prev, prompt: e.target.value }));
            }
          }}
          placeholder="Du bist ein Wetter-Assistent. Der Nutzer fragt nach dem Wetter für: {eingabe}. Gib eine hilfreiche Antwort."
          rows={4}
        />
        <small>
          Verwende <code>{'{eingabe}'}</code> als Platzhalter für den Text nach dem Befehl (z.B.
          /wetter Berlin → {'{eingabe}'} = &quot;Berlin&quot;)
        </small>
      </div>

      <div className="command-form-actions">
        <button className="command-btn secondary" onClick={handleCancel} disabled={saving}>
          <FiX />
          Abbrechen
        </button>
        <button
          className="command-btn primary"
          onClick={isNew ? handleSaveNew : handleSaveEdit}
          disabled={saving}
        >
          <FiSave />
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="commands-editor">
      {/* Header */}
      <div className="commands-editor-header">
        <div className="commands-editor-info">
          <h4>Eigene Befehle</h4>
          <p>Definiere eigene Slash-Befehle mit KI-Prompts</p>
        </div>
        {!newCommand && !editingCommand && (
          <button className="commands-add-btn" onClick={handleAddNew}>
            <FiPlus />
            Neuer Befehl
          </button>
        )}
      </div>

      {/* New Command Form */}
      {newCommand && renderForm(newCommand, true)}

      {/* Commands List */}
      <div className="commands-list">
        {commands.length === 0 && !newCommand ? (
          <div className="commands-empty">
            <FiCommand className="commands-empty-icon" />
            <p>Keine Befehle definiert</p>
            <small>Erstelle deinen ersten eigenen Befehl</small>
          </div>
        ) : (
          commands.map(cmd =>
            editingCommand?.id === cmd.id ? (
              <div key={cmd.id} className="command-item editing">
                {renderForm(editingCommand, false)}
              </div>
            ) : (
              <div
                key={cmd.id}
                className={`command-item ${(cmd.isEnabled ?? cmd.is_enabled ?? true) ? '' : 'disabled'}`}
              >
                <div className="command-item-drag">
                  <FiMenu />
                </div>
                <div className="command-item-content">
                  <div className="command-item-header">
                    <span className="command-item-name">/{cmd.command}</span>
                    <span className="command-item-desc">{cmd.description}</span>
                  </div>
                  <div className="command-item-prompt">{cmd.prompt}</div>
                </div>
                <div className="command-item-actions">
                  <button
                    className={`command-toggle-btn ${(cmd.isEnabled ?? cmd.is_enabled ?? true) ? 'enabled' : ''}`}
                    onClick={() => handleToggleEnabled(cmd)}
                    title={
                      (cmd.isEnabled ?? cmd.is_enabled ?? true) ? 'Deaktivieren' : 'Aktivieren'
                    }
                  >
                    <span className="command-toggle-slider" />
                  </button>
                  <button
                    className="command-action-btn edit"
                    onClick={() => handleEdit(cmd)}
                    title="Bearbeiten"
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    className="command-action-btn delete"
                    onClick={() => handleDelete(cmd.id)}
                    title="Löschen"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            )
          )
        )}
      </div>

      {/* Built-in Commands Info */}
      <div className="commands-builtin-info">
        <h5>System-Befehle (nicht änderbar)</h5>
        <div className="commands-builtin-list">
          <div className="command-builtin-item">
            <span className="command-builtin-name">/start</span>
            <span className="command-builtin-desc">Bot starten</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/clear</span>
            <span className="command-builtin-desc">Kontext leeren (neues Gespräch)</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/help</span>
            <span className="command-builtin-desc">Hilfe anzeigen</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/commands</span>
            <span className="command-builtin-desc">Alle Befehle anzeigen</span>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default CommandsEditor;
