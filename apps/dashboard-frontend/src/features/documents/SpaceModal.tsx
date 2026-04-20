import React, { memo, useState, useEffect } from 'react';
import { Save, AlertCircle, Check, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';

const descriptionTemplate = `**Inhalt:** Beschreiben Sie, welche Dokumente dieser Bereich enthält.

**Zweck:** Wofür werden diese Dokumente genutzt?

**Typische Fragen:**
- Frage 1, die dieser Bereich beantworten kann
- Frage 2
- Frage 3`;

interface Space {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
  is_system?: boolean;
}

interface SpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (space: Space | null) => void;
  space?: Space | null;
  mode?: 'create' | 'edit';
}

const SpaceModal = memo(function SpaceModal({
  isOpen,
  onClose,
  onSave,
  space = null,
  mode = 'create',
}: SpaceModalProps) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState(descriptionTemplate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset form when modal opens/closes or space changes
  useEffect(() => {
    if (isOpen) {
      if (space && mode === 'edit') {
        setName(space.name || '');
        setDescription(space.description || '');
      } else {
        setName('');
        setDescription(descriptionTemplate);
      }
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, space, mode]);

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
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
        icon: space?.icon || 'folder',
        color: space?.color || '#45ADFF',
      };

      let data;
      if (mode === 'edit' && space?.id) {
        data = await api.put(`/spaces/${space.id}`, payload, { showError: false });
      } else {
        data = await api.post('/spaces', payload, { showError: false });
      }

      setSuccess(mode === 'edit' ? 'Bereich aktualisiert' : 'Bereich erstellt');

      setTimeout(() => {
        onSave(data.space || data);
        onClose();
      }, 500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Unbekannter Fehler');
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
      await api.del(`/spaces/${space.id}`, { showError: false });

      setSuccess('Bereich gelöscht');
      setTimeout(() => {
        onSave(null); // Signal deletion
        onClose();
      }, 500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Bereich bearbeiten' : 'Neuen Wissensbereich erstellen'}
      size="medium"
      footer={
        <div className="flex justify-between items-center w-full max-sm:flex-col max-sm:gap-3">
          {mode === 'edit' && space && !space.is_default && !space.is_system && (
            <Button
              type="button"
              variant="destructive"
              className="max-sm:w-full max-sm:justify-center"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 />
              Löschen
            </Button>
          )}
          <div className="flex gap-3 ml-auto max-sm:w-full max-sm:ml-0">
            <Button
              type="button"
              variant="outline"
              className="max-sm:flex-1 max-sm:justify-center"
              onClick={onClose}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              className="max-sm:flex-1 max-sm:justify-center"
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? (
                'Speichern...'
              ) : (
                <>
                  <Save />
                  {mode === 'edit' ? 'Speichern' : 'Erstellen'}
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="p-6 flex flex-col gap-5">
        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm">
            <Check className="size-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="space-name">Name</Label>
          <Input
            id="space-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Vertrieb, Technik, Recht..."
            maxLength={100}
            disabled={space?.is_default || space?.is_system}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="space-description" className="flex items-center gap-1.5">
            Beschreibung
            <span className="font-normal text-muted-foreground text-xs">
              wird für intelligentes Routing genutzt
            </span>
          </Label>
          <Textarea
            id="space-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Beschreiben Sie, was dieser Bereich enthält..."
            rows={8}
            className="resize-y min-h-[150px] font-mono leading-relaxed"
          />
          <p className="text-xs text-muted-foreground italic">
            Je präziser die Beschreibung, desto besser findet die KI relevante Dokumente.
          </p>
        </div>
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default SpaceModal;
