/**
 * HtmlDocumentViewer — rendert eine gespeicherte HTML-Datei „artefakt-artig"
 * (Plan 012 Batch 3). Zwei Ansichten über einen kleinen Umschalter oben:
 *
 *   • „Vorschau" — das HTML gerendert in einem SANDBOX-iframe. Bewusst OHNE
 *     `allow-same-origin`: Skripte laufen in einem eigenen, null-Origin-Kontext
 *     und kommen weder an das Dashboard, seine Cookies noch an den Speicher —
 *     die Datei ist Nutzer-Inhalt und wird isoliert dargestellt (wie ein
 *     Artefakt).
 *   • „Code" — der HTML-Quelltext in einem einfachen Editor; „Speichern" schreibt
 *     über `PUT /documents/:id/content` zurück (HTML ist dort seit Batch 3
 *     freigegeben). Die Vorschau zeigt immer den AKTUELLEN Entwurf, auch vor dem
 *     Speichern — man sieht seine Änderung sofort.
 */
import { useEffect, useState } from 'react';
import { Code2, Download, Eye, Save } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

type HtmlView = 'vorschau' | 'code';

interface HtmlContentResponse {
  content: string;
}

export default function HtmlDocumentViewer({
  documentId,
  filename,
  onDownload,
}: {
  documentId: string;
  filename: string;
  onDownload: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [view, setView] = useState<HtmlView>('vorschau');
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
      .get<HtmlContentResponse>(`/documents/${documentId}/content`, { showError: false })
      .then(res => {
        if (cancelled) return;
        setOriginal(res.content);
        setDraft(res.content);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err?.message ?? 'HTML-Inhalt konnte nicht geladen werden');
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
      toast.success('HTML gespeichert');
    } catch {
      /* Toast kommt aus useApi */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Lade HTML …" />;
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
      {/* Kopfzeile: Umschalter links, Aktionen rechts — auf einer Höhe. */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div
          role="group"
          aria-label="HTML-Ansicht"
          className="flex items-center gap-1 rounded-md border border-border p-0.5"
        >
          {(
            [
              { key: 'vorschau', label: 'Vorschau', icon: Eye },
              { key: 'code', label: 'Code', icon: Code2 },
            ] as const
          ).map(t => (
            <button
              key={t.key}
              type="button"
              data-testid={`html-view-${t.key}`}
              aria-pressed={view === t.key}
              onClick={() => setView(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-ui-xs font-medium transition-colors',
                view === t.key
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="size-3.5" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-ui-xs text-muted-foreground" data-testid="html-dirty">
              Nicht gespeichert
            </span>
          )}
          {view === 'code' && (
            <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
              <Save className="mr-1.5 size-3.5" aria-hidden="true" />
              {saving ? 'Speichert …' : 'Speichern'}
            </Button>
          )}
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

      <div className="min-h-0 flex-1">
        {view === 'vorschau' ? (
          <iframe
            title={filename}
            // Isoliert: Skripte ja, aber kein Zugriff auf das Dashboard (kein
            // allow-same-origin). Nutzer-HTML wird wie ein Artefakt gerendert.
            sandbox="allow-scripts allow-popups allow-forms"
            srcDoc={draft}
            data-testid="html-vorschau"
            // Weißer Zeichengrund wie im Browser — HTML-Dokumente erwarten das,
            // unabhängig vom Dashboard-Theme.
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            aria-label="HTML-Quelltext"
            data-testid="html-code"
            className="h-full w-full resize-none border-0 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
          />
        )}
      </div>
    </div>
  );
}
