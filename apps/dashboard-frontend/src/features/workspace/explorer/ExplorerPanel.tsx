import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  FileText,
  File as FileIcon,
  FileImage,
  MoreHorizontal,
  MessageSquare,
  Pencil,
  Trash2,
  FolderInput,
  BookOpenText,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ExplorerDialogs } from './ExplorerDialogs';
import type { ExplorerDialogState } from './ExplorerDialogs';

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

/**
 * Second-Brain-Explorer: kompletter Dokumentbestand als verschachtelter
 * Ordnerbaum (knowledge_spaces mit parent_id). Ordner-CRUD über Kontextmenü,
 * Datei-Klick öffnet einen Viewer-Tab, »Mit Ordner chatten« scoped das
 * KI-Panel auf den Teilbaum.
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

  const loadTree = useCallback(async () => {
    try {
      const data = await api.get<TreeResponse>('/spaces/tree', { showError: false });
      setSpaces(data.spaces);
      setDocuments(data.documents);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Explorer konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Menü-Aktionen (WorkspaceMenuBar → Store → hier): z. B. »Neuer Ordner…«
  const explorerRequest = useWorkspaceStore(s => s.explorerRequest);
  const clearExplorerRequest = useWorkspaceStore(s => s.clearExplorerRequest);
  useEffect(() => {
    if (explorerRequest === 'create-folder') {
      setDialog({ kind: 'create', parent: null });
      clearExplorerRequest();
    }
  }, [explorerRequest, clearExplorerRequest]);

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

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const chatWithFolder = (space: TreeSpace) => {
    const subtree = collectSubtreeIds(spaces, space.id);
    setChatScope({ spaceIds: subtree, label: space.name });
    toast.success(`Chat auf Ordner „${space.name}“ eingegrenzt`);
  };

  const renderFolder = (space: TreeSpace, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(space.id);
    const childFolders = childrenByParent.get(space.id) ?? [];
    const childDocs = docsBySpace.get(space.id) ?? [];

    return (
      <div key={space.id}>
        <div
          className="group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => toggleExpand(space.id)}
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={false}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpand(space.id);
            }
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <Folder
            className="h-3.5 w-3.5 shrink-0"
            style={space.color ? { color: space.color } : undefined}
          />
          <span className="min-w-0 flex-1 truncate text-foreground">{space.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Aktionen für Ordner ${space.name}`}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-border"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => chatWithFolder(space)}>
                <MessageSquare className="mr-2 h-3.5 w-3.5" /> Mit Ordner chatten
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: 'context-file', space })}>
                <BookOpenText className="mr-2 h-3.5 w-3.5" /> Kontextdatei bearbeiten
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog({ kind: 'create', parent: space })}>
                <FolderPlus className="mr-2 h-3.5 w-3.5" /> Neuer Unterordner
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={space.is_system}
                onClick={() => setDialog({ kind: 'rename', space })}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" /> Umbenennen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: 'move', space, spaces })}>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> Verschieben
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={space.is_system}
                variant="destructive"
                onClick={() => setDialog({ kind: 'delete', space })}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isExpanded && (
          <div role="group">
            {childFolders.map(child => renderFolder(child, depth + 1))}
            {childDocs.map(doc => renderDocument(doc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderDocument = (doc: TreeDocument, depth: number): React.ReactNode => (
    <div
      key={doc.id}
      className="group flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      role="treeitem"
      aria-selected={false}
      tabIndex={0}
      onClick={() => openTab({ type: 'document', documentId: doc.id, title: doc.filename })}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTab({ type: 'document', documentId: doc.id, title: doc.filename });
        }
      }}
    >
      {docIcon(doc)}
      <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Aktionen für ${doc.filename}`}
            className="rounded p-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-border"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem
            onClick={() => setDialog({ kind: 'move-document', document: doc, spaces })}
          >
            <FolderInput className="mr-2 h-3.5 w-3.5" /> In Ordner verschieben
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const rootFolders = childrenByParent.get(null) ?? [];
  const rootDocs = docsBySpace.get(null) ?? [];

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide select-none">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
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
            title="Aktualisieren"
            aria-label="Explorer aktualisieren"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={loadTree}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1.5" role="tree" aria-label="Dokumente und Ordner">
          {loading && <p className="px-2 py-1 text-xs text-muted-foreground">Lade Explorer…</p>}
          {error && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {rootFolders.map(space => renderFolder(space, 0))}
              {rootDocs.map(doc => renderDocument(doc, 0))}
              {rootFolders.length === 0 && rootDocs.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Noch keine Ordner oder Dokumente
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      <ExplorerDialogs dialog={dialog} onClose={() => setDialog(null)} onChanged={loadTree} />
    </div>
  );
}
