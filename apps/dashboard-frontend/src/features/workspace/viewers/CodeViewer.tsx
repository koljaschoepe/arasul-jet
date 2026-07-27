/**
 * CodeViewer — Quelltext-Dateien farbig anzeigen und bearbeiten (Plan 013, B10).
 *
 * Öffnet `.py/.js/.ts/…` (Backend-Whitelist `CODE_EXTENSIONS`) im CodeMirror-6-
 * Editor: Syntaxfarben, Zeilennummern, Falten. Lädt/speichert den Roh-Inhalt
 * selbst über GET/PUT `/documents/:id/content` — dieselbe Kante wie der
 * HTML-Viewer. „Speichern" ist nur aktiv, solange es ungespeicherte Änderungen
 * gibt.
 */
import { useEffect, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';
import CodeMirrorEditor from './CodeMirrorEditor';
import { spracheLabel } from './codeLanguage';

interface ContentResponse {
  content: string;
}

export default function CodeViewer({
  documentId,
  filename,
  fileExtension,
  onDownload,
}: {
  documentId: string;
  filename: string;
  fileExtension: string;
  onDownload: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [original, setOriginal] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<ContentResponse>(`/documents/${documentId}/content`, { showError: false })
      .then(res => {
        if (cancelled) return;
        setOriginal(res.content);
        setDraft(res.content);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err?.message ?? 'Datei konnte nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, api]);

  const dirty = original !== null && draft !== original;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/documents/${documentId}/content`, { content: draft });
      setOriginal(draft);
      toast.success('Gespeichert');
    } catch {
      /* Toast kommt aus useApi */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Lade Datei …" />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>{error}</p>
        <Button type="button" variant="secondary" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Herunterladen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Kopfzeile — einheitlich mit dem HTML-Viewer: Label links, Aktionen rechts. */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-ui-xs font-medium text-muted-foreground" data-testid="code-language">
          {spracheLabel(fileExtension)}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-ui-xs text-muted-foreground" data-testid="code-dirty">
              Nicht gespeichert
            </span>
          )}
          <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
            <Save className="mr-1.5 size-3.5" aria-hidden="true" />
            {saving ? 'Speichert …' : 'Speichern'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDownload}
            aria-label="Herunterladen"
            title="Herunterladen"
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirrorEditor
          value={draft}
          onChange={setDraft}
          fileExtension={fileExtension}
          ariaLabel={`Quelltext von ${filename}`}
          testId="code-editor"
        />
      </div>
    </div>
  );
}
