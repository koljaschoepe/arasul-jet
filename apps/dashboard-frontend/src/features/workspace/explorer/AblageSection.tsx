/**
 * AblageSection — die Projektablage (echter Geräte-Ordner des aktiven Projekts)
 * als eigener Bereich im Explorer, unter dem Wissensraum-Baum.
 *
 * Zeigt `data/projects/<uuid>` vom Gerät: Dateien öffnen (eigener Editor-Tab),
 * anlegen, umbenennen, löschen, hochladen, herunterladen — und einzelne Dateien
 * per Klick in den Wissensraum übernehmen (dann kennt auch das RAG sie).
 * Sandboxes und Flows arbeiten im selben Ordner; was ein Agent dort baut,
 * erscheint hier nach dem nächsten Aktualisieren.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileCode,
  FileImage,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/shadcn/context-menu';
import Modal, { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';

export interface AblageEintrag {
  pfad: string;
  name: string;
  typ: 'ordner' | 'datei';
  groesse: number | null;
  geaendert: string | null;
}

interface AblageResponse {
  data: { eintraege: AblageEintrag[]; gekuerzt: boolean };
}

type AblageDialog =
  | { kind: 'neu-datei'; ordner: string | null }
  | { kind: 'neu-ordner'; ordner: string | null }
  | { kind: 'umbenennen'; eintrag: AblageEintrag }
  | { kind: 'loeschen'; eintrag: AblageEintrag };

function dateiIcon(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return <FileImage className="h-3.5 w-3.5 shrink-0" />;
  if (
    ['js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'json', 'yaml', 'yml', 'html', 'css', 'sql'].includes(
      ext
    )
  )
    return <FileCode className="h-3.5 w-3.5 shrink-0" />;
  if (['md', 'markdown', 'txt', 'pdf'].includes(ext))
    return <FileText className="h-3.5 w-3.5 shrink-0" />;
  return <FileIcon className="h-3.5 w-3.5 shrink-0" />;
}

export function AblageSection({ projectId }: { projectId: string | undefined }) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const openTab = useWorkspaceStore(s => s.openTab);

  const [offen, setOffen] = useState(true);
  const [offeneOrdner, setOffeneOrdner] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<AblageDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const uploadZielRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const queryKey = ['projekt-ablage', projectId];
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    enabled: !!projectId && offen,
    queryFn: () => api.get<AblageResponse>(`/projects/${projectId}/dateien`, { showError: false }),
    staleTime: 5_000,
    refetchInterval: 20_000,
  });
  const eintraege = useMemo(() => data?.data.eintraege ?? [], [data]);

  // Kinder je Ordner-Pfad ('' = Wurzel) — der Baum kommt flach mit Pfaden.
  const kinderVon = useMemo(() => {
    const map = new Map<string, AblageEintrag[]>();
    for (const e of eintraege) {
      const idx = e.pfad.lastIndexOf('/');
      const eltern = idx >= 0 ? e.pfad.slice(0, idx) : '';
      const liste = map.get(eltern) ?? [];
      liste.push(e);
      map.set(eltern, liste);
    }
    return map;
  }, [eintraege]);

  const neuLaden = () => qc.invalidateQueries({ queryKey });

  const toggleOrdner = (pfad: string) =>
    setOffeneOrdner(prev => {
      const neu = new Set(prev);
      if (neu.has(pfad)) neu.delete(pfad);
      else neu.add(pfad);
      return neu;
    });

  const oeffneDatei = (e: AblageEintrag) => {
    if (!projectId) return;
    openTab({ type: 'projektdatei', projectId, filePath: e.pfad, title: e.name });
  };

  const download = async (pfad: string | null, name: string) => {
    try {
      const q = pfad ? `?pfad=${encodeURIComponent(pfad)}` : '';
      const res = await api.get<Response>(`/projects/${projectId}/dateien/download${q}`, {
        raw: true,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  const uebernehmen = useMutation({
    mutationFn: (pfad: string) =>
      api.post<{ data: { filename: string } }>(`/projects/${projectId}/dateien/uebernehmen`, {
        pfad,
      }),
    onSuccess: res => {
      toast.success(`„${res.data.filename}" in den Wissensraum übernommen`);
      qc.invalidateQueries({ queryKey: ['spaces'] });
    },
    onError: err => toast.error((err as ApiError).message || 'Übernahme fehlgeschlagen'),
  });

  const hochladen = async (files: FileList) => {
    if (!projectId) return;
    const ziel = uploadZielRef.current;
    let fehler = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      if (ziel) form.append('ordner', ziel);
      try {
        await api.post(`/projects/${projectId}/dateien/upload`, form, { showError: false });
      } catch (err) {
        fehler += 1;
        toast.error(`„${file.name}": ${(err as ApiError).message || 'Upload fehlgeschlagen'}`);
      }
    }
    if (files.length > fehler) toast.success('In die Ablage hochgeladen');
    neuLaden();
  };

  const dialogBestaetigen = async () => {
    if (!dialog || !projectId) return;
    const name = dialogName.trim();
    try {
      if (dialog.kind === 'neu-datei') {
        if (!name) return;
        const pfad = dialog.ordner ? `${dialog.ordner}/${name}` : name;
        await api.put(`/projects/${projectId}/dateien/inhalt`, { pfad, inhalt: '' });
        openTab({ type: 'projektdatei', projectId, filePath: pfad, title: name });
      } else if (dialog.kind === 'neu-ordner') {
        if (!name) return;
        const pfad = dialog.ordner ? `${dialog.ordner}/${name}` : name;
        await api.post(`/projects/${projectId}/dateien/ordner`, { pfad });
      } else if (dialog.kind === 'umbenennen') {
        if (!name) return;
        const idx = dialog.eintrag.pfad.lastIndexOf('/');
        const eltern = idx >= 0 ? dialog.eintrag.pfad.slice(0, idx) : '';
        const nach = eltern ? `${eltern}/${name}` : name;
        await api.post(`/projects/${projectId}/dateien/verschieben`, {
          von: dialog.eintrag.pfad,
          nach,
        });
      } else if (dialog.kind === 'loeschen') {
        await api.del(
          `/projects/${projectId}/dateien?pfad=${encodeURIComponent(dialog.eintrag.pfad)}`
        );
      }
      setDialog(null);
      setDialogName('');
      neuLaden();
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  const renderEintrag = (e: AblageEintrag, tiefe: number) => {
    if (e.typ === 'ordner') {
      const auf = offeneOrdner.has(e.pfad);
      const kinder = kinderVon.get(e.pfad) ?? [];
      return (
        <div key={e.pfad}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent/60"
                style={{ paddingLeft: `${8 + tiefe * 14}px` }}
                onClick={() => toggleOrdner(e.pfad)}
                data-testid="ablage-folder"
              >
                {auf ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{e.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  setDialogName('');
                  setDialog({ kind: 'neu-datei', ordner: e.pfad });
                }}
              >
                <FilePlus className="mr-2 h-3.5 w-3.5" /> Neue Datei
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  setDialogName('');
                  setDialog({ kind: 'neu-ordner', ordner: e.pfad });
                }}
              >
                <FolderPlus className="mr-2 h-3.5 w-3.5" /> Neuer Ordner
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  uploadZielRef.current = e.pfad;
                  uploadInputRef.current?.click();
                }}
              >
                <Upload className="mr-2 h-3.5 w-3.5" /> Hierher hochladen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => void download(e.pfad, `${e.name}.tar.gz`)}>
                <Download className="mr-2 h-3.5 w-3.5" /> Als Archiv herunterladen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  setDialogName(e.name);
                  setDialog({ kind: 'umbenennen', eintrag: e });
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" /> Umbenennen
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'loeschen', eintrag: e })}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Löschen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {auf && <div role="group">{kinder.map(k => renderEintrag(k, tiefe + 1))}</div>}
        </div>
      );
    }
    return (
      <ContextMenu key={e.pfad}>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent/60"
            style={{ paddingLeft: `${8 + tiefe * 14 + 16}px` }}
            onClick={() => oeffneDatei(e)}
            data-testid="ablage-file"
          >
            <span className="text-muted-foreground">{dateiIcon(e.name)}</span>
            <span className="min-w-0 truncate">{e.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => oeffneDatei(e)}>
            <FileText className="mr-2 h-3.5 w-3.5" /> Öffnen
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void download(e.pfad, e.name)}>
            <Download className="mr-2 h-3.5 w-3.5" /> Herunterladen
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => uebernehmen.mutate(e.pfad)}>
            <BookOpenText className="mr-2 h-3.5 w-3.5" /> In Wissensraum übernehmen
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              setDialogName(e.name);
              setDialog({ kind: 'umbenennen', eintrag: e });
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" /> Umbenennen
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDialog({ kind: 'loeschen', eintrag: e })}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Löschen
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  if (!projectId) return null;

  const wurzel = kinderVon.get('') ?? [];
  const dialogTitel =
    dialog?.kind === 'neu-datei'
      ? 'Neue Datei'
      : dialog?.kind === 'neu-ordner'
        ? 'Neuer Ordner'
        : 'Umbenennen';

  return (
    <div className="mt-2 border-t border-border/60 pt-1" data-testid="ablage-section">
      {/* Bereichs-Kopf: auf-/zuklappbar, Aktionen rechts. */}
      <div className="group flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={() => setOffen(o => !o)}
          aria-expanded={offen}
          data-testid="ablage-toggle"
        >
          {offen ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <HardDrive className="h-3 w-3 shrink-0" />
          <span className="truncate">Projektablage</span>
        </button>
        {offen && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              title="Neue Datei"
              aria-label="Neue Datei in der Projektablage"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                setDialogName('');
                setDialog({ kind: 'neu-datei', ordner: null });
              }}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Neuer Ordner"
              aria-label="Neuer Ordner in der Projektablage"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                setDialogName('');
                setDialog({ kind: 'neu-ordner', ordner: null });
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Hochladen"
              aria-label="In die Projektablage hochladen"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                uploadZielRef.current = null;
                uploadInputRef.current?.click();
              }}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Alles als Archiv herunterladen"
              aria-label="Projektablage herunterladen"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => void download(null, 'projektablage.tar.gz')}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Aktualisieren"
              aria-label="Projektablage aktualisieren"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </button>
          </div>
        )}
      </div>

      {offen && (
        <div className="pb-1" data-testid="ablage-tree">
          {isLoading && <p className="px-2 py-1 text-xs text-muted-foreground">Lade Ablage…</p>}
          {!isLoading && wurzel.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">
              Noch leer — hier landen Dateien von Flows, Sandboxes und Uploads
            </p>
          )}
          {wurzel.map(e => renderEintrag(e, 0))}
          {data?.data.gekuerzt && (
            <p className="px-2 py-1 text-[11px] text-muted-foreground/60">
              Liste gekürzt — nicht alle Einträge werden angezeigt
            </p>
          )}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="ablage-upload-input"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) void hochladen(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Name-Dialog (neue Datei / neuer Ordner / umbenennen) */}
      <Modal
        isOpen={dialog !== null && dialog.kind !== 'loeschen'}
        onClose={() => setDialog(null)}
        title={dialogTitel}
        size="small"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => void dialogBestaetigen()}
              disabled={!dialogName.trim()}
            >
              {dialog?.kind === 'umbenennen' ? 'Umbenennen' : 'Anlegen'}
            </Button>
          </div>
        }
      >
        <Input
          value={dialogName}
          onChange={e => setDialogName(e.target.value)}
          placeholder={dialog?.kind === 'neu-ordner' ? 'ordnername' : 'dateiname.md'}
          aria-label="Name"
          onKeyDown={e => {
            if (e.key === 'Enter' && dialogName.trim()) void dialogBestaetigen();
          }}
        />
      </Modal>

      <ConfirmModal
        isOpen={dialog?.kind === 'loeschen'}
        onClose={() => setDialog(null)}
        onConfirm={() => void dialogBestaetigen()}
        title={
          dialog?.kind === 'loeschen' && dialog.eintrag.typ === 'ordner'
            ? 'Ordner löschen'
            : 'Datei löschen'
        }
        message={
          dialog?.kind === 'loeschen'
            ? `„${dialog.eintrag.pfad}" wirklich löschen?${dialog.eintrag.typ === 'ordner' ? ' Der gesamte Inhalt geht verloren.' : ''}`
            : ''
        }
        confirmText="Löschen"
        confirmVariant="danger"
      />
    </div>
  );
}
