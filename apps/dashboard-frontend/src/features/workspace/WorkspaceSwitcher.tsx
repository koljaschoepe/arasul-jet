import { useState } from 'react';
import { Boxes, Check, ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { useToast } from '@/contexts/ToastContext';
import { useProjects, useActiveProject } from './useProjects';

/**
 * Projekt-Switcher (Workspace-Neuausrichtung Batch 2) — prominenter Umschalter
 * oben in der Shell. Ein Projekt ist die oberste Ebene über den Ordnern; der
 * Wechsel bestimmt, welche Ordner der Explorer zeigt und worüber Suche/Agenten
 * laufen. Über „Neues Projekt" wird ein Projekt angelegt und direkt aktiviert.
 */
export function WorkspaceSwitcher() {
  const toast = useToast();
  const { projects, createProject } = useProjects();
  const { activeProject, setActive } = useActiveProject();

  const [dialogOffen, setDialogOffen] = useState(false);
  const [name, setName] = useState('');
  const [beschreibung, setBeschreibung] = useState('');

  const label = activeProject?.name ?? 'Standard';

  const anlegen = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await createProject.mutateAsync({
        name: trimmed,
        description: beschreibung.trim() || null,
      });
      await setActive.mutateAsync(res.data.id);
      toast.success(`Projekt „${trimmed}" angelegt und aktiviert`);
      setDialogOffen(false);
      setName('');
      setBeschreibung('');
    } catch {
      toast.error('Projekt konnte nicht angelegt werden');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-6 max-w-56 items-center gap-1.5 rounded px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent data-[state=open]:bg-accent"
          aria-label="Projekt wechseln"
          title="Projekt wechseln"
        >
          <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Projekt</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length === 0 && <DropdownMenuItem disabled>Keine Projekte</DropdownMenuItem>}
          {projects.map(project => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => setActive.mutate(project.id)}
              disabled={setActive.isPending}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">
                {project.folder_count}
              </span>
              {activeProject?.id === project.id && (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOffen(true)}>
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Neues Projekt …
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neues Projekt</DialogTitle>
            <DialogDescription>
              Ein Projekt bündelt mehrere Ordner. Das aktive Projekt begrenzt, welche Ordner
              sichtbar sind und worüber Suche und Agenten laufen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projekt-name">Name</Label>
              <Input
                id="projekt-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="z. B. Marketing"
                maxLength={100}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void anlegen();
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projekt-beschreibung">Beschreibung (optional)</Label>
              <Textarea
                id="projekt-beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder="Wofür ist dieses Projekt?"
                rows={2}
                className="resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={anlegen} disabled={!name.trim() || createProject.isPending}>
              {createProject.isPending ? 'Legt an …' : 'Anlegen & aktivieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
