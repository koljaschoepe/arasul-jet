/**
 * EditProjectDialog - Modal to edit an existing sandbox project
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Save } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import type { SandboxProject } from './types';

interface EditProjectDialogProps {
  project: SandboxProject | null;
  onClose: () => void;
  onUpdated: (project: SandboxProject) => void;
}

export default function EditProjectDialog({ project, onClose, onUpdated }: EditProjectDialogProps) {
  const api = useApi();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [networkMode, setNetworkMode] = useState<'isolated' | 'internal'>('isolated');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields when project changes
  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setDescription(project.description || '');
      setNetworkMode(project.network_mode === 'internal' ? 'internal' : 'isolated');
      setError(null);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!name.trim()) {
      setError('Projektname ist erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = await api.put<{ project: SandboxProject }>(
        `/sandbox/projects/${project.id}`,
        {
          name: name.trim(),
          description: description.trim() || null,
          network_mode: networkMode,
        },
        { showError: false }
      );
      toast.success(`Projekt "${data.project.name}" aktualisiert`);
      onUpdated(data.project);
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      setError(e.data?.message || e.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!project}
      onClose={onClose}
      title="Projekt bearbeiten"
      size="medium"
      footer={
        <div className="flex items-center justify-end w-full max-sm:flex-col max-sm:gap-3">
          <div className="flex gap-3 max-sm:w-full max-sm:ml-0">
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
              disabled={saving || !name.trim()}
              onClick={handleSubmit}
            >
              {saving ? (
                'Speichere...'
              ) : (
                <>
                  <Save className="size-4" />
                  Speichern
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep-name">Projektname</Label>
          <Input
            id="ep-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Web Scraper, ML Pipeline, API Server..."
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep-desc" className="flex items-center gap-1.5">
            Beschreibung <span className="font-normal text-muted-foreground text-xs">optional</span>
          </Label>
          <Textarea
            id="ep-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Woran arbeitest du in diesem Projekt?"
            rows={2}
            maxLength={500}
            className="resize-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Netzwerk</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNetworkMode('isolated')}
              className={`flex-1 px-3 py-2 rounded-md border text-xs text-left transition-colors ${
                networkMode === 'isolated'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:border-primary/50'
              }`}
            >
              <div className="font-medium">Isoliert</div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Nur Internet, kein Zugriff auf interne Services
              </div>
            </button>
            <button
              type="button"
              onClick={() => setNetworkMode('internal')}
              className={`flex-1 px-3 py-2 rounded-md border text-xs text-left transition-colors ${
                networkMode === 'internal'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:border-primary/50'
              }`}
            >
              <div className="font-medium">Internes Netzwerk</div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Zugriff auf KI-Services + Datenbank
              </div>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Netzwerk-Änderungen werden beim nächsten Container-Start wirksam.
          </p>
        </div>
      </form>
    </Modal>
  );
}
