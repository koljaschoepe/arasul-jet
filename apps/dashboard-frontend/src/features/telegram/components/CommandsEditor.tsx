/**
 * CommandsEditor - Editor for managing bot custom commands
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Terminal, AlertCircle, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import useConfirm from '../../../hooks/useConfirm';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';

interface BotCommand {
  id: number;
  command: string;
  description: string;
  prompt: string;
  isEnabled?: boolean;
  is_enabled?: boolean;
}

interface CommandsEditorProps {
  botId: number;
  commands: BotCommand[];
  onChange: (commands: BotCommand[]) => void;
}

interface NewCommandData {
  command: string;
  description: string;
  prompt: string;
  isEnabled: boolean;
}

interface EditingCommandData extends BotCommand {
  command: string;
}

interface CommandApiResponse {
  command: BotCommand;
}

function CommandsEditor({ botId, commands, onChange }: CommandsEditorProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingCommand, setEditingCommand] = useState<EditingCommandData | null>(null);
  const [newCommand, setNewCommand] = useState<NewCommandData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const handleEdit = (cmd: BotCommand) => {
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
    if (!newCommand?.command || !newCommand.description || !newCommand.prompt) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = await api.post<CommandApiResponse>(
        `/telegram-bots/${botId}/commands`,
        {
          command: newCommand.command.replace(/^\//, ''),
          description: newCommand.description,
          prompt: newCommand.prompt,
        },
        { showError: false }
      );

      onChange([...commands, data.command]);
      toast.success('Befehl erstellt');
      setNewCommand(null);
    } catch (err: unknown) {
      console.error('Befehl erstellen fehlgeschlagen:', err);
      const e = err as { message?: string };
      setError(e.message || 'Fehler beim Erstellen des Befehls');
    } finally {
      setSaving(false);
    }
  };

  // Update existing command
  const handleSaveEdit = async () => {
    if (!editingCommand?.command || !editingCommand.description || !editingCommand.prompt) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = await api.put<CommandApiResponse>(
        `/telegram-bots/${botId}/commands/${editingCommand.id}`,
        {
          command: editingCommand.command.replace(/^\//, ''),
          description: editingCommand.description,
          prompt: editingCommand.prompt,
          isEnabled: editingCommand.isEnabled,
        },
        { showError: false }
      );

      onChange(commands.map(c => (c.id === data.command.id ? data.command : c)));
      toast.success('Befehl gespeichert');
      setEditingCommand(null);
    } catch (err: unknown) {
      console.error('Befehl speichern fehlgeschlagen:', err);
      const e = err as { message?: string };
      setError(e.message || 'Fehler beim Speichern des Befehls');
    } finally {
      setSaving(false);
    }
  };

  // Delete command
  const handleDelete = async (cmdId: number) => {
    if (!(await confirm({ message: 'Befehl wirklich löschen?' }))) return;

    try {
      await api.del(`/telegram-bots/${botId}/commands/${cmdId}`, { showError: false });

      onChange(commands.filter(c => c.id !== cmdId));
      toast.success('Befehl gelöscht');
    } catch (err: unknown) {
      console.error('Befehl löschen fehlgeschlagen:', err);
      toast.error('Fehler beim Löschen des Befehls');
    }
  };

  // Toggle command enabled/disabled
  const handleToggleEnabled = async (cmd: BotCommand) => {
    try {
      const data = await api.put<CommandApiResponse>(
        `/telegram-bots/${botId}/commands/${cmd.id}`,
        {
          isEnabled: !(cmd.isEnabled ?? cmd.is_enabled ?? true),
        },
        { showError: false }
      );

      onChange(commands.map(c => (c.id === data.command.id ? data.command : c)));
    } catch (err: unknown) {
      console.error('Befehl aktualisieren fehlgeschlagen:', err);
      toast.error('Fehler beim Aktualisieren des Befehls');
    }
  };

  // Render command form (for new or editing)
  const renderForm = (data: NewCommandData | EditingCommandData, isNew: boolean) => (
    <div className="p-4 bg-card border border-border rounded-xl mb-4">
      {error && (
        <div className="flex items-center gap-2 py-2.5 px-3.5 mb-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 mb-4">
        <div className="mb-4">
          <Label className="mb-1.5">Befehl</Label>
          <div className="flex items-center gap-0 bg-background border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50">
            <span className="px-3 text-muted-foreground bg-card border-r border-border text-sm font-mono">
              /
            </span>
            <input
              type="text"
              value={data.command}
              onChange={e => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (isNew) {
                  setNewCommand(prev => (prev ? { ...prev, command: value } : prev));
                } else {
                  setEditingCommand(prev => (prev ? { ...prev, command: value } : prev));
                }
              }}
              placeholder="wetter"
              maxLength={32}
              className="flex-1 py-2.5 px-3 bg-transparent border-none text-foreground text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-4">
          <Label className="mb-1.5">Beschreibung</Label>
          <Input
            type="text"
            value={data.description}
            onChange={e => {
              if (isNew) {
                setNewCommand(prev => (prev ? { ...prev, description: e.target.value } : prev));
              } else {
                setEditingCommand(prev => (prev ? { ...prev, description: e.target.value } : prev));
              }
            }}
            placeholder="Zeigt das aktuelle Wetter"
            maxLength={256}
          />
        </div>
      </div>

      <div className="mb-4">
        <Label className="mb-1.5">Prompt-Vorlage</Label>
        <Textarea
          value={data.prompt}
          onChange={e => {
            if (isNew) {
              setNewCommand(prev => (prev ? { ...prev, prompt: e.target.value } : prev));
            } else {
              setEditingCommand(prev => (prev ? { ...prev, prompt: e.target.value } : prev));
            }
          }}
          placeholder="Du bist ein Wetter-Assistent. Der Nutzer fragt nach dem Wetter für: {eingabe}. Gib eine hilfreiche Antwort."
          rows={4}
        />
        <small className="block mt-1.5 text-muted-foreground text-xs">
          Verwende <code>{'{eingabe}'}</code> als Platzhalter für den Text nach dem Befehl (z.B.
          /wetter Berlin &rarr; {'{eingabe}'} = &quot;Berlin&quot;)
        </small>
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          <X size={14} />
          Abbrechen
        </Button>
        <Button onClick={isNew ? handleSaveNew : handleSaveEdit} disabled={saving}>
          <Save size={14} />
          {saving ? 'Speichern...' : 'Speichern'}
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="m-0 text-foreground text-base">Eigene Befehle</h4>
          <p className="m-0 mt-1 text-muted-foreground text-sm">
            Definiere eigene Slash-Befehle mit KI-Prompts
          </p>
        </div>
        {!newCommand && !editingCommand && (
          <Button onClick={handleAddNew}>
            <Plus size={16} />
            Neuer Befehl
          </Button>
        )}
      </div>

      {/* New Command Form */}
      {newCommand && renderForm(newCommand, true)}

      {/* Commands List */}
      <div className="flex flex-col gap-2">
        {commands.length === 0 && !newCommand ? (
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <Terminal className="text-3xl mb-3 text-muted-foreground/60" size={32} />
            <p>Keine Befehle definiert</p>
            <small>Erstelle deinen ersten eigenen Befehl</small>
          </div>
        ) : (
          commands.map(cmd =>
            editingCommand?.id === cmd.id ? (
              <div key={cmd.id} className="p-0 border-none bg-transparent">
                {renderForm(editingCommand, false)}
              </div>
            ) : (
              <div
                key={cmd.id}
                className={cn(
                  'flex items-center gap-3 p-3 bg-card border border-border rounded-lg transition-all hover:border-primary/30',
                  !(cmd.isEnabled ?? cmd.is_enabled ?? true) && 'opacity-50'
                )}
              >
                <div className="text-muted-foreground cursor-grab">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-primary">
                      /{cmd.command}
                    </span>
                    <span className="text-xs text-muted-foreground">{cmd.description}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{cmd.prompt}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className={cn(
                      'relative w-10 h-[22px] rounded-full cursor-pointer transition-all border',
                      (cmd.isEnabled ?? cmd.is_enabled ?? true)
                        ? 'bg-primary border-primary'
                        : 'bg-background border-border'
                    )}
                    onClick={() => handleToggleEnabled(cmd)}
                    title={
                      (cmd.isEnabled ?? cmd.is_enabled ?? true) ? 'Deaktivieren' : 'Aktivieren'
                    }
                  >
                    <span
                      className={cn(
                        'absolute top-[2px] left-[2px] size-4 bg-white rounded-full transition-transform',
                        (cmd.isEnabled ?? cmd.is_enabled ?? true) && 'translate-x-[18px]'
                      )}
                    />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleEdit(cmd)}
                    title="Bearbeiten"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(cmd.id)}
                    title="Löschen"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )
          )
        )}
      </div>

      {/* Built-in Commands Info */}
      <div className="mt-6 pt-4 border-t border-border">
        <h5 className="m-0 mb-3 text-foreground text-sm">System-Befehle (nicht änderbar)</h5>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 py-1.5">
            <span className="font-mono text-sm text-primary min-w-[100px]">/start</span>
            <span className="text-[0.825rem] text-muted-foreground">Bot starten</span>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <span className="font-mono text-sm text-primary min-w-[100px]">/clear</span>
            <span className="text-[0.825rem] text-muted-foreground">
              Kontext leeren (neues Gespräch)
            </span>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <span className="font-mono text-sm text-primary min-w-[100px]">/help</span>
            <span className="text-[0.825rem] text-muted-foreground">Hilfe anzeigen</span>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <span className="font-mono text-sm text-primary min-w-[100px]">/commands</span>
            <span className="text-[0.825rem] text-muted-foreground">Alle Befehle anzeigen</span>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default CommandsEditor;
