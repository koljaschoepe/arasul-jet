/**
 * ProjectFileTab — eine Datei aus der Projektablage (echter Geräte-Ordner)
 * im CodeMirror-Editor. Gegenstück zum CodeViewer, aber gegen die Datei-API
 * der Ablage (`/projects/:id/dateien/inhalt`) statt gegen MinIO-Dokumente.
 *
 * Binärdateien und Übergrößen liefern kein `inhalt` — dann gibt es statt des
 * Editors einen Download-Hinweis.
 */
import { useEffect, useRef, useState } from 'react';
import { Code2, Download, Eye, Save } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import CodeMirrorEditor from './CodeMirrorEditor';
import { spracheLabel } from './codeLanguage';

interface AblageInhalt {
  inhalt: string | null;
  groesse: number;
  binaer: boolean;
  zuGross: boolean;
}

function groesseLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

export default function ProjectFileTab({
  projectId,
  filePath,
  tabId,
}: {
  projectId: string;
  filePath: string;
  tabId: string;
}) {
  const api = useApi();
  const toast = useToast();
  const updateTabTitle = useWorkspaceStore(s => s.updateTabTitle);

  const [original, setOriginal] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<AblageInhalt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateiname = filePath.split('/').pop() ?? filePath;
  const endung = dateiname.includes('.') ? '.' + dateiname.split('.').pop() : '';
  // HTML aus der Ablage (z. B. vom Chat-Agent erzeugte Webseiten) öffnet
  // standardmäßig GERENDERT — wie eine kleine Webseite im Tab; der Quelltext
  // bleibt einen Klick entfernt.
  const istHtml = endung.toLowerCase() === '.html' || endung.toLowerCase() === '.htm';
  const [ansicht, setAnsicht] = useState<'vorschau' | 'code'>('vorschau');

  // Tab-Titel = Dateiname (der Store kennt beim Öffnen nur den Pfad).
  useEffect(() => {
    updateTabTitle(tabId, dateiname);
  }, [tabId, dateiname, updateTabTitle]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ data: AblageInhalt }>(
        `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(filePath)}`,
        { showError: false }
      )
      .then(res => {
        if (cancelled) return;
        setMeta(res.data);
        setOriginal(res.data.inhalt);
        setDraft(res.data.inhalt ?? '');
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
  }, [projectId, filePath, api]);

  const dirty = original !== null && draft !== original;

  // Aktueller Zustand für die Fokus-Aktualisierung unten — der Listener soll
  // nicht bei jedem Tastendruck neu registriert werden.
  const zustandRef = useRef({ dirty, saving, loading, original });
  useEffect(() => {
    zustandRef.current = { dirty, saving, loading, original };
  }, [dirty, saving, loading, original]);

  // Externe Änderungen bemerken (z. B. der Chat-Agent schreibt dieselbe
  // Datei): beim Zurückkehren ins Fenster die Datei still neu laden — aber
  // NUR, wenn keine ungespeicherten Änderungen vorliegen. Kein Polling.
  useEffect(() => {
    let inFlight = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const z = zustandRef.current;
      if (inFlight || z.dirty || z.saving || z.loading) return;
      inFlight = true;
      api
        .get<{ data: AblageInhalt }>(
          `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(filePath)}`,
          { showError: false }
        )
        .then(res => {
          const jetzt = zustandRef.current;
          // Nichts überschreiben, wenn der Nutzer inzwischen tippt oder sich
          // auf dem Server nichts geändert hat (erhält die Cursor-Position).
          if (jetzt.dirty || res.data.inhalt === jetzt.original) return;
          setMeta(res.data);
          setOriginal(res.data.inhalt);
          setDraft(res.data.inhalt ?? '');
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [api, projectId, filePath]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/dateien/inhalt`, { pfad: filePath, inhalt: draft });
      setOriginal(draft);
      toast.success('Gespeichert');
    } catch {
      /* Toast kommt aus useApi */
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    try {
      const res = await api.get<Response>(
        `/projects/${projectId}/dateien/download?pfad=${encodeURIComponent(filePath)}`,
        { raw: true }
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dateiname;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  if (loading) {
    return <LoadingSpinner message="Lade Datei …" />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  // Binär / zu groß: kein Editor, aber Download.
  if (meta && meta.inhalt === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-sm">
          {meta.binaer
            ? `„${dateiname}" ist eine Binärdatei (${groesseLabel(meta.groesse)}).`
            : `„${dateiname}" ist zu groß für den Editor (${groesseLabel(meta.groesse)}).`}
        </p>
        <Button type="button" variant="secondary" onClick={download}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Herunterladen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-file-tab">
      {/* Kopfzeile — einheitlich mit dem CodeViewer: Label links, Aktionen rechts. */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="min-w-0 truncate text-ui-xs font-medium text-muted-foreground">
          {filePath}
          <span className="ml-2 text-muted-foreground/60">{spracheLabel(endung)}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {istHtml && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAnsicht(a => (a === 'vorschau' ? 'code' : 'vorschau'))}
              data-testid="html-ansicht-toggle"
            >
              {ansicht === 'vorschau' ? (
                <>
                  <Code2 className="mr-1.5 size-3.5" aria-hidden="true" /> Quelltext
                </>
              ) : (
                <>
                  <Eye className="mr-1.5 size-3.5" aria-hidden="true" /> Vorschau
                </>
              )}
            </Button>
          )}
          {dirty && (
            <span className="text-ui-xs text-muted-foreground" data-testid="project-file-dirty">
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
            onClick={download}
            aria-label="Herunterladen"
            title="Herunterladen"
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {istHtml && ansicht === 'vorschau' ? (
          // Sandbox OHNE allow-same-origin: das gerenderte HTML darf Skripte
          // ausführen, kommt aber nicht an Cookies/API der Plattform heran.
          <iframe
            srcDoc={draft}
            sandbox="allow-scripts"
            title={`Vorschau von ${dateiname}`}
            className="h-full w-full border-0 bg-white"
            data-testid="html-vorschau"
          />
        ) : (
          <CodeMirrorEditor
            value={draft}
            onChange={setDraft}
            fileExtension={endung}
            ariaLabel={`Inhalt von ${dateiname}`}
            testId="project-file-editor"
          />
        )}
      </div>
    </div>
  );
}
