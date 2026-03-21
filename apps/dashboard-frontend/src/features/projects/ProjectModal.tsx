import React, { memo, useState, useEffect } from 'react';
import { Save, AlertCircle, Check, Trash2, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import Modal from '../../components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';

const DEFAULT_COLOR = '#45ADFF';

interface Space {
  id: string;
  name: string;
  document_count?: number;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  knowledge_space_id?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: any) => void;
  project?: Project | null;
  mode?: 'create' | 'edit';
}

const ProjectModal = memo(function ProjectModal({
  isOpen,
  onClose,
  onSave,
  project = null,
  mode = 'create',
}: ProjectModalProps) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [knowledgeSpaceId, setKnowledgeSpaceId] = useState('');
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    api
      .get('/spaces', { signal: controller.signal, showError: false })
      .then((data: any) => setSpaces(data.spaces || []))
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen, api]);

  useEffect(() => {
    if (isOpen) {
      if (project && mode === 'edit') {
        setName(project.name || '');
        setDescription(project.description || '');
        setSystemPrompt(project.system_prompt || '');
        setKnowledgeSpaceId(project.knowledge_space_id || '');
      } else {
        setName('');
        setDescription('');
        setSystemPrompt('');
        setKnowledgeSpaceId('');
      }
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, project, mode]);

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bitte geben Sie einen Namen ein');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        icon: project?.icon || 'folder',
        color: project?.color || DEFAULT_COLOR,
        knowledge_space_id: knowledgeSpaceId || null,
      };
      let data;
      if (mode === 'edit' && project?.id) {
        data = await api.put(`/projects/${project.id}`, payload, { showError: false });
      } else {
        data = await api.post('/projects', payload, { showError: false });
      }
      setSuccess(mode === 'edit' ? 'Projekt aktualisiert' : 'Projekt erstellt');
      setTimeout(() => {
        onSave(data.project || data);
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id) return;
    if (
      !(await confirm({
        message: `Projekt "${project.name}" wirklich löschen? Chats werden zum Standard-Projekt verschoben.`,
      }))
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.del(`/projects/${project.id}`, { showError: false });
      setSuccess('Projekt gelöscht');
      setTimeout(() => {
        onSave(null);
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
      title={mode === 'edit' ? 'Projekt bearbeiten' : 'Neues Projekt'}
      size="medium"
      footer={
        <div className="flex items-center justify-between w-full max-sm:flex-col max-sm:gap-3">
          {mode === 'edit' && project && !project.is_default && (
            <Button
              type="button"
              variant="destructive"
              className="max-sm:w-full max-sm:justify-center"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 className="size-4" />
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
              disabled={saving || !name.trim()}
              onClick={handleSubmit}
            >
              {saving ? (
                'Speichern...'
              ) : (
                <>
                  <Save className="size-4" />
                  {mode === 'edit' ? 'Speichern' : 'Erstellen'}
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="p-6 flex flex-col gap-5">
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-medium bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-medium bg-primary/10 border border-primary/30 text-primary">
            <Check className="size-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pm-name" className="flex items-center gap-1.5">
            Name
          </Label>
          <Input
            id="pm-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Kundenservice, Marketing..."
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pm-desc" className="flex items-center gap-1.5">
            Beschreibung <span className="font-normal text-muted-foreground text-xs">optional</span>
          </Label>
          <Input
            id="pm-desc"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Wofür ist dieses Projekt?"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pm-prompt" className="flex items-center gap-1.5">
            System-Prompt{' '}
            <span className="font-normal text-muted-foreground text-xs">
              Anweisungen für die KI
            </span>
          </Label>
          <Textarea
            id="pm-prompt"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Du bist ein Experte für... Antworte immer auf Deutsch..."
            rows={5}
            className="resize-y min-h-[100px] font-mono leading-relaxed"
          />
          {systemPrompt.length > 0 && (
            <div
              className={cn(
                'self-end text-xs text-muted-foreground',
                systemPrompt.length > 2000 && 'text-muted-foreground'
              )}
            >
              {systemPrompt.length} / 2000
            </div>
          )}
        </div>

        {spaces.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pm-space" className="flex items-center gap-1.5">
              <Database className="size-4 text-muted-foreground" />
              Knowledge Space{' '}
              <span className="font-normal text-muted-foreground text-xs">
                RAG auf Bereich einschränken
              </span>
            </Label>
            <Select
              value={knowledgeSpaceId || 'none'}
              onValueChange={val => setKnowledgeSpaceId(val === 'none' ? '' : val)}
            >
              <SelectTrigger id="pm-space" className="w-full">
                <SelectValue placeholder="Kein Space (globale Suche)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Space (globale Suche)</SelectItem>
                {spaces.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.document_count || 0} Dokumente)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default ProjectModal;
