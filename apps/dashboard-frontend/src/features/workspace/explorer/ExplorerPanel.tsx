import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  FileText,
  File as FileIcon,
  FileImage,
  FileUp,
  Pencil,
  Search,
  Trash2,
  FolderInput,
  FolderSearch,
  BookOpenText,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/shadcn/context-menu';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useUploadDocuments } from '@/hooks/uploadDocuments';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';
import { ExplorerDialogs } from './ExplorerDialogs';
import type { ExplorerDialogState } from './ExplorerDialogs';

/** Drag-Payload Explorer → Agent-Chat (Datei/Ordner als Kontext). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';

/** Drag-Payload Datei → Ordner (Verschieben innerhalb des Explorers). */
export const DND_DOC_TYPE = 'application/x-arasul-doc';

interface DocMovePayload {
  documentId: string;
  fromSpaceId: string | null;
  label: string;
}

export interface TreeSpace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  is_default: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface TreeDocument {
  id: string;
  filename: string;
  title: string | null;
  status: string;
  space_id: string | null;
  is_context_file: boolean;
  mime_type: string | null;
  file_extension: string | null;
  file_size: number | null;
}

interface TreeResponse {
  spaces: TreeSpace[];
  documents: TreeDocument[];
}

/** Anzeigename einer Datei: benutzerdefinierter Titel schlägt den Dateinamen. */
function docLabel(doc: TreeDocument): string {
  return doc.title?.trim() ? doc.title : doc.filename;
}

/** Teilbaum-IDs eines Ordners (inklusive des Ordners selbst, Wurzel zuerst). */
export function collectSubtreeIds(spaces: TreeSpace[], rootId: string): string[] {
  const childrenByParent = new Map<string, TreeSpace[]>();
  for (const s of spaces) {
    if (s.parent_id) {
      const list = childrenByParent.get(s.parent_id) ?? [];
      list.push(s);
      childrenByParent.set(s.parent_id, list);
    }
  }
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || result.includes(id)) continue;
    result.push(id);
    for (const child of childrenByParent.get(id) ?? []) {
      queue.push(child.id);
    }
  }
  return result;
}

function docIcon(doc: TreeDocument) {
  const mime = doc.mime_type ?? '';
  if (mime.startsWith('image/')) return <FileImage className="h-3.5 w-3.5 shrink-0" />;
  if (mime === 'application/pdf' || mime.startsWith('text/'))
    return <FileText className="h-3.5 w-3.5 shrink-0" />;
  return <FileIcon className="h-3.5 w-3.5 shrink-0" />;
}

/** Indexierungs-Status als dezenter Punkt; »indexed« zeigt nichts. */
function StatusDot({ status }: { status: string }) {
  if (status === 'indexed') return null;
  const map: Record<string, { cls: string; label: string }> = {
    processing: { cls: 'bg-warning animate-pulse', label: 'Wird indexiert …' },
    pending: { cls: 'bg-muted-foreground/50', label: 'Wartet auf Indexierung' },
    partial: { cls: 'bg-warning', label: 'Teilweise indexiert' },
    failed: { cls: 'bg-destructive', label: 'Indexierung fehlgeschlagen' },
  };
  const info = map[status] ?? map.pending!;
  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', info.cls)}
      title={info.label}
      aria-label={info.label}
    />
  );
}

/**
 * Explorer der Workspace-Shell: EIN Baum aus Ordnern und Dateien
 * (Ordner → Unterordner → Dateien). Import per Rechtsklick oder Drag & Drop vom
 * Desktop direkt in einen Ordner; Dateien lassen sich per Drag & Drop zwischen
 * Ordnern verschieben und in den Agent-Chat ziehen (Kontext-Scope). Rechtsklick
 * öffnet je Zeile ein Kontextmenü (Umbenennen/Löschen/Neuer Ordner …). Suche
 * filtert den Baum client-seitig.
 *
 * Versteckte Workspace-Ordner (`knowledge_spaces.is_workspace = TRUE`) liefert
 * `/spaces/tree` gar nicht erst aus — sie erscheinen deshalb nie als Zeile und
 * können strukturell kein Verschiebe-/Ablageziel sein.
 */
export function ExplorerPanel() {
  const api = useApi();
  const toast = useToast();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);

  const [spaces, setSpaces] = useState<TreeSpace[]>([]);
  const [documents, setDocuments] = useState<TreeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<ExplorerDialogState | null>(null);
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadTree = useCallback(async () => {
    try {
      const tree = await api.get<TreeResponse>('/spaces/tree', { showError: false });
      setSpaces(tree.spaces);
      setDocuments(tree.documents);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Explorer konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadTree();
    const timers = refreshTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, [loadTree]);

  /** Nach Uploads mehrfach nachladen, damit pending→indexed sichtbar wird. */
  const scheduleRefresh = useCallback(() => {
    refreshTimersRef.current.forEach(clearTimeout);
    refreshTimersRef.current = [3000, 9000, 20000].map(ms => setTimeout(loadTree, ms));
  }, [loadTree]);

  const { uploadFiles, uploading } = useUploadDocuments();

  const doUpload = useCallback(
    async (files: FileList | File[], spaceId: string | null) => {
      const result = await uploadFiles(files, spaceId);
      if (result.ok > 0) {
        toast.success(
          `${result.ok} ${result.ok === 1 ? 'Dokument' : 'Dokumente'} hochgeladen — Indexierung läuft`
        );
      }
      for (const f of result.failed.slice(0, 3)) {
        toast.error(`${f.name}: ${f.error}`);
      }
      loadTree();
      scheduleRefresh();
    },
    [uploadFiles, toast, loadTree, scheduleRefresh]
  );

  const requestUpload = useCallback((spaceId: string | null) => {
    uploadTargetRef.current = spaceId;
    fileInputRef.current?.click();
  }, []);

  /** Datei per Drag & Drop in einen anderen Ordner verschieben (optimistisch). */
  const moveDocument = useCallback(
    async (
      documentId: string,
      fromSpaceId: string | null,
      toSpaceId: string | null,
      label: string
    ) => {
      if (fromSpaceId === toSpaceId) return; // gleicher Ordner → No-Op
      const snapshot = documents;
      setDocuments(docs =>
        docs.map(d => (d.id === documentId ? { ...d, space_id: toSpaceId } : d))
      );
      try {
        await api.put(`/documents/${documentId}/move`, { space_id: toSpaceId });
        toast.success(`„${label}“ verschoben`);
        loadTree();
      } catch {
        setDocuments(snapshot); // Fehler-Toast kommt aus useApi
      }
    },
    [api, documents, toast, loadTree]
  );

  // Menü-Aktionen (WorkspaceMenuBar → Store → hier)
  const explorerRequest = useWorkspaceStore(s => s.explorerRequest);
  const clearExplorerRequest = useWorkspaceStore(s => s.clearExplorerRequest);
  useEffect(() => {
    if (!explorerRequest) return;
    if (explorerRequest === 'create-folder') setDialog({ kind: 'create', parent: null });
    if (explorerRequest === 'upload-files') requestUpload(null);
    clearExplorerRequest();
  }, [explorerRequest, clearExplorerRequest, requestUpload]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, TreeSpace[]>();
    for (const s of spaces) {
      const key = s.parent_id ?? null;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [spaces]);

  const docsBySpace = useMemo(() => {
    const map = new Map<string | null, TreeDocument[]>();
    for (const d of documents) {
      if (d.is_context_file) continue; // Kontextdateien sind Ordner-Metadaten
      const key = d.space_id ?? null;
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [documents]);

  /** Wurzel-Ordner (ohne Elternordner) — oberste Baum-Ebene. */
  const rootFolders = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);

  /** Wurzel-Dateien (keinem Ordner zugeordnet). */
  const rootDocs = useMemo(() => docsBySpace.get(null) ?? [], [docsBySpace]);

  // --- Suche -----------------------------------------------------------

  const q = query.trim().toLowerCase();
  const matches = useCallback((name: string) => q === '' || name.toLowerCase().includes(q), [q]);

  /** Ordner sichtbar, wenn er selbst, ein Unterordner oder eine Datei matcht. */
  const folderVisible = useCallback(
    function visible(space: TreeSpace): boolean {
      if (matches(space.name)) return true;
      if ((docsBySpace.get(space.id) ?? []).some(d => matches(docLabel(d)))) return true;
      return (childrenByParent.get(space.id) ?? []).some(visible);
    },
    [matches, docsBySpace, childrenByParent]
  );

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isExpanded = (id: string) => q !== '' || expanded.has(id);

  // --- Aktionen ----------------------------------------------------------

  const chatWithFolder = (space: TreeSpace) => {
    const subtree = collectSubtreeIds(spaces, space.id);
    setChatScope({ spaceIds: subtree, label: space.name });
    toast.success(`KI auf Ordner „${space.name}“ eingegrenzt`);
  };

  const chatWithDocument = (doc: TreeDocument) => {
    if (!doc.space_id) {
      toast.error('Datei ohne Ordner kann nicht als Kontext gesetzt werden');
      return;
    }
    setChatScope({ spaceIds: [doc.space_id], label: docLabel(doc) });
    toast.success(`KI auf „${docLabel(doc)}“ eingegrenzt`);
  };

  /** Elternordner einer Datei (für »Neuer Ordner« als Geschwister). */
  const parentSpaceOf = (doc: TreeDocument): TreeSpace | null =>
    doc.space_id ? (spaces.find(s => s.id === doc.space_id) ?? null) : null;

  /** Drag-Payloads eines Ordners setzen (nur Chat-Scope). */
  const folderDragStart = (space: TreeSpace) => (e: React.DragEvent) => {
    e.dataTransfer.setData(
      DND_SCOPE_TYPE,
      JSON.stringify({ spaceIds: collectSubtreeIds(spaces, space.id), label: space.name })
    );
    e.dataTransfer.setData('text/plain', space.name);
    e.dataTransfer.effectAllowed = 'link';
  };

  /** Drag-Payloads einer Datei setzen (Chat-Scope + Verschiebe-Payload). */
  const docDragStart = (doc: TreeDocument) => (e: React.DragEvent) => {
    const label = docLabel(doc);
    // Chat akzeptiert den Scope (Ordner der Datei); leere spaceIds ignoriert der Chat.
    e.dataTransfer.setData(
      DND_SCOPE_TYPE,
      JSON.stringify({ spaceIds: doc.space_id ? [doc.space_id] : [], label })
    );
    // Ordner-Zeilen akzeptieren die Verschiebe-Nutzlast.
    const move: DocMovePayload = { documentId: doc.id, fromSpaceId: doc.space_id, label };
    e.dataTransfer.setData(DND_DOC_TYPE, JSON.stringify(move));
    e.dataTransfer.setData('text/plain', label);
    e.dataTransfer.effectAllowed = 'all';
  };

  /** Drop-Handler für Ordner-/Wurzel-Zeilen: OS-Datei-Import ODER Datei-Move. */
  const dropProps = (spaceId: string | null, rowKey: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const types = e.dataTransfer.types;
      if (types.includes(DND_DOC_TYPE)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(rowKey);
      } else if (types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setDropTarget(rowKey);
      }
    },
    onDragLeave: () => setDropTarget(t => (t === rowKey ? null : t)),
    onDrop: (e: React.DragEvent) => {
      const movePayload = e.dataTransfer.getData(DND_DOC_TYPE);
      if (movePayload) {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        try {
          const parsed = JSON.parse(movePayload) as DocMovePayload;
          moveDocument(parsed.documentId, parsed.fromSpaceId ?? null, spaceId, parsed.label);
        } catch {
          /* defekte Nutzlast ignorieren */
        }
        return;
      }
      if (e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        doUpload(e.dataTransfer.files, spaceId);
      }
    },
  });

  // --- Rendering -----------------------------------------------------------

  const renderDocument = (doc: TreeDocument, depth: number): React.ReactNode => {
    const label = docLabel(doc);
    if (!matches(label)) return null;
    const open = () => openTab({ type: 'document', documentId: doc.id, title: doc.filename });
    return (
      <ContextMenu key={doc.id}>
        <ContextMenuTrigger asChild>
          <div
            className="group flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            style={{ paddingLeft: `${depth * 12 + 20}px` }}
            role="treeitem"
            aria-selected={false}
            tabIndex={0}
            draggable
            onDragStart={docDragStart(doc)}
            onClick={open}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            }}
          >
            {docIcon(doc)}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <StatusDot status={doc.status} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={open}>
            <FileText className="mr-2 h-3.5 w-3.5" /> Öffnen
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => chatWithDocument(doc)}>
            <FolderSearch className="mr-2 h-3.5 w-3.5" /> KI auf Datei eingrenzen
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setDialog({ kind: 'rename-document', document: doc })}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Umbenennen
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => setDialog({ kind: 'move-document', document: doc, spaces })}
          >
            <FolderInput className="mr-2 h-3.5 w-3.5" /> In Ordner verschieben
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => setDialog({ kind: 'create', parent: parentSpaceOf(doc) })}
          >
            <FolderPlus className="mr-2 h-3.5 w-3.5" /> Neuer Ordner
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDialog({ kind: 'delete-document', document: doc })}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Löschen
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderFolder = (space: TreeSpace, depth: number): React.ReactNode => {
    if (!folderVisible(space)) return null;
    const open = isExpanded(space.id);
    const childFolders = childrenByParent.get(space.id) ?? [];
    const childDocs = docsBySpace.get(space.id) ?? [];
    const rowKey = `space:${space.id}`;

    return (
      <div key={space.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent',
                dropTarget === rowKey && 'bg-accent outline-1 outline-dashed outline-primary/60'
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() => toggleExpand(space.id)}
              role="treeitem"
              aria-expanded={open}
              aria-selected={false}
              tabIndex={0}
              draggable
              onDragStart={folderDragStart(space)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(space.id);
                }
              }}
              {...dropProps(space.id, rowKey)}
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <Folder
                className="h-3.5 w-3.5 shrink-0"
                style={space.color ? { color: space.color } : undefined}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{space.name}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => requestUpload(space.id)}>
              <FileUp className="mr-2 h-3.5 w-3.5" /> Datei importieren…
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => chatWithFolder(space)}>
              <FolderSearch className="mr-2 h-3.5 w-3.5" /> KI auf Ordner eingrenzen
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setDialog({ kind: 'context-file', space })}>
              <BookOpenText className="mr-2 h-3.5 w-3.5" /> Kontextdatei bearbeiten
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setDialog({ kind: 'create', parent: space })}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" /> Neuer Ordner
            </ContextMenuItem>
            <ContextMenuItem
              disabled={space.is_system}
              onSelect={() => setDialog({ kind: 'rename', space })}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" /> Umbenennen
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setDialog({ kind: 'move', space, spaces })}>
              <FolderInput className="mr-2 h-3.5 w-3.5" /> Verschieben
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={space.is_system}
              variant="destructive"
              onSelect={() => setDialog({ kind: 'delete', space })}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Löschen
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {open && (
          <div role="group">
            {childFolders.map(child => renderFolder(child, depth + 1))}
            {childDocs.map(doc => renderDocument(doc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex h-full min-w-0 flex-col bg-background"
      data-testid="workspace-explorer-panel"
    >
      {/* Kopf: Suche + Aktionen */}
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md bg-card px-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suchen…"
            aria-label="Explorer durchsuchen"
            className="h-6 w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Suche leeren"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          title="Neuer Ordner"
          aria-label="Neuer Ordner"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setDialog({ kind: 'create', parent: null })}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Dateien importieren"
          aria-label="Dateien importieren"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => requestUpload(null)}
        >
          <Upload className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Aktualisieren"
          aria-label="Explorer aktualisieren"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={loadTree}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', uploading && 'animate-spin')} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="explorer-upload-input"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            doUpload(e.target.files, uploadTargetRef.current);
          }
          e.target.value = '';
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
          aria-label="Ordner und Dokumente"
          {...dropProps(null, 'root')}
        >
          {loading && <p className="px-2 py-1 text-xs text-muted-foreground">Lade Explorer…</p>}
          {error && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && (
            <div data-testid="explorer-tree">
              {rootFolders.map(folder => renderFolder(folder, 0))}
              {rootDocs.map(doc => renderDocument(doc, 0))}
              {rootFolders.length === 0 && rootDocs.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground/60">
                  Noch keine Ordner oder Dateien — Dateien einfach hierher ziehen
                </p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <ExplorerDialogs dialog={dialog} onClose={() => setDialog(null)} onChanged={loadTree} />
    </div>
  );
}
