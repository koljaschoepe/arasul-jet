import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, FileWarning } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';

// Der WYSIWYG-Editor (TipTap) ist schwer — nur laden, wenn wirklich ein
// editierbares Dokument geöffnet wird. Er lädt und speichert den Inhalt selbst
// über GET/PUT /documents/:id/content (mit Re-Index) und wird hier inline
// (embedded) gerendert — es gibt keine separate Vorschau mehr.
const TipTapEditor = lazy(() => import('@/components/editor/tiptap/TipTapEditor'));

const EDITABLE_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.yaml', '.yml']);

interface DocumentMeta {
  id: string;
  filename: string;
  mime_type: string | null;
  file_extension: string | null;
  file_size?: number;
}

type ViewerKind = 'markdown' | 'text' | 'pdf' | 'image' | 'unsupported';

const TEXT_EXTENSIONS = new Set(['.txt', '.yaml', '.yml']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

function viewerKindFor(meta: DocumentMeta): ViewerKind {
  const ext = (meta.file_extension ?? '').toLowerCase();
  const mime = (meta.mime_type ?? '').toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) return 'text';
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'unsupported';
}

/**
 * Datei-Viewer-Tab: rendert gespeicherte Dokumente in der Arbeitsfläche.
 * PDF und Bilder kommen als Blob über den bestehenden Download-Endpoint
 * (browser-nativer PDF-Viewer im iframe, keine neue Dependency).
 * Editierbare Text-/Markdown-Dokumente öffnen direkt im TipTap-WYSIWYG-Editor
 * (inline, füllt den Tab) — es gibt keine separate Read-only-Vorschau mehr.
 */
export default function DocumentViewerTab({
  documentId,
  tabId,
}: {
  documentId: string;
  tabId: string;
}) {
  const api = useApi();
  const updateTabTitle = useWorkspaceStore(s => s.updateTabTitle);
  const closeTab = useWorkspaceStore(s => s.closeTab);

  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { document: doc } = await api.get<{ document: DocumentMeta }>(
          `/documents/${documentId}`,
          { showError: false }
        );
        if (cancelled) return;
        setMeta(doc);
        updateTabTitle(tabId, doc.filename);

        const kind = viewerKindFor(doc);
        // Markdown/Text laden ihren Inhalt selbst im eingebetteten Editor bzw.
        // brauchen keinen Blob — nur PDF/Bild werden hier als Blob geholt.
        if (kind === 'pdf' || kind === 'image') {
          const res = await api.get<Response>(`/documents/${documentId}/download`, {
            raw: true,
            showError: false,
          });
          if (cancelled) return;
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(
            // Blob-Typ explizit setzen, damit der Browser-PDF-Viewer greift
            kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob
          );
          setBlobUrl(objectUrl);
        }
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Dokument konnte nicht geladen werden');
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, api, tabId, updateTabTitle]);

  const downloadFile = async () => {
    try {
      const res = await api.get<Response>(`/documents/${documentId}/download`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta?.filename ?? 'dokument';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  if (loading) {
    return <LoadingSpinner message="Lade Dokument..." />;
  }

  if (error || !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileWarning className="h-8 w-8" aria-hidden="true" />
        <p>{error ?? 'Dokument nicht gefunden'}</p>
      </div>
    );
  }

  const kind = viewerKindFor(meta);
  const isEditable =
    (kind === 'markdown' || kind === 'text') &&
    EDITABLE_EXTENSIONS.has((meta.file_extension ?? '').toLowerCase());

  // Editierbare Text-/Markdown-Dokumente landen direkt im TipTap-Editor
  // (inline, füllt den Tab) — keine Read-only-Vorschau, kein Extra-Klick zum
  // Editieren. Der Editor lädt/speichert selbst; „Schließen" schließt den Tab.
  if (isEditable) {
    return (
      <div className="h-full min-h-0">
        <Suspense fallback={<LoadingSpinner message="Editor wird geladen..." />}>
          <TipTapEditor
            embedded
            documentId={documentId}
            filename={meta.filename}
            token=""
            onClose={() => closeTab(tabId)}
          />
        </Suspense>
      </div>
    );
  }

  switch (kind) {
    case 'pdf':
      return blobUrl ? (
        <iframe src={blobUrl} title={meta.filename} className="h-full w-full border-0" />
      ) : null;
    case 'image':
      return blobUrl ? (
        <div className="flex h-full items-center justify-center overflow-auto p-4">
          <img src={blobUrl} alt={meta.filename} className="max-h-full max-w-full object-contain" />
        </div>
      ) : null;
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
          <FileWarning className="h-8 w-8" aria-hidden="true" />
          <p>
            Für <span className="font-medium text-foreground">{meta.filename}</span> gibt es keine
            Vorschau.
          </p>
          <Button type="button" variant="secondary" onClick={downloadFile}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Herunterladen
          </Button>
        </div>
      );
  }
}
