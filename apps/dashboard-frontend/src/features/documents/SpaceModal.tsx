import React, { memo, useState, useEffect } from 'react';
import { Folder, Save, AlertCircle, Check, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { cn } from '@/lib/utils';

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
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        icon,
        color,
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
    } catch (err: any) {
      setError(err.data?.error || err.message);
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
    } catch (err: any) {
      setError(err.data?.error || err.message);
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
          <Folder style={{ color }} />
          {mode === 'edit' ? ' Bereich bearbeiten' : ' Neuen Wissensbereich erstellen'}
        </>
      }
      size="medium"
      className="space-modal-wrapper"
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
      <div className="flex-1 overflow-y-auto p-6 max-sm:p-5">
        {/* Messages */}
        {error && (
          <div className="flex items-center gap-3 p-3.5 rounded-md text-sm font-medium mb-4 animate-[fadeIn_0.2s_ease] bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertCircle className="shrink-0 w-[1.15rem] h-[1.15rem]" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 p-3.5 rounded-md text-sm font-medium mb-4 animate-[fadeIn_0.2s_ease] bg-primary/10 border border-primary/30 text-primary">
            <Check className="shrink-0 w-[1.15rem] h-[1.15rem]" />
            <span>{success}</span>
          </div>
        )}

        {/* Name */}
        <div className="mb-5 last:mb-0">
          <Label htmlFor="space-name" className="mb-2">
            Name
          </Label>
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

        {/* Icon and Color */}
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <div className="mb-0">
            <Label className="mb-2">Icon</Label>
            <div className="flex flex-wrap gap-2">
              {SPACE_ICONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'size-9 bg-background border-2 border-border rounded-md text-muted-foreground cursor-pointer flex items-center justify-center transition-all hover:border-[var(--border-input-focus)] hover:text-muted-foreground',
                    icon === opt.value && 'bg-primary/10 border-primary text-primary'
                  )}
                  onClick={() => setIcon(opt.value)}
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={icon === opt.value}
                >
                  <Folder className="size-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="mb-0 max-sm:mb-5">
            <Label className="mb-2">Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {SPACE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'size-7 border-2 border-transparent rounded-full cursor-pointer transition-all hover:scale-115',
                    color === c && 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.3)] scale-110'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Farbe ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mb-5 last:mb-0 mt-5">
          <Label htmlFor="space-description" className="mb-2">
            Beschreibung
            <span className="font-normal text-muted-foreground text-xs ml-2">
              (wird für intelligentes Routing genutzt)
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
          <p className="mt-2 text-xs text-muted-foreground italic m-0">
            Je präziser die Beschreibung, desto besser findet die KI relevante Dokumente.
          </p>
        </div>
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default SpaceModal;
