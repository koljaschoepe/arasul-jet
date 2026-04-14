/**
 * CreateProjectDialog - Modal to create a new sandbox project
 */

import { useState } from 'react';
import { Folder, AlertCircle } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import type { SandboxProject } from './types';

// Icon options for projects
const PROJECT_ICONS = [
  'terminal',
  'code',
  'box',
  'cpu',
  'globe',
  'database',
  'zap',
  'flask',
  'rocket',
  'puzzle',
];
const PROJECT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#ec4899',
];

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: SandboxProject) => void;
}

export default function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: CreateProjectDialogProps) {
  const api = useApi();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('terminal');
  const [color, setColor] = useState('#3b82f6');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Projektname ist erforderlich');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const data = await api.post<{ project: SandboxProject }>(
        '/sandbox/projects',
        { name: name.trim(), description: description.trim() || null, icon, color },
        { showError: false }
      );
      toast.success(`Projekt "${data.project.name}" erstellt`);
      onCreated(data.project);
      handleReset();
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      setError(e.data?.message || e.message || 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = () => {
    setName('');
    setDescription('');
    setIcon('terminal');
    setColor('#3b82f6');
    setError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={handleClose} title="Neues Projekt erstellen">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Projektname *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Web Scraper, ML Pipeline, API Server..."
            className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Beschreibung</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Woran arbeitest du in diesem Projekt?"
            className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Icon</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_ICONS.map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`w-9 h-9 rounded-md border text-xs font-mono flex items-center justify-center transition-colors ${
                  icon === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground hover:border-primary/50'
                }`}
              >
                {i.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Farbe</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50 text-xs text-muted-foreground">
          <Folder className="size-4 shrink-0" />
          <span>
            Jedes Projekt erhält einen eigenen Workspace-Ordner und Docker-Container. Installierte
            Pakete bleiben erhalten.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={creating}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!name.trim() || creating}>
            {creating ? 'Erstelle...' : 'Projekt erstellen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
