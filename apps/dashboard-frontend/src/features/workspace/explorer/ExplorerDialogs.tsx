import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { collectSubtreeIds } from './ExplorerPanel';
import type { TreeSpace, TreeDocument } from './ExplorerPanel';

export type ExplorerDialogState =
  | { kind: 'create'; parent: TreeSpace | null }
  | { kind: 'rename'; space: TreeSpace }
  | { kind: 'move'; space: TreeSpace; spaces: TreeSpace[] }
  | { kind: 'delete'; space: TreeSpace }
  | { kind: 'move-document'; document: TreeDocument; spaces: TreeSpace[] }
  | { kind: 'context-file'; space: TreeSpace };

interface ExplorerDialogsProps {
  dialog: ExplorerDialogState | null;
  onClose: () => void;
  onChanged: () => void;
}

const ROOT_VALUE = '__root__';

/**
 * Dialoge des Explorers: Ordner anlegen/umbenennen/verschieben/löschen,
 * Dokument verschieben, Kontextdatei bearbeiten. Alle Mutationen laufen
 * über useApi; onChanged lädt danach den Baum neu.
 */
export function ExplorerDialogs({ dialog, onClose, onChanged }: ExplorerDialogsProps) {
  const api = useApi();
  const toast = useToast();

  const [name, setName] = useState('');
  const [targetParent, setTargetParent] = useState<string>(ROOT_VALUE);
  const [contextContent, setContextContent] = useState('');
  const [contextExists, setContextExists] = useState(false);
  const [busy, setBusy] = useState(false);

  // Dialog-Wechsel: Felder initialisieren
  useEffect(() => {
    if (!dialog) return;
    setBusy(false);
    if (dialog.kind === 'rename') {
      setName(dialog.space.name);
    } else {
      setName('');
    }
    setTargetParent(ROOT_VALUE);
    if (dialog.kind === 'context-file') {
      setContextContent('');
      setContextExists(false);
      api
        .get<{ content: string | null }>(`/spaces/${dialog.space.id}/context-file`, {
          showError: false,
        })
        .then(data => {
          setContextContent(data.content ?? '');
          setContextExists(data.content !== null);
        })
        .catch(() => {
          /* leerer Editor, wenn Laden fehlschlägt */
        });
    }
  }, [dialog]);

  // Verschieben: eigener Teilbaum ist kein gültiges Ziel (Zyklus)
  const moveTargets = useMemo(() => {
    if (!dialog) return [];
    if (dialog.kind === 'move') {
      const forbidden = new Set(collectSubtreeIds(dialog.spaces, dialog.space.id));
      return dialog.spaces.filter(s => !forbidden.has(s.id));
    }
    if (dialog.kind === 'move-document') {
      return dialog.spaces;
    }
    return [];
  }, [dialog]);

  if (!dialog) return null;

  const run = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      onClose();
      onChanged();
    } catch {
      // Fehler-Toast kommt aus useApi
      setBusy(false);
    }
  };

  const parentValue = targetParent === ROOT_VALUE ? null : targetParent;

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        {dialog.kind === 'create' && (
          <>
            <DialogHeader>
              <DialogTitle>
                {dialog.parent ? `Neuer Unterordner in „${dialog.parent.name}“` : 'Neuer Ordner'}
              </DialogTitle>
              <DialogDescription>
                Ordner strukturieren dein Second Brain — Dokumente lassen sich später frei
                verschieben.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Ordnername"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) {
                  run(
                    () =>
                      api
                        .post('/spaces', {
                          name: name.trim(),
                          description: name.trim(),
                          parent_id: dialog.parent?.id ?? null,
                        })
                        .then(() => undefined),
                    'Ordner erstellt'
                  );
                }
              }}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={!name.trim() || busy}
                onClick={() =>
                  run(
                    () =>
                      api
                        .post('/spaces', {
                          name: name.trim(),
                          description: name.trim(),
                          parent_id: dialog.parent?.id ?? null,
                        })
                        .then(() => undefined),
                    'Ordner erstellt'
                  )
                }
              >
                Erstellen
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog.kind === 'rename' && (
          <>
            <DialogHeader>
              <DialogTitle>Ordner umbenennen</DialogTitle>
            </DialogHeader>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) {
                  run(
                    () =>
                      api
                        .put(`/spaces/${dialog.space.id}`, { name: name.trim() })
                        .then(() => undefined),
                    'Ordner umbenannt'
                  );
                }
              }}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={!name.trim() || busy}
                onClick={() =>
                  run(
                    () =>
                      api
                        .put(`/spaces/${dialog.space.id}`, { name: name.trim() })
                        .then(() => undefined),
                    'Ordner umbenannt'
                  )
                }
              >
                Speichern
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog.kind === 'move' && (
          <>
            <DialogHeader>
              <DialogTitle>„{dialog.space.name}“ verschieben</DialogTitle>
              <DialogDescription>
                Der eigene Teilbaum steht nicht zur Auswahl (keine Zyklen).
              </DialogDescription>
            </DialogHeader>
            <Select value={targetParent} onValueChange={setTargetParent}>
              <SelectTrigger>
                <SelectValue placeholder="Zielordner wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_VALUE}>Oberste Ebene</SelectItem>
                {moveTargets.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api
                        .put(`/spaces/${dialog.space.id}`, { parent_id: parentValue })
                        .then(() => undefined),
                    'Ordner verschoben'
                  )
                }
              >
                Verschieben
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog.kind === 'delete' && (
          <>
            <DialogHeader>
              <DialogTitle>„{dialog.space.name}“ löschen?</DialogTitle>
              <DialogDescription>
                Dokumente aus diesem Ordner wandern in den Standard-Bereich. Ordner mit Unterordnern
                können nicht gelöscht werden.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.del(`/spaces/${dialog.space.id}`).then(() => undefined),
                    'Ordner gelöscht'
                  )
                }
              >
                Löschen
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog.kind === 'move-document' && (
          <>
            <DialogHeader>
              <DialogTitle>„{dialog.document.filename}“ verschieben</DialogTitle>
            </DialogHeader>
            <Select value={targetParent} onValueChange={setTargetParent}>
              <SelectTrigger>
                <SelectValue placeholder="Zielordner wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_VALUE}>Kein Ordner (Wurzel)</SelectItem>
                {moveTargets.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api
                        .put(`/documents/${dialog.document.id}/move`, { space_id: parentValue })
                        .then(() => undefined),
                    'Dokument verschoben'
                  )
                }
              >
                Verschieben
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog.kind === 'context-file' && (
          <>
            <DialogHeader>
              <DialogTitle>Kontextdatei: „{dialog.space.name}“</DialogTitle>
              <DialogDescription>
                Dieser Text wird dem KI-Assistenten automatisch mitgegeben, wenn der Chat auf diesen
                Ordner eingegrenzt ist (wie eine CLAUDE.md für den Ordner). Er wird nicht als
                Dokument indexiert.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={12}
              placeholder={'# Kontext\n\nWas soll die KI über diesen Ordner wissen?'}
              value={contextContent}
              onChange={e => setContextContent(e.target.value)}
              className="font-mono text-xs"
            />
            <DialogFooter>
              {contextExists && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        api.del(`/spaces/${dialog.space.id}/context-file`).then(() => undefined),
                      'Kontextdatei gelöscht'
                    )
                  }
                >
                  Löschen
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={busy || !contextContent.trim()}
                onClick={() =>
                  run(
                    () =>
                      api
                        .put(`/spaces/${dialog.space.id}/context-file`, {
                          content: contextContent,
                        })
                        .then(() => undefined),
                    'Kontextdatei gespeichert'
                  )
                }
              >
                Speichern
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
