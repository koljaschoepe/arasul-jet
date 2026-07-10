import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, FileWarning } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';

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
 * (browser-nativer PDF-Viewer im iframe, keine neue Dependency);
 * Markdown/Text über den Content-Endpoint.
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

  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
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
        if (kind === 'markdown' || kind === 'text') {
          const data = await api.get<{ content: string }>(`/documents/${documentId}/content`, {
            showError: false,
          });
          if (cancelled) return;
          setTextContent(data.content);
        } else if (kind === 'pdf' || kind === 'image') {
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

  switch (kind) {
    case 'markdown':
      return (
        <div className="prose prose-sm dark:prose-invert mx-auto max-w-3xl p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent ?? ''}</ReactMarkdown>
        </div>
      );
    case 'text':
      return (
        <pre className="h-full overflow-auto p-6 font-mono text-sm whitespace-pre-wrap text-foreground">
          {textContent ?? ''}
        </pre>
      );
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
    case 'unsupported':
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
