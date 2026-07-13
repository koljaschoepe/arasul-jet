import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  FileText,
  File as FileIcon,
  FileImage,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  FolderInput,
  FolderSearch,
  BookOpenText,
  RefreshCw,
  Upload,
  Workflow,
  X,
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
import { useUploadDocuments } from '@/hooks/uploadDocuments';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';
import { ExplorerDialogs } from './ExplorerDialogs';
import type { ExplorerDialogState } from './ExplorerDialogs';

// Feature-Entry wie in TabContent.tsx — kein Import feature-interner Komponenten.
const ProjectModal = lazy(() =>
  import('@/features/projects').then(m => ({ default: m.ProjectModal }))
);

/** Drag-Payload Explorer → Agent-Chat (Datei/Ordner/Projekt als Kontext). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';

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

export interface WorkspaceProject {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  icon?: string;
  color?: string;
  knowledge_space_id?: string | null;
  is_default?: boolean;
  space_name?: string | null;
  conversation_count?: string | number;
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
 * Explorer der Workspace-Shell: EIN Baum mit Projekten als oberster Ebene
 * (Projekt → Ordner → Dateien). Das Standard-Projekt (»Allgemein«) nimmt
 * alle Ordner/Dateien auf, die keinem anderen Projekt zugeordnet sind —
 * nichts bleibt unsichtbar. Upload per Kontextmenü und Drag & Drop vom
 * Desktop direkt in Projekt/Ordner; Zeilen sind zum Agent-Chat draggbar
 * (Kontext-Scope). Suche filtert den Baum client-seitig.
 */
export function ExplorerPanel() {
  const api = useApi();
  const toast = useToast();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);

  const [spaces, setSpaces] = useState<TreeSpace[]>([]);
  const [documents, setDocuments] = useState<TreeDocument[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<ExplorerDialogState | null>(null);
  const [projectModal, setProjectModal] = useState<{
    mode: 'create' | 'edit';
    project: WorkspaceProject | null;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadTree = useCallback(async () => {
    try {
      const [tree, proj] = await Promise.all([
        api.get<TreeResponse>('/spaces/tree', { showError: false }),
        api
          .get<{ projects: WorkspaceProject[] }>('/projects', { showError: false })
          .catch(() => ({ projects: [] as WorkspaceProject[] })),
      ]);
      setSpaces(tree.spaces);
      setDocuments(tree.documents);
      setProjects(proj.projects);
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

  // Menü-Aktionen (WorkspaceMenuBar → Store → hier)
  const explorerRequest = useWorkspaceStore(s => s.explorerRequest);
  const clearExplorerRequest = useWorkspaceStore(s => s.clearExplorerRequest);
  useEffect(() => {
    if (!explorerRequest) return;
    if (explorerRequest === 'create-folder') setDialog({ kind: 'create', parent: null });
    if (explorerRequest === 'create-project') setProjectModal({ mode: 'create', project: null });
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

  const spaceById = useMemo(() => new Map(spaces.map(s => [s.id, s])), [spaces]);

  /** Projekt-Zeilen: Standard-Projekt zuerst, danach alphabetisch. */
  const orderedProjects = useMemo(() => {
    const list = [...projects].sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
    // Ohne Projekte (leere DB / API-Fehler): synthetisches »Allgemein«,
    // damit der Baum trotzdem alle Ordner zeigt.
    if (list.length === 0) {
      list.push({ id: '__default__', name: 'Allgemein', is_default: true });
    }
    return list;
  }, [projects]);

  /** Von Nicht-Default-Projekten abgedeckte Space-IDs. */
  const coveredSpaceIds = useMemo(() => {
    const covered = new Set<string>();
    for (const p of orderedProjects) {
      if (p.is_default) continue;
      if (p.knowledge_space_id && spaceById.has(p.knowledge_space_id)) {
        for (const id of collectSubtreeIds(spaces, p.knowledge_space_id)) covered.add(id);
      }
    }
    return covered;
  }, [orderedProjects, spaceById, spaces]);

  // --- Suche -----------------------------------------------------------

  const q = query.trim().toLowerCase();
  const matches = useCallback((name: string) => q === '' || name.toLowerCase().includes(q), [q]);

  /** Ordner sichtbar, wenn er selbst, ein Unterordner oder eine Datei matcht. */
  const folderVisible = useCallback(
    function visible(space: TreeSpace): boolean {
      if (matches(space.name)) return true;
      if ((docsBySpace.get(space.id) ?? []).some(d => matches(d.filename))) return true;
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

  const scopeToProject = (project: WorkspaceProject) => {
    if (!project.knowledge_space_id) return;
    const ids = collectSubtreeIds(spaces, project.knowledge_space_id);
    setChatScope({ spaceIds: ids, label: project.name });
    toast.success(`KI auf Projekt „${project.name}“ eingegrenzt`);
  };

  const dragPayload = (spaceIds: string[], label: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData(DND_SCOPE_TYPE, JSON.stringify({ spaceIds, label }));
    e.dataTransfer.setData('text/plain', label);
    e.dataTransfer.effectAllowed = 'link';
  };

  /** Drop-Handler für OS-Dateien auf Projekt-/Ordner-Zeilen. */
  const dropProps = (spaceId: string | null, rowKey: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(rowKey);
      }
    },
    onDragLeave: () => setDropTarget(t => (t === rowKey ? null : t)),
    onDrop: (e: React.DragEvent) => {
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
    if (!matches(doc.filename)) return null;
    return (
      <div
        key={doc.id}
        className="group flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        role="treeitem"
        aria-selected={false}
        tabIndex={0}
        draggable
        onDragStart={dragPayload(doc.space_id ? [doc.space_id] : [], doc.filename)}
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
        <StatusDot status={doc.status} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Aktionen für ${doc.filename}`}
              className="rounded p-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-accent"
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
  };

  const renderFolder = (space: TreeSpace, depth: number): React.ReactNode => {
    if (!folderVisible(space)) return null;
    const open = isExpanded(space.id);
    const childFolders = childrenByParent.get(space.id) ?? [];
    const childDocs = docsBySpace.get(space.id) ?? [];
    const rowKey = `space:${space.id}`;

    return (
      <div key={space.id}>
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
          onDragStart={dragPayload(collectSubtreeIds(spaces, space.id), space.name)}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Aktionen für Ordner ${space.name}`}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-accent"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => requestUpload(space.id)}>
                <Upload className="mr-2 h-3.5 w-3.5" /> Dateien hochladen…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => chatWithFolder(space)}>
                <FolderSearch className="mr-2 h-3.5 w-3.5" /> KI auf Ordner eingrenzen
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
        {open && (
          <div role="group">
            {childFolders.map(child => renderFolder(child, depth + 1))}
            {childDocs.map(doc => renderDocument(doc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderProject = (project: WorkspaceProject): React.ReactNode => {
    const ks = project.knowledge_space_id ? spaceById.get(project.knowledge_space_id) : undefined;
    const projectKey = `project:${project.id}`;
    const open = isExpanded(projectKey);

    // Kinder: eigener Ordner-Teilbaum; das Standard-Projekt nimmt zusätzlich
    // alles Unzugeordnete auf (Root-Ordner außerhalb anderer Projekte + Dateien
    // ohne Ordner).
    let childFolders: TreeSpace[] = [];
    let childDocs: TreeDocument[] = [];
    if (ks) {
      childFolders = childrenByParent.get(ks.id) ?? [];
      childDocs = docsBySpace.get(ks.id) ?? [];
    }
    if (project.is_default) {
      const uncoveredRoots = (childrenByParent.get(null) ?? []).filter(
        s => !coveredSpaceIds.has(s.id) && s.id !== project.knowledge_space_id
      );
      childFolders = [...childFolders, ...uncoveredRoots];
      childDocs = [...childDocs, ...(docsBySpace.get(null) ?? [])];
    }

    const visibleChildren =
      q === ''
        ? true
        : matches(project.name) ||
          childFolders.some(folderVisible) ||
          childDocs.some(d => matches(d.filename));
    if (!visibleChildren) return null;

    const uploadSpaceId = ks?.id ?? null;
    const scopeIds = ks ? collectSubtreeIds(spaces, ks.id) : [];

    return (
      <div key={project.id} data-testid={`project-${project.id}`}>
        <div
          className={cn(
            'group flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs font-medium hover:bg-accent',
            dropTarget === projectKey && 'bg-accent outline-1 outline-dashed outline-primary/60'
          )}
          role="treeitem"
          aria-expanded={open}
          aria-selected={false}
          tabIndex={0}
          draggable={scopeIds.length > 0}
          onDragStart={scopeIds.length > 0 ? dragPayload(scopeIds, project.name) : undefined}
          onClick={() => toggleExpand(projectKey)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpand(projectKey);
            }
          }}
          {...dropProps(uploadSpaceId, projectKey)}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color || 'var(--primary)' }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-foreground">{project.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Aktionen für Projekt ${project.name}`}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-accent"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => requestUpload(uploadSpaceId)}>
                <Upload className="mr-2 h-3.5 w-3.5" /> Dateien hochladen…
              </DropdownMenuItem>
              {scopeIds.length > 0 && (
                <DropdownMenuItem onClick={() => scopeToProject(project)}>
                  <FolderSearch className="mr-2 h-3.5 w-3.5" /> KI auf Projekt eingrenzen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openTab({ type: 'automationen' })}>
                <Workflow className="mr-2 h-3.5 w-3.5" /> Automationen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {ks && (
                <DropdownMenuItem onClick={() => setDialog({ kind: 'create', parent: ks })}>
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> Neuer Ordner
                </DropdownMenuItem>
              )}
              {project.id !== '__default__' && (
                <DropdownMenuItem onClick={() => setProjectModal({ mode: 'edit', project })}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Bearbeiten…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {open && (
          <div role="group">
            {childFolders.map(child => renderFolder(child, 1))}
            {childDocs.map(doc => renderDocument(doc, 1))}
            {childFolders.length === 0 && childDocs.length === 0 && (
              <p className="py-0.5 pl-8 text-xs text-muted-foreground/60">
                Leer — Dateien einfach hierher ziehen
              </p>
            )}
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
          title="Neues Projekt"
          aria-label="Neues Projekt"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setProjectModal({ mode: 'create', project: null })}
        >
          <Plus className="h-3.5 w-3.5" />
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
        <div className="p-1.5" role="tree" aria-label="Projekte, Ordner und Dokumente">
          {loading && <p className="px-2 py-1 text-xs text-muted-foreground">Lade Explorer…</p>}
          {error && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && (
            <div data-testid="projects-tree">{orderedProjects.map(renderProject)}</div>
          )}
        </div>
      </ScrollArea>

      <ExplorerDialogs dialog={dialog} onClose={() => setDialog(null)} onChanged={loadTree} />
      {projectModal && (
        <Suspense fallback={null}>
          <ProjectModal
            isOpen
            mode={projectModal.mode}
            project={
              projectModal.project
                ? {
                    ...projectModal.project,
                    knowledge_space_id: projectModal.project.knowledge_space_id ?? undefined,
                  }
                : null
            }
            onClose={() => setProjectModal(null)}
            onSave={() => {
              setProjectModal(null);
              loadTree();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
