/**
 * ExplorerPanel — EIN Datei-Baum aus dem Projektordner (Ein-Ordner-Modell).
 *
 * Der Projektordner auf der Platte (`data/projects/<uuid>`) ist die einzige
 * Wahrheit: `GET /projects/:id/dateien` liefert den Baum, ein Backend-Sync
 * spiegelt Ordner automatisch in Wissensräume (`space_id` am Ordner-Eintrag)
 * und indexierbare Dateien in Dokumente (`dokument: {id, status}` am
 * Datei-Eintrag). Ein manuelles „In den Wissensraum übernehmen" gibt es nicht
 * mehr — hochgeladene Dateien werden automatisch indexiert.
 *
 * Aktionen: Datei öffnen (Editor-Tab; binäre Dokumente im Dokument-Viewer),
 * Neue Datei, Neuer Ordner, Umbenennen, Löschen, Hochladen, Herunterladen.
 * Ordner mit Wissensraum-Spiegel lassen sich in den Chat ziehen
 * („Mit Ordner chatten" + Speicherziel); noch nicht gesyncte Ordner sind
 * nicht draggbar („wird noch übernommen").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  FolderSearch,
  Pencil,
  Pin,
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
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import Modal, { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { usePins } from '../useWorkspaceContext';
import { useActiveProject } from '../useProjects';
import { cn } from '@/lib/utils';
import { SidebarViewHeader } from '../sidebar/SidebarView';
import { SidebarSearch } from '@/components/ui/SidebarSearch';

/** Drag-Payload Explorer → Agent-Chat (Ordner als Wissens-Scope). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';

/**
 * Drag-Payload Explorer → Chat-Composer (Ordner als Speicherziel,
 * Pfad-basiert). Payload: { projectId, pfad, name, typ }.
 */
export const DND_ABLAGE_TYPE = 'application/x-arasul-ablage';

export type DokumentStatus =
  | 'pending'
  | 'processing'
  | 'indexed'
  | 'partial'
  | 'failed'
  | 'stored'
  | 'context';

export interface AblageEintrag {
  pfad: string;
  name: string;
  typ: 'ordner' | 'datei';
  groesse: number | null;
  geaendert: string | null;
  /** Nur Dateien: der gespiegelte Wissens-Eintrag (Auto-Indexierung). */
  dokument?: { id: string; status: DokumentStatus };
  /** Nur Ordner: der gespiegelte Wissensraum (für Chat-Scope). */
  space_id?: string;
}

interface AblageResponse {
  data: { eintraege: AblageEintrag[]; gekuerzt: boolean };
}

type ExplorerDialog =
  | { kind: 'neu-datei'; ordner: string | null }
  | { kind: 'neu-ordner'; ordner: string | null }
  | { kind: 'umbenennen'; eintrag: AblageEintrag }
  | { kind: 'loeschen'; eintrag: AblageEintrag };

/** Eltern-Pfad eines Eintrags ('' = Wurzel). */
function elternPfad(pfad: string): string {
  const idx = pfad.lastIndexOf('/');
  return idx >= 0 ? pfad.slice(0, idx) : '';
}

/**
 * Wissensraum-IDs eines Ordners samt aller Unterordner (Pfad-Präfix) —
 * das Chat-Scope-Pendant zum alten collectSubtreeIds, jetzt Pfad-basiert.
 */
export function sammleScopeIds(eintraege: AblageEintrag[], ordner: AblageEintrag): string[] {
  const ids = ordner.space_id ? [ordner.space_id] : [];
  const prefix = `${ordner.pfad}/`;
  for (const e of eintraege) {
    if (e.typ === 'ordner' && e.space_id && e.pfad.startsWith(prefix)) ids.push(e.space_id);
  }
  return ids;
}

function dateiIcon(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'tif', 'bmp'].includes(ext))
    return <FileImage className="h-3.5 w-3.5 shrink-0" />;
  if (
    ['js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'json', 'yaml', 'yml', 'html', 'css', 'sql'].includes(
      ext
    )
  )
    return <FileCode className="h-3.5 w-3.5 shrink-0" />;
  if (['md', 'markdown', 'txt', 'pdf', 'docx'].includes(ext))
    return <FileText className="h-3.5 w-3.5 shrink-0" />;
  return <FileIcon className="h-3.5 w-3.5 shrink-0" />;
}

/**
 * Indexierungs-Status als dezenter Text-Suffix — bewusst OHNE Punkte, Badges
 * oder Icons (ausdrücklicher Nutzerwunsch). indexed/stored/context zeigen
 * nichts: die Datei ist einfach „da".
 */
function statusSuffix(status: DokumentStatus): { text: string; cls: string } | null {
  if (status === 'pending' || status === 'processing')
    return { text: '· wird indexiert', cls: 'text-muted-foreground' };
  if (status === 'failed') return { text: '· Index fehlgeschlagen', cls: 'text-destructive' };
  if (status === 'partial') return { text: '· teilweise indexiert', cls: 'text-warning' };
  return null;
}

/** Läuft für irgendeinen Eintrag noch die Indexierung? */
function hatLaufendeIndexierung(eintraege: AblageEintrag[]): boolean {
  return eintraege.some(
    e => e.dokument && (e.dokument.status === 'pending' || e.dokument.status === 'processing')
  );
}

export function ExplorerPanel() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const { addPin } = usePins();
  // Der Baum ist der Projektordner des aktiven Projekts: wechselt es, wechselt
  // der Query-Key und der Explorer lädt neu. `activeProject.name` steht als
  // Kopf-Titel — wie »Modelle«/»Erweiterungen« bei den anderen Ansichten.
  const { activeId, activeProject } = useActiveProject();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<ExplorerDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadZielRef = useRef<string | null>(null);
  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [uploading, setUploading] = useState(false);

  const queryKey = useMemo(() => ['projekt-dateien', activeId], [activeId]);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey,
    enabled: !!activeId,
    queryFn: () => api.get<AblageResponse>(`/projects/${activeId}/dateien`, { showError: false }),
    staleTime: 5_000,
    // Solange irgendein Eintrag pending/processing ist, alle 20 s nachladen —
    // so wird pending→indexed auch ohne Nutzeraktion sichtbar.
    refetchInterval: q =>
      hatLaufendeIndexierung(q.state.data?.data.eintraege ?? []) ? 20_000 : false,
  });
  const eintraege = useMemo(() => data?.data.eintraege ?? [], [data]);

  const neuLaden = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  /**
   * Nach Uploads/Mutationen gestaffelt nachladen (3 s / 9 s / 20 s), damit der
   * Backend-Sync (Datei→Dokument, Ordner→Wissensraum) sichtbar wird.
   */
  const scheduleRefresh = useCallback(() => {
    refreshTimersRef.current.forEach(clearTimeout);
    refreshTimersRef.current = [3000, 9000, 20000].map(ms => setTimeout(() => refetch(), ms));
  }, [refetch]);

  useEffect(() => {
    const timers = refreshTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Kinder je Ordner-Pfad ('' = Wurzel) — der Baum kommt flach mit Pfaden.
  const kinderVon = useMemo(() => {
    const map = new Map<string, AblageEintrag[]>();
    for (const e of eintraege) {
      const eltern = elternPfad(e.pfad);
      const liste = map.get(eltern) ?? [];
      liste.push(e);
      map.set(eltern, liste);
    }
    return map;
  }, [eintraege]);

  // --- Suche ---------------------------------------------------------------

  const q = query.trim().toLowerCase();
  const matches = useCallback((name: string) => q === '' || name.toLowerCase().includes(q), [q]);

  /** Eintrag sichtbar, wenn er selbst oder (bei Ordnern) ein Nachfahre matcht. */
  const istSichtbar = useCallback(
    (e: AblageEintrag): boolean => {
      if (matches(e.name)) return true;
      if (e.typ !== 'ordner') return false;
      const prefix = `${e.pfad}/`;
      return eintraege.some(k => k.pfad.startsWith(prefix) && matches(k.name));
    },
    [matches, eintraege]
  );

  const toggleOrdner = (pfad: string) =>
    setExpanded(prev => {
      const neu = new Set(prev);
      if (neu.has(pfad)) neu.delete(pfad);
      else neu.add(pfad);
      return neu;
    });
  const istOffen = (pfad: string) => q !== '' || expanded.has(pfad);

  // --- Aktionen ------------------------------------------------------------

  /**
   * Datei öffnen: Text-Dateien im Projektdatei-Editor; binäre Dateien mit
   * Wissens-Spiegel (PDF/DOCX/Bilder …) im Dokument-Viewer über die
   * dokument.id — so, wie sie der alte Wissensraum-Baum öffnete.
   */
  const oeffneDatei = useCallback(
    async (e: AblageEintrag) => {
      if (!activeId) return;
      if (e.dokument) {
        try {
          const res = await api.get<{ data: { binaer: boolean } }>(
            `/projects/${activeId}/dateien/inhalt?pfad=${encodeURIComponent(e.pfad)}`,
            { showError: false }
          );
          if (res.data.binaer) {
            openTab({ type: 'document', documentId: e.dokument.id, title: e.name });
            return;
          }
        } catch {
          /* fällt auf den Editor-Tab zurück */
        }
      }
      openTab({ type: 'projektdatei', projectId: activeId, filePath: e.pfad, title: e.name });
    },
    [activeId, api, openTab]
  );

  const download = useCallback(
    async (pfad: string | null, name: string) => {
      if (!activeId) return;
      try {
        const suffix = pfad ? `?pfad=${encodeURIComponent(pfad)}` : '';
        const res = await api.get<Response>(`/projects/${activeId}/dateien/download${suffix}`, {
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
    },
    [activeId, api]
  );

  const hochladen = useCallback(
    async (files: FileList | File[], ziel: string | null) => {
      if (!activeId) return;
      setUploading(true);
      let ok = 0;
      try {
        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append('file', file);
          if (ziel) form.append('ordner', ziel);
          try {
            await api.post(`/projects/${activeId}/dateien/upload`, form, { showError: false });
            ok += 1;
          } catch (err) {
            toast.error(`„${file.name}": ${(err as ApiError).message || 'Upload fehlgeschlagen'}`);
          }
        }
      } finally {
        setUploading(false);
      }
      if (ok > 0) {
        toast.success(
          `${ok} ${ok === 1 ? 'Datei' : 'Dateien'} hochgeladen — Indexierung läuft automatisch`
        );
      }
      neuLaden();
      scheduleRefresh();
    },
    [activeId, api, toast, neuLaden, scheduleRefresh]
  );

  const requestUpload = useCallback((ziel: string | null) => {
    uploadZielRef.current = ziel;
    uploadInputRef.current?.click();
  }, []);

  const chatMitOrdner = (e: AblageEintrag) => {
    if (!e.space_id) return;
    setChatScope({ spaceIds: sammleScopeIds(eintraege, e), label: e.name });
    toast.success(`KI auf Ordner „${e.name}“ eingegrenzt`);
  };

  const anheften = (e: AblageEintrag) => {
    const target =
      e.typ === 'ordner'
        ? e.space_id
          ? { spaceId: e.space_id }
          : null
        : e.dokument
          ? { documentId: e.dokument.id }
          : null;
    if (!target) return;
    addPin.mutate(target, {
      onSuccess: () => toast.success(`„${e.name}“ angeheftet`),
      onError: () => toast.error('Anheften fehlgeschlagen'),
    });
  };

  const dialogBestaetigen = async () => {
    if (!dialog || !activeId) return;
    const name = dialogName.trim();
    try {
      if (dialog.kind === 'neu-datei') {
        if (!name) return;
        const pfad = dialog.ordner ? `${dialog.ordner}/${name}` : name;
        await api.put(`/projects/${activeId}/dateien/inhalt`, { pfad, inhalt: '' });
        openTab({ type: 'projektdatei', projectId: activeId, filePath: pfad, title: name });
      } else if (dialog.kind === 'neu-ordner') {
        if (!name) return;
        const pfad = dialog.ordner ? `${dialog.ordner}/${name}` : name;
        await api.post(`/projects/${activeId}/dateien/ordner`, { pfad });
      } else if (dialog.kind === 'umbenennen') {
        if (!name) return;
        const eltern = elternPfad(dialog.eintrag.pfad);
        const nach = eltern ? `${eltern}/${name}` : name;
        await api.post(`/projects/${activeId}/dateien/verschieben`, {
          von: dialog.eintrag.pfad,
          nach,
        });
      } else if (dialog.kind === 'loeschen') {
        await api.del(
          `/projects/${activeId}/dateien?pfad=${encodeURIComponent(dialog.eintrag.pfad)}`
        );
      }
      setDialog(null);
      setDialogName('');
      neuLaden();
      // Der Wissens-Spiegel (space_id/dokument) folgt dem Sync leicht verzögert.
      scheduleRefresh();
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  // Menü-Aktionen (WorkspaceMenuBar → Store → hier)
  const explorerRequest = useWorkspaceStore(s => s.explorerRequest);
  const clearExplorerRequest = useWorkspaceStore(s => s.clearExplorerRequest);
  useEffect(() => {
    if (!explorerRequest) return;
    if (explorerRequest === 'create-folder') {
      setDialogName('');
      setDialog({ kind: 'neu-ordner', ordner: null });
    }
    if (explorerRequest === 'upload-files') requestUpload(null);
    clearExplorerRequest();
  }, [explorerRequest, clearExplorerRequest, requestUpload]);

  // --- Drag & Drop ---------------------------------------------------------

  /**
   * Eintrag als DnD-Quelle für den Chat: Ordner mit Wissensraum-Spiegel
   * liefern den Scope („Mit Ordner chatten") UND das Pfad-Ziel
   * („Speichern in: …"); noch nicht gesyncte Ordner sind nicht draggbar.
   */
  const dragStart = (e: AblageEintrag) => (ev: React.DragEvent) => {
    if (!activeId) return;
    ev.dataTransfer.setData(
      DND_ABLAGE_TYPE,
      JSON.stringify({ projectId: activeId, pfad: e.pfad, name: e.name, typ: e.typ })
    );
    if (e.typ === 'ordner' && e.space_id) {
      ev.dataTransfer.setData(
        DND_SCOPE_TYPE,
        JSON.stringify({ spaceIds: sammleScopeIds(eintraege, e), label: e.name })
      );
    } else if (e.typ === 'datei') {
      // Datei → Chat: Scope ist der Wissensraum ihres Ordners (wie früher).
      const eltern = eintraege.find(k => k.typ === 'ordner' && k.pfad === elternPfad(e.pfad));
      if (eltern?.space_id) {
        ev.dataTransfer.setData(
          DND_SCOPE_TYPE,
          JSON.stringify({ spaceIds: [eltern.space_id], label: e.name })
        );
      }
    }
    ev.dataTransfer.setData('text/plain', e.name);
    ev.dataTransfer.effectAllowed = 'link';
  };

  /** Drop-Handler für Ordner-/Wurzel-Zeilen: OS-Dateien hierher hochladen. */
  const dropProps = (ziel: string | null, rowKey: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (ev.dataTransfer.types.includes('Files')) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = 'copy';
        setDropTarget(rowKey);
      }
    },
    onDragLeave: () => setDropTarget(t => (t === rowKey ? null : t)),
    onDrop: (ev: React.DragEvent) => {
      if (ev.dataTransfer.files.length > 0) {
        ev.preventDefault();
        ev.stopPropagation();
        setDropTarget(null);
        void hochladen(ev.dataTransfer.files, ziel);
      }
    },
  });

  // --- Rendering -----------------------------------------------------------

  const renderDatei = (e: AblageEintrag, tiefe: number): React.ReactNode => {
    if (!matches(e.name)) return null;
    const suffix = e.dokument ? statusSuffix(e.dokument.status) : null;
    return (
      <ContextMenu key={e.pfad}>
        <ContextMenuTrigger asChild>
          <div
            className="group flex min-h-ui-row cursor-pointer items-center gap-1.5 rounded pr-3 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            style={{ paddingLeft: `${tiefe * 12 + 20}px` }}
            role="treeitem"
            aria-selected={false}
            tabIndex={0}
            draggable
            onDragStart={dragStart(e)}
            onClick={() => void oeffneDatei(e)}
            onKeyDown={ev => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                void oeffneDatei(e);
              }
            }}
            data-testid="explorer-file"
          >
            {dateiIcon(e.name)}
            <span className="min-w-0 truncate">{e.name}</span>
            {suffix && (
              <span className={cn('shrink-0 text-[11px]', suffix.cls)}>{suffix.text}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void oeffneDatei(e)}>
            <FileText className="mr-2 h-3.5 w-3.5" /> Öffnen
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void download(e.pfad, e.name)}>
            <Download className="mr-2 h-3.5 w-3.5" /> Herunterladen
          </ContextMenuItem>
          {e.dokument && (
            <ContextMenuItem onSelect={() => anheften(e)}>
              <Pin className="mr-2 h-3.5 w-3.5" /> An Chat anheften
            </ContextMenuItem>
          )}
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

  const renderOrdner = (e: AblageEintrag, tiefe: number): React.ReactNode => {
    if (!istSichtbar(e)) return null;
    const offen = istOffen(e.pfad);
    const kinder = kinderVon.get(e.pfad) ?? [];
    const rowKey = `ordner:${e.pfad}`;
    const gesynct = !!e.space_id;

    return (
      <div key={e.pfad}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'group flex min-h-ui-row cursor-pointer items-center gap-1 rounded pr-3 text-ui-sm hover:bg-accent',
                dropTarget === rowKey && 'bg-accent outline-1 outline-dashed outline-primary/60'
              )}
              style={{ paddingLeft: `${tiefe * 12 + 4}px` }}
              onClick={() => toggleOrdner(e.pfad)}
              role="treeitem"
              aria-expanded={offen}
              aria-selected={false}
              tabIndex={0}
              draggable={gesynct}
              title={gesynct ? undefined : 'Wird noch übernommen — Chat-Drag folgt nach dem Sync'}
              onDragStart={gesynct ? dragStart(e) : undefined}
              onKeyDown={ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  toggleOrdner(e.pfad);
                }
              }}
              {...dropProps(e.pfad, rowKey)}
              data-testid="explorer-folder"
            >
              {offen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
            </div>
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
            <ContextMenuItem onSelect={() => requestUpload(e.pfad)}>
              <Upload className="mr-2 h-3.5 w-3.5" /> Hierher hochladen
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!gesynct} onSelect={() => chatMitOrdner(e)}>
              <FolderSearch className="mr-2 h-3.5 w-3.5" />
              {gesynct ? 'KI auf Ordner eingrenzen' : 'KI auf Ordner eingrenzen (wird übernommen)'}
            </ContextMenuItem>
            <ContextMenuItem disabled={!gesynct} onSelect={() => anheften(e)}>
              <Pin className="mr-2 h-3.5 w-3.5" /> An Chat anheften
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
        {offen && (
          <div role="group">
            {kinder.map(k =>
              k.typ === 'ordner' ? renderOrdner(k, tiefe + 1) : renderDatei(k, tiefe + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const wurzel = kinderVon.get('') ?? [];
  const dialogTitel =
    dialog?.kind === 'neu-datei'
      ? 'Neue Datei'
      : dialog?.kind === 'neu-ordner'
        ? 'Neuer Ordner'
        : 'Umbenennen';

  return (
    <div
      className="flex h-full min-w-0 flex-col bg-background"
      data-testid="workspace-explorer-panel"
    >
      {/* Einheitliche Kopfzeile: Projektname als Titel, Datei-Aktionen rechts. */}
      <SidebarViewHeader
        title={activeProject?.name ?? 'Dateien'}
        actions={
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Neue Datei"
              aria-label="Neue Datei"
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
              aria-label="Neuer Ordner"
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
              title="Dateien hochladen"
              aria-label="Dateien hochladen"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => requestUpload(null)}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Alles als Archiv herunterladen"
              aria-label="Projektordner herunterladen"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => void download(null, `${activeProject?.name ?? 'projekt'}.tar.gz`)}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Aktualisieren"
              aria-label="Explorer aktualisieren"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', (isFetching || uploading) && 'animate-spin')}
              />
            </button>
          </div>
        }
      />
      <div className="px-2 pt-2">
        <SidebarSearch
          value={query}
          onChange={setQuery}
          placeholder="Dateien durchsuchen…"
          ariaLabel="Explorer durchsuchen"
        />
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="explorer-upload-input"
        onChange={ev => {
          if (ev.target.files && ev.target.files.length > 0) {
            void hochladen(ev.target.files, uploadZielRef.current);
          }
          ev.target.value = '';
        }}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div
          className={cn(
            'p-1.5',
            dropTarget === 'root' &&
              'rounded bg-accent/40 outline-1 outline-dashed outline-primary/50'
          )}
          role="tree"
          aria-label="Projektdateien"
          {...dropProps(null, 'root')}
        >
          {!activeId && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Kein Projekt aktiv</p>
          )}
          {activeId && isLoading && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Lade Dateien…</p>
          )}
          {activeId && !isLoading && error != null && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              Explorer konnte nicht geladen werden
            </p>
          )}
          {activeId && !isLoading && error == null && (
            <div data-testid="explorer-tree">
              {wurzel.map(e => (e.typ === 'ordner' ? renderOrdner(e, 0) : renderDatei(e, 0)))}
              {wurzel.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground/60">
                  Noch keine Dateien — einfach hierher ziehen; sie werden automatisch indexiert
                </p>
              )}
              {data?.data.gekuerzt && (
                <p className="px-2 py-1 text-[11px] text-muted-foreground/60">
                  Liste gekürzt — nicht alle Einträge werden angezeigt
                </p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

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
          onChange={ev => setDialogName(ev.target.value)}
          placeholder={dialog?.kind === 'neu-ordner' ? 'ordnername' : 'dateiname.md'}
          aria-label="Name"
          onKeyDown={ev => {
            if (ev.key === 'Enter' && dialogName.trim()) void dialogBestaetigen();
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
