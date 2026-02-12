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
import useConfirm from '../../hooks/useConfirm';

function CommandsEditor({ botId, commands, onChange, getAuthHeaders }) {
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
      setNewCommand(null);
    } catch (err) {
      setError(err.message);
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
      setEditingCommand(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete command
  const handleDelete = async cmdId => {
    if (!(await confirm({ message: 'Command wirklich löschen?' }))) return;

    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/commands/${cmdId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Loeschen');
      }

      onChange(commands.filter(c => c.id !== cmdId));
    } catch (err) {
      alert(err.message);
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
      alert(err.message);
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
          <label>Command</label>
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
        <label>Prompt Template</label>
        <textarea
          value={data.prompt}
          onChange={e => {
            if (isNew) {
              setNewCommand(prev => ({ ...prev, prompt: e.target.value }));
            } else {
              setEditingCommand(prev => ({ ...prev, prompt: e.target.value }));
            }
          }}
          placeholder="Du bist ein Wetter-Assistent. Der Nutzer fragt nach dem Wetter fuer: {args}. Gib eine hilfreiche Antwort."
          rows={4}
        />
        <small>
          Verwende <code>{'{args}'}</code> fuer Parameter nach dem Command (z.B. /wetter Berlin)
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
          <h4>Custom Commands</h4>
          <p>Definiere eigene Slash-Commands mit LLM-Prompts</p>
        </div>
        {!newCommand && !editingCommand && (
          <button className="commands-add-btn" onClick={handleAddNew}>
            <FiPlus />
            Neuer Command
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
            <p>Keine Commands definiert</p>
            <small>Erstelle deinen ersten Custom Command</small>
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
                    title="Loeschen"
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
        <h5>Eingebaute Commands</h5>
        <div className="commands-builtin-list">
          <div className="command-builtin-item">
            <span className="command-builtin-name">/start</span>
            <span className="command-builtin-desc">Startet den Bot</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/help</span>
            <span className="command-builtin-desc">Zeigt Hilfe</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/new</span>
            <span className="command-builtin-desc">Neue Konversation</span>
          </div>
          <div className="command-builtin-item">
            <span className="command-builtin-name">/commands</span>
            <span className="command-builtin-desc">Listet alle Commands</span>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default CommandsEditor;
